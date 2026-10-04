"""Le motif d'un site : deux cœurs NX-OS en vPC, un cluster FortiGate actif-passif, un routeur WAN vers un PE
d'une autre infrastructure ; et le chaînage des sites par leurs cœurs."""

import random
from dataclasses import replace

from ld_contracts.synth import naming
from ld_contracts.synth.build_access import add_access_switch
from ld_contracts.synth.draft import Draft, core_hostnames, description, new_device, uptime_days
from ld_contracts.synth.world import Aggregate, Cable, Device, HaCluster, Port, PortRef

CORE_PORT_COUNT = 54  # N9K-C93180YC-FX : 48 × 10/25G + 6 × 100G
CORE_HUNDRED_GIG_FROM = 49
CORE_FW_PORTS = (41, 42)  # une patte vPC par membre du cluster
CORE_ROUTER_PORT = 43
CORE_SPARE_PORTS = range(44, 49)  # réserve des mutations (câble déplacé)
CORE_PEER_LINK_PORTS = (49, 50)
CORE_INTERSITE_PORTS = (53, 54)  # 53 vers le site précédent, 54 vers le suivant
MAX_ACCESS_PER_SITE = CORE_FW_PORTS[0] - 1
PEER_LINK_PO = 10
FW_VPC_IDS = (20, 21)
FW_PRIORITIES = (200, 100)
FW_UNUSED_PORTS = 4
TEN_GIG, HUNDRED_GIG, ONE_GIG = 10000, 100000, 1000
SFP_MEDIA, QSFP_MEDIA, INTERSITE_MEDIA, COPPER_MEDIA, WAN_MEDIA = (
    "10Gbase-SR",
    "100Gbase-SR4",
    "100Gbase-LR4",
    "1000base-T",
    "1000base-LX",
)
CORE_MGMT_HOSTS, FW_MGMT_HOSTS, ROUTER_MGMT_HOST = (10, 11), (20, 21), 30
FW_TRANSIT_PREFIX = 29
PE_PORT = "GigabitEthernet0/0/0/1"


def build_site(draft: Draft, rng: random.Random, site: str, access_count: int) -> Draft:
    draft = add_cores(draft, rng, site)
    for number in range(1, access_count + 1):
        draft = add_access_switch(draft, rng, site, number, changed_run=None)
    draft = add_firewalls(draft, rng, site)
    return add_router(draft, rng, site)


def _core_physical(device: Device, other: Device, n: int) -> Port:
    """Un port physique de cœur : peer-link monté et décrit, sinon en attente, sans optique."""
    peer_link = n in CORE_PEER_LINK_PORTS
    name = f"Ethernet1/{n}"
    return Port(
        device=device.hostname,
        name=name,
        kind="physical",
        role="peer_link" if peer_link else "unused",
        speed_mbps=HUNDRED_GIG if peer_link else None,
        media=QSFP_MEDIA if peer_link else None,
        mac=naming.mac(naming.OUI["cisco"], device.index, n),
        description=description(other.hostname, name) if peer_link else None,
        aggregate=f"port-channel{PEER_LINK_PO}" if peer_link else None,
        state="up" if peer_link else "down",
        vlan=None if peer_link else naming.UNUSED_VLAN,
    )


def _core_ports(device: Device, other: Device, site_no: int, rank: int) -> list[Port]:
    """Les 54 ports d'un cœur, son peer-link `port-channel10`, `mgmt0` et `loopback0`."""
    oui = naming.OUI["cisco"]
    host = device.hostname
    ports = [_core_physical(device, other, n) for n in range(1, CORE_PORT_COUNT + 1)]
    ports.append(
        Port(
            device=host,
            name=f"port-channel{PEER_LINK_PO}",
            kind="aggregate",
            role="lag",
            speed_mbps=HUNDRED_GIG * len(CORE_PEER_LINK_PORTS),
            media=None,
            mac=naming.mac(oui, device.index, CORE_PEER_LINK_PORTS[0]),
            description=description(other.hostname, f"port-channel{PEER_LINK_PO}"),
        )
    )
    mgmt_ip = (f"10.{site_no}.0.{CORE_MGMT_HOSTS[rank]}", 24)
    ports.append(
        Port(host, "mgmt0", "management", "mgmt", ONE_GIG, COPPER_MEDIA, naming.mac(oui, device.index, 0), ip=mgmt_ip)
    )
    ports.append(
        Port(host, "loopback0", "loopback", "loopback", None, None, None, ip=(f"10.255.{site_no}.{rank + 1}", 32))
    )
    return ports


