"""Les deux runs comparées et le résumé du diff, vérifié contre les sections."""

from pydantic import Field, field_validator

from ld_contracts.common import ContractModel, Int, NonEmptyStr, SemVer, UtcDatetime
from ld_contracts.enums import RunStatus
from ld_contracts.snapshot.report import Sha256Hex
from ld_contracts.snapshot.snapshot import require_supported_major


class RunRef(ContractModel):
    """Une des deux runs comparées : la carte d'identité de son snapshot, recopiée de `source`."""

    collector_run_id: NonEmptyStr = Field(description="Run amont.")
    bundle_sha256: Sha256Hex = Field(description="Empreinte du bundle archivé dont le snapshot vient.")
    snapshot_version: SemVer = Field(
        description="`snapshot_version` du snapshot comparé, de la majeure que le contrat Snapshot accepte."
    )
    start_datetime: UtcDatetime = Field(description="Début de la run ; `elapsed_seconds` se calcule sur ce champ.")
    end_datetime: UtcDatetime | None = Field(description="Fin de la run ; null si absente.")
    status: RunStatus = Field(description="État global de la run.")

    @field_validator("snapshot_version")
    @classmethod
    def _major_is_supported(cls, value: str) -> str:
        return require_supported_major(value)


class SectionSummary(ContractModel):
    """Comptes d'une section d'entités."""

    added: Int = Field(ge=0, description="Taille de `added`.")
    removed: Int = Field(ge=0, description="Taille de `removed`.")
    changed: Int = Field(ge=0, description="Taille de `changed`.")


class CheckSummary(ContractModel):
    """Comptes des contrôles."""

    appeared: Int = Field(ge=0, description="Taille de `checks.appeared`.")
    resolved: Int = Field(ge=0, description="Taille de `checks.resolved`.")
    persisted: Int = Field(ge=0, description="Égal à `checks.persisted`.")


class CoverageSummary(ContractModel):
    """Comptes de la couverture."""

    changed: Int = Field(ge=0, description="Taille de `coverage.changed`.")


class EventSummary(ContractModel):
    """Comptes des événements, par sorte."""

    rebooted: Int = Field(ge=0, description="Nœuds redémarrés.")
    flapped: Int = Field(ge=0, description="Interfaces qui ont changé d'état dans la fenêtre.")


class Summary(ContractModel):
    """Ce que la timeline affiche sans ouvrir le diff ; chaque compte est vérifié contre sa liste."""

    nodes: SectionSummary = Field(description="Nœuds.")
    interfaces: SectionSummary = Field(description="Interfaces.")
    links: SectionSummary = Field(description="Liens.")
    aggregates: SectionSummary = Field(description="Agrégats.")
    mlag_domains: SectionSummary = Field(description="Domaines MLAG.")
    ha_clusters: SectionSummary = Field(description="Clusters HA.")
    checks: CheckSummary = Field(description="Contrôles.")
    coverage: CoverageSummary = Field(description="Couverture.")
    events: EventSummary = Field(description="Événements.")
    volatile_changes: Int = Field(
        ge=0,
        description="Nombre de différences sur les champs volatils (`uptime_seconds`, `last_change_age_seconds`), "
        "exclues de `changed` ; non vérifiable depuis le document.",
    )
