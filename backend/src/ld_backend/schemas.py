"""Formes de réponse de l'API : typées, donc présentes dans OpenAPI et dans les types TS générés.

Aucune de ces formes ne porte de valeur du bundle, à l'exception de `hostname` et `ref` d'un constat, qui ne
quittent pas la zone. Les dates écrites par le backend sont en UTC, forme du contrat (`Z`).
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Status = Literal["created", "already_present", "invalid", "conflict", "archive_error"]


def utc_z(moment: datetime) -> str:
    """ISO 8601 en UTC avec `Z` : une seule forme pour tout ce que le backend écrit lui-même."""
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class IngestError(ApiModel):
    path: str = Field(description="Chemin du champ ou du document fautif (`interfaces.0.duplex`, `lldp.0.hostname`).")
    message: str = Field(description="La règle enfreinte, sans valeur du bundle.")
    detail: dict[str, str | int] = Field(description="Localisateurs seulement : `section`, `index`.")


class IngestFinding(ApiModel):
    code: str
    message: str = Field(description="Texte lisible, sans valeur du bundle.")
    hostname: str | None = Field(description="Device concerné ; null pour un constat agrégé.")
    ref: str | None = Field(description="Objet concerné (interface, membre, liste de devices).")
    details: dict[str, str | int] = Field(
        description="Forme structurée du message, sans valeur : `nullable_key_absent` donne `field`, "
        "`occurrences`, `devices`."
    )


class IngestSummary(ApiModel):
    contract_version: str
    produced_at: str
    run_status: str
    devices: int
    devices_in_scope: int
    tasks: int
    interfaces: int
    aggregates: int
    lldp: int
    cdp: int
    system: int
    ha: int
    residual_normalizations: dict[str, int]


class IngestConflict(ApiModel):
    """Pourquoi un 409 : la run est archivée avec d'autres données. L'archive ne change pas."""

    received_sha256: str = Field(description="Empreinte des données reçues, hors enveloppe.")
    archived_sha256: str = Field(description="Empreinte des données archivées.")
    archived_stored_at: str = Field(description="Date de la première ingestion, celle qui fait foi.")


CorrelationStatus = Literal["created", "already_present", "failed"]


class CorrelationSummary(ApiModel):
    """Ce que B1 a fait de la livraison. Les comptes sont null quand rien n'a été calculé."""

    status: CorrelationStatus = Field(
        description="`created` : snapshot calculé et rangé ; `already_present` : la run avait déjà le sien, non "
        "recalculé ; `failed` : B1 a échoué, le bundle reste archivé, la trace est au journal du serveur."
    )
    nodes: int | None
    links: int | None
    checks: dict[str, int] | None = Field(description="Nombre de contrôles par sévérité (`error`, `warning`, `info`).")


class IngestReport(ApiModel):
    """Rapport d'ingestion : la réponse du POST, et le document archivé à côté du bundle."""

    status: Status
    infrastructure: str | None
    run_id: str | None
    summary: IngestSummary | None = Field(description="Comptes par section ; null si le bundle n'a pas été lu.")
    errors: list[IngestError]
    findings: list[IngestFinding] = Field(
        description="Constats de la livraison reçue. Sur un 200, ils peuvent différer du rapport archivé."
    )
    conflict: IngestConflict | None = Field(description="Renseigné sur un 409 seulement.")
    # Seul champ à défaut : les rapports archivés avant le branchement de B1 n'ont pas la clé et doivent se relire.
    correlation: CorrelationSummary | None = Field(
        default=None,
        description="Renseigné quand le bundle est archivé (201, 200). Toujours null dans le rapport archivé : il "
        "décrit l'ingestion, et l'état de la corrélation est la présence du snapshot, qui se recalcule.",
    )


class RunEntry(ApiModel):
    run_id: str
    run_start: str = Field(description="Début de la collecte : clé de tri de la liste et de la timeline.")
    run_end: str | None
    run_status: str
    produced_at: str = Field(description="Date d'export du bundle archivé.")
    stored_at: str = Field(description="Date d'ingestion.")
    sha256: str = Field(description="Empreinte des données, hors enveloppe.")


class RunList(ApiModel):
    infrastructure: str
    runs: list[RunEntry] = Field(description="Triées par début de collecte, puis par `run_id`.")
