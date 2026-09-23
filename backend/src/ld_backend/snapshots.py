"""Branchement de B1 : corréler un bundle archivé et ranger le snapshot à côté de lui.

Trois règles (décisions du 2026-09-20, revue du même jour) :
- un échec de B1 ne fait jamais échouer l'ingestion : le bundle est la donnée irremplaçable, B1 est du code qui
  bouge ; la trace va au journal, la réponse dit `failed`, `ld correlate` rattrape après correction ;
- le snapshot est un produit dérivé : une livraison identique ne le recalcule pas, `recorrelate` le remplace ;
- **le snapshot se calcule toujours sur le bundle archivé**, jamais sur une livraison qui ne l'est pas : l'enveloppe
  (`produced_at`, `exporter_version`) est hors empreinte mais recopiée dans `snapshot.source`, et un ré-export de la
  même run donnerait d'autres octets que `ld correlate`.

Le journal d'un échec tient en deux lignes : la première ne cite aucune valeur (type d'exception, fichier, ligne),
la seconde donne le détail utile à la correction et peut citer des valeurs du bundle (un hostname dans un
`KeyError`). Pour une `ValidationError` du contrat, les valeurs d'entrée sont retirées.
"""

import logging
import traceback
from collections import Counter

from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot import Snapshot
from ld_contracts.snapshot.serialize import canonical_json
from pydantic import ValidationError

from ld_backend.archive import ArchiveCorruptError, BundleArchive
from ld_backend.correlate import correlate
from ld_backend.schemas import CorrelationSummary

log = logging.getLogger(__name__)

SEVERITIES = ("error", "warning", "info")
FAILED = CorrelationSummary(status="failed", nodes=None, links=None, checks=None)
ALREADY_PRESENT = CorrelationSummary(status="already_present", nodes=None, links=None, checks=None)


def summarize(snapshot: Snapshot) -> CorrelationSummary:
    by_severity = Counter(check.severity for check in snapshot.checks)
    return CorrelationSummary(
        status="created",
        nodes=len(snapshot.nodes),
        links=len(snapshot.links),
        checks={severity: by_severity.get(severity, 0) for severity in SEVERITIES},
    )


def _log_failure(exc: Exception, infrastructure: str, run_id: str) -> None:
    frames = traceback.extract_tb(exc.__traceback__)
    where = f"{frames[-1].filename}:{frames[-1].lineno} ({frames[-1].name})" if frames else "?"
    log.error("corrélation en échec infra=%r run=%r : %s à %s", infrastructure, run_id, type(exc).__name__, where)
    if isinstance(exc, ValidationError):
        detail = repr(exc.errors(include_input=False, include_url=False, include_context=False))
    else:
        detail = "".join(traceback.format_exception(exc))
    log.error("détail de l'échec (peut citer des valeurs du bundle, à relire avant de sortir de la zone) :\n%s", detail)


def correlate_and_store(archive: BundleArchive, bundle: RunBundle, sha256: str) -> CorrelationSummary:
    """Tout échec (B1, contrat de sortie, disque) est journalisé et rendu en `failed`, jamais propagé."""
    infrastructure, run_id = bundle.infrastructure, bundle.run.collector_run_id
    try:
        snapshot = correlate(bundle, sha256)
        archive.store_snapshot(infrastructure, run_id, canonical_json(snapshot))
    except Exception as exc:
        _log_failure(exc, infrastructure, run_id)
        return FAILED
    return summarize(snapshot)


def recorrelate(archive: BundleArchive, infrastructure: str, run_id: str) -> CorrelationSummary | None:
    """Recalcule depuis le bundle archivé et remplace. None si la run est inconnue ; archive corrompue : exception."""
    stored = archive.find_run(infrastructure, run_id)
    data = archive.load_bundle(infrastructure, run_id)
    if stored is None or data is None:
        return None
    try:
        bundle = RunBundle.model_validate(data)
    except ValidationError as exc:  # bundle archivé sous une version du contrat que ce code ne lit plus
        _log_failure(exc, infrastructure, run_id)
        return FAILED
    return correlate_and_store(archive, bundle, stored.sha256)


def correlate_if_missing(
    archive: BundleArchive, bundle: RunBundle, sha256: str, *, created: bool
) -> CorrelationSummary:
    """Chemin de l'ingestion. `created` : la livraison reçue est celle qui vient d'être archivée, on la corrèle.

    Sinon la run existait : son snapshot n'est pas recalculé ; s'il manque (B1 avait échoué), il se calcule depuis
    le bundle **archivé**, pas depuis la livraison reçue, dont l'enveloppe peut différer.
    """
    infrastructure, run_id = bundle.infrastructure, bundle.run.collector_run_id
    if created:
        return correlate_and_store(archive, bundle, sha256)
    try:
        if archive.has_snapshot(infrastructure, run_id):
            return ALREADY_PRESENT
        return recorrelate(archive, infrastructure, run_id) or FAILED
    except (ArchiveCorruptError, OSError) as exc:
        _log_failure(exc, infrastructure, run_id)
        return FAILED
