"""L'accueil de la v2 (`docs/13`, brique 1) : ce que `GET /api/infrastructures` dit de chaque infrastructure archivée.

Une lecture seule de l'archive : la dernière run ; la dernière run utile (`completed` ou `partial`), celle dont
l'accueil montre les comptes et qu'il ouvre : ses équipements dans le périmètre (le rapport d'ingestion), ceux qui
ont répondu et les contrôles par sévérité (le snapshot) ; et les dernières runs. Le snapshot pèse plusieurs dizaines
de Mo sur une grande infrastructure : ce qu'on y lit est gardé en mémoire par identité du fichier
(`BundleArchive.snapshot_stamp`), comme le cache des diffs ; un `ld correlate` qui remplace le snapshot l'invalide.
Rien d'ici n'écrit, rien n'affirme ce que l'archive ne dit pas : un rapport ou un snapshot illisible donne `null`,
jamais un chiffre.
"""

import logging
import threading
from collections import Counter, OrderedDict
from dataclasses import dataclass
from datetime import datetime

from ld_backend.archive import ArchiveCorruptError, BundleArchive, StoredRun
from ld_backend.schemas import InfrastructureEntry, InfrastructureList, LastRun, RecentRun
from ld_backend.snapshots import SEVERITIES

log = logging.getLogger(__name__)

RECENT_RUNS = 6
MAX_RECENT_RUNS = 100
SNAPSHOT_CACHE_ENTRIES = 256
GOOD_STATUSES = frozenset({"completed", "partial"})
ANSWERED = frozenset({"success", "partial"})

Stamp = tuple[int, int, int]


@dataclass(frozen=True, slots=True)
class SnapshotFacts:
    """Ce que l'accueil lit d'un snapshot : les contrôles par sévérité, les nœuds qui ont répondu."""

    checks: dict[str, int]
    answered: int


def snapshot_facts(archive: BundleArchive, infrastructure: str, run_id: str) -> SnapshotFacts | None:
    """Les faits du snapshot de la run ; None sans snapshot lisible, ou sans ses listes."""
    try:
        snapshot = archive.load_snapshot(infrastructure, run_id)
    except ArchiveCorruptError, OSError:
        log.warning("snapshot illisible, non compté : %s / %s", infrastructure, run_id)
        return None
    if snapshot is None:
        return None
    checks, nodes = snapshot.get("checks"), snapshot.get("nodes")
    if not isinstance(checks, list) or not isinstance(nodes, list):
        return None
    by_severity = Counter(check.get("severity") for check in checks if isinstance(check, dict))
    answered = sum(1 for node in nodes if isinstance(node, dict) and node.get("collection") in ANSWERED)
    return SnapshotFacts(checks={s: by_severity.get(s, 0) for s in SEVERITIES}, answered=answered)


def count_devices(archive: BundleArchive, infrastructure: str, run_id: str) -> int | None:
    """Les équipements dans le périmètre d'après le rapport d'ingestion archivé ; None s'il ne se lit pas."""
    try:
        report = archive.load_report(infrastructure, run_id)
    except ArchiveCorruptError, OSError:
        log.warning("rapport illisible, équipements non comptés : %s / %s", infrastructure, run_id)
        return None
    summary = report.get("summary") if isinstance(report, dict) else None
    devices = summary.get("devices_in_scope") if isinstance(summary, dict) else None
    return devices if isinstance(devices, int) else None


class SnapshotCache:
    """Les faits déjà lus, par identité du fichier snapshot ; borné, sûr entre fils."""

    def __init__(self, max_entries: int = SNAPSHOT_CACHE_ENTRIES) -> None:
        self.max_entries = max_entries
        self._entries: OrderedDict[tuple[str, str, Stamp], SnapshotFacts | None] = OrderedDict()
        self._lock = threading.Lock()

    def facts(self, archive: BundleArchive, run: StoredRun) -> SnapshotFacts | None:
        stamp = archive.snapshot_stamp(run.infrastructure, run.run_id)
        if stamp is None:
            return None
        key = (run.infrastructure, run.run_id, stamp)
        with self._lock:
            if key in self._entries:
                self._entries.move_to_end(key)
                return self._entries[key]
        read = snapshot_facts(archive, run.infrastructure, run.run_id)
        with self._lock:
            self._entries[key] = read
            self._entries.move_to_end(key)
            while len(self._entries) > self.max_entries:
                self._entries.popitem(last=False)
        return read


def _last_run(run: StoredRun) -> LastRun:
    return LastRun(run_id=run.run_id, run_start=run.run_start, run_end=run.run_end, run_status=run.run_status)


def _recent(archive: BundleArchive, cache: SnapshotCache, runs: list[StoredRun], recent: int) -> list[RecentRun]:
    """Les dernières runs, la plus récente d'abord, chacune avec celle qui la précède dans l'ordre des collectes."""
    out: list[RecentRun] = []
    for index in range(len(runs) - 1, max(len(runs) - recent, 0) - 1, -1):
        run = runs[index]
        facts = cache.facts(archive, run)
        out.append(
            RecentRun(
                **_last_run(run).model_dump(),
                devices=count_devices(archive, run.infrastructure, run.run_id),
                answered=None if facts is None else facts.answered,
                previous_run_id=runs[index - 1].run_id if index > 0 else None,
            )
        )
    return out


def _entry(
    archive: BundleArchive, cache: SnapshotCache, name: str, runs: list[StoredRun], recent: int
) -> InfrastructureEntry:
    last = runs[-1]
    recent_runs = _recent(archive, cache, runs, recent)
    good = next((run for run in reversed(runs) if run.run_status in GOOD_STATUSES), None)
    # les comptes décrivent la run qu'on ouvre : la dernière bonne, ou la dernière à défaut (revue, H3)
    shown = last if good is None else good
    facts = cache.facts(archive, shown)
    return InfrastructureEntry(
        infrastructure=name,
        runs=len(runs),
        last_run=_last_run(last),
        last_good_run=None if good is None else _last_run(good),
        devices=count_devices(archive, shown.infrastructure, shown.run_id),
        answered=None if facts is None else facts.answered,
        checks=None if facts is None else facts.checks,
        recent_runs=recent_runs,
    )


def infrastructures(archive: BundleArchive, cache: SnapshotCache, recent: int = RECENT_RUNS) -> InfrastructureList:
    """Toutes les infrastructures archivées, la dernière collecte en tête ; `recent` dernières runs chacune
    (l'utilisateur en demande autant qu'il veut, jusqu'à `MAX_RECENT_RUNS` : chaque run lue coûte son snapshot)."""
    by_name, unreadable = archive.scan()
    entries = [_entry(archive, cache, name, runs, recent) for name, runs in by_name.items()]
    entries.sort(key=lambda e: (datetime.fromisoformat(e.last_run.run_start), e.infrastructure), reverse=True)
    return InfrastructureList(infrastructures=entries, unreadable=unreadable)
