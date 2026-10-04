"""Le catalogue des mutations : chacune transforme un monde en un nouveau monde et dit ce qu'elle a fait.

Une mutation ne tire que parmi des listes triées : le monde résultant ne dépend que du monde d'entrée, de la
graine et du rang de run. Une mutation sans sujet possible lève `NotApplicableError`, jamais un monde inchangé.
"""

import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace

from ld_contracts.synth import build_access, build_site, naming
from ld_contracts.synth.catalogue import MUTATION_KINDS
from ld_contracts.synth.draft import core_hostnames, draft_of, world_of
from ld_contracts.synth.world import (
    CISCO,
    Aggregate,
    Cable,
    Port,
    PortRef,
    World,
    with_aggregates,
    with_cables,
    with_clusters,
    with_device,
    with_devices,
    with_faults,
    with_ports,
    with_stubs,
)

DEGRADED_SPEED = 1000


class NotApplicableError(LookupError):
    """La mutation n'a aucun sujet dans ce monde (plus de stub à retirer, tous les sites pleins…)."""


@dataclass(frozen=True, slots=True)
class Mutation:
    kind: str
    subject: str
    details: Mapping[str, object]


def _pick[T](rng: random.Random, kind: str, candidates: Sequence[T]) -> T:
    if not candidates:
        raise NotApplicableError(f"{kind} : aucun sujet possible dans ce monde")
    return rng.choice(list(candidates))


def _down(port: Port, run: int) -> Port:
    return replace(port, state="down", changed_run=run)


def _ref(ref: PortRef) -> list[str]:
    return [ref[0], ref[1]]


def _is_cisco(world: World, hostname: str) -> bool:
    device = world.device_index.get(hostname)
    return device is not None and device.platform in CISCO and device.infrastructure == world.infrastructure


def _observed_cables(world: World) -> list[Cable]:
    """Câbles que LLDP / CDP voient : deux bouts Cisco du périmètre, aucun bout down."""
    out = []
    for cable in world.cables:
        ports = [world.port_index.get(cable.a), world.port_index.get(cable.b)]
        if None in ports or any(p.state == "down" for p in ports):
            continue
        if _is_cisco(world, cable.a[0]) and _is_cisco(world, cable.b[0]):
            out.append(cable)
    return out


def _free_access_numbers(world: World, site: str) -> list[int]:
    """Numéros d'accès libres sur le cœur 01 : un port cœur gardant une description périmée n'est pas réutilisé."""
    core = core_hostnames(site)[0]
    taken = {
        int(p.name.split("/")[1])
        for p in world.ports_by_device[core]
        if p.name.startswith("Ethernet1/") and (p.role == "downlink" or p.description is not None)
    }
    return [n for n in range(1, build_site.MAX_ACCESS_PER_SITE + 1) if n not in taken]


