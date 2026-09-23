"""Cohérence d'ensemble d'un snapshot : identités, références, structures, couverture, comptes.

Tout écart est un refus : un snapshot incohérent est un bug de B1, pas de la donnée. Les contextes situent
la faute (section, index, champ) sans citer de valeur.
"""

from typing import TYPE_CHECKING

from pydantic_core import PydanticCustomError

from ld_contracts.snapshot.enums import NodeKind
from ld_contracts.snapshot.refs import AggregateRef, ClusterRef, InterfaceRef, LinkKey, LinkRef, NodeRef, link_key
from ld_contracts.snapshot.report import SECTIONS
from ld_contracts.snapshot.structures import MlagDomain, MlagMember, SnapshotAggregate

if TYPE_CHECKING:
    from ld_contracts.snapshot.snapshot import Snapshot

Ref = NodeRef | InterfaceRef | LinkRef | AggregateRef | ClusterRef
TARGET_OF_REF = {
    NodeRef: "nodes",
    InterfaceRef: "interfaces",
    LinkRef: "links",
    AggregateRef: "aggregates",
    ClusterRef: "ha_clusters",
}


class Index:
    """Les éléments du document, par identité."""

    def __init__(self, snapshot: Snapshot) -> None:
        self.nodes = {n.hostname: n for n in snapshot.nodes}
        self.interfaces = {(i.hostname, i.name): i for i in snapshot.interfaces}
        self.links = {link_key(link) for link in snapshot.links}
        self.aggregates = {(a.hostname, a.name): a for a in snapshot.aggregates}
        self.ha_clusters = {tuple(m.hostname for m in c.members) for c in snapshot.ha_clusters}

    def has(self, ref: Ref) -> bool:
        match ref:
            case NodeRef():
                return ref.hostname in self.nodes
            case InterfaceRef():
                return (ref.hostname, ref.name) in self.interfaces
            case LinkRef():
                return link_key(ref) in self.links
            case AggregateRef():
                return (ref.hostname, ref.name) in self.aggregates
            case ClusterRef():
                return ref.members in self.ha_clusters


def unknown(section: str, index: int, field: str, target: str) -> PydanticCustomError:
    return PydanticCustomError(
        "reference_unknown",
        "la référence ne désigne aucun élément du snapshot",
        {"section": section, "index": index, "field": field, "target": target},
    )


def inconsistent(section: str, index: int, field: str) -> PydanticCustomError:
    return PydanticCustomError(
        "reference_inconsistent",
        "la référence existe mais contredit la structure",
        {"section": section, "index": index, "field": field},
    )


def _touches(cable: LinkKey, hostname: str, interfaces: set[str]) -> bool:
    return any(end.hostname == hostname and end.interface in interfaces for end in (cable.a, cable.b))


def check_node_identity(snapshot: Snapshot) -> None:
    """`hostname` est la clé des nœuds, toutes sortes confondues, comparée sans la casse."""
    seen: set[str] = set()
    for index, node in enumerate(snapshot.nodes):
        folded = node.hostname.casefold()
        if folded in seen:
            raise PydanticCustomError(
                "duplicate_identity", "identité en double dans la section", {"section": "nodes", "index": index}
            )
        seen.add(folded)


def check_interfaces_and_links(snapshot: Snapshot, index: Index) -> None:
    for position, itf in enumerate(snapshot.interfaces):
        if itf.hostname not in index.nodes:
            raise unknown("interfaces", position, "hostname", "nodes")
    for position, link in enumerate(snapshot.links):
        for side in ("a", "b"):
            end = getattr(link, side)
            if end.hostname not in index.nodes:
                raise unknown("links", position, f"{side}.hostname", "nodes")
            itf = index.interfaces.get((end.hostname, end.interface))
            if itf is None:
                continue  # device injoignable, stub, externe : l'interface peut manquer, pas le nœud
            expected = itf.aggregate.name if itf.aggregate is not None else None
            if getattr(link, f"aggregate_{side}") != expected:
                raise inconsistent("links", position, f"aggregate_{side}")


