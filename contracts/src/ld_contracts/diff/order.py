"""Clés de tri des entités du snapshot (R6), nommées une fois pour le contrat Diff et pour B3.

Ce sont les clés que `Snapshot._canonical_sections` applique ; le diff trie ses listes `added` / `removed` avec.
"""

from ld_contracts.snapshot.checks import check_key
from ld_contracts.snapshot.interfaces import SnapshotInterface
from ld_contracts.snapshot.nodes import Node
from ld_contracts.snapshot.order import natural_key
from ld_contracts.snapshot.refs import link_key
from ld_contracts.snapshot.structures import HaCluster, MlagDomain, SnapshotAggregate, mlag_member_key


def node_key(node: Node) -> tuple:
    return (str(node.kind), node.hostname)


def interface_key(interface: SnapshotInterface) -> tuple:
    return (interface.hostname, natural_key(interface.name))


def aggregate_key(aggregate: SnapshotAggregate) -> tuple:
    return (aggregate.hostname, natural_key(aggregate.name))


def mlag_domain_key(domain: MlagDomain) -> tuple:
    return (domain.mlag_id, tuple(mlag_member_key(m) for m in domain.members))


def ha_cluster_key(cluster: HaCluster) -> tuple:
    return tuple(m.hostname for m in cluster.members)


__all__ = [
    "aggregate_key",
    "check_key",
    "ha_cluster_key",
    "interface_key",
    "link_key",
    "mlag_domain_key",
    "node_key",
]