def add_cores(draft: Draft, rng: random.Random, site: str) -> Draft:
    cores: list[Device] = []
    for number in (1, 2):
        draft, device = new_device(draft, site, "core", number, uptime_days=uptime_days(rng))
        cores.append(device)
    site_no = naming.site_number(site)
    ports = [p for rank, device in enumerate(cores) for p in _core_ports(device, cores[1 - rank], site_no, rank)]
    cables = [
        Cable((cores[0].hostname, f"Ethernet1/{n}"), (cores[1].hostname, f"Ethernet1/{n}"))
        for n in CORE_PEER_LINK_PORTS
    ]
    members = tuple(f"Ethernet1/{n}" for n in CORE_PEER_LINK_PORTS)
    aggregates = [Aggregate(c.hostname, f"port-channel{PEER_LINK_PO}", members, None, True) for c in cores]
    return draft.add(ports=ports, cables=cables, aggregates=aggregates)


def _ha_form(site: str, cores: tuple[str, str], members: list[Device]) -> dict[str, str]:
    """Descriptions partagées des deux membres : une paire par membre, dans l'ordre des priorités HA."""
    first, second = (f"Ethernet1/{n}" for n in CORE_FW_PORTS)
    return {
        "x1": f"C1|{cores[0]}|{first}|{cores[0]}|{second}",
        "x2": f"C1|{cores[1]}|{first}|{cores[1]}|{second}",
        "ha1": f"C2|{members[1].hostname}|ha1|{members[0].hostname}|ha1",
    }


def _firewall_ports(device: Device, rank: int, ha_form: dict[str, str], site_no: int) -> list[Port]:
    host, i, oui = device.hostname, device.index, naming.OUI["fortinet"]
    x1_mac = naming.mac(oui, i, 1)
    ports = [
        Port(host, "x1", "physical", "fw_uplink", TEN_GIG, SFP_MEDIA, x1_mac, ha_form["x1"], "agg-core"),
        Port(host, "x2", "physical", "fw_uplink", TEN_GIG, SFP_MEDIA, naming.mac(oui, i, 2), ha_form["x2"], "agg-core"),
        Port(host, "ha1", "physical", "heartbeat", ONE_GIG, COPPER_MEDIA, naming.mac(oui, i, 3), ha_form["ha1"]),
        Port(host, "ha2", "physical", "unused", None, COPPER_MEDIA, naming.mac(oui, i, 4), state="down"),
        Port(host, "agg-core", "aggregate", "lag", 2 * TEN_GIG, None, x1_mac),
        Port(
            host,
            f"agg-core.{naming.FIREWALL_TRANSIT_VLAN}",
            "subinterface",
            "subif",
            None,
            None,
            x1_mac,
            ip=(f"10.{site_no}.{naming.FIREWALL_TRANSIT_VLAN // 10}.{1 + rank}", FW_TRANSIT_PREFIX),
            vlan=naming.FIREWALL_TRANSIT_VLAN,
        ),
        Port(
            host,
            "mgmt",
            "management",
            "mgmt",
            ONE_GIG,
            COPPER_MEDIA,
            naming.mac(oui, i, 0),
            ip=(f"10.{site_no}.0.{FW_MGMT_HOSTS[rank]}", 24),
        ),
    ]
    ports += [
        Port(host, f"port{n}", "physical", "unused", None, COPPER_MEDIA, naming.mac(oui, i, 10 + n), state="down")
        for n in range(1, FW_UNUSED_PORTS + 1)
    ]
    return ports


