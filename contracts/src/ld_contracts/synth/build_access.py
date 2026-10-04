"""Les accès et leurs stubs : un stack Catalyst double-attaché en vPC, des serveurs, téléphones et bornes dessus."""

import random
from dataclasses import replace

from ld_contracts.synth import naming
from ld_contracts.synth.draft import Draft, core_hostnames, description, new_device, uptime_days
from ld_contracts.synth.world import Aggregate, Cable, Device, Port, PortRef, Stub

ACCESS_PORTS_PER_MEMBER = 24  # C9300-24P : 24 × 1G cuivre par membre
ACCESS_UPLINKS_PER_MEMBER = 4  # module C9300-NM-4X : 4 × 10G SFP+ par membre
ACCESS_MGMT_PORT = "GigabitEthernet0/0"
ACCESS_LAG = "Port-channel1"
ACCESS_VPC_BASE = 100  # vPC 100 + numéro d'accès sur les cœurs
ACCESS_MGMT_HOST_BASE = 40  # 10.<site>.0.(40 + numéro) ; cœurs .10-.11, firewalls .20-.21, routeur .30
UPLINK_SPEED, ACCESS_SPEED = 10000, 1000
UPLINK_MEDIA, COPPER_MEDIA = "10Gbase-SR", "1000base-T"
STACK_WEIGHTS = ((1, 6), (2, 3), (3, 1))
STUB_KINDS = ("server", "phone", "ap")
STUBS_PER_ACCESS = (1, 3)
STUB_VLAN = {"server": naming.SERVER_VLAN, "phone": naming.PHONE_VLAN, "ap": naming.AP_VLAN}


def _stack_size(rng: random.Random) -> int:
    return rng.choices([s for s, _ in STACK_WEIGHTS], [w for _, w in STACK_WEIGHTS])[0]


def access_ports(device: Device) -> list[Port]:
    """Tous les ports d'un stack Catalyst, down et vides : cuivre avec son média, cages SFP+ sans optique."""
    oui = naming.OUI["cisco"]
    ports: list[Port] = []
    counter = 1
    for member in range(1, device.stack_size + 1):
        for n in range(1, ACCESS_PORTS_PER_MEMBER + 1):
            name = naming.stack_port(member, 0, n, tengig=False)
            mac = naming.mac(oui, device.index, counter)
            ports.append(
                Port(
                    device.hostname,
                    name,
                    "physical",
                    "unused",
                    None,
                    COPPER_MEDIA,
                    mac,
                    state="down",
                    vlan=naming.UNUSED_VLAN,
                )
            )
            counter += 1
        for n in range(1, ACCESS_UPLINKS_PER_MEMBER + 1):
            name = naming.stack_port(member, 1, n, tengig=True)
            mac = naming.mac(oui, device.index, counter)
            ports.append(
                Port(
                    device.hostname, name, "physical", "unused", None, None, mac, state="down", vlan=naming.UNUSED_VLAN
                )
            )
            counter += 1
    site = naming.site_number(device.site)
    number = int(device.hostname.rsplit("-", 1)[1])
    mgmt_ip = (f"10.{site}.0.{ACCESS_MGMT_HOST_BASE + number}", 24)
    ports.append(
        Port(
            device.hostname,
            ACCESS_MGMT_PORT,
            "management",
            "mgmt",
            ACCESS_SPEED,
            COPPER_MEDIA,
            naming.mac(oui, device.index, 0),
            ip=mgmt_ip,
        )
    )
    return ports


def _uplink_names(device: Device) -> tuple[str, str]:
    """Te1/1/1 vers le cœur 01 ; vers le cœur 02, Te1/1/2 sur un châssis seul, Te<dernier>/1/1 sur un stack."""
    second = naming.stack_port(device.stack_size, 1, 1 if device.stack_size > 1 else 2, tengig=True)
    return "TenGigabitEthernet1/1/1", second


def _core_leg(
    draft: Draft, core: str, core_port: str, host: str, uplink: str, vpc: int, changed_run: int | None
) -> tuple[Port, Port]:
    """Le port du cœur vers l'accès et son port-channel vPC, qui porte la MAC de son membre."""
    mac = naming.mac(naming.OUI["cisco"], draft.device(core).index, int(core_port.split("/")[1]))
    physical = Port(
        device=core,
        name=core_port,
        kind="physical",
        role="downlink",
        speed_mbps=UPLINK_SPEED,
        media=UPLINK_MEDIA,
        mac=mac,
        description=description(host, uplink),
        aggregate=f"port-channel{vpc}",
        changed_run=changed_run,
    )
    lag = Port(
        device=core,
        name=f"port-channel{vpc}",
        kind="aggregate",
        role="lag",
        speed_mbps=UPLINK_SPEED,
        media=None,
        mac=mac,
        description=description(host, ACCESS_LAG),
        changed_run=changed_run,
    )
    return physical, lag


