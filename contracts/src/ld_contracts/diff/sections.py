"""Les sections du diff : par entité, ajoutées (état d'après), retirées (état d'avant), changées (référence et champs).

Les listes `added` / `removed` suivent l'ordre canonique de leur section dans le snapshot ; `changed` est trié par
référence et ne contient que des références de la sorte de la section ; une identité n'apparaît que dans une part ;
aucun champ volatil déclaré n'entre dans `changed`.
"""

from collections.abc import Callable
from typing import Any

from pydantic import Field, model_validator

from ld_contracts.common import ContractModel, Int
from ld_contracts.diff.changes import (
    VOLATILE_PATHS,
    EntityChange,
    change_key,
    require_disjoint,
    require_no_volatile,
    require_ref_kind,
)
from ld_contracts.diff.order import (
    aggregate_key,
    check_key,
    ha_cluster_key,
    interface_key,
    link_key,
    mlag_domain_key,
    node_key,
)
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.interfaces import SnapshotInterface
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.nodes import Node
from ld_contracts.snapshot.order import require_canonical
from ld_contracts.snapshot.refs import ref_key
from ld_contracts.snapshot.structures import HaCluster, MlagDomain, SnapshotAggregate, mlag_member_key

NO_VOLATILE: frozenset[str] = frozenset()


def _added(what: str, order: str) -> Any:
    return Field(description=f"{what} présents dans `after` seulement, tels qu'ils y sont ; triés par {order}.")


def _removed(what: str, order: str) -> Any:
    return Field(description=f"{what} présents dans `before` seulement, tels qu'ils y étaient ; triés par {order}.")


def _changed(what: str, kind: str) -> Any:
    return Field(
        description=f"{what} présents des deux côtés dont un champ non volatil diffère ; référence `{kind}`, "
        "triés par identité."
    )


def _canonical_section(
    section: ContractModel,
    *,
    key: Callable,
    identity: Callable,
    ref_identity: Callable,
    kind: str,
    name: str,
    volatile: frozenset[str] = NO_VOLATILE,
) -> None:
    require_canonical(section.added, key=key, section=f"{name}.added")
    require_canonical(section.removed, key=key, section=f"{name}.removed")
    require_canonical(section.changed, key=change_key, section=f"{name}.changed")
    require_ref_kind(section.changed, kind, f"{name}.changed")
    require_no_volatile(section.changed, volatile, f"{name}.changed")
    require_disjoint(
        {
            "added": (identity(item) for item in section.added),
            "removed": (identity(item) for item in section.removed),
            "changed": (ref_identity(change.ref) for change in section.changed),
        },
        name,
    )


def _by_hostname_and_name(item: Any) -> tuple:
    return (item.hostname, item.name)


class NodeChanges(ContractModel):
    """Nœuds ajoutés, retirés, changés. Identité : `hostname`, à l'octet (un stub devenu device est un nœud changé si
    le nom s'écrit à l'identique, `docs/07` Q5)."""

    added: tuple[Node, ...] = _added("Nœuds", "(sorte, hostname)")
    removed: tuple[Node, ...] = _removed("Nœuds", "(sorte, hostname)")
    changed: tuple[EntityChange, ...] = _changed("Nœuds", "node")

    @model_validator(mode="after")
    def _canonical(self) -> NodeChanges:
        _canonical_section(
            self,
            key=node_key,
            identity=lambda n: n.hostname,
            ref_identity=lambda r: r.hostname,
            kind="node",
            name="nodes",
            volatile=VOLATILE_PATHS["nodes"],
        )
        return self


class InterfaceChanges(ContractModel):
    """Interfaces ajoutées, retirées, changées. Identité : `(hostname, name)`."""

    added: tuple[SnapshotInterface, ...] = _added("Interfaces", "(hostname, nom naturel)")
    removed: tuple[SnapshotInterface, ...] = _removed("Interfaces", "(hostname, nom naturel)")
    changed: tuple[EntityChange, ...] = _changed("Interfaces", "interface")

    @model_validator(mode="after")
    def _canonical(self) -> InterfaceChanges:
        _canonical_section(
            self,
            key=interface_key,
            identity=_by_hostname_and_name,
            ref_identity=_by_hostname_and_name,
            kind="interface",
            name="interfaces",
            volatile=VOLATILE_PATHS["interfaces"],
        )
        return self


class LinkChanges(ContractModel):
    """Liens ajoutés, retirés, changés. Identité : la paire triée des bouts (`kind` n'en fait pas partie en V1)."""

    added: tuple[Link, ...] = _added("Liens", "paire de bouts")
    removed: tuple[Link, ...] = _removed("Liens", "paire de bouts")
    changed: tuple[EntityChange, ...] = _changed("Liens", "link")

    @model_validator(mode="after")
    def _canonical(self) -> LinkChanges:
        _canonical_section(self, key=link_key, identity=link_key, ref_identity=link_key, kind="link", name="links")
        return self


