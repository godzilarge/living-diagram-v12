"""D1 et D3 : appariement par l'identité du snapshot, section par section ; contrôles en multi-ensemble.

Chaque section rend son modèle du contrat Diff et le nombre de différences volatiles qu'elle a ignorées.
"""

from collections import defaultdict
from collections.abc import Callable, Sequence

from ld_contracts.diff.changes import EntityChange, change_key
from ld_contracts.diff.order import (
    aggregate_key,
    check_key,
    ha_cluster_key,
    interface_key,
    link_key,
    mlag_domain_key,
    node_key,
)
from ld_contracts.diff.refs import MlagDomainRef
from ld_contracts.diff.sections import (
    AggregateChanges,
    CheckChanges,
    CoverageChanges,
    HaClusterChanges,
    InterfaceChanges,
    LinkChanges,
    MlagDomainChanges,
    NodeChanges,
    check_identity,
)
from ld_contracts.snapshot import Snapshot
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.refs import AggregateRef, ClusterRef, InterfaceRef, LinkRef, NodeRef

from ld_backend.diff.fields import NO_VOLATILE, VOLATILE, compare


def match[T](
    before: Sequence[T], after: Sequence[T], identity: Callable[[T], object]
) -> tuple[list[T], list[T], list[tuple[T, T]]]:
    """Présents dans `after` seulement, dans `before` seulement, dans les deux (paires `(avant, après)`)."""
    before_by = {identity(item): item for item in before}
    after_by = {identity(item): item for item in after}
    added = [item for key, item in after_by.items() if key not in before_by]
    removed = [item for key, item in before_by.items() if key not in after_by]
    pairs = [(before_by[key], item) for key, item in after_by.items() if key in before_by]
    return added, removed, pairs


def changed[T](
    pairs: list[tuple[T, T]], ref_of: Callable[[T], object], volatile: frozenset[str]
) -> tuple[tuple[EntityChange, ...], int]:
    out: list[EntityChange] = []
    ignored = 0
    for before, after in pairs:
        fields, count = compare(before, after, volatile)  # type: ignore[arg-type]
        ignored += count
        if fields:
            out.append(EntityChange(ref=ref_of(after), fields=fields))
    return tuple(sorted(out, key=change_key)), ignored


def _section[T](
    before: Sequence[T],
    after: Sequence[T],
    *,
    identity: Callable[[T], object],
    key: Callable[[T], object],
    ref_of: Callable[[T], object],
    volatile: frozenset[str],
    model: type,
) -> tuple[object, int]:
    added, removed, pairs = match(before, after, identity)
    changes, ignored = changed(pairs, ref_of, volatile)
    section = model(added=tuple(sorted(added, key=key)), removed=tuple(sorted(removed, key=key)), changed=changes)
    return section, ignored


def node_changes(before: Snapshot, after: Snapshot) -> tuple[NodeChanges, int]:
    """Identité = hostname à l'octet, quelle que soit la sorte : un stub devenu device est un nœud changé si le nom
    s'écrit à l'identique ; réécrit avec une majuscule, il est retiré puis ajouté (`docs/07` Q5, à trancher)."""
    return _section(  # type: ignore[return-value]
        before.nodes,
        after.nodes,
        identity=lambda n: n.hostname,
        key=node_key,
        ref_of=lambda n: NodeRef(kind="node", hostname=n.hostname),
        volatile=VOLATILE["nodes"],
        model=NodeChanges,
    )


def interface_changes(before: Snapshot, after: Snapshot) -> tuple[InterfaceChanges, int]:
    return _section(  # type: ignore[return-value]
        before.interfaces,
        after.interfaces,
        identity=interface_key,
        key=interface_key,
        ref_of=lambda i: InterfaceRef(kind="interface", hostname=i.hostname, name=i.name),
        volatile=VOLATILE["interfaces"],
        model=InterfaceChanges,
    )


def link_changes(before: Snapshot, after: Snapshot) -> tuple[LinkChanges, int]:
    return _section(  # type: ignore[return-value]
        before.links,
        after.links,
        identity=link_key,
        key=link_key,
        ref_of=lambda link: LinkRef(kind="link", a=link.a, b=link.b),
        volatile=NO_VOLATILE,
        model=LinkChanges,
    )


def aggregate_changes(before: Snapshot, after: Snapshot) -> tuple[AggregateChanges, int]:
    return _section(  # type: ignore[return-value]
        before.aggregates,
        after.aggregates,
        identity=aggregate_key,
        key=aggregate_key,
        ref_of=lambda a: AggregateRef(kind="aggregate", hostname=a.hostname, name=a.name),
        volatile=NO_VOLATILE,
        model=AggregateChanges,
    )


def mlag_domain_changes(before: Snapshot, after: Snapshot) -> tuple[MlagDomainChanges, int]:
    return _section(  # type: ignore[return-value]
        before.mlag_domains,
        after.mlag_domains,
        identity=mlag_domain_key,
        key=mlag_domain_key,
        ref_of=lambda d: MlagDomainRef(kind="mlag_domain", mlag_id=d.mlag_id, members=d.members),
        volatile=NO_VOLATILE,
        model=MlagDomainChanges,
    )


def ha_cluster_changes(before: Snapshot, after: Snapshot) -> tuple[HaClusterChanges, int]:
    return _section(  # type: ignore[return-value]
        before.ha_clusters,
        after.ha_clusters,
        identity=ha_cluster_key,
        key=ha_cluster_key,
        ref_of=lambda c: ClusterRef(kind="cluster", members=tuple(m.hostname for m in c.members)),
        volatile=NO_VOLATILE,
        model=HaClusterChanges,
    )


def coverage_changes(before: Snapshot, after: Snapshot) -> CoverageChanges:
    """Devices présents des deux côtés seulement : un device ajouté ou retiré se lit dans `nodes`."""
    _, _, pairs = match(before.coverage, after.coverage, lambda c: c.hostname)
    changes, _ = changed(pairs, lambda c: NodeRef(kind="node", hostname=c.hostname), NO_VOLATILE)
    return CoverageChanges(changed=changes)


def check_changes(before: Snapshot, after: Snapshot) -> CheckChanges:
    """Identité `(code, refs)` en multi-ensemble : les détails décrivent, ils n'identifient pas (D3) ; une sévérité
    qui change seule est donc un `persisted` (revue, B2, parqué)."""
    groups: dict[tuple, tuple[list[Check], list[Check]]] = defaultdict(lambda: ([], []))
    for check in before.checks:
        groups[check_identity(check)][0].append(check)
    for check in after.checks:
        groups[check_identity(check)][1].append(check)
    appeared: list[Check] = []
    resolved: list[Check] = []
    persisted = 0
    for olds, news in groups.values():
        common = min(len(olds), len(news))
        persisted += common
        resolved.extend(olds[common:])
        appeared.extend(news[common:])
    return CheckChanges(
        appeared=tuple(sorted(appeared, key=check_key)),
        resolved=tuple(sorted(resolved, key=check_key)),
        persisted=persisted,
    )
