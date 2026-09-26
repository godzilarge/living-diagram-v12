"""R4 (HA) : un cluster par ensemble de membres, construit depuis tous les documents `ha[]` qui le décrivent.

La vue d'un membre sur lui-même prime pour son rôle, son état et sa priorité ; le mode et le nom du cluster
suivent le premier rapporteur (ordre des hostnames) ; tout désaccord entre valeurs **lues** est un `ha_view_mismatch`
(`null` n'affirme jamais un fait : il ne contredit rien, et une valeur lue par un autre rapporteur le remplace).
Un membre absent de `devices` est retiré du cluster (constat `ha_member_unknown` du contrat d'entrée) ; un membre
connu de `devices` sous une autre infrastructure devient un nœud `external`, comme un voisin cité par LLDP
(`assemble.node_hostnames`). `ha_member_down` est émis dès qu'un rapporteur dit `down`, l'état retenu restant la
vue propre : un split-brain (chacun se dit `up`, dit l'autre `down`) garde son erreur. Aucun câble n'est inventé
pour un heartbeat : le câble est celui que R3 a tracé sur le port, ou rien.
"""

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from ld_contracts.enums import HaState
from ld_contracts.models_ha import HaMember, HaStatus
from ld_contracts.snapshot.checks import Check
from ld_contracts.snapshot.codes import CheckCode
from ld_contracts.snapshot.links import Link
from ld_contracts.snapshot.order import natural_key
from ld_contracts.snapshot.refs import ClusterRef, LinkKey, link_key
from ld_contracts.snapshot.structures import HaCluster, HaClusterMember, HeartbeatInterface, heartbeat_key

from ld_backend.correlate.checkbuild import cluster_ref, node_ref, port_ref, structure_check
from ld_backend.correlate.context import Context, Key

Members = tuple[str, ...]  # la clé d'un cluster : ses membres, triés
View = tuple[str, HaMember]  # (rapporteur, ce qu'il dit d'un membre)


@dataclass(frozen=True, slots=True)
class HaResult:
    clusters: tuple[HaCluster, ...]
    checks: tuple[Check, ...]


def _links_by_port(links: Iterable[Link]) -> dict[Key, list[Link]]:
    out: dict[Key, list[Link]] = defaultdict(list)
    for link in sorted(links, key=link_key):
        out[(link.a.hostname, link.a.interface)].append(link)
        out[(link.b.hostname, link.b.interface)].append(link)
    return out


def _agreed(ref: ClusterRef, field: str, views: Sequence[tuple[str, str | None]]) -> tuple[str | None, list[Check]]:
    """La première valeur lue (ordre des rapporteurs) ; un contrôle si deux valeurs lues diffèrent."""
    read = [value for _, value in views if value is not None]
    retained = read[0] if read else None
    if len(set(read)) <= 1:
        return retained, []
    detail = [{"reported_by": reporter, "value": value} for reporter, value in views]
    return retained, [structure_check(CheckCode.HA_VIEW_MISMATCH, (ref,), field=field, views=detail)]


def _differ(views: Sequence[View], field: str) -> bool:
    """Deux valeurs lues différentes ; `null` (non lu) ne contredit rien."""
    return len({getattr(seen, field) for _, seen in views if getattr(seen, field) is not None}) > 1


def _member(ref: ClusterRef, hostname: str, views: Sequence[View]) -> tuple[HaClusterMember, list[Check]]:
    own = next((seen for reporter, seen in views if reporter == hostname), None)
    retained = own if own is not None else views[0][1]
    priorities = [seen.priority for _, seen in views if seen.priority is not None]
    priority = retained.priority if retained.priority is not None else (priorities[0] if priorities else None)
    checks = []
    if any(_differ(views, field) for field in ("role", "state", "priority")):
        detail = [
            {"reported_by": reporter, "role": str(seen.role), "state": str(seen.state), "priority": seen.priority}
            for reporter, seen in views
        ]
        checks.append(
            structure_check(CheckCode.HA_VIEW_MISMATCH, (ref,), field="member", member=hostname, views=detail)
        )
    saying_down = [reporter for reporter, seen in views if seen.state == HaState.DOWN]
    if saying_down:  # dès qu'un rapporteur le dit : un split-brain garde son erreur (revue, B5)
        checks.append(
            structure_check(
                CheckCode.HA_MEMBER_DOWN, (ref, node_ref(hostname)), role=str(retained.role), reported_by=saying_down
            )
        )
    member = HaClusterMember(
        hostname=hostname,
        role=retained.role,
        state=retained.state,
        priority=priority,
        reported_by=tuple(reporter for reporter, _ in views),
    )
    return member, checks


