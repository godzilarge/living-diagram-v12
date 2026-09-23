"""Ingestion d'un bundle : valider (contrat), archiver (B2), corréler (B1), rapporter.

B1 passe après l'archivage et ne peut pas le faire échouer (`snapshots.py`).

Un seul chemin de code pour la route HTTP et la ligne de commande.
"""

import logging
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from time import perf_counter
from types import MappingProxyType
from typing import Any

from ld_contracts.bundle import RunBundle
from ld_contracts.checks import Finding
from ld_contracts.validate import Issue, validate_dict

from ld_backend.archive import ArchiveConflictError, ArchiveCorruptError, BundleArchive
from ld_backend.schemas import (
    CorrelationSummary,
    IngestConflict,
    IngestError,
    IngestFinding,
    IngestReport,
    IngestSummary,
    Status,
    utc_z,
)
from ld_backend.snapshots import correlate_if_missing

log = logging.getLogger(__name__)

HTTP_STATUS: Mapping[Status, int] = MappingProxyType(
    {"created": 201, "already_present": 200, "invalid": 422, "conflict": 409, "archive_error": 500}
)


@dataclass(frozen=True, slots=True)
class IngestResult:
    status: Status
    infrastructure: str | None = None
    run_id: str | None = None
    errors: tuple[Issue, ...] = ()
    findings: tuple[Finding, ...] = ()
    summary: dict[str, Any] = field(default_factory=dict)
    conflict: IngestConflict | None = None
    correlation: CorrelationSummary | None = None

    @property
    def http_status(self) -> int:
        return HTTP_STATUS[self.status]


def _summary(bundle: RunBundle) -> dict[str, Any]:
    return {
        "contract_version": bundle.contract_version,
        "produced_at": utc_z(bundle.produced_at),
        "run_status": bundle.run.status.value,
        "devices": len(bundle.devices),
        "devices_in_scope": len(bundle.devices_in_scope()),
        "tasks": len(bundle.tasks),
        "interfaces": len(bundle.interfaces),
        "aggregates": len(bundle.aggregates),
        "lldp": len(bundle.lldp),
        "cdp": len(bundle.cdp),
        "system": len(bundle.system),
        "ha": len(bundle.ha),
        "residual_normalizations": dict(bundle.residual_normalizations),
    }


LOCATOR_KEYS = frozenset({"section", "index"})


def _locators(detail: dict[str, Any]) -> dict[str, Any]:
    """Le rapport sort sans valeur : du contexte d'une erreur, seuls la section et l'index situent le document."""
    return {k: v for k, v in detail.items() if k in LOCATOR_KEYS}


def result_payload(result: IngestResult) -> dict[str, Any]:
    """Forme JSON du résultat (`IngestReport`), identique pour l'API et la CLI ; aucune valeur du bundle."""
    report = IngestReport(
        status=result.status,
        infrastructure=result.infrastructure,
        run_id=result.run_id,
        summary=IngestSummary(**result.summary) if result.summary else None,
        errors=[IngestError(path=e.path, message=e.message, detail=_locators(e.detail)) for e in result.errors],
        findings=[
            IngestFinding(code=f.code, message=f.message, hostname=f.hostname, ref=f.ref, details=dict(f.details))
            for f in result.findings
        ],
        conflict=result.conflict,
        correlation=result.correlation,
    )
    return report.model_dump(mode="json")


def delivery_payload(bundle: RunBundle, findings: tuple[Finding, ...]) -> dict[str, Any]:
    """Résumé et constats d'une livraison validée, à la forme du rapport : ce que `ld render` montre sans archive."""
    payload = result_payload(IngestResult(status="created", findings=findings, summary=_summary(bundle)))
    return {"summary": payload["summary"], "findings": payload["findings"]}


def error_payload(errors: tuple[Issue, ...]) -> list[dict[str, Any]]:
    return result_payload(IngestResult(status="invalid", errors=errors))["errors"]


def _store(base: IngestResult, bundle: RunBundle, archive: BundleArchive) -> IngestResult:
    try:
        stored, created = archive.store(bundle, result_payload(base))
    except ArchiveConflictError as exc:
        conflict = IngestConflict(
            received_sha256=exc.received_sha256,
            archived_sha256=exc.existing.sha256,
            archived_stored_at=exc.existing.stored_at,
        )
        return IngestResult(
            status="conflict", infrastructure=base.infrastructure, run_id=base.run_id, conflict=conflict
        )
    except ArchiveCorruptError as exc:
        log.error("archive corrompue, intervention nécessaire : %s", exc)
        return IngestResult(status="archive_error", infrastructure=base.infrastructure, run_id=base.run_id)
    archived = base if created else replace(base, status="already_present")
    return replace(archived, correlation=correlate_if_missing(archive, bundle, stored.sha256, created=created))


def _validate_and_store(data: object, archive: BundleArchive) -> IngestResult:
    report = validate_dict(data)
    if not report.ok or report.bundle is None:
        return IngestResult(status="invalid", errors=report.errors)
    bundle = report.bundle
    base = IngestResult(
        status="created",
        infrastructure=bundle.infrastructure,
        run_id=bundle.run.collector_run_id,
        findings=report.findings,
        summary=_summary(bundle),
    )
    return _store(base, bundle, archive)


def ingest_bundle(data: object, archive: BundleArchive) -> IngestResult:
    started = perf_counter()
    result = _validate_and_store(data, archive)
    log.info(
        # %r : pas de ligne forgée par un libellé
        "ingestion infra=%r run=%r status=%s correlation=%s findings=%d errors=%d duree_ms=%d",
        result.infrastructure,
        result.run_id,
        result.status,
        result.correlation.status if result.correlation else "none",
        len(result.findings),
        len(result.errors),
        round((perf_counter() - started) * 1000),
    )
    return result
