"""Formes courte et longue des noms d'interfaces Cisco : le vocabulaire de R1, sans dépendance au contexte."""

import re

CISCO_LONG = {
    "Twe": "TwentyFiveGigE",
    "Te": "TenGigabitEthernet",
    "Gi": "GigabitEthernet",
    "Fo": "FortyGigabitEthernet",
    "Hu": "HundredGigE",
    "Eth": "Ethernet",
    "Po": "port-channel",
    "Fa": "FastEthernet",
    "Lo": "Loopback",
    "Vl": "Vlan",
    "Tu": "Tunnel",
}
_SHORT_RE = re.compile(r"^(Twe|Te|Gi|Fo|Hu|Eth|Po|Fa|Lo|Vl|Tu)(\d[\d/.:]*)$")
_MGMT = {"Mgmt", "Mgmt0", "mgmt", "mgmt0"}
MGMT = "mgmt0"


def expand_cisco(name: str) -> str | None:
    """Forme longue d'un nom court Cisco ; None si le nom n'est pas une forme courte connue."""
    if name in _MGMT:
        return MGMT
    match = _SHORT_RE.match(name)
    if match is None:
        return None
    return CISCO_LONG[match.group(1)] + match.group(2)


def equivalent(name: str) -> str:
    """Forme de comparaison de deux noms de ports (R3) : égaux, ou égaux après expansion."""
    return expand_cisco(name) or name