def device_added(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    sites = [s for s in world.sites if _free_access_numbers(world, s)]
    site = _pick(rng, "device_added", sites)
    number = _free_access_numbers(world, site)[0]
    new = world_of(build_access.add_access_switch(draft_of(world), rng, site, number, changed_run=run), world)
    hostname = naming.hostname(site, "access", number)
    uplinks = sorted(
        _ref(new.cables_by_port[(hostname, p.name)].other((hostname, p.name)))
        for p in new.ports_by_device[hostname]
        if p.role == "uplink"
    )
    return new, Mutation("device_added", hostname, {"site": site, "uplinks": uplinks})


def device_removed(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    device = _pick(rng, "device_removed", world.devices_with_role("access"))
    host = device.hostname
    own = {(p.device, p.name) for p in world.ports_by_device[host]}
    cables = [c for c in world.cables if c.a in own or c.b in own]
    updates: dict[PortRef, Port | None] = dict.fromkeys(sorted(own))
    aggregates: dict[PortRef, Aggregate | None] = {(host, a.name): None for a in world.aggregates if a.device == host}
    core_ports = []
    for cable in cables:
        far = cable.other(cable.a if cable.a in own else cable.b)
        port = world.port_index[far]
        core_ports.append(_ref(far))
        updates[far] = replace(
            _down(port, run), role="unused", aggregate=None, vlan=naming.UNUSED_VLAN, speed_mbps=None
        )
        if port.aggregate is not None:
            aggregates[(far[0], port.aggregate)] = None
            updates[(far[0], port.aggregate)] = None
    stubs = [s.name for s in world.stubs if s.attached[0] == host]
    new = with_devices(world, remove=[host])
    new = with_ports(new, updates)
    new = with_cables(new, remove=cables)
    new = with_aggregates(new, aggregates)
    new = with_stubs(new, remove=stubs)
    return new, Mutation("device_removed", host, {"site": device.site, "core_ports": sorted(core_ports)})


def device_unreachable(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = [d.hostname for d in world.in_scope() if d.hostname not in world.unreachable]
    host = _pick(rng, "device_unreachable", candidates)
    return with_faults(world, unreachable=[host]), Mutation("device_unreachable", host, {})


def topic_failed(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = [
        (d.hostname, topic)
        for d in world.in_scope()
        if d.hostname not in world.unreachable
        for topic in naming.TOPICS[d.platform]
        if topic != "interfaces" and (d.hostname, topic) not in world.failed_topics
    ]
    host, topic = _pick(rng, "topic_failed", candidates)
    return with_faults(world, failed_topics=[(host, topic)]), Mutation("topic_failed", host, {"topic": topic})


def _uplink_cables(world: World) -> list[Cable]:
    """Câbles accès → cœur, montés, les deux bouts dans le périmètre."""
    return [
        c
        for c in _observed_cables(world)
        if {world.port_index[c.a].role, world.port_index[c.b].role} == {"uplink", "downlink"}
    ]


def _ends(world: World, cable: Cable, role: str) -> tuple[Port, Port]:
    """(bout du rôle demandé, autre bout)."""
    a, b = world.port_index[cable.a], world.port_index[cable.b]
    return (a, b) if a.role == role else (b, a)


def cable_moved(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = []
    for cable in _uplink_cables(world):
        down, _ = _ends(world, cable, "downlink")
        spare = [
            p
            for p in world.ports_by_device[down.device]
            if p.role == "unused" and p.description is None and int(p.name.split("/")[1]) in build_site.CORE_SPARE_PORTS
        ]
        if spare:
            candidates.append((cable, spare[0]))
    cable, spare = _pick(rng, "cable_moved", candidates)
    down, up = _ends(world, cable, "downlink")
    aggregate = world.aggregate_index[(down.device, down.aggregate)]
    moved = replace(
        spare,
        role="downlink",
        speed_mbps=down.speed_mbps,
        media=down.media,
        state="up",
        aggregate=down.aggregate,
        vlan=None,
        changed_run=run,
    )
    stale = replace(_down(down, run), role="unused", aggregate=None, vlan=naming.UNUSED_VLAN, media=None)
    new = with_ports(world, {(down.device, down.name): stale, (spare.device, spare.name): moved})
    new = with_cables(new, add=[Cable((up.device, up.name), (spare.device, spare.name))], remove=[cable])
    new = with_aggregates(new, {(aggregate.device, aggregate.name): replace(aggregate, members=(spare.name,))})
    details = {"core": down.device, "from": down.name, "to": spare.name, "access_port": up.name}
    return new, Mutation("cable_moved", up.device, details)


def cable_down(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = []
    for cable in world.cables:
        ports = [world.port_index.get(cable.a), world.port_index.get(cable.b)]
        if None in ports or any(p.state != "up" for p in ports):
            continue
        if {ports[0].role, ports[1].role} & {"peer_link", "intersite"}:
            continue
        candidates.append(cable)
    cable = _pick(rng, "cable_down", candidates)
    updates = {ref: _down(world.port_index[ref], run) for ref in (cable.a, cable.b)}
    return with_ports(world, updates), Mutation("cable_down", cable.a[0], {"a": _ref(cable.a), "b": _ref(cable.b)})


def description_changed(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    """Un port **observé** dont la description V1 est réécrite vers un autre port du voisin : B1 voit le désaccord."""
    candidates = []
    for cable in _observed_cables(world):
        for ref in (cable.a, cable.b):
            port = world.port_index[ref]
            if port.kind == "physical" and port.description is not None and len(port.description.split("|")) == 4:
                candidates.append((port, cable.other(ref)))
    port, far = _pick(rng, "description_changed", candidates)
    others = sorted(p.name for p in world.ports_by_device[far[0]] if p.kind == "physical" and p.name != far[1])
    fields = port.description.split("|")
    after = "|".join([fields[0], fields[1], others[0], fields[3]])
    new = with_ports(world, {(port.device, port.name): replace(port, description=after)})
    details = {"port": port.name, "before": port.description, "after": after}
    return new, Mutation("description_changed", port.device, details)


def ha_failover(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    cluster = _pick(rng, "ha_failover", world.clusters)
    swapped = replace(cluster, roles=(cluster.roles[1], cluster.roles[0]))
    before = cluster.members[cluster.roles.index("primary")]
    after = swapped.members[swapped.roles.index("primary")]
    details = {"primary_before": before, "primary_after": after}
    return with_clusters(world, {cluster.name: swapped}), Mutation("ha_failover", cluster.name, details)


def ha_member_down(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    """Un membre meurt pendant la run : injoignable, ses câbles tombent à l'émission, le survivant le voit `down`."""
    candidates = [(c, m) for c in world.clusters for m in c.members if m not in c.down]
    cluster, dead = _pick(rng, "ha_member_down", candidates)
    new = with_clusters(world, {cluster.name: replace(cluster, down=(*cluster.down, dead))})
    role = cluster.roles[cluster.members.index(dead)]
    return with_faults(new, unreachable=[dead]), Mutation(
        "ha_member_down", cluster.name, {"member": dead, "role": role}
    )


def aggregate_member_suspended(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = []
    for aggregate in world.aggregates:
        if aggregate.peer_link or not _is_cisco(world, aggregate.device):
            continue
        for member in aggregate.members:
            port = world.port_index[(aggregate.device, member)]
            cable = world.cables_by_port.get((aggregate.device, member))
            if port.state != "up" or cable is None:
                continue
            far = cable.other((aggregate.device, member))
            far_port = world.port_index.get(far)
            if far_port is not None and far_port.state == "up" and _is_cisco(world, far[0]):
                candidates.append((aggregate, port, far_port))
    aggregate, port, far_port = _pick(rng, "aggregate_member_suspended", candidates)
    updates = {
        (port.device, port.name): replace(port, state="suspended", changed_run=run),
        (far_port.device, far_port.name): replace(far_port, state="suspended", changed_run=run),
    }
    details = {"aggregate": aggregate.name, "member": port.name, "peer": _ref((far_port.device, far_port.name))}
    return with_ports(world, updates), Mutation("aggregate_member_suspended", aggregate.device, details)


def speed_degraded(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = [c for c in _uplink_cables(world) if _ends(world, c, "uplink")[0].speed_mbps != DEGRADED_SPEED]
    cable = _pick(rng, "speed_degraded", candidates)
    up, down = _ends(world, cable, "uplink")
    updates = {
        (up.device, up.name): replace(up, speed_mbps=DEGRADED_SPEED, changed_run=run),
        (down.device, down.name): replace(down, changed_run=run),
    }
    details = {"a": _ref((up.device, up.name)), "b": _ref((down.device, down.name)), "speed_mbps": DEGRADED_SPEED}
    return with_ports(world, updates), Mutation("speed_degraded", up.device, details)


def stub_added(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    candidates = [
        d
        for d in world.devices_with_role("access")
        if build_access.free_access_port(world.ports_by_device[d.hostname], d.hostname)
    ]
    device = _pick(rng, "stub_added", candidates)
    new = world_of(build_access.add_stub(draft_of(world), device, "server", changed_run=run), world)
    stub = next(s for s in new.stubs if s not in world.stubs)
    return new, Mutation("stub_added", stub.name, {"port": _ref(stub.attached), "kind": stub.kind})


def stub_removed(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    stub = _pick(rng, "stub_removed", world.stubs)
    port = world.port_index[stub.attached]
    new = with_stubs(world, remove=[stub.name])
    new = with_ports(new, {stub.attached: _down(port, run)})
    return new, Mutation("stub_removed", stub.name, {"port": _ref(stub.attached), "kind": stub.kind})


def reboot(world: World, rng: random.Random, run: int) -> tuple[World, Mutation]:
    """Le device repart : son démarrage est daté de cette run, l'uptime recompte ensuite (rien de transitoire)."""
    candidates = [d for d in world.in_scope() if d.boot_run != run]
    device = _pick(rng, "reboot", candidates)
    return with_device(world, replace(device, boot_run=run)), Mutation("reboot", device.hostname, {})


Mutator = Callable[[World, random.Random, int], tuple[World, Mutation]]
MUTATORS: dict[str, Mutator] = {
    "device_added": device_added,
    "device_removed": device_removed,
    "device_unreachable": device_unreachable,
    "topic_failed": topic_failed,
    "cable_moved": cable_moved,
    "cable_down": cable_down,
    "description_changed": description_changed,
    "ha_failover": ha_failover,
    "ha_member_down": ha_member_down,
    "aggregate_member_suspended": aggregate_member_suspended,
    "speed_degraded": speed_degraded,
    "stub_added": stub_added,
    "stub_removed": stub_removed,
    "reboot": reboot,
}
assert tuple(MUTATORS) == MUTATION_KINDS, "le catalogue et les fonctions doivent se correspondre un pour un"


def apply_mutation(kind: str, world: World, rng: random.Random, run_index: int) -> tuple[World, Mutation]:
    """Applique une mutation du catalogue ; le monde porte sa graine, rien d'autre n'est nécessaire."""
    if kind not in MUTATORS:
        raise KeyError(f"mutation inconnue : {kind}")
    return MUTATORS[kind](world, rng, run_index)
