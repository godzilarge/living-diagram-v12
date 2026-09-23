"""Sondes hors fusion : doublons internes qu'un bundle valide peut porter et que le snapshot refuse."""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import attempt, interface, load_minimal, variant

m = load_minimal()


def a1(d):
    ips = interface(d, "sw-core-01", "Ethernet1/4")["ip_addresses"]
    ips.append(dict(ips[0]))


attempt("A1 la même IP listée deux fois sur une interface", variant(m, a1))


def a2(d):
    system = next(s for s in d["system"] if s["hostname"] == "sw-core-01")
    member = {"slot": 1, "serial": None, "model": None, "role": "active", "state": "ready", "priority": None}
    system["chassis_members"] = [member, dict(member)]


attempt("A2 deux membres de stack au même slot", variant(m, a2))


def a3(d):
    system = next(s for s in d["system"] if s["hostname"] == "sw-core-01")
    system["virtual_contexts"] = ["vs1", "vs1"]
    d["ha"][0]["heartbeat_interfaces"] = ["ha1", "ha1"]


attempt("A3 virtual_contexts et heartbeat en double", variant(m, a3))


def a4(d):
    # l'IP annoncée existe sur deux interfaces du même device (adresse secondaire, VRF différentes)
    for name in ("Ethernet1/4", "Ethernet1/5"):
        interface(d, "sw-core-01", name)["ip_addresses"] = [
            {"address": "10.9.9.1", "prefix": 24, "family": 4, "role": "primary"}
        ]


attempt("A4 même IP sur deux interfaces d'un device", variant(m, a4))
