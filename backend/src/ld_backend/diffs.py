"""Branchement de B3 : comparer deux snapshots, archivés ou lus dans des fichiers, à la demande.

Le diff n'est jamais stocké (`docs/07` décision 7) : dérivé, déterministe ; le stocker créerait un second produit à
invalider. Coût mesuré à la jauge (500 devices, 21 000 interfaces, revue M5) : relire et revalider les deux snapshots
≈ 2,2 s, comparer ≈ 1 s ; la revalidation à chaque appel est une question ouverte (`docs/07` Q6). Ce module ne fait
que trouver les deux snapshots ; `ld_backend.diff` compare.
"""

from typing import Literal

from ld_contracts.diff import Diff
from ld_contracts.snapshot import Snapshot
from ld_contracts.validate import Issue, validate_snapshot_dict
from pydantic import ValidationError

from ld_backend.archive import BundleArchive, StoredRun
from ld_backend.snapshots import correlate_data

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
