"""Deux chemins vers la page : depuis un fichier bundle (sans archive ni serveur), ou depuis une run archivée.

Le chemin fichier est la boucle de mise au point d'un exportateur : corriger, relancer, rafraîchir. Il ne touche
pas l'archive, donc ré-exporter la même run avec des données corrigées ne rencontre pas de 409.

Avec `--from`, la page embarque aussi le diff (B3) depuis une run précédente : un fichier (bundle ou snapshot) en
mode fichier, une run archivée en mode archive. Le diff se calcule ici, à la demande, jamais stocké.
"""

from dataclasses import dataclass
from typing import Any

from ld_contracts.snapshot import Snapshot
from ld_contracts.validate import validate_dict

from ld_backend.archive import ArchiveCorruptError, BundleArchive, fingerprint
from ld_backend.correlate import correlate
from ld_backend.diff import DiffError, diff
from ld_backend.diffs import SnapshotUnavailableError, load_archived_snapshot, snapshot_from_data, snapshot_model
from ld_backend.ingest import delivery_payload, error_payload
from ld_backend.render.page import build_page_data, render_page


@dataclass(frozen=True, slots=True)
class PageOutcome:
    page: str | None
    errors: tuple[dict[str, Any], ...] = ()
    problem: str | None = None
    counts: tuple[int, int, int] = (0, 0, 0)  # nœuds, câbles, contrôles


def _counts(snapshot: dict[str, Any]) -> tuple[int, int, int]:
    return len(snapshot["nodes"]), len(snapshot["links"]), len(snapshot["checks"])


def _diff_data(before: Snapshot, after: Snapshot) -> dict[str, Any]:
    """Le diff pour la page ; une `DiffError` remonte à l'appelant, qui en fait un problème lisible."""
    return diff(before, after).model_dump(mode="json")


def page_from_bundle(data: object, *, origin: str, previous: object = None) -> PageOutcome:
    """Valide, corrèle, assemble. Un bug de B1 remonte tel quel : ici, on veut voir la trace. `previous` : le
    fichier d'avant (bundle ou snapshot) dont la page embarque le diff."""
    report = validate_dict(data)
    if not report.ok or report.bundle is None:
        return PageOutcome(page=None, errors=tuple(error_payload(report.errors)), problem="bundle hors contrat")
    bundle = report.bundle
    current = correlate(bundle, fingerprint(bundle)[1])
    snapshot = current.model_dump(mode="json")
    ingest = delivery_payload(bundle, report.findings)
    diff_json = None
    if previous is not None:
        before, errors = snapshot_from_data(previous)
        if before is None:
            return PageOutcome(page=None, errors=tuple(error_payload(errors)), problem="fichier --from hors contrat")
        try:
            diff_json = _diff_data(before, current)
        except DiffError as exc:
            return PageOutcome(page=None, problem=str(exc))
    page = render_page(build_page_data(snapshot, ingest, origin=origin, diff=diff_json))
    return PageOutcome(page=page, counts=_counts(snapshot))


def page_from_archive(
    archive: BundleArchive, infrastructure: str, run_id: str, from_run: str | None = None
) -> PageOutcome:
    """Le snapshot et le rapport tels qu'archivés : la page montre ce que l'API sert. `from_run` : la run d'avant
    dont la page embarque le diff, comme `GET /api/diff`."""
    try:
        if archive.find_run(infrastructure, run_id) is None:
            return PageOutcome(page=None, problem="run inconnue pour cette infrastructure")
        snapshot = archive.load_snapshot(infrastructure, run_id)
        report = archive.load_report(infrastructure, run_id)
        if snapshot is None:
            return PageOutcome(page=None, problem="run archivée sans snapshot : lancer `ld correlate`")
        diff_json = None
        if from_run is not None:
            before = load_archived_snapshot(archive, infrastructure, from_run, "from")
            diff_json = _diff_data(before, snapshot_model(snapshot, "to"))  # le dict déjà lu, validé une fois
    except (SnapshotUnavailableError, DiffError) as exc:
        return PageOutcome(page=None, problem=str(exc))
    except ArchiveCorruptError, OSError:
        return PageOutcome(page=None, problem="entrée d'archive corrompue ou illisible : intervention nécessaire")
    # Pas de rapport n'est pas « aucun constat » : la page doit pouvoir dire « non disponible ».
    ingest = None if report is None else {"summary": report.get("summary"), "findings": report["findings"]}
    origin = f"archive · {infrastructure} · {run_id}"
    page = render_page(build_page_data(snapshot, ingest, origin=origin, diff=diff_json))
    return PageOutcome(page=page, counts=_counts(snapshot))
