"""Projection du monde en RunBundle : ce qu'un exportateur parfait produirait depuis ce que chaque source voit.

Fonction pure : même monde, même spécification, même rang de run ⇒ même document. Aucune horloge, aucun tirage.
Toutes les clés nullables sont écrites : un bundle généré ne porte jamais de constat `nullable_key_absent`.
"""

from collections.abc import Iterable
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta

from ld_contracts.bundle import CONTRACT_VERSION
from ld_contracts.synth import naming
from ld_contracts.synth.naming import TOPICS
from ld_contracts.synth.spec import GenerationSpec
from ld_contracts.synth.world import CISCO, Device, Platform, Port, PortRef, World, with_ports

EXPORTER_VERSION = "ld-contracts-synth 1.0.0"
RUN_PERIOD = timedelta(days=7)
DEVICE_STAGGER = timedelta(seconds=3)
SUBJECT_DURATION = timedelta(seconds=8)
FAILED_SUBJECT_FACTOR = 4  # un topic en échec a attendu son timeout
RUN_TAIL = timedelta(seconds=30)
PRODUCED_DELAY = timedelta(minutes=5)
DAY = 86400
BOOT_TO_LINK = 300  # un lien monte cinq minutes après le démarrage
REBOOT_UPTIME = 7200  # un device redémarré est collecté deux heures après son retour
CHANGE_SETTLE = 1800  # un changement d'état est daté une demi-heure avant la collecte qui le voit
JUMBO_MTU, DEFAULT_MTU = 9216, 1500
STACK_PRIORITY = {1: 15, 2: 14}  # actif, standby ; les autres membres à 1
STACK_PRIORITY_DEFAULT = 1
UNREACHABLE_ERROR = "ssh: connect timeout"
ROUTED_ROLES = frozenset({"routed", "wan", "intersite"})
INTERFACE_TYPE = {
    "physical": "physical",
    "aggregate": "aggregate",
    "management": "management",
    "loopback": "loopback",
    "subinterface": "subinterface",
}


def iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass(frozen=True)
class Emission:
    """Le contexte d'une projection : le monde tel que la run le voit, la spécification, le rang de la run."""

    world: World
    spec: GenerationSpec
    run_index: int
    start: datetime

    def collected(self, hostname: str, topic: str) -> bool:
        device = self.world.device_index.get(hostname)
        if device is None or device.infrastructure != self.world.infrastructure:
            return False
        if hostname in self.world.unreachable or (hostname, topic) in self.world.failed_topics:
            return False
        return topic in TOPICS[device.platform]

    def uptime(self, device: Device) -> int:
        """Depuis la première run, ou depuis le run du dernier redémarrage : croissant de sept jours par run."""
        if device.boot_run is None:
            return (device.uptime_days + 7 * self.run_index) * DAY
        return REBOOT_UPTIME + device.index + (self.run_index - device.boot_run) * 7 * DAY

    def age(self, device: Device, port: Port) -> int | str:
        """Âge du dernier changement : `"never"` pour un port resté down depuis le démarrage (RFC 2863), sinon au plus
        l'uptime moins le délai de montée du lien."""
        booted_after_change = device.boot_run is not None and (
            port.changed_run is None or port.changed_run <= device.boot_run
        )
        if port.state == "down" and (port.changed_run is None or booted_after_change):
            return "never"
        ceiling = self.uptime(device) - BOOT_TO_LINK
        if port.changed_run is None or booted_after_change:
            return ceiling
        return min((self.run_index - port.changed_run) * 7 * DAY + CHANGE_SETTLE, ceiling)

    def run_id(self) -> str:
        return naming.hex_token(self.spec.seed, "run", self.run_index, length=24)


def as_seen(world: World, run_index: int) -> World:
    """Le monde tel que la collecte le voit : les câbles d'un membre HA mort sont tombés aux deux bouts (transitoire,
    le monde durable ne change pas)."""
    dead = {m for c in world.clusters for m in c.down}
    if not dead:
        return world
    updates = {}
    for cable in world.cables:
        if cable.a[0] in dead or cable.b[0] in dead:
            for ref in (cable.a, cable.b):
                if ref in world.port_index:
                    updates[ref] = replace(world.port_index[ref], state="down", changed_run=run_index)
    return with_ports(world, updates)


