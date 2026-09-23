"""Source, couverture et rapport du snapshot."""

from typing import Annotated

from pydantic import Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, Hostname, Int, NonEmptyStr, SemVer, UtcDatetime
from ld_contracts.enums import RunStatus
from ld_contracts.snapshot.enums import CollectionStatus, TopicStatus
from ld_contracts.snapshot.order import identity, require_canonical

Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]

SECTIONS = ("nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters", "checks")


class RunSummary(ContractModel):
    """La run amont, telle que le bundle la décrit."""

    start_datetime: UtcDatetime = Field(description="Début de la run.")
    end_datetime: UtcDatetime | None = Field(description="Fin de la run ; null si absente.")
    status: RunStatus = Field(description="État global de la run.")


class Source(ContractModel):
    """D'où vient le snapshot : le bundle, identifié par son empreinte. Aucun horodatage propre à B1."""

    infrastructure: NonEmptyStr = Field(description="Infrastructure dessinée.")
    collector_run_id: NonEmptyStr = Field(description="Run amont.")
    bundle_sha256: Sha256Hex = Field(description="Empreinte SHA-256 du bundle archivé (hexadécimal minuscule).")
    contract_version: SemVer = Field(description="Version du contrat RunBundle du bundle.")
    produced_at: UtcDatetime = Field(description="`produced_at` du bundle.")
    exporter_version: NonEmptyStr = Field(description="`exporter_version` du bundle.")
    run: RunSummary = Field(description="Début, fin et statut de la run.")


class TopicCoverage(ContractModel):
    """Résultat de collecte par topic sur un device : `absent` = non demandé, rien à attendre."""

    interfaces: TopicStatus = Field(description="Topic `interfaces`.")
    aggregates: TopicStatus = Field(description="Topic agrégats.")
    lldp: TopicStatus = Field(description="Topic `lldp`.")
    cdp: TopicStatus = Field(description="Topic `cdp`.")
    system: TopicStatus = Field(description="Topic `system`.")
    ha: TopicStatus = Field(description="Topic `ha`.")


NOTHING_COLLECTED = frozenset({CollectionStatus.UNREACHABLE, CollectionStatus.NOT_COLLECTED})


class Coverage(ContractModel):
    """Ce qui a été collecté sur un device en périmètre : « pas vu parce que non collecté », pas « n'existe pas »."""

    hostname: Hostname = Field(description="Device en périmètre, clé de `nodes[]` (sorte `device`).")
    status: CollectionStatus = Field(
        description="Statut de la task, égal à `nodes[].collection` du device ; `not_collected` si aucune task."
    )
    topics: TopicCoverage = Field(description="Statut par topic ; tous `absent` si `unreachable` ou `not_collected`.")

    @model_validator(mode="after")
    def _nothing_collected_means_all_absent(self) -> Coverage:
        collected = [name for name, value in self.topics if value != TopicStatus.ABSENT]
        if self.status in NOTHING_COLLECTED and collected:
            raise PydanticCustomError(
                "coverage_topics_for_status",
                "un device sans collecte a un topic qui n'est pas absent",
                {"status": str(self.status), "fields": collected},
            )
        return self


class SectionCounts(ContractModel):
    """Taille de chaque section, vérifiée à la validation."""

    nodes: Int = Field(ge=0, description="Nombre de nœuds.")
    interfaces: Int = Field(ge=0, description="Nombre d'interfaces.")
    links: Int = Field(ge=0, description="Nombre de liens.")
    aggregates: Int = Field(ge=0, description="Nombre d'agrégats.")
    mlag_domains: Int = Field(ge=0, description="Nombre de domaines MLAG.")
    ha_clusters: Int = Field(ge=0, description="Nombre de clusters HA.")
    checks: Int = Field(ge=0, description="Nombre de contrôles.")


class Report(ContractModel):
    """Le rapport de corrélation. Les clés nullables absentes du bundle n'y sont pas : elles décrivent la
    livraison et vivent dans le rapport d'ingestion (décision 2026-09-19)."""

    counts: SectionCounts = Field(description="Comptes par section.")
    residual_normalizations: dict[str, Int] = Field(description="Recopié du bundle : ce que B0 a dû normaliser.")
    applied_normalizations: dict[str, Int] = Field(
        description="Compteur par règle de B1 (`ifname_short_to_long`…) ; doit rester explicable."
    )
    unresolved_names: tuple[NonEmptyStr, ...] = Field(description="Noms de voisins finis en stub, triés, sans doublon.")
    unparseable_descriptions: Int = Field(ge=0, description="Descriptions non vides que R2 n'a pas su lire.")

    @model_validator(mode="after")
    def _canonical(self) -> Report:
        require_canonical(self.unresolved_names, key=identity, section="unresolved_names")
        return self
