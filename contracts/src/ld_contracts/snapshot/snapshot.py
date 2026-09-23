"""Snapshot v1 : le graphe d'une run, sortie de B1, entrée de tout le reste.

Le document refuse ce qu'un bundle ne fait que signaler : un snapshot incohérent est un bug de B1,
pas de la donnée. Toutes les clés sont requises ; les listes sont dans l'ordre canonique ; toute
référence désigne un élément du document (`integrity`).
"""

from pydantic import Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from ld_contracts.common import ContractModel, SemVer
from ld_contracts.snapshot.checks import Check, check_key
from ld_contracts.snapshot.integrity import check_integrity
from ld_contracts.snapshot.interfaces import SnapshotInterface
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.nodes import Node
from ld_contracts.snapshot.order import natural_key, require_canonical
from ld_contracts.snapshot.refs import link_key
from ld_contracts.snapshot.report import Coverage, Report, Source
from ld_contracts.snapshot.structures import HaCluster, MlagDomain, SnapshotAggregate

SNAPSHOT_VERSION = "1.0.0"
SNAPSHOT_MAJOR = int(SNAPSHOT_VERSION.split(".")[0])


class Snapshot(ContractModel):
    """Le graphe d'une run : nœuds, interfaces, arêtes typées, structures, contrôles, couverture, rapport.

    Tout vient du bundle ou d'une règle déterministe de B1 : aucun horodatage propre, aucun identifiant
    synthétique, aucune coordonnée. Même bundle ⇒ même snapshot, à l'octet (`canonical_json`).
    """

    snapshot_version: SemVer = Field(
        description="Version semver du contrat Snapshot, indépendante de celle du RunBundle."
    )
    source: Source = Field(description="Le bundle d'origine.")
    nodes: tuple[Node, ...] = Field(description="Nœuds, triés par (sorte, hostname) ; hostname unique sans la casse.")
    interfaces: tuple[SnapshotInterface, ...] = Field(description="Interfaces, triées par (hostname, nom naturel).")
    links: tuple[Link, ...] = Field(description="Arêtes, triées par paire d'endpoints.")
    aggregates: tuple[SnapshotAggregate, ...] = Field(description="Agrégats, triés par (hostname, nom naturel).")
    mlag_domains: tuple[MlagDomain, ...] = Field(description="Domaines MLAG, triés par (mlag_id, membres).")
    ha_clusters: tuple[HaCluster, ...] = Field(description="Clusters HA, triés par membres.")
    checks: tuple[Check, ...] = Field(description="Contrôles, triés par (code, références, détails).")
    coverage: tuple[Coverage, ...] = Field(description="Un élément par nœud `device`, triés par hostname.")
    report: Report = Field(description="Comptes et normalisations.")

    @field_validator("snapshot_version")
    @classmethod
    def _major_is_supported(cls, value: str) -> str:
        major = int(value.split(".")[0])
        if major != SNAPSHOT_MAJOR:
            raise PydanticCustomError(
                "snapshot_major_unsupported",
                "version majeure du snapshot non supportée",
                {"received": major, "expected": SNAPSHOT_MAJOR},
            )
        return value

    @model_validator(mode="after")
    def _consistent(self) -> Snapshot:
        self._canonical_sections()
        check_integrity(self)
        return self

    def _canonical_sections(self) -> None:
        require_canonical(self.nodes, key=lambda n: (str(n.kind), n.hostname), section="nodes")
        require_canonical(self.interfaces, key=lambda i: (i.hostname, natural_key(i.name)), section="interfaces")
        require_canonical(self.links, key=link_key, section="links")
        require_canonical(self.aggregates, key=lambda a: (a.hostname, natural_key(a.name)), section="aggregates")
        require_canonical(
            self.mlag_domains,
            key=lambda d: (d.mlag_id, tuple((m.hostname, natural_key(m.aggregate)) for m in d.members)),
            section="mlag_domains",
        )
        require_canonical(self.ha_clusters, key=lambda c: tuple(m.hostname for m in c.members), section="ha_clusters")
        require_canonical(self.checks, key=check_key, section="checks")
        require_canonical(self.coverage, key=lambda c: c.hostname, section="coverage")