def emit_bundle(world: World, spec: GenerationSpec, run_index: int) -> dict:
    emission = Emission(as_seen(world, run_index), spec, run_index, spec.start + RUN_PERIOD * run_index)
    tasks, run_end = tasks_docs(emission)
    return {
        "contract_version": CONTRACT_VERSION,
        "produced_at": iso(run_end + PRODUCED_DELAY),
        "exporter_version": EXPORTER_VERSION,
        "infrastructure": spec.infrastructure,
        "run": {
            "collector_run_id": emission.run_id(),
            "collection_name": f"synthetic weekly {run_index + 1:02d}",
            "start_datetime": iso(emission.start),
            "end_datetime": iso(run_end),
            "status": "completed",
        },
        "devices": [device_doc(d) for d in emission.world.devices],
        "tasks": tasks,
        "interfaces": interface_docs(emission),
        "aggregates": aggregate_docs(emission),
        "lldp": neighbor_docs(emission, "lldp"),
        "cdp": neighbor_docs(emission, "cdp"),
        "system": system_docs(emission),
        "ha": ha_docs(emission),
        "residual_normalizations": {},
    }


def device_doc(device: Device) -> dict:
    return {
        "hostname": device.hostname,
        "infrastructure": device.infrastructure,
        "site": device.site,
        "type": device.type,
        "vendor": naming.VENDOR[device.platform],
        "model": device.model,
        "os_name": device.os_name,
        "os_version": device.os_version,
        "serial_number": device.serial,
        "extras": {},
    }


def tasks_docs(emission: Emission) -> tuple[list[dict], datetime]:
    docs: list[dict] = []
    last = emission.start
    for rank, device in enumerate(emission.world.in_scope()):
        if device.hostname in emission.world.unreachable:
            docs.append(
                {
                    "hostname": device.hostname,
                    "status": "unreachable",
                    "status_per_subject": {},
                    "error": UNREACHABLE_ERROR,
                }
            )
            continue
        cursor = emission.start + DEVICE_STAGGER * rank
        subjects: dict[str, dict] = {}
        for topic in TOPICS[device.platform]:
            failed = (device.hostname, topic) in emission.world.failed_topics
            ended = cursor + SUBJECT_DURATION * (FAILED_SUBJECT_FACTOR if failed else 1)
            subjects[topic] = {
                "status": "failed" if failed else "success",
                "started_at": iso(cursor),
                "ended_at": iso(ended),
                "error": f"command timeout on {device.hostname}" if failed else None,
            }
            cursor = ended
        last = max(last, cursor)
        status = "partial" if any(s["status"] == "failed" for s in subjects.values()) else "success"
        docs.append({"hostname": device.hostname, "status": status, "status_per_subject": subjects, "error": None})
    return docs, last + RUN_TAIL


def _members(world: World, port: Port) -> tuple[str, ...]:
    aggregate = world.aggregate_index.get((port.device, port.name))
    return aggregate.members if aggregate else ()


def _oper_up(world: World, port: Port) -> bool:
    if port.kind == "aggregate":
        return any(world.port_index[(port.device, m)].state == "up" for m in _members(world, port))
    if port.kind == "subinterface":
        parent = world.port_index.get((port.device, port.name.split(".")[0]))
        return parent is None or _oper_up(world, parent)
    return port.state == "up" or port.kind == "loopback"


def _oper_reason(device: Device, port: Port, up: bool) -> str | None:
    if up:
        return None
    if port.state == "suspended":
        return "suspended by LACP"
    if port.kind == "aggregate":
        return "No operational members"
    return naming.down_reason(device.platform)


def _speed(world: World, port: Port, up: bool) -> int | None:
    """Vitesse opérationnelle : un membre suspendu par LACP a un lien physique, donc une vitesse."""
    if port.kind in {"loopback", "subinterface"}:
        return None
    if port.kind == "aggregate":
        members = [world.port_index[(port.device, m)] for m in _members(world, port)]
        return sum(m.speed_mbps or 0 for m in members if m.state == "up") or None
    return port.speed_mbps if up or port.state == "suspended" else None


def _switchport(world: World, device: Device, port: Port) -> str | None:
    if device.platform == Platform.FORTIOS:
        return None
    if port.kind == "aggregate":
        members = _members(world, port)
        return _switchport(world, device, world.port_index[(port.device, members[0])]) if members else "trunk"
    if port.kind in {"loopback", "subinterface"}:
        return "none"
    if port.kind == "management" or port.role in ROUTED_ROLES or device.role == "router":
        return "routed"
    if port.role in naming.TRUNK_VLANS_BY_ROLE:
        return "trunk"
    return "access"