def _heartbeat_cable(candidates: Sequence[Link], members: set[str]) -> tuple[LinkKey | None, list[Link]]:
    """L'unique câble du port ; à plusieurs, l'unique qui mène à un membre du cluster ; sinon aucun, et les
    candidats restent visibles dans le contrôle (revue, B2)."""
    chosen = list(candidates)
    if len(chosen) > 1:
        chosen = [link for link in chosen if {link.a.hostname, link.b.hostname} <= members]
    if len(chosen) != 1:
        return None, chosen
    return LinkKey(a=chosen[0].a, b=chosen[0].b), chosen


def _far_end(link: Link, hostname: str, interface: str) -> dict:
    other = link.b if (link.a.hostname, link.a.interface) == (hostname, interface) else link.a
    return {"hostname": other.hostname, "interface": other.interface}


def _heartbeats(
    ctx: Context, ref: ClusterRef, key: Members, docs: Sequence[HaStatus], by_port: Mapping[Key, list[Link]]
) -> tuple[tuple[HeartbeatInterface, ...], list[Check]]:
    items, checks = [], []
    for doc in docs:
        for name in sorted(set(doc.heartbeat_interfaces), key=natural_key):
            cable, candidates = _heartbeat_cable(by_port.get((doc.hostname, name), ()), set(key))
            items.append(HeartbeatInterface(hostname=doc.hostname, interface=name, cable=cable))
            if cable is None:
                port, fallback = port_ref(ctx, doc.hostname, name)
                detail = (
                    {"candidates": [_far_end(link, doc.hostname, name) for link in candidates]} if candidates else {}
                )
                checks.append(structure_check(CheckCode.HEARTBEAT_LINK_NOT_OBSERVED, (ref, port), **fallback, **detail))
    return tuple(sorted(items, key=heartbeat_key)), checks


def _cluster(
    ctx: Context, key: Members, docs: Sequence[HaStatus], by_port: Mapping[Key, list[Link]]
) -> tuple[HaCluster, list[Check]]:
    ref = cluster_ref(key)
    _, checks = _agreed(ref, "mode", [(doc.hostname, str(doc.mode)) for doc in docs])
    name, name_checks = _agreed(ref, "cluster_name", [(doc.hostname, doc.cluster_name) for doc in docs])
    checks.extend(name_checks)
    members = []
    for hostname in key:
        views = [(doc.hostname, seen) for doc in docs for seen in doc.members if seen.name == hostname]
        member, member_checks = _member(ref, hostname, views)
        members.append(member)
        checks.extend(member_checks)
    heartbeats, heartbeat_checks = _heartbeats(ctx, ref, key, docs, by_port)
    checks.extend(heartbeat_checks)
    cluster = HaCluster(members=tuple(members), mode=docs[0].mode, cluster_name=name, heartbeat_interfaces=heartbeats)
    return cluster, checks


def _overlap_checks(clusters: Sequence[HaCluster]) -> list[Check]:
    """Un device décrit dans deux clusters aux membres différents : les vues ne concordent pas."""
    keys = [tuple(m.hostname for m in cluster.members) for cluster in clusters]
    out = []
    for key in keys:
        for hostname in key:
            views = [list(other) for other in keys if hostname in other]
            if len(views) > 1:
                out.append(
                    structure_check(
                        CheckCode.HA_VIEW_MISMATCH,
                        (cluster_ref(key), node_ref(hostname)),
                        field="members",
                        member=hostname,
                        views=views,
                    )
                )
    return out


def build_ha_clusters(ctx: Context, links: Iterable[Link], known_hosts: frozenset[str]) -> HaResult:
    groups: dict[Members, list[HaStatus]] = defaultdict(list)
    for doc in sorted(ctx.bundle.ha, key=lambda d: d.hostname):
        key = tuple(sorted(seen.name for seen in doc.members if seen.name in known_hosts))
        if key:
            groups[key].append(doc)
    by_port = _links_by_port(links)
    clusters, checks = [], []
    for key in sorted(groups):
        cluster, found = _cluster(ctx, key, groups[key], by_port)
        clusters.append(cluster)
        checks.extend(found)
    checks.extend(_overlap_checks(clusters))
    return HaResult(tuple(clusters), tuple(checks))
