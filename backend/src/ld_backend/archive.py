"""Archive des bundles bruts : le début de B2.

Un dossier par (infrastructure, run) sous la racine : `bundle.json` (forme canonique), `report.json`
(rapport d'ingestion), `meta.json` (empreinte, dates de la run et de l'ingestion) et `snapshot.json` (sortie
de B1). Sur disque en V1, derrière une interface que Mongo pourra remplacer sans toucher à la route.

Règles :
- une run archivée ne change jamais : réarchiver des **données** identiques est un non-événement,
  réarchiver des données différentes pour la même run est un conflit, jamais un écrasement ;
- l'empreinte porte sur les données, pas sur l'enveloppe (`produced_at`, `exporter_version`) :
  un ré-export légitime de la même run reste idempotent ;
- l'écriture est atomique (dossier temporaire puis renommage) : pas de run à moitié écrite, et deux
  écritures simultanées donnent exactement une création ;
- le snapshot est un **produit dérivé** : il se recalcule depuis le bundle, donc il se remplace (une règle de B1
  corrigée, `ld correlate`) ; il arrive après le bundle, par remplacement atomique d'un seul fichier ;
- une entrée corrompue est isolée (`ArchiveCorruptError`), jamais fatale pour les autres runs ;
- les runs se listent dans l'ordre des **collectes** (`run_start`), pas des exports : c'est l'ordre de la
  timeline et du diff N-1, et `meta.json` le porte pour ne pas rouvrir chaque bundle ;
- les dates écrites ici sont en UTC, forme du contrat (`Z`).
"""

import errno
import hashlib
import json
import logging
import os
import re
import shutil
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from ld_contracts.bundle import RunBundle

from ld_backend.schemas import utc_z

log = logging.getLogger(__name__)

SAFE_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
ENVELOPE_FIELDS = frozenset({"produced_at", "exporter_version"})
TMP_PREFIX = ".tmp-"
SNAPSHOT_FILE = "snapshot.json"
SNAPSHOT_TAIL = b"}\n"
STALE_TMP_SECONDS = 3600


class ArchiveConflictError(Exception):
    """Un bundle aux données différentes existe déjà pour cette run et cette infrastructure."""

    def __init__(self, existing: StoredRun, received_sha256: str) -> None:
        super().__init__(f"run {existing.run_id} déjà archivée avec des données différentes")
        self.existing = existing
        self.received_sha256 = received_sha256


class ArchiveCorruptError(Exception):
    """Une entrée d'archive est illisible ; elle est isolée, les autres runs restent servies."""


@dataclass(frozen=True, slots=True)
class StoredRun:
    infrastructure: str
    run_id: str
    path: Path
    sha256: str
    bytes_sha256: str
    stored_at: str
    produced_at: str
    run_start: str
    run_end: str | None
    run_status: str


DATE_FIELDS = ("stored_at", "produced_at", "run_start", "run_end")
NULLABLE_FIELDS = frozenset({"run_end"})
META_FIELDS = ("infrastructure", "run_id", "sha256", "bytes_sha256", "run_status", *DATE_FIELDS)


def _segment(value: str) -> str:
    """Nom de dossier sûr. Les noms hachés commencent par `_`, interdit aux noms sûrs : aucune collision."""
    if SAFE_SEGMENT.fullmatch(value):
        return value
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", value).strip("._-")[:40] or "x"
    return f"_{cleaned}-{digest}"


def canonical_json(data: dict) -> str:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def fingerprint(bundle: RunBundle) -> tuple[str, str]:
    """(forme canonique complète, empreinte SHA-256 des données hors enveloppe)."""
    data = bundle.model_dump(mode="json")
    hashed = canonical_json({k: v for k, v in data.items() if k not in ENVELOPE_FIELDS})
    return canonical_json(data), hashlib.sha256(hashed.encode("utf-8")).hexdigest()