def check_aggregates(snapshot: Snapshot, index: Index) -> None:
    for position, aggregate in enumerate(snapshot.aggregates):
        if aggregate.hostname not in index.nodes:
            raise unknown("aggregates", position, "hostname", "nodes")
        members = {m.name for m in aggregate.members}
        for number, cable in enumerate(aggregate.cables):
            if link_key(cable) not in index.links:
                raise unknown("aggregates", position, f"cables[{number}]", "links")
            if not _touches(cable, aggregate.hostname, members):
                raise inconsistent("aggregates", position, f"cables[{number}]")


def _mlag_member(index: Index, member: MlagMember) -> SnapshotAggregate | None:
    return index.aggregates.get((member.hostname, member.aggregate))


def check_mlag_domains(snapshot: Snapshot, index: Index) -> None:
    for position, domain in enumerate(snapshot.mlag_domains):
        for number, member in enumerate(domain.members):
            aggregate = _mlag_member(index, member)
            if aggregate is None:
                raise unknown("mlag_domains", position, f"members[{number}]", "aggregates")
            if aggregate.mlag_id != domain.mlag_id:
                raise inconsistent("mlag_domains", position, f"members[{number}]")
        _check_peer_link(domain, position, index)
        if domain.downstream is not None and domain.downstream not in index.nodes:
            raise unknown("mlag_domains", position, "downstream", "nodes")


def _check_peer_link(domain: MlagDomain, position: int, index: Index) -> None:
    if domain.peer_link is None:
        return
    aggregate = _mlag_member(index, domain.peer_link)
    if aggregate is None:
        raise unknown("mlag_domains", position, "peer_link", "aggregates")
    devices = {m.hostname for m in domain.members}
    if not aggregate.mlag_peer_link or domain.peer_link.hostname not in devices:
        raise inconsistent("mlag_domains", position, "peer_link")


def check_ha_clusters(snapshot: Snapshot, index: Index) -> None:
    for position, cluster in enumerate(snapshot.ha_clusters):
        for number, member in enumerate(cluster.members):
            if member.hostname not in index.nodes:
                raise unknown("ha_clusters", position, f"members[{number}].hostname", "nodes")
        for number, heartbeat in enumerate(cluster.heartbeat_interfaces):
            field = f"heartbeat_interfaces[{number}].cable"
            if heartbeat.cable is None:
                continue
            if link_key(heartbeat.cable) not in index.links:
                raise unknown("ha_clusters", position, field, "links")
            if not _touches(heartbeat.cable, heartbeat.hostname, {heartbeat.interface}):
                raise inconsistent("ha_clusters", position, field)


def check_check_refs(snapshot: Snapshot, index: Index) -> None:
    for position, check in enumerate(snapshot.checks):
        for number, ref in enumerate(check.refs):
            if not index.has(ref):
                raise unknown("checks", position, f"refs[{number}]", TARGET_OF_REF[type(ref)])


def check_coverage(snapshot: Snapshot, index: Index) -> None:
    """`coverage` liste exactement les nœuds `device`, avec le même statut de collecte."""
    devices = {name for name, node in index.nodes.items() if node.kind == NodeKind.DEVICE}
    covered = {c.hostname for c in snapshot.coverage}
    if devices != covered:
        raise PydanticCustomError(
            "coverage_mismatch",
            "coverage ne liste pas exactement les nœuds device",
            {"missing": len(devices - covered), "unexpected": len(covered - devices)},
        )
    for position, coverage in enumerate(snapshot.coverage):
        if index.nodes[coverage.hostname].collection != coverage.status:
            raise PydanticCustomError(
                "coverage_status_mismatch",
                "coverage.status diffère de nodes[].collection",
                {"index": position},
            )


def check_counts(snapshot: Snapshot) -> None:
    for section in SECTIONS:
        declared, actual = getattr(snapshot.report.counts, section), len(getattr(snapshot, section))
        if declared != actual:
            raise PydanticCustomError(
                "report_counts_mismatch",
                "un compte du rapport diffère de la taille de la section",
                {"section": section, "declared": declared, "actual": actual},
            )


def check_integrity(snapshot: Snapshot) -> None:
    check_node_identity(snapshot)
    index = Index(snapshot)
    check_interfaces_and_links(snapshot, index)
    check_aggregates(snapshot, index)
    check_mlag_domains(snapshot, index)
    check_ha_clusters(snapshot, index)
    check_check_refs(snapshot, index)
    check_coverage(snapshot, index)
    check_counts(snapshot)