def _trunk_role(world: World, port: Port) -> str:
    """Le rôle qui fixe les VLAN d'un trunk : celui du port, ou du premier membre pour un agrégat."""
    if port.kind == "aggregate":
        members = _members(world, port)
        return world.port_index[(port.device, members[0])].role if members else "downlink"
    return port.role


def _vrf(device: Device, port: Port, mode: str | None) -> str | None:
    if port.kind == "management":
        return naming.MGMT_VRF[device.platform]
    if port.ip is not None or mode == "routed" or port.kind == "loopback":
        return "default"
    return None


def interface_doc(emission: Emission, device: Device, port: Port) -> dict:
    world = emission.world
    up = _oper_up(world, port)
    mode = _switchport(world, device, port)
    physical = port.kind in {"physical", "management"}
    speed = _speed(world, port, up)
    trunk_vlans = (
        naming.TRUNK_VLANS_BY_ROLE.get(_trunk_role(world, port), naming.ACCESS_TRUNK_VLANS) if mode == "trunk" else None
    )
    return {
        "hostname": device.hostname,
        "name": port.name,
        "description": port.description,
        "type": INTERFACE_TYPE[port.kind],
        "admin_status": "up",
        "oper_status": "up" if up else "down",
        "oper_reason": _oper_reason(device, port, up),
        "speed_mbps": speed,
        "configured_speed_mbps": None,
        "auto_negotiate": True if physical and port.media == "1000base-T" else None,
        "duplex": "full" if speed is not None else None,
        "mtu": JUMBO_MTU
        if device.platform == Platform.NXOS and port.kind in {"physical", "aggregate"}
        else DEFAULT_MTU,
        "mac_address": port.mac,
        "media": port.media if physical else None,
        "last_change_age_seconds": emission.age(device, port),
        "parent_interface": port.name.split(".")[0] if port.kind == "subinterface" else None,
        "vlan_id": port.vlan if port.kind == "subinterface" else None,
        "members": list(_members(world, port)),
        "ip_addresses": [{"address": port.ip[0], "prefix": port.ip[1], "family": 4, "role": "primary"}]
        if port.ip
        else [],
        "vrf": _vrf(device, port, mode),
        "virtual_context": "root" if device.platform == Platform.FORTIOS else None,
        "switchport_mode": mode,
        "access_vlan": port.vlan if mode == "access" else None,
        "native_vlan": naming.NATIVE_VLAN if mode == "trunk" else None,
        "allowed_vlans": [{"first": a, "last": b} for a, b in trunk_vlans] if trunk_vlans is not None else None,
        "counters": {"in_errors": 0, "out_errors": 0, "crc": 0, "in_discards": 0, "out_discards": 0}
        if up and physical
        else None,
        "extras": {},
    }


def interface_docs(emission: Emission) -> list[dict]:
    world = emission.world
    return [
        interface_doc(emission, device, port)
        for device in world.in_scope()
        if emission.collected(device.hostname, "interfaces")
        for port in world.ports_by_device.get(device.hostname, ())
    ]


def aggregate_docs(emission: Emission) -> list[dict]:
    world = emission.world
    docs = []
    status = {"up": "bundled", "suspended": "suspended", "down": "down"}
    for aggregate in world.aggregates:
        if not emission.collected(aggregate.device, "aggregates"):
            continue
        states = {m: world.port_index[(aggregate.device, m)].state for m in aggregate.members}
        docs.append(
            {
                "hostname": aggregate.device,
                "name": aggregate.name,
                "oper_status": "up" if "up" in states.values() else "down",
                "protocol": "lacp",
                "lacp_mode": "active",
                "min_links": 1,
                "members": [{"name": m, "status": status[s]} for m, s in states.items()],
                "mlag_id": aggregate.mlag_id,
                "mlag_peer_link": aggregate.peer_link,
                "extras": {},
            }
        )
    return docs


def _cable_up(world: World, refs: Iterable[PortRef]) -> bool:
    return all(world.port_index[r].state != "down" for r in refs if r in world.port_index)


