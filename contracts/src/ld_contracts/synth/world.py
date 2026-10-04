"""Le monde : la vérité terrain immuable dont le bundle est une projection.

Tout est trié par clé naturelle à la construction et après chaque mise à jour : l'ordre du monde est
l'ordre du bundle, indépendant de l'ordre des opérations et de `PYTHONHASHSEED`. `check_world` dit les
invariants que le contrat du bundle ne peut pas voir (un stub n'est pas un device, un agrégat et ses
membres sont deux écritures du même fait).
"""

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from enum import StrEnum
from functools import cached_property

PortRef = tuple[str, str]


class Platform(StrEnum):
    NXOS = "nxos"
    IOSXE = "iosxe"
    FORTIOS = "fortios"
    IOSXR = "iosxr"  # externe, jamais collecté


CISCO = frozenset({Platform.NXOS, Platform.IOSXE, Platform.IOSXR})


@dataclass(frozen=True, slots=True)
class Device:
    hostname: str
    infrastructure: str
    site: str
    type: str
    platform: Platform
    model: str
    os_name: str
    os_version: str
    serial: str
    role: str  # core | access | firewall | router | external
    index: int  # rang de création, base des MAC et des serials ; jamais réutilisé
    stack_size: int = 1
    uptime_days: int = 90  # uptime à la première run, si le device n'a pas redémarré depuis
    boot_run: int | None = None  # run où il a redémarré ; None = démarré avant la première run


@dataclass(frozen=True, slots=True)
class Port:
    device: str
    name: str
    kind: str  # physical | aggregate | management | loopback | subinterface
    role: str  # peer_link | downlink | uplink | fw_link | fw_uplink | routed | wan | intersite | heartbeat |
    #            access | unused | lag | mgmt | loopback | subif
    speed_mbps: int | None
    media: str | None
    mac: str | None
    description: str | None = None
    aggregate: str | None = None  # agrégat dont ce port est membre
    state: str = "up"  # up | down | suspended
    changed_run: int | None = None  # run du dernier changement d'état ; None = stable depuis le démarrage
    ip: tuple[str, int] | None = None
    vlan: int | None = None  # VLAN d'accès (role access / unused), ou VLAN d'une sous-interface


@dataclass(frozen=True, slots=True)
class Cable:
    a: PortRef
    b: PortRef

    def __post_init__(self) -> None:
        if self.a > self.b:
            a, b = self.b, self.a
            object.__setattr__(self, "a", a)
            object.__setattr__(self, "b", b)

    def other(self, ref: PortRef) -> PortRef:
        return self.b if ref == self.a else self.a


@dataclass(frozen=True, slots=True)
class Aggregate:
    device: str
    name: str
    members: tuple[str, ...]
    mlag_id: int | None = None
    peer_link: bool = False


@dataclass(frozen=True, slots=True)
class HaCluster:
    name: str
    site: str
    members: tuple[str, str]  # par priorité décroissante : l'ordre de la forme HA des descriptions
    priorities: tuple[int, int]
    roles: tuple[str, str] = ("primary", "secondary")
    heartbeat: str = "ha1"
    down: tuple[str, ...] = ()  # membres morts pendant la run : vus `down` par les autres (transitoire)


@dataclass(frozen=True, slots=True)
class Stub:
    name: str
    kind: str  # server | phone | ap
    port_id: str
    capabilities: tuple[str, ...]
    cdp_capabilities: tuple[str, ...] | None  # None = ne parle pas CDP
    attached: PortRef


