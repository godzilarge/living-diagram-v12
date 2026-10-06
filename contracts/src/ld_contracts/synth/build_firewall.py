"""Le cluster FortiGate d'un site et son raccordement aux cœurs, sous l'une des formes de `FIREWALL_UPLINKS`.

Une forme est une liste de pattes par membre : (agrégat du firewall, port local, cœur, port du cœur, port-channel du
cœur, vPC ou non). Tout le reste s'en déduit : ports, câbles, agrégats des deux côtés, descriptions en forme HA.
`vpc` (défaut) occupe Ethernet1/41-42 des cœurs ; les autres formes Ethernet1/33 à 36, ou 33 à 40 sur le cœur 01
pour `single-core` : des ports d'accès que la construction n'atteint jamais (vingt accès au plus par site), et qu'un
accès ajouté ne prend pas (un port décrit est pris).
"""

import random
from collections.abc import Sequence
from dataclasses import dataclass

from ld_contracts.synth import naming
from ld_contracts.synth.draft import Draft, core_hostnames, description, new_device, uptime_days
from ld_contracts.synth.world import Aggregate, Cable, Device, HaCluster, Port, PortRef

FW_PRIORITIES = (200, 100)
FW_UNUSED_PORTS = 4
FW_MGMT_HOSTS = (20, 21)
FW_TRANSIT_PREFIX = 29
TEN_GIG, ONE_GIG = 10000, 1000
SFP_MEDIA, COPPER_MEDIA = "10Gbase-SR", "1000base-T"
UPLINK_MAC_INDEX = {"x1": 1, "x2": 2, "x3": 5, "x4": 6}  # 3 et 4 : ha1 et ha2
VPC_CORE_PORT, VPC_ID = 41, 20  # forme `vpc` : Ethernet1/41 + rang, vPC 20 + rang
FW_CORE_PORT, FW_PO = 33, 20  # autres formes : premier port du cœur, premier port-channel


@dataclass(frozen=True, slots=True)
class Leg:
    aggregate: str  # agrégat du firewall
    local: str  # port du firewall
    core: int  # 0 = cœur 01, 1 = cœur 02
    core_port: int  # Ethernet1/<n>
    core_po: int  # port-channel<n> du cœur
    vpc: bool  # le port-channel du cœur est une patte vPC (`mlag_id` = son numéro)


def legs(form: str, rank: int) -> tuple[Leg, ...]:
    """Les pattes du membre de rang `rank` (0 = priorité haute) ; une forme inconnue est une erreur de programmation."""
    if form == "vpc":
        n, po = VPC_CORE_PORT + rank, VPC_ID + rank
        return (Leg("agg-core", "x1", 0, n, po, True), Leg("agg-core", "x2", 1, n, po, True))
    out: list[Leg] = []
    for j, agg in enumerate(("agg-1", "agg-2")):
        first, second = f"x{2 * j + 1}", f"x{2 * j + 2}"
        po = FW_PO + 2 * rank + j
        if form == "dual-vpc":
            n = FW_CORE_PORT + 2 * rank + j
            out += [Leg(agg, first, 0, n, po, True), Leg(agg, second, 1, n, po, True)]
        elif form == "per-core":
            n = FW_CORE_PORT + 2 * rank
            out += [Leg(agg, first, j, n, po, False), Leg(agg, second, j, n + 1, po, False)]
        elif form == "single-core":
            n = FW_CORE_PORT + 4 * rank + 2 * j
            out += [Leg(agg, first, 0, n, po, False), Leg(agg, second, 0, n + 1, po, False)]
        else:
            raise ValueError(f"forme de raccordement inconnue : {form}")
    return tuple(out)


def _ha_form(cores: tuple[str, str], members: Sequence[Device], plan: Sequence[tuple[Leg, ...]]) -> dict[str, str]:
    """Descriptions partagées des deux membres : une paire (cœur, port) par membre, dans l'ordre des priorités HA."""
    by_local = [{leg.local: leg for leg in member_legs} for member_legs in plan]
    form = {
        local: "C1|" + "|".join(f"{cores[m[local].core]}|Ethernet1/{m[local].core_port}" for m in by_local)
        for local in by_local[0]
    }
    form["ha1"] = f"C2|{members[1].hostname}|ha1|{members[0].hostname}|ha1"
    return form