def _witnesses(emission: Emission, topic: str) -> Iterable[tuple[Port, Device, PortRef]]:
    """(port témoin, son device, le bout d'en face) pour chaque câble vu depuis un bout collecté qui parle `topic`."""
    world = emission.world
    for cable in world.cables:
        if not _cable_up(world, (cable.a, cable.b)):
            continue
        for ref in (cable.a, cable.b):
            device = world.device_index.get(ref[0])
            if device is not None and device.platform in CISCO and emission.collected(ref[0], topic):
                yield world.port_index[ref], device, cable.other(ref)


def _remote_doc(emission: Emission, topic: str, witness: Port, remote: PortRef) -> dict | None:
    device = emission.world.device_index.get(remote[0])
    if device is None or device.platform not in CISCO:
        return None  # un firewall n'annonce rien : le câble reste documenté seulement
    port_id = naming.lldp_port_id(device.platform, remote[1]) if topic == "lldp" else remote[1]
    capabilities = naming.lldp_capabilities(device.role) if topic == "lldp" else naming.cdp_capabilities(device.role)
    return _neighbor_doc(witness, remote[0], port_id, capabilities)


def _neighbor_doc(witness: Port, neighbor: str, port_id: str, capabilities: tuple[str, ...]) -> dict:
    return {
        "hostname": witness.device,
        "local_interface": witness.name,
        "neighbor": neighbor,
        "neighbor_interface": port_id,
        "neighbor_capabilities": list(capabilities),
        "extras": {},
    }


def neighbor_docs(emission: Emission, topic: str) -> list[dict]:
    docs = [
        d for witness, _, remote in _witnesses(emission, topic) if (d := _remote_doc(emission, topic, witness, remote))
    ]
    world = emission.world
    for stub in world.stubs:
        port = world.port_index[stub.attached]
        if port.state != "up" or not emission.collected(port.device, topic):
            continue
        if topic == "lldp":
            docs.append(_neighbor_doc(port, stub.name, stub.port_id, stub.capabilities))
        elif stub.cdp_capabilities is not None:
            port_id = naming.PHONE_CDP_PORT_ID if stub.kind == "phone" else stub.port_id
            docs.append(_neighbor_doc(port, stub.name, port_id, stub.cdp_capabilities))
    return sorted(docs, key=lambda d: (d["hostname"], d["local_interface"], d["neighbor"], d["neighbor_interface"]))


def _chassis_members(emission: Emission, device: Device) -> list[dict]:
    if device.stack_size == 1:
        return []
    prefix = naming.MODELS[device.role][4]
    roles = {1: "active", 2: "standby"}
    return [
        {
            "slot": slot,
            "serial": device.serial if slot == 1 else naming.serial(prefix, emission.spec.seed, device.index, slot),
            "model": device.model,
            "role": roles.get(slot, "member"),
            "state": "ready",
            "priority": STACK_PRIORITY.get(slot, STACK_PRIORITY_DEFAULT),
        }
        for slot in range(1, device.stack_size + 1)
    ]


def system_docs(emission: Emission) -> list[dict]:
    docs = []
    for device in emission.world.in_scope():
        if not emission.collected(device.hostname, "system"):
            continue
        docs.append(
            {
                "hostname": device.hostname,
                "reported_hostname": device.hostname,
                "vendor": naming.VENDOR[device.platform],
                "model": device.model,
                "os_version": naming.MODELS[device.role][3],
                "serial_number": device.serial,
                "uptime_seconds": emission.uptime(device),
                "chassis_members": _chassis_members(emission, device),
                "virtual_contexts": ["root"] if device.platform == Platform.FORTIOS else [],
                "extras": {},
            }
        )
    return docs


def ha_docs(emission: Emission) -> list[dict]:
    world = emission.world
    docs = []
    for cluster in world.clusters:
        members = [
            {
                "name": name,
                "serial": world.device_index[name].serial,
                "role": role,
                "state": "down" if name in cluster.down else "up",
                "priority": priority,
            }
            for name, role, priority in zip(cluster.members, cluster.roles, cluster.priorities, strict=True)
        ]
        for name in cluster.members:
            if emission.collected(name, "ha"):
                docs.append(
                    {
                        "hostname": name,
                        "mode": "active_passive",
                        "cluster_name": cluster.name,
                        "members": members,
                        "heartbeat_interfaces": [cluster.heartbeat],
                        "extras": {},
                    }
                )
    return sorted(docs, key=lambda d: d["hostname"])
