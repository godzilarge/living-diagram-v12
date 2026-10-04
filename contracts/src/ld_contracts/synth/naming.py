"""Noms, identifiants et formes d'annonce par plateforme : ce que chaque constructeur écrit vraiment.

Noms locaux canoniques (forme longue chez Cisco) ; en LLDP, IOS-XE annonce la forme courte de son port
et NX-OS la forme longue ; en CDP, Cisco annonce toujours la forme longue. Les MAC se dérivent du rang du
device et du rang du port : uniques sans tirage. Les faits de plateforme que l'émission consomme (topics
collectés, VLAN des trunks, VRF de management) vivent ici aussi.
"""

import hashlib
import re

from ld_contracts.synth.world import Platform

OUI = {"cisco": "00:3a:9c", "fortinet": "70:4c:a5", "server": "3c:ec:ef", "phone": "00:1b:54", "ap": "f8:7b:20"}
VENDOR = {Platform.NXOS: "cisco", Platform.IOSXE: "cisco", Platform.IOSXR: "cisco", Platform.FORTIOS: "fortinet"}
OS_NAME = {Platform.NXOS: "NX-OS", Platform.IOSXE: "IOS-XE", Platform.IOSXR: "IOS-XR", Platform.FORTIOS: "FortiOS"}

# (modèle, plateforme, version d'inventaire, version affichée par l'équipement, préfixe de serial)
MODELS = {
    "core": ("N9K-C93180YC-FX", Platform.NXOS, "10.4.2", "10.4(2)", "FDO"),
    "access": ("C9300-24P", Platform.IOSXE, "17.9.4a", "17.09.04a", "FOC"),
    "router": ("ASR1001-X", Platform.IOSXE, "17.9.4a", "17.09.04a", "FXS"),
    "firewall": ("FGT-600F", Platform.FORTIOS, "7.4.5", "v7.4.5", "FG600F"),
    "external": ("ASR-9001", Platform.IOSXR, "7.9.2", "7.9.2", "FOC"),
}
DEVICE_TYPE = {"core": "switch", "access": "switch", "router": "router", "firewall": "firewall", "external": "router"}

# Topics que la librairie de collecte sait lire sur chaque plateforme : un firewall n'a ni LLDP ni CDP.
TOPICS = {
    Platform.NXOS: ("interfaces", "lldp", "cdp", "aggregates", "system"),
    Platform.IOSXE: ("interfaces", "lldp", "cdp", "aggregates", "system"),
    Platform.FORTIOS: ("interfaces", "aggregates", "ha", "system"),
}
MGMT_VRF = {Platform.NXOS: "management", Platform.IOSXE: "Mgmt-vrf", Platform.FORTIOS: "default"}

# VLAN autorisés sur les trunks, par rôle du port : le peer-link porte tout, les uplinks les VLAN utilisateurs,
# les trunks vers les firewalls le VLAN de transit 400 que leur sous-interface `agg-core.400` utilise.
TRUNK_ALL = ((1, 4094),)
ACCESS_TRUNK_VLANS = ((10, 20), (100, 100), (200, 210))
FIREWALL_TRUNK_VLANS = ((100, 100), (400, 400))
FIREWALL_TRANSIT_VLAN = 400
TRUNK_VLANS_BY_ROLE = {
    "peer_link": TRUNK_ALL,
    "downlink": ACCESS_TRUNK_VLANS,
    "uplink": ACCESS_TRUNK_VLANS,
    "fw_link": FIREWALL_TRUNK_VLANS,
}
NATIVE_VLAN = 1
SERVER_VLAN, PHONE_VLAN, AP_VLAN, UNUSED_VLAN = 20, 100, 200, 1
PHONE_CDP_PORT_ID = "Port 1"
AP_PORT_ID = "GigabitEthernet0"
SERVER_PORT_NAME = "eno1"

_SHORT = {
    "TwentyFiveGigE": "Twe",
    "TenGigabitEthernet": "Te",
    "GigabitEthernet": "Gi",
    "FortyGigabitEthernet": "Fo",
    "HundredGigE": "Hu",
    "Port-channel": "Po",
}
_LONG_RE = re.compile(r"^([A-Za-z-]+?)(\d[\d/.:]*)$")
_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def mac(oui: str, device_index: int, port_index: int) -> str:
    """MAC unique : OUI, puis 16 bits de device et 8 bits de port."""
    if not 0 <= device_index < 65536 or not 0 <= port_index < 256:
        raise ValueError("rang de device ou de port hors plage pour une MAC")
    return f"{oui}:{device_index >> 8:02x}:{device_index & 255:02x}:{port_index:02x}"


def serial(prefix: str, seed: str, device_index: int, slot: int = 0) -> str:
    """Serial plausible, unique par (rang, membre) par construction : préfixe, quatre chiffres du rang, le numéro
    de membre (0 pour le châssis), deux lettres tirées de la graine dans tout l'alphabet."""
    digest = hashlib.sha256(f"{seed}:serial:{device_index}:{slot}".encode()).digest()
    letters = "".join(_LETTERS[b % len(_LETTERS)] for b in digest[:2])
    return f"{prefix}{device_index % 10000:04d}{slot}{letters}"


def hex_token(seed: str, *parts: object, length: int) -> str:
    return hashlib.sha256(":".join([seed, *map(str, parts)]).encode()).hexdigest()[:length]


def short_cisco(name: str) -> str:
    """Forme courte IOS-XE d'un nom long ; les noms sans forme courte (`Loopback0`, `mgmt0`) restent tels quels."""
    match = _LONG_RE.match(name)
    if match and match.group(1) in _SHORT:
        return _SHORT[match.group(1)] + match.group(2)
    return name


def lldp_port_id(platform: Platform, name: str) -> str:
    """Ce qu'un équipement annonce comme port-id LLDP pour l'un de ses ports."""
    return short_cisco(name) if platform == Platform.IOSXE else name


def lldp_capabilities(role: str) -> tuple[str, ...]:
    return ("router",) if role in {"router", "external"} else ("bridge", "router")


def cdp_capabilities(role: str) -> tuple[str, ...]:
    return ("router",) if role in {"router", "external"} else ("switch", "igmp")


def down_reason(platform: Platform) -> str | None:
    """Raison brute d'un port physique sans lien, telle que le constructeur l'affiche."""
    return {Platform.NXOS: "Link not connected", Platform.IOSXE: "notconnect"}.get(platform)


def site_name(index: int) -> str:
    return f"dc{index:02d}"


def site_number(site: str) -> int:
    return int(site[2:])


def hostname(site: str, role: str, number: int) -> str:
    short = {"core": "core", "access": "acc", "firewall": "fw", "router": "rt", "external": "pe"}[role]
    return f"{site}-{short}-{number:02d}"


def stack_port(member: int, slot: int, port: int, tengig: bool) -> str:
    prefix = "TenGigabitEthernet" if tengig else "GigabitEthernet"
    return f"{prefix}{member}/{slot}/{port}"