@dataclass(frozen=True)
class World:
    seed: str
    infrastructure: str
    sites: tuple[str, ...]
    devices: tuple[Device, ...]
    ports: tuple[Port, ...]
    cables: tuple[Cable, ...]
    aggregates: tuple[Aggregate, ...]
    clusters: tuple[HaCluster, ...]
    stubs: tuple[Stub, ...]
    unreachable: frozenset[str] = frozenset()
    failed_topics: tuple[tuple[str, str], ...] = ()
    next_index: int = field(default=0)  # prochain rang de device ; jamais décrémenté
    next_stub: int = field(default=0)  # prochain numéro de stub ; jamais décrémenté

    @cached_property
    def device_index(self) -> Mapping[str, Device]:
        return {d.hostname: d for d in self.devices}

    @cached_property
    def port_index(self) -> Mapping[PortRef, Port]:
        return {(p.device, p.name): p for p in self.ports}

    @cached_property
    def cables_by_port(self) -> Mapping[PortRef, Cable]:
        return {ref: c for c in self.cables for ref in (c.a, c.b)}

    @cached_property
    def aggregate_index(self) -> Mapping[PortRef, Aggregate]:
        return {(a.device, a.name): a for a in self.aggregates}

    @cached_property
    def stubs_by_port(self) -> Mapping[PortRef, Stub]:
        return {s.attached: s for s in self.stubs}

    @cached_property
    def ports_by_device(self) -> Mapping[str, tuple[Port, ...]]:
        out: dict[str, list[Port]] = {}
        for port in self.ports:
            out.setdefault(port.device, []).append(port)
        return {host: tuple(ports) for host, ports in out.items()}

    def in_scope(self) -> tuple[Device, ...]:
        return tuple(d for d in self.devices if d.infrastructure == self.infrastructure)

    def devices_with_role(self, role: str) -> tuple[Device, ...]:
        return tuple(d for d in self.devices if d.role == role)


def _sorted_ports(ports: Iterable[Port]) -> tuple[Port, ...]:
    return tuple(sorted(ports, key=lambda p: (p.device, p.name)))


def _sorted_cables(cables: Iterable[Cable]) -> tuple[Cable, ...]:
    return tuple(sorted(cables, key=lambda c: (c.a, c.b)))


def with_ports(world: World, updates: Mapping[PortRef, Port | None]) -> World:
    """Nouveau monde avec des ports remplacés (`Port`), ajoutés, ou retirés (`None`)."""
    kept = [p for p in world.ports if (p.device, p.name) not in updates]
    added = [p for p in updates.values() if p is not None]
    return replace(world, ports=_sorted_ports([*kept, *added]))


def with_devices(world: World, add: Iterable[Device] = (), remove: Iterable[str] = ()) -> World:
    gone = set(remove)
    devices = [d for d in world.devices if d.hostname not in gone] + list(add)
    index = max([world.next_index, *(d.index + 1 for d in devices)])
    return replace(world, devices=tuple(sorted(devices, key=lambda d: d.hostname)), next_index=index)


def with_device(world: World, device: Device) -> World:
    """Remplace un device par une copie (même hostname, même rang)."""
    others = [d for d in world.devices if d.hostname != device.hostname]
    return replace(world, devices=tuple(sorted([*others, device], key=lambda d: d.hostname)))


def with_cables(world: World, add: Iterable[Cable] = (), remove: Iterable[Cable] = ()) -> World:
    gone = set(remove)
    return replace(world, cables=_sorted_cables([c for c in world.cables if c not in gone] + list(add)))


def with_aggregates(world: World, updates: Mapping[PortRef, Aggregate | None]) -> World:
    kept = [a for a in world.aggregates if (a.device, a.name) not in updates]
    added = [a for a in updates.values() if a is not None]
    return replace(world, aggregates=tuple(sorted([*kept, *added], key=lambda a: (a.device, a.name))))


def with_clusters(world: World, updates: Mapping[str, HaCluster]) -> World:
    kept = [c for c in world.clusters if c.name not in updates]
    return replace(world, clusters=tuple(sorted([*kept, *updates.values()], key=lambda c: c.name)))


def with_stubs(world: World, add: Iterable[Stub] = (), remove: Iterable[str] = ()) -> World:
    gone = set(remove)
    stubs = [s for s in world.stubs if s.name not in gone] + list(add)
    return replace(world, stubs=tuple(sorted(stubs, key=lambda s: s.name)))


def with_faults(world: World, unreachable: Iterable[str] = (), failed_topics: Iterable[tuple[str, str]] = ()) -> World:
    return replace(
        world,
        unreachable=frozenset(world.unreachable | set(unreachable)),
        failed_topics=tuple(sorted(set(world.failed_topics) | set(failed_topics))),
    )