def _firewall_legs(
    draft: Draft, member: Device, rank: int, cores: tuple[str, str]
) -> tuple[list[Port], list[Cable], list[Aggregate]]:
    """Côté cœurs : une patte vPC (20 ou 21) par membre, un port par cœur, décrit vers le membre."""
    core_port = f"Ethernet1/{CORE_FW_PORTS[rank]}"
    vpc = FW_VPC_IDS[rank]
    ports: list[Port] = []
    cables: list[Cable] = []
    aggregates: list[Aggregate] = []
    for core, local in zip(cores, ("x1", "x2"), strict=True):
        mac = naming.mac(naming.OUI["cisco"], draft.device(core).index, CORE_FW_PORTS[rank])
        ports.append(
            Port(
                core,
                core_port,
                "physical",
                "fw_link",
                TEN_GIG,
                SFP_MEDIA,
                mac,
                description(member.hostname, local),
                f"port-channel{vpc}",
            )
        )
        ports.append(
            Port(
                core,
                f"port-channel{vpc}",
                "aggregate",
                "lag",
                TEN_GIG,
                None,
                mac,
                description(member.hostname, "agg-core"),
            )
        )
        cables.append(Cable((member.hostname, local), (core, core_port)))
        aggregates.append(Aggregate(core, f"port-channel{vpc}", (core_port,), vpc, False))
    return ports, cables, aggregates


def add_firewalls(draft: Draft, rng: random.Random, site: str) -> Draft:
    """Cluster actif-passif : fw-01 (priorité 200) et fw-02 (100), configuration partagée, descriptions en forme HA."""
    members: list[Device] = []
    for number in (1, 2):
        draft, device = new_device(draft, site, "firewall", number, uptime_days=uptime_days(rng))
        members.append(device)
    cores = core_hostnames(site)
    site_no = naming.site_number(site)
    ha_form = _ha_form(site, cores, members)
    own: list[Port] = []
    core_updates: dict[PortRef, Port] = {}
    cables: list[Cable] = []
    aggregates: list[Aggregate] = []
    for rank, member in enumerate(members):
        own += _firewall_ports(member, rank, ha_form, site_no)
        aggregates.append(Aggregate(member.hostname, "agg-core", ("x1", "x2"), None, False))
        legs, leg_cables, leg_aggregates = _firewall_legs(draft, member, rank, cores)
        core_updates.update({(p.device, p.name): p for p in legs})
        cables += leg_cables
        aggregates += leg_aggregates
    cables.append(Cable((members[0].hostname, "ha1"), (members[1].hostname, "ha1")))
    cluster = HaCluster(f"{site.upper()}-EDGE", site, (members[0].hostname, members[1].hostname), FW_PRIORITIES)
    return draft.replace_ports(core_updates).add(ports=own, cables=cables, aggregates=aggregates, clusters=[cluster])


def _router_core_links(router: Device, cores: tuple[str, str], site_no: int) -> tuple[list[Port], list[Port]]:
    """(ports du routeur, ports des cœurs) : un lien routé /31 vers chaque cœur, décrit des deux côtés."""
    host, oui, i = router.hostname, naming.OUI["cisco"], router.index
    core_port = f"Ethernet1/{CORE_ROUTER_PORT}"
    own: list[Port] = []
    core_ports: list[Port] = []
    for rank, core in enumerate(cores):
        local = f"GigabitEthernet0/0/{rank}"
        own.append(
            Port(
                device=host,
                name=local,
                kind="physical",
                role="routed",
                speed_mbps=ONE_GIG,
                media=COPPER_MEDIA,
                mac=naming.mac(oui, i, rank + 1),
                description=description(core, core_port, "C2"),
                ip=(f"10.{site_no}.1.{2 * rank + 1}", 31),
            )
        )
        core_ports.append(
            Port(
                device=core,
                name=core_port,
                kind="physical",
                role="routed",
                speed_mbps=ONE_GIG,
                media=COPPER_MEDIA,
                mac=None,
                description=description(host, local, "C2"),
                ip=(f"10.{site_no}.1.{2 * rank}", 31),
            )
        )
    return own, core_ports


