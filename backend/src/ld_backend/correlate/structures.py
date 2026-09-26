"""R4 : agrégats, faisceaux et domaines MLAG, construits sur les câbles de R3 ; puis les clusters HA (`ha.py`).

`aggregates[]` du snapshot ne reprend que les documents `aggregates[]` du bundle : un agrégat connu par
`interfaces[].members` seul (topic en échec) n'a ni protocole ni statut de membre, on n'en invente pas ; son
appartenance reste visible sur les interfaces et les câbles. La paire MLAG se détermine par le peer-link câblé,
un numéro de vPC étant local à son domaine ; à défaut, par un `mlag_id` partagé par exactement deux devices.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from ld_contracts.enums import MemberStatus
from ld_contracts.models_interfaces import Aggregate
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.order import natural_key
from ld_contracts.snapshot.refs import LinkKey, link_key
from ld_contracts.snapshot.structures import HaCluster, MlagDomain, MlagMember, SnapshotAggregate, mlag_member_key

from ld_backend.correlate.checkbuild import aggregate_ref, port_ref, structure_check
from ld_backend.correlate.context import Context, Key
from ld_backend.correlate.ha import build_ha_clusters

Cables = Mapping[tuple, Link]  # par clé de lien
Beam = tuple[Key, Key]  # deux agrégats reliés par au moins un câble, clés triées
Pair = tuple[SnapshotAggregate, SnapshotAggregate]  # deux agrégats candidats à un domaine, triés par hostname


@dataclass(frozen=True, slots=True)
class Structures:
    aggregates: tuple[SnapshotAggregate, ...]
    mlag_domains: tuple[MlagDomain, ...]
    ha_clusters: tuple[HaCluster, ...]
    checks: tuple[Check, ...]


def aggregate_key(hostname: str, name: str) -> tuple:
    return hostname, natural_key(name)


def _ordered(first: Key, second: Key) -> Beam:
    return (first, second) if aggregate_key(*first) <= aggregate_key(*second) else (second, first)


def _other_hosts(aggregate: SnapshotAggregate) -> set[str]:
    return {end.hostname for cable in aggregate.cables for end in (cable.a, cable.b)} - {aggregate.hostname}


# --- agrégats ---------------------------------------------------------------------------------------------------


def _cables_by_aggregate(links: Iterable[Link]) -> dict[Key, dict[tuple, Link]]:
    out: dict[Key, dict[tuple, Link]] = defaultdict(dict)
    for link in links:
        for end, name in ((link.a, link.aggregate_a), (link.b, link.aggregate_b)):
            if name is not None:
                out[(end.hostname, name)][link_key(link)] = link
    return out


def _aggregate(doc: Aggregate, cables: Cables) -> SnapshotAggregate:
    """Recopie du document ; `cables` = les câbles qui touchent un de ses membres (un câble arrêté à l'agrégat
    lui-même, R1-bis indéterminé, n'en fait pas partie)."""
    members = tuple(sorted(doc.members, key=lambda m: natural_key(m.name)))
    names = {m.name for m in members}
    touching = sorted(
        key
        for key, link in cables.items()
        if any(end.hostname == doc.hostname and end.interface in names for end in (link.a, link.b))
    )
    return SnapshotAggregate(
        hostname=doc.hostname,
        name=doc.name,
        oper_status=doc.oper_status,
        protocol=doc.protocol,
        lacp_mode=doc.lacp_mode,
        min_links=doc.min_links,
        members=members,
        mlag_id=doc.mlag_id,
        mlag_peer_link=doc.mlag_peer_link,
        cables=tuple(LinkKey(a=cables[key].a, b=cables[key].b) for key in touching),
        degraded=any(m.status != MemberStatus.BUNDLED for m in members),
    )


def _aggregate_checks(ctx: Context, doc: Aggregate) -> list[Check]:
    ref = aggregate_ref(doc.hostname, doc.name)
    out = []
    for member in doc.members:
        if member.status != MemberStatus.BUNDLED:
            member_ref, _ = port_ref(ctx, doc.hostname, member.name)  # le nom est déjà dans `member`
            out.append(
                structure_check(
                    CheckCode.AGGREGATE_MEMBER_NOT_BUNDLED,
                    (ref, member_ref),
                    member=member.name,
                    status=str(member.status),
                )
            )
    bundled = sum(m.status == MemberStatus.BUNDLED for m in doc.members)
    if doc.min_links is not None and bundled < doc.min_links:
        out.append(
            structure_check(CheckCode.AGGREGATE_BELOW_MIN_LINKS, (ref,), min_links=doc.min_links, bundled=bundled)
        )
    return out


def _beams(links: Iterable[Link]) -> dict[Beam, list[Link]]:
    """Un faisceau : les câbles dont les deux bouts sont membres d'un agrégat."""
    out: dict[Beam, list[Link]] = defaultdict(list)
    for link in links:
        if link.aggregate_a is not None and link.aggregate_b is not None:
            out[_ordered((link.a.hostname, link.aggregate_a), (link.b.hostname, link.aggregate_b))].append(link)
    return out


def _protocol_checks(by_key: Mapping[Key, SnapshotAggregate], beams: Mapping[Beam, list[Link]]) -> list[Check]:
    out = []
    for first, second in sorted(beams, key=lambda beam: tuple(aggregate_key(*key) for key in beam)):
        left, right = by_key.get(first), by_key.get(second)
        if left is None or right is None or left.protocol == right.protocol:
            continue  # un bout sans document `aggregates[]` n'a pas de protocole connu : rien à comparer
        out.append(
            structure_check(
                CheckCode.AGGREGATE_PROTOCOL_MISMATCH,
                (aggregate_ref(*first), aggregate_ref(*second)),
                protocols=[
                    {"hostname": a.hostname, "aggregate": a.name, "protocol": str(a.protocol)} for a in (left, right)
                ],
                cable_statuses=sorted({str(link.status) for link in beams[(first, second)]}),  # documenté seul ? (B4)
            )
        )
    return out


# --- MLAG -------------------------------------------------------------------------------------------------------


def _peer_pairs(aggregates: Iterable[SnapshotAggregate]) -> set[frozenset[str]]:
    """Paires de devices reliés par un peer-link câblé ; un device présent dans deux paires n'en garde aucune.

    Une paire n'a de sens qu'entre deux devices porteurs de documents `aggregates[]` : un peer-link dont les câbles
    mènent à un stub ou à un externe ne forme pas de paire, et le repli par `mlag_id` reste possible (revue, H1).
    """
    with_documents = {aggregate.hostname for aggregate in aggregates}
    pairs: set[frozenset[str]] = set()
    for aggregate in aggregates:
        others = _other_hosts(aggregate) if aggregate.mlag_peer_link else set()
        if len(others) == 1 and next(iter(others)) in with_documents:
            pairs.add(frozenset({aggregate.hostname, next(iter(others))}))
    hosts = [host for pair in pairs for host in pair]
    conflicted = {host for host in hosts if hosts.count(host) > 1}
    return {pair for pair in pairs if not pair & conflicted}


def _candidates(aggregates: tuple[SnapshotAggregate, ...]) -> list[Pair]:
    """Par paire de peers, chaque `mlag_id` porté par un agrégat de chaque bout ; puis, hors de toute paire,
    un `mlag_id` partagé par exactement deux devices."""
    with_id = [
        a for a in aggregates if a.mlag_id is not None and not a.mlag_peer_link
    ]  # un peer-link n'est pas un membre
    by_device_id: dict[tuple[str, int], list[SnapshotAggregate]] = defaultdict(list)
    for aggregate in with_id:
        by_device_id[(aggregate.hostname, aggregate.mlag_id)].append(aggregate)
    pairs = _peer_pairs(aggregates)
    paired = {host for pair in pairs for host in pair}
    out: list[Pair] = []
    for left_host, right_host in sorted(sorted(pair) for pair in pairs):
        ids = {i for (h, i) in by_device_id if h == left_host} & {i for (h, i) in by_device_id if h == right_host}
        for mlag_id in sorted(ids):
            left, right = by_device_id[(left_host, mlag_id)], by_device_id[(right_host, mlag_id)]
            if len(left) == 1 and len(right) == 1:
                out.append((left[0], right[0]))
    by_id: dict[int, list[SnapshotAggregate]] = defaultdict(list)
    for aggregate in with_id:
        if aggregate.hostname not in paired:
            by_id[aggregate.mlag_id].append(aggregate)
    for mlag_id in sorted(by_id):
        group = sorted(by_id[mlag_id], key=lambda a: a.hostname)
        if len(group) == 2 and group[0].hostname != group[1].hostname:
            out.append((group[0], group[1]))
    return out


def _peer_link(pair: Pair, flagged: Mapping[str, list[SnapshotAggregate]]) -> MlagMember | None:
    """L'agrégat `mlag_peer_link` d'un des deux devices : d'abord un dont les câbles mènent à l'autre device."""
    hosts = {a.hostname for a in pair}
    candidates = [a for aggregate in pair for a in flagged.get(aggregate.hostname, ())]
    leading = [a for a in candidates if _other_hosts(a) == hosts - {a.hostname}]
    chosen = next(iter(leading or candidates), None)
    return None if chosen is None else MlagMember(hostname=chosen.hostname, aggregate=chosen.name)


def _domain(pair: Pair, flagged: Mapping[str, list[SnapshotAggregate]], beams: Mapping[Beam, list[Link]]) -> tuple:
    left, right = pair
    refs = (aggregate_ref(left.hostname, left.name), aggregate_ref(right.hostname, right.name))
    if _ordered((left.hostname, left.name), (right.hostname, right.name)) in beams:
        return None, [structure_check(CheckCode.MLAG_PAIR_DIRECT_LINK, refs, mlag_id=left.mlag_id)]
    downstream = sorted((_other_hosts(left) | _other_hosts(right)) - {left.hostname, right.hostname})
    checks = []
    if len(downstream) > 1:
        checks.append(
            structure_check(CheckCode.MLAG_DOWNSTREAM_INCONSISTENT, refs, mlag_id=left.mlag_id, downstream=downstream)
        )
    domain = MlagDomain(
        mlag_id=left.mlag_id,
        members=tuple(sorted((MlagMember(hostname=a.hostname, aggregate=a.name) for a in pair), key=mlag_member_key)),
        peer_link=_peer_link(pair, flagged),
        downstream=downstream[0] if len(downstream) == 1 else None,
    )
    return domain, checks


def _domains(aggregates: tuple[SnapshotAggregate, ...], beams: Mapping[Beam, list[Link]]) -> tuple[list, list]:
    flagged: dict[str, list[SnapshotAggregate]] = defaultdict(list)
    for aggregate in aggregates:  # déjà triés par (hostname, nom naturel)
        if aggregate.mlag_peer_link:
            flagged[aggregate.hostname].append(aggregate)
    domains, checks = [], []
    for pair in _candidates(aggregates):
        domain, found = _domain(pair, flagged, beams)
        checks.extend(found)
        if domain is not None:
            domains.append(domain)
    domains.sort(key=lambda d: (d.mlag_id, tuple(mlag_member_key(m) for m in d.members)))
    return domains, checks


# --- assemblage -------------------------------------------------------------------------------------------------


def build_structures(ctx: Context, links: tuple[Link, ...], known_hosts: frozenset[str]) -> Structures:
    cables = _cables_by_aggregate(links)
    aggregates = tuple(
        sorted(
            (_aggregate(doc, cables.get((doc.hostname, doc.name), {})) for doc in ctx.bundle.aggregates),
            key=lambda a: aggregate_key(a.hostname, a.name),
        )
    )
    beams = _beams(links)
    checks = [check for doc in ctx.bundle.aggregates for check in _aggregate_checks(ctx, doc)]
    checks.extend(_protocol_checks({(a.hostname, a.name): a for a in aggregates}, beams))
    domains, mlag_checks = _domains(aggregates, beams)
    ha = build_ha_clusters(ctx, links, known_hosts)
    return Structures(aggregates, tuple(domains), ha.clusters, (*checks, *mlag_checks, *ha.checks))
