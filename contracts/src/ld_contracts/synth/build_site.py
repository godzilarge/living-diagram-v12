"""Le motif d'un site : deux cœurs NX-OS en vPC, un cluster FortiGate actif-passif (`build_firewall.py`), un routeur
WAN vers un PE d'une autre infrastructure ; et le chaînage des sites par leurs cœurs."""

import random
from dataclasses import replace

from ld_contracts.synth import naming
from ld_contracts.synth.build_access import add_access_switch
from ld_contracts.synth.build_firewall import add_firewalls
from ld_contracts.synth.draft import Draft, core_hostnames, description, new_device, uptime_days
from ld_contracts.synth.world import Aggregate, Cable, Device, Port, PortRef

CORE_PORT_COUNT = 54  # N9K-C93180YC-FX : 48 × 10/25G + 6 × 100G
CORE_HUNDRED_GIG_FROM = 49
CORE_ROUTER_PORT = 43
CORE_SPARE_PORTS = range(44, 49)  # réserve des mutations (câble déplacé)
CORE_PEER_LINK_PORTS = (49, 50)
CORE_INTERSITE_PORTS = (53, 54)  # 53 vers le site précédent, 54 vers le suivant
MAX_ACCESS_PER_SITE = 40  # Ethernet1/1-40 ; les firewalls y prennent 33-40 sauf en forme `vpc` (41-42)
PEER_LINK_PO = 10
TEN_GIG, HUNDRED_GIG, ONE_GIG = 10000, 100000, 1000
SFP_MEDIA, QSFP_MEDIA, INTERSITE_MEDIA, COPPER_MEDIA, WAN_MEDIA = (
    "10Gbase-SR",
    "100Gbase-SR4",
    "100Gbase-LR4",
    "1000base-T",
    "1000base-LX",
)
CORE_MGMT_HOSTS, ROUTER_MGMT_HOST = (10, 11), 30
PE_PORT = "GigabitEthernet0/0/0/1"


def build_site(draft: Draft, rng: random.Random, site: str, access_count: int, firewall_uplinks: str) -> Draft:
    draft = add_cores(draft, rng, site)
    for number in range(1, access_count + 1):
        draft = add_access_switch(draft, rng, site, number, changed_run=None)
    draft = add_firewalls(draft, rng, site, firewall_uplinks)
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
