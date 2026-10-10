"""Branchement de B3 : comparer deux snapshots, archivés ou lus dans des fichiers, à la demande.

Le diff n'est jamais stocké sur disque (`docs/07` décision 7) : dérivé, déterministe ; le stocker créerait un second
produit à invalider. Coût mesuré à la jauge (500 devices, 21 000 interfaces, revue M5) : relire et revalider les deux
snapshots ≈ 2,2 s, comparer ≈ 1 s. **Q6 tranchée le 2026-10-09** : l'API garde en mémoire les derniers diffs servis
(`DiffCache`), valides tant que les deux fichiers snapshot n'ont pas changé ; le premier appel paie, les suivants non.
Ce module trouve les deux snapshots et range les diffs ; `ld_backend.diff` compare.
"""

import threading
from collections import OrderedDict
from typing import Literal

from ld_contracts.diff import Diff
from ld_contracts.snapshot import Snapshot
from ld_contracts.validate import Issue, validate_snapshot_dict
from pydantic import ValidationError

from ld_backend.archive import BundleArchive, StoredRun
from ld_backend.snapshots import correlate_data

# Assez pour les allers-retours d'une bande des runs à la jauge ; un diff plus gros que la borne n'est pas gardé.
DIFF_CACHE_BYTES = 64 * 1024 * 1024
Stamp = tuple[int, int, int]
CacheKey = tuple[str, str, str, Stamp, Stamp]

Reason = Literal["unknown", "missing", "invalid", "too_few", "no_previous"]

MESSAGES: dict[Reason, str] = {
    "unknown": "run inconnue pour cette infrastructure",
    "missing": "run archivée sans snapshot : lancer `ld correlate`",
    "invalid": "snapshot archivé hors contrat : lancer `ld correlate`",
    "too_few": "il faut deux runs archivées pour comparer",
    "no_previous": "aucune run archivée ne précède --to",
}


class SnapshotUnavailableError(LookupError):
    """Un des deux snapshots manque ; `side` dit lequel (`from` / `to`), `reason` pourquoi. Aucune valeur. Une
    exception ordinaire : une dataclass gelée à slots cassait `add_note` (revue, B3)."""

    def __init__(self, reason: Reason, side: str) -> None:
        super().__init__(reason, side)
        self.reason = reason
        self.side = side

    def __str__(self) -> str:
        return (
            f"run `{self.side}` : {MESSAGES[self.reason]}"
            if self.reason in {"unknown", "missing", "invalid"}
            else MESSAGES[self.reason]
        )


def snapshot_model(data: dict, side: str) -> Snapshot:
    """Le modèle d'un snapshot déjà lu (archive) ; hors contrat ⇒ `invalid` pour ce côté."""
    try:
        return Snapshot.model_validate(data)
    except ValidationError as exc:
        raise SnapshotUnavailableError("invalid", side) from exc


def load_archived_snapshot(archive: BundleArchive, infrastructure: str, run_id: str, side: str) -> Snapshot:
    """Le snapshot archivé d'une run. Archive corrompue ou illisible : l'exception remonte, l'appelant la traduit."""
    if archive.find_run(infrastructure, run_id) is None:
        raise SnapshotUnavailableError("unknown", side)
    data = archive.load_snapshot(infrastructure, run_id)
    if data is None:
        raise SnapshotUnavailableError("missing", side)
    return snapshot_model(data, side)


def resolve_pair(runs: list[StoredRun], from_run: str | None, to_run: str | None) -> tuple[str, str]:
    """`--to` = la dernière run archivée par défaut ; `--from` = celle qui la précède dans l'ordre des débuts."""
    ids = [run.run_id for run in runs]
    if to_run is None:
        if not ids:
            raise SnapshotUnavailableError("too_few", "to")
        to_run = ids[-1]
    if from_run is None:
        if to_run not in ids:
            raise SnapshotUnavailableError("unknown", "to")
        index = ids.index(to_run)
        if index == 0:
            raise SnapshotUnavailableError("too_few" if len(ids) < 2 else "no_previous", "from")
        from_run = ids[index - 1]
    return from_run, to_run


def archived_pair(
    archive: BundleArchive, infrastructure: str, from_run: str | None, to_run: str | None
) -> tuple[Snapshot, Snapshot]:
    from_run, to_run = resolve_pair(archive.list_runs(infrastructure), from_run, to_run)
    before = load_archived_snapshot(archive, infrastructure, from_run, "from")
    after = load_archived_snapshot(archive, infrastructure, to_run, "to")
    return before, after


def snapshot_from_data(data: object) -> tuple[Snapshot | None, tuple[Issue, ...]]:
    """Un fichier : un snapshot (reconnu à `snapshot_version`), sinon un bundle validé puis corrélé par B1."""
    if isinstance(data, dict) and "snapshot_version" in data:
        report = validate_snapshot_dict(data)
        return report.snapshot, report.errors
    result = correlate_data(data)
    return result.snapshot, result.errors


def summary_lines(diff: Diff) -> list[str]:
    """Le résumé lisible du diff, une ligne par section ; cite les deux runs, jamais une valeur d'entité."""
    s = diff.summary
    lines = [f"runs : {diff.before.collector_run_id} → {diff.after.collector_run_id} · écart {diff.elapsed_seconds}s"]
    for name in ("nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters"):
        part = getattr(s, name)
        lines.append(f"{name:<13}+{part.added} −{part.removed} ~{part.changed}")
    lines.append(f"{'checks':<13}+{s.checks.appeared} −{s.checks.resolved} ={s.checks.persisted}")
    lines.append(f"{'coverage':<13}~{s.coverage.changed}")
    lines.append(f"{'events':<13}rebooted {s.events.rebooted} · flapped {s.events.flapped}")
    lines.append(f"{'volatile':<13}{s.volatile_changes}")
    return lines


class DiffCache:
    """Les derniers diffs servis, en octets, du plus ancien au plus récent ; borné en octets, sûr entre fils.

    La clé porte l'identité des deux fichiers snapshot (`BundleArchive.snapshot_stamp`) : un `ld correlate` qui
    remplace l'un d'eux rend l'entrée inatteignable, elle sort à son tour. Deux appels simultanés pour la même paire
    calculent deux fois ; le second remplace le premier, mêmes octets.
    """

    def __init__(self, max_bytes: int = DIFF_CACHE_BYTES) -> None:
        self.max_bytes = max_bytes
        self._entries: OrderedDict[CacheKey, bytes] = OrderedDict()
        self._size = 0
        self._lock = threading.Lock()

    def get(self, key: CacheKey) -> bytes | None:
        with self._lock:
            found = self._entries.get(key)
            if found is not None:
                self._entries.move_to_end(key)
            return found

    def put(self, key: CacheKey, payload: bytes) -> None:
        if len(payload) > self.max_bytes:
            return
        with self._lock:
            previous = self._entries.pop(key, None)
            self._size -= len(previous) if previous is not None else 0
            while self._entries and self._size + len(payload) > self.max_bytes:
                _, evicted = self._entries.popitem(last=False)
                self._size -= len(evicted)
            self._entries[key] = payload
            self._size += len(payload)

    @property
    def size(self) -> int:
        return self._size

    def __len__(self) -> int:
        return len(self._entries)