def _router_other_ports(router: Device, external: Device, site_no: int) -> list[Port]:
    """Le lien WAN vers le PE, trois ports libres, le port de management et la loopback."""
    host, oui, i = router.hostname, naming.OUI["cisco"], router.index
    ports = [
        Port(
            device=host,
            name="GigabitEthernet0/0/2",
            kind="physical",
            role="wan",
            speed_mbps=ONE_GIG,
            media=WAN_MEDIA,
            mac=naming.mac(oui, i, 3),
            description=description(external.hostname, PE_PORT, "C1"),
            ip=(f"10.254.{site_no}.1", 31),
        )
    ]
    ports += [
        Port(
            host,
            f"GigabitEthernet0/0/{n}",
            "physical",
            "unused",
            None,
            COPPER_MEDIA,
            naming.mac(oui, i, n + 1),
            state="down",
        )
        for n in (3, 4, 5)
    ]
    mgmt_ip = (f"10.{site_no}.0.{ROUTER_MGMT_HOST}", 24)
    ports.append(
        Port(host, "GigabitEthernet0", "management", "mgmt", ONE_GIG, COPPER_MEDIA, naming.mac(oui, i, 0), ip=mgmt_ip)
    )
    ports.append(Port(host, "Loopback0", "loopback", "loopback", None, None, None, ip=(f"10.255.{site_no}.3", 32)))
    return ports


def add_router(draft: Draft, rng: random.Random, site: str) -> Draft:
    draft, router = new_device(draft, site, "router", 1, uptime_days=uptime_days(rng))
    draft, external = new_device(draft, site, "external", 1, uptime_days=uptime_days(rng))
    cores = core_hostnames(site)
    site_no = naming.site_number(site)
    links, core_ports = _router_core_links(router, cores, site_no)
    own = links + _router_other_ports(router, external, site_no)
    core_updates = {}
    for port in core_ports:
        mac = naming.mac(naming.OUI["cisco"], draft.device(port.device).index, CORE_ROUTER_PORT)
        core_updates[(port.device, port.name)] = replace(port, mac=mac)
    cables = [
        Cable((router.hostname, p.name), (p.description.split("|")[1], p.description.split("|")[2]))
        for p in own
        if p.role == "routed"
    ]
    cables.append(Cable((router.hostname, "GigabitEthernet0/0/2"), (external.hostname, PE_PORT)))
    return draft.replace_ports(core_updates).add(ports=own, cables=cables)


def chain_sites(draft: Draft, sites: tuple[str, ...]) -> Draft:
    """Les cœurs du site n parlent aux cœurs du site n+1 (Ethernet1/54 → Ethernet1/53), en routé 100G."""
    base = {(p.device, p.name): p for p in draft.ports}
    updates: dict[PortRef, Port] = {}
    cables: list[Cable] = []
    for rank, (here, there) in enumerate(zip(sites, sites[1:], strict=False)):
        for core_number in (1, 2):
            a = naming.hostname(here, "core", core_number)
            b = naming.hostname(there, "core", core_number)
            pa, pb = (f"Ethernet1/{n}" for n in (CORE_INTERSITE_PORTS[1], CORE_INTERSITE_PORTS[0]))
            subnet = 4 * rank + 2 * (core_number - 1)
            common = {
                "role": "intersite",
                "speed_mbps": HUNDRED_GIG,
                "state": "up",
                "media": INTERSITE_MEDIA,
                "vlan": None,
            }
            updates[(a, pa)] = replace(
                base[(a, pa)], description=description(b, pb), ip=(f"10.253.{rank}.{subnet}", 31), **common
            )
            updates[(b, pb)] = replace(
                base[(b, pb)], description=description(a, pa), ip=(f"10.253.{rank}.{subnet + 1}", 31), **common
            )
            cables.append(Cable((a, pa), (b, pb)))
    return draft.replace_ports(updates).add(cables=cables)