class AggregateChanges(ContractModel):
    """Agrégats ajoutés, retirés, changés. Identité : `(hostname, name)`."""

    added: tuple[SnapshotAggregate, ...] = _added("Agrégats", "(hostname, nom naturel)")
    removed: tuple[SnapshotAggregate, ...] = _removed("Agrégats", "(hostname, nom naturel)")
    changed: tuple[EntityChange, ...] = _changed("Agrégats", "aggregate")

    @model_validator(mode="after")
    def _canonical(self) -> AggregateChanges:
        _canonical_section(
            self,
            key=aggregate_key,
            identity=_by_hostname_and_name,
            ref_identity=_by_hostname_and_name,
            kind="aggregate",
            name="aggregates",
        )
        return self


def _mlag_identity(item: Any) -> tuple:
    return (item.mlag_id, tuple(mlag_member_key(m) for m in item.members))


class MlagDomainChanges(ContractModel):
    """Domaines MLAG ajoutés, retirés, changés. Identité : `(mlag_id, membres)`."""

    added: tuple[MlagDomain, ...] = _added("Domaines", "(`mlag_id`, membres)")
    removed: tuple[MlagDomain, ...] = _removed("Domaines", "(`mlag_id`, membres)")
    changed: tuple[EntityChange, ...] = _changed("Domaines", "mlag_domain")

    @model_validator(mode="after")
    def _canonical(self) -> MlagDomainChanges:
        _canonical_section(
            self,
            key=mlag_domain_key,
            identity=_mlag_identity,
            ref_identity=_mlag_identity,
            kind="mlag_domain",
            name="mlag_domains",
        )
        return self


class HaClusterChanges(ContractModel):
    """Clusters HA ajoutés, retirés, changés. Identité : l'ensemble des membres (un membre perdu = cluster retiré
    et cluster ajouté, docs/07 Q1)."""

    added: tuple[HaCluster, ...] = _added("Clusters", "membres")
    removed: tuple[HaCluster, ...] = _removed("Clusters", "membres")
    changed: tuple[EntityChange, ...] = _changed("Clusters", "cluster")

    @model_validator(mode="after")
    def _canonical(self) -> HaClusterChanges:
        _canonical_section(
            self,
            key=ha_cluster_key,
            identity=ha_cluster_key,
            ref_identity=lambda r: tuple(r.members),
            kind="cluster",
            name="ha_clusters",
        )
        return self


def check_identity(check: Check) -> tuple:
    """`(code, refs)` : les `details` décrivent, ils n'identifient pas (docs/07 D3) ; partagé avec B3."""
    return (str(check.code), tuple(ref_key(r) for r in check.refs))


class CheckChanges(ContractModel):
    """Contrôles apparus, résolus, persistants. Identité : `(code, refs)` ; les `details` décrivent, ils
    n'identifient pas (un contrôle dont seuls les détails changent persiste)."""

    appeared: tuple[Check, ...] = Field(
        description="Contrôles de `after` sans équivalent dans `before`, triés par (code, références, détails)."
    )
    resolved: tuple[Check, ...] = Field(
        description="Contrôles de `before` sans équivalent dans `after`, triés par (code, références, détails)."
    )
    persisted: Int = Field(ge=0, description="Nombre de contrôles présents des deux côtés.")

    @model_validator(mode="after")
    def _canonical(self) -> CheckChanges:
        require_canonical(self.appeared, key=check_key, section="checks.appeared")
        require_canonical(self.resolved, key=check_key, section="checks.resolved")
        # En multi-ensemble, une identité apparue ne peut pas aussi être résolue : les communs sont `persisted`.
        require_disjoint(
            {"appeared": map(check_identity, self.appeared), "resolved": map(check_identity, self.resolved)}, "checks"
        )
        return self


class CoverageChanges(ContractModel):
    """Couverture changée sur un device présent des deux côtés : statut de collecte ou statut d'un topic. Les
    devices ajoutés ou retirés se lisent dans `nodes`."""

    changed: tuple[EntityChange, ...] = Field(
        description="Référence `node` ; champs `status`, `topics.<topic>` ; triés par hostname."
    )

    @model_validator(mode="after")
    def _canonical(self) -> CoverageChanges:
        require_canonical(self.changed, key=change_key, section="coverage.changed")
        require_ref_kind(self.changed, "node", "coverage.changed")
        return self