def clear_transients(world: World) -> World:
    """Au début d'une run, les pannes de collecte et les morts HA de la run précédente s'effacent.

    Un redémarrage n'est pas transitoire : l'uptime repart du run du reboot et recompte ensuite (`Device.boot_run`).
    """
    clusters = tuple(replace(c, down=()) for c in world.clusters)
    return replace(world, unreachable=frozenset(), failed_topics=(), clusters=clusters)


def _duplicates(values: Iterable[object]) -> list[object]:
    return sorted((v for v, n in Counter(values).items() if n > 1), key=str)


def check_world(world: World) -> list[str]:
    """Les invariants du monde, en clair ; vide si tout tient. Un monde qui les viole est un bug du générateur."""
    problems: list[str] = []
    hosts = set(world.device_index)
    externals = {d.hostname for d in world.devices if d.role == "external"}
    problems += [f"port en double : {d}" for d in _duplicates((p.device, p.name) for p in world.ports)]
    problems += [f"port d'un device inconnu : {(p.device, p.name)}" for p in world.ports if p.device not in hosts]
    macs = [p.mac for p in world.ports if p.kind in {"physical", "management"}]
    problems += [f"MAC de port en double : {m}" for m in _duplicates(macs)]
    problems += [f"port sans MAC : {(p.device, p.name)}" for p in world.ports if p.kind != "loopback" and not p.mac]
    seen_ends: Counter = Counter()
    for cable in world.cables:
        for ref in (cable.a, cable.b):
            seen_ends[ref] += 1
            if ref not in world.port_index and ref[0] not in externals:
                problems.append(f"câble vers un port inexistant : {ref}")
    problems += [f"port à plusieurs câbles : {ref}" for ref, n in sorted(seen_ends.items()) if n > 1]
    problems += _check_aggregates(world)
    problems += _check_stubs(world)
    for cluster in world.clusters:
        problems += [f"membre de cluster inconnu : {m}" for m in cluster.members if m not in hosts]
        if cluster.heartbeat and any((m, cluster.heartbeat) not in world.port_index for m in cluster.members):
            problems.append(f"heartbeat absent sur un membre : {cluster.name}")
    return problems


def _check_aggregates(world: World) -> list[str]:
    problems: list[str] = []
    memberships = {(a.device, m): a.name for a in world.aggregates for m in a.members}
    for aggregate in world.aggregates:
        key = (aggregate.device, aggregate.name)
        if not aggregate.members:
            problems.append(f"agrégat sans membre : {key}")
        if key not in world.port_index or world.port_index[key].kind != "aggregate":
            problems.append(f"agrégat sans port agrégat : {key}")
        for member in aggregate.members:
            port = world.port_index.get((aggregate.device, member))
            if port is None:
                problems.append(f"membre d'agrégat inexistant : {(aggregate.device, member)}")
            elif port.aggregate != aggregate.name:
                problems.append(f"membre qui ne connaît pas son agrégat : {(aggregate.device, member)}")
    for port in world.ports:
        if port.aggregate is not None and memberships.get((port.device, port.name)) != port.aggregate:
            problems.append(f"port membre d'un agrégat qui ne le liste pas : {(port.device, port.name)}")
    return problems


def _check_stubs(world: World) -> list[str]:
    problems: list[str] = []
    problems += [f"nom de stub en double : {n}" for n in _duplicates(s.name for s in world.stubs)]
    problems += [
        f"port-id de stub en double : {p}" for p in _duplicates(s.port_id for s in world.stubs if ":" in s.port_id)
    ]
    problems += [f"port à plusieurs stubs : {ref}" for ref in _duplicates(s.attached for s in world.stubs)]
    for stub in world.stubs:
        port = world.port_index.get(stub.attached)
        if port is None or port.role != "access":
            problems.append(f"stub hors d'un port d'accès : {stub.name}")
        elif port.state != "up":
            problems.append(f"stub sur un port down : {stub.name}")
    return problems