def _uplinks(device: Device, ha_form: dict[str, str], member_legs: tuple[Leg, ...]) -> list[Port]:
    """Les ports physiques vers les cœurs, puis un port agrégat par agrégat du firewall (MAC de son premier membre)."""
    host, i, oui = device.hostname, device.index, naming.OUI["fortinet"]
    ports = [
        Port(
            host,
            leg.local,
            "physical",
            "fw_uplink",
            TEN_GIG,
            SFP_MEDIA,
            naming.mac(oui, i, UPLINK_MAC_INDEX[leg.local]),
            ha_form[leg.local],
            leg.aggregate,
        )
        for leg in member_legs
    ]
    for agg in dict.fromkeys(leg.aggregate for leg in member_legs):
        members = [leg for leg in member_legs if leg.aggregate == agg]
        mac = naming.mac(oui, i, UPLINK_MAC_INDEX[members[0].local])
        ports.append(Port(host, agg, "aggregate", "lag", TEN_GIG * len(members), None, mac))
    return ports


def _firewall_ports(device: Device, rank: int, ha_form: dict[str, str], member_legs: tuple[Leg, ...]) -> list[Port]:
    host, i, oui = device.hostname, device.index, naming.OUI["fortinet"]
    site_no = naming.site_number(device.site)
    transit_on = member_legs[0].aggregate
    ports = _uplinks(device, ha_form, member_legs)
    ports += [
        Port(host, "ha1", "physical", "heartbeat", ONE_GIG, COPPER_MEDIA, naming.mac(oui, i, 3), ha_form["ha1"]),
        Port(host, "ha2", "physical", "unused", None, COPPER_MEDIA, naming.mac(oui, i, 4), state="down"),
        Port(
            host,
            f"{transit_on}.{naming.FIREWALL_TRANSIT_VLAN}",
            "subinterface",
            "subif",
            None,
            None,
            naming.mac(oui, i, UPLINK_MAC_INDEX[member_legs[0].local]),
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


def _core_side(
    draft: Draft, member: Device, cores: tuple[str, str], member_legs: tuple[Leg, ...]
) -> tuple[list[Port], list[Cable], list[Aggregate]]:
    """Côté cœurs : un port décrit vers le membre par patte, un port-channel par (cœur, numéro), vPC ou non."""
    ports: list[Port] = []
    cables: list[Cable] = []
    groups: dict[tuple[str, int], list[Leg]] = {}
    for leg in member_legs:
        core, name = cores[leg.core], f"Ethernet1/{leg.core_port}"
        mac = naming.mac(naming.OUI["cisco"], draft.device(core).index, leg.core_port)
        lag = f"port-channel{leg.core_po}"
        desc = description(member.hostname, leg.local)
        ports.append(Port(core, name, "physical", "fw_link", TEN_GIG, SFP_MEDIA, mac, desc, lag))
        cables.append(Cable((member.hostname, leg.local), (core, name)))
        groups.setdefault((core, leg.core_po), []).append(leg)
    aggregates: list[Aggregate] = []
    for (core, po), group in groups.items():
        lag = f"port-channel{po}"
        mac = naming.mac(naming.OUI["cisco"], draft.device(core).index, group[0].core_port)
        desc = description(member.hostname, group[0].aggregate)
        ports.append(Port(core, lag, "aggregate", "lag", TEN_GIG * len(group), None, mac, desc))
        members = tuple(f"Ethernet1/{leg.core_port}" for leg in group)
        aggregates.append(Aggregate(core, lag, members, po if group[0].vpc else None, False))
    return ports, cables, aggregates


def add_firewalls(draft: Draft, rng: random.Random, site: str, form: str) -> Draft:
    """Cluster actif-passif : fw-01 (priorité 200) et fw-02 (100), configuration partagée, descriptions en forme HA."""
    members: list[Device] = []
    for number in (1, 2):
        draft, device = new_device(draft, site, "firewall", number, uptime_days=uptime_days(rng))
        members.append(device)
    cores = core_hostnames(site)
    plan = [legs(form, rank) for rank in range(len(members))]
    ha_form = _ha_form(cores, members, plan)
    own: list[Port] = []
    core_updates: dict[PortRef, Port] = {}
    cables: list[Cable] = []
    aggregates: list[Aggregate] = []
    for rank, (member, member_legs) in enumerate(zip(members, plan, strict=True)):
        own += _firewall_ports(member, rank, ha_form, member_legs)
        for agg in dict.fromkeys(leg.aggregate for leg in member_legs):
            locals_ = tuple(leg.local for leg in member_legs if leg.aggregate == agg)
            aggregates.append(Aggregate(member.hostname, agg, locals_, None, False))
        side_ports, side_cables, side_aggregates = _core_side(draft, member, cores, member_legs)
        core_updates.update({(p.device, p.name): p for p in side_ports})
        cables += side_cables
        aggregates += side_aggregates
    cables.append(Cable((members[0].hostname, "ha1"), (members[1].hostname, "ha1")))
    cluster = HaCluster(f"{site.upper()}-EDGE", site, (members[0].hostname, members[1].hostname), FW_PRIORITIES)
    return draft.replace_ports(core_updates).add(ports=own, cables=cables, aggregates=aggregates, clusters=[cluster])