def _dump(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _purge_stale_snapshot_tmp(run_dir: Path) -> None:
    """Un `ld correlate` tué avant le renommage laisse un temporaire de la taille d'un snapshot. Seuls les vieux
    sont retirés : un temporaire récent peut appartenir à une écriture en cours dans un autre processus."""
    limit = time.time() - STALE_TMP_SECONDS
    for orphan in run_dir.glob(f"{TMP_PREFIX}{SNAPSHOT_FILE}-*"):
        try:
            if orphan.stat().st_mtime < limit:
                orphan.unlink()
        except OSError:  # disparu entre-temps, ou pas à nous : ce ménage ne doit jamais empêcher d'écrire
            continue


def _parse_meta(run_dir: Path, meta: object) -> StoredRun:
    """Forme stricte : les neuf champs, des chaînes (`run_end` peut être null), dates ISO 8601 avec fuseau."""
    if not isinstance(meta, dict) or set(meta) != set(META_FIELDS):
        raise ArchiveCorruptError(str(run_dir))
    if not all(isinstance(meta[k], str) or (meta[k] is None and k in NULLABLE_FIELDS) for k in META_FIELDS):
        raise ArchiveCorruptError(str(run_dir))
    try:
        dates = [datetime.fromisoformat(meta[k]) for k in DATE_FIELDS if meta[k] is not None]
    except ValueError as exc:
        raise ArchiveCorruptError(str(run_dir)) from exc
    if any(moment.tzinfo is None for moment in dates):
        raise ArchiveCorruptError(str(run_dir))
    return StoredRun(path=run_dir, **meta)


class BundleArchive:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def _run_dir(self, infrastructure: str, run_id: str) -> Path:
        return self.root / _segment(infrastructure) / _segment(run_id)

    def store(self, bundle: RunBundle, report: dict) -> tuple[StoredRun, bool]:
        """Archive le bundle ; retourne (run archivée, créée ?). Conflit ou corruption : exception."""
        payload, sha256 = fingerprint(bundle)
        run_dir = self._run_dir(bundle.infrastructure, bundle.run.collector_run_id)
        existing = self._read_meta(run_dir)
        if existing is not None:
            return self._same_or_conflict(existing, sha256)
        raw = (payload + "\n").encode("utf-8")
        stored = StoredRun(
            infrastructure=bundle.infrastructure,
            run_id=bundle.run.collector_run_id,
            path=run_dir,
            sha256=sha256,
            bytes_sha256=_sha256(raw),
            stored_at=utc_z(datetime.now(UTC).replace(microsecond=0)),
            produced_at=utc_z(bundle.produced_at),
            run_start=utc_z(bundle.run.start_datetime),
            run_end=None if bundle.run.end_datetime is None else utc_z(bundle.run.end_datetime),
            run_status=bundle.run.status.value,
        )
        tmp = run_dir.parent / f"{TMP_PREFIX}{run_dir.name}-{uuid4().hex}"
        tmp.mkdir(parents=True, exist_ok=False)
        try:
            (tmp / "bundle.json").write_bytes(raw)
            _dump(tmp / "report.json", report)
            _dump(tmp / "meta.json", {k: v for k, v in asdict(stored).items() if k != "path"})
            tmp.rename(run_dir)
        except OSError as exc:
            shutil.rmtree(tmp, ignore_errors=True)
            if exc.errno not in (errno.ENOTEMPTY, errno.EEXIST):
                raise
            winner = self._read_meta(run_dir)
            if winner is None:
                raise ArchiveCorruptError(str(run_dir)) from exc
            return self._same_or_conflict(winner, sha256)
        except BaseException:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        return stored, True

    @staticmethod
    def _same_or_conflict(existing: StoredRun, sha256: str) -> tuple[StoredRun, bool]:
        if existing.sha256 != sha256:
            raise ArchiveConflictError(existing, sha256)
        return existing, False

    def _read_meta(self, run_dir: Path) -> StoredRun | None:
        meta_path = run_dir / "meta.json"
        if not meta_path.exists():
            return None
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ArchiveCorruptError(str(run_dir)) from exc
        return _parse_meta(run_dir, meta)

    def find_run(self, infrastructure: str, run_id: str) -> StoredRun | None:
        return self._read_meta(self._run_dir(infrastructure, run_id))

    def store_snapshot(self, infrastructure: str, run_id: str, payload: str) -> None:
        """Écrit ou remplace le snapshot d'une run archivée ; `KeyError` si la run ne l'est pas."""
        run_dir = self._run_dir(infrastructure, run_id)
        if self._read_meta(run_dir) is None:
            raise KeyError(run_id)
        _purge_stale_snapshot_tmp(run_dir)
        tmp = run_dir / f"{TMP_PREFIX}{SNAPSHOT_FILE}-{uuid4().hex}"
        try:
            with tmp.open("w", encoding="utf-8") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())  # une coupure après le renommage ne doit pas laisser un fichier vide
            tmp.replace(run_dir / SNAPSHOT_FILE)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise

    def has_snapshot(self, infrastructure: str, run_id: str) -> bool:
        """Présent **et** entier, sans le lire : la forme canonique finit toujours par `}` et une fin de ligne.

        Un snapshot vide ou tronqué (coupure pendant la première écriture) compte comme absent : il se recalcule.
        """
        run_dir = self._run_dir(infrastructure, run_id)
        path = run_dir / SNAPSHOT_FILE
        if self._read_meta(run_dir) is None or not path.is_file():
            return False
        with path.open("rb") as handle:
            if handle.seek(0, os.SEEK_END) < len(SNAPSHOT_TAIL):
                return False
            handle.seek(-len(SNAPSHOT_TAIL), os.SEEK_END)
            return handle.read() == SNAPSHOT_TAIL

    def load_snapshot_bytes(self, infrastructure: str, run_id: str) -> bytes | None:
        """None si la run est inconnue ou n'a pas de snapshot entier : `find_run` distingue les deux."""
        if not self.has_snapshot(infrastructure, run_id):
            return None
        return (self._run_dir(infrastructure, run_id) / SNAPSHOT_FILE).read_bytes()

    def load_snapshot(self, infrastructure: str, run_id: str) -> dict | None:
        raw = self.load_snapshot_bytes(infrastructure, run_id)
        return None if raw is None else self._parse(raw, infrastructure, run_id)

    def list_runs(self, infrastructure: str) -> list[StoredRun]:
        infra_dir = self.root / _segment(infrastructure)
        if not infra_dir.is_dir():
            return []
        runs: list[StoredRun] = []
        for entry in infra_dir.iterdir():
            if not entry.is_dir() or entry.name.startswith(TMP_PREFIX):
                continue
            try:
                meta = self._read_meta(entry)
            except ArchiveCorruptError:
                log.warning("entrée d'archive corrompue ignorée : %s", entry)
                continue
            if meta is None:
                log.warning("dossier de run sans meta.json ignoré : %s", entry)
                continue
            runs.append(meta)
        return sorted(runs, key=lambda r: (datetime.fromisoformat(r.run_start), r.run_id))

    def load_bundle_bytes(self, infrastructure: str, run_id: str) -> bytes | None:
        """Octets canoniques du bundle, vérifiés par empreinte : une corruption est signalée, jamais servie."""
        run_dir = self._run_dir(infrastructure, run_id)
        meta = self._read_meta(run_dir)
        if meta is None:
            return None
        raw = (run_dir / "bundle.json").read_bytes()
        if _sha256(raw) != meta.bytes_sha256:
            raise ArchiveCorruptError(str(run_dir))
        return raw

    def load_bundle(self, infrastructure: str, run_id: str) -> dict | None:
        raw = self.load_bundle_bytes(infrastructure, run_id)
        return None if raw is None else self._parse(raw, infrastructure, run_id)

    def load_report(self, infrastructure: str, run_id: str) -> dict | None:
        path = self._run_dir(infrastructure, run_id) / "report.json"
        return None if not path.exists() else self._parse(path.read_bytes(), infrastructure, run_id)

    def _parse(self, raw: bytes, infrastructure: str, run_id: str) -> dict:
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ArchiveCorruptError(str(self._run_dir(infrastructure, run_id))) from exc
