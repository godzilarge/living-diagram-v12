"""Deux chemins vers la page : depuis un fichier bundle (sans archive ni serveur), ou depuis une run archivée.

Le chemin fichier est la boucle de mise au point d'un exportateur : corriger, relancer, rafraîchir. Il ne touche
pas l'archive, donc ré-exporter la même run avec des données corrigées ne rencontre pas de 409.
"""

from dataclasses import dataclass
from typing import Any

from ld_contracts.validate import validate_dict

from ld_backend.archive import ArchiveCorruptError, BundleArchive, fingerprint
from ld_backend.correlate import correlate
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


def page_from_bundle(data: object, *, origin: str) -> PageOutcome:
    """Valide, corrèle, assemble. Un bug de B1 remonte tel quel : ici, on veut voir la trace."""
    report = validate_dict(data)
    if not report.ok or report.bundle is None:
        return PageOutcome(page=None, errors=tuple(error_payload(report.errors)), problem="bundle hors contrat")
    bundle = report.bundle
    snapshot = correlate(bundle, fingerprint(bundle)[1]).model_dump(mode="json")
    ingest = delivery_payload(bundle, report.findings)
    return PageOutcome(page=render_page(build_page_data(snapshot, ingest, origin=origin)), counts=_counts(snapshot))


def page_from_archive(archive: BundleArchive, infrastructure: str, run_id: str) -> PageOutcome:
    """Le snapshot et le rapport tels qu'archivés : la page montre ce que l'API sert."""
    try:
        if archive.find_run(infrastructure, run_id) is None:
            return PageOutcome(page=None, problem="run inconnue pour cette infrastructure")
        snapshot = archive.load_snapshot(infrastructure, run_id)
        report = archive.load_report(infrastructure, run_id)
    except ArchiveCorruptError, OSError:
        return PageOutcome(page=None, problem="entrée d'archive corrompue ou illisible : intervention nécessaire")
    if snapshot is None:
        return PageOutcome(page=None, problem="run archivée sans snapshot : lancer `ld correlate`")
    # Pas de rapport n'est pas « aucun constat » : la page doit pouvoir dire « non disponible ».
    ingest = None if report is None else {"summary": report.get("summary"), "findings": report["findings"]}
    origin = f"archive · {infrastructure} · {run_id}"
    return PageOutcome(page=render_page(build_page_data(snapshot, ingest, origin=origin)), counts=_counts(snapshot))