def add_access_switch(draft: Draft, rng: random.Random, site: str, number: int, changed_run: int | None) -> Draft:
    """Un accès double-attaché : un uplink par cœur, `Port-channel1` côté accès, vPC 100+n sur les cœurs."""
    draft, device = new_device(draft, site, "access", number, stack_size=_stack_size(rng), uptime_days=uptime_days(rng))
    host = device.hostname
    own = {(p.device, p.name): p for p in access_ports(device)}
    uplinks = _uplink_names(device)
    core_port = f"Ethernet1/{number}"
    vpc = ACCESS_VPC_BASE + number
    core_updates: dict[PortRef, Port] = {}
    cables: list[Cable] = []
    aggregates: list[Aggregate] = []
    for uplink, core in zip(uplinks, core_hostnames(site), strict=True):
        own[(host, uplink)] = replace(
            own[(host, uplink)],
            role="uplink",
            speed_mbps=UPLINK_SPEED,
            media=UPLINK_MEDIA,
            state="up",
            description=description(core, core_port),
            aggregate=ACCESS_LAG,
            changed_run=changed_run,
        )
        physical, lag = _core_leg(draft, core, core_port, host, uplink, vpc, changed_run)
        core_updates[(core, core_port)] = physical
        core_updates[(core, lag.name)] = lag
        cables.append(Cable((host, uplink), (core, core_port)))
        aggregates.append(Aggregate(core, lag.name, (core_port,), vpc, False))
    own[(host, ACCESS_LAG)] = Port(
        device=host,
        name=ACCESS_LAG,
        kind="aggregate",
        role="lag",
        speed_mbps=2 * UPLINK_SPEED,
        media=None,
        mac=own[(host, uplinks[0])].mac,
        description=description(core_hostnames(site)[0], f"port-channel{vpc}"),
        changed_run=changed_run,
    )
    aggregates.append(Aggregate(host, ACCESS_LAG, uplinks, None, False))
    draft = draft.replace_ports(core_updates).add(ports=own.values(), cables=cables, aggregates=aggregates)
    for _ in range(rng.randint(*STUBS_PER_ACCESS)):
        draft = add_stub(draft, device, rng.choice(STUB_KINDS), changed_run)
    return draft


def free_access_port(ports: tuple[Port, ...] | list[Port], host: str) -> Port | None:
    """Le premier port cuivre libre du device, dans l'ordre des noms."""
    candidates = [
        p for p in ports if p.device == host and p.role == "unused" and p.media == COPPER_MEDIA and p.kind == "physical"
    ]
    return min(candidates, key=lambda p: p.name, default=None)


def make_stub(seed: str, site: str, kind: str, number: int, attached: PortRef) -> Stub:
    """Un stub : serveur (LLDP seul, port-id = MAC), téléphone (LLDP MAC, CDP « Port 1 »), borne (nom de port)."""
    token = naming.hex_token(seed, "stub", kind, number, length=12)
    mac = ":".join(token[i : i + 2] for i in range(0, 12, 2))
    if kind == "server":
        return Stub(f"srv-{site}-{number:02d}", kind, mac, ("station",), None, attached)
    if kind == "phone":
        return Stub(f"SEP{token.upper()}", kind, mac, ("bridge", "telephone"), ("host", "phone"), attached)
    return Stub(
        f"ap-{site}-{number:02d}", kind, naming.AP_PORT_ID, ("bridge", "wlan_access_point"), ("trans_bridge",), attached
    )


def stub_description(stub: Stub) -> str | None:
    """Les serveurs et les bornes sont documentés sur leur port ; les téléphones jamais."""
    if stub.kind == "server":
        return description(stub.name, naming.SERVER_PORT_NAME, "C3")
    if stub.kind == "ap":
        return description(stub.name, naming.AP_PORT_ID, "C3")
    return None


def add_stub(draft: Draft, device: Device, kind: str, changed_run: int | None) -> Draft:
    """Un stub sur le premier port libre ; son numéro vient d'un compteur jamais décrémenté : un stub retiré ne rend
    ni son nom ni sa MAC. Sans port libre, rien n'est ajouté."""
    port = free_access_port(draft.ports_of(device.hostname), device.hostname)
    if port is None:
        return draft
    number = draft.next_stub + 1
    stub = make_stub(draft.seed, device.site, kind, number, (device.hostname, port.name))
    updated = replace(
        port,
        role="access",
        speed_mbps=ACCESS_SPEED,
        state="up",
        description=stub_description(stub),
        vlan=STUB_VLAN[kind],
        changed_run=changed_run,
    )
    draft = replace(draft, next_stub=number)
    return draft.replace_ports({(port.device, port.name): updated}).add(stubs=[stub])
