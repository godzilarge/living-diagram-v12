"""E2 bis : hostname d'inventaire = IPv6 canonique, annoncée sous une autre écriture ; et hostname = MAC."""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import attempt, lldp_doc, load_minimal, variant

m = load_minimal()


def add_device(d, hostname):
    dev = dict(next(x for x in d["devices"] if x["hostname"] == "fw-edge-02"))
    dev["hostname"], dev["serial_number"] = hostname, None
    d["devices"].append(dev)


def v6(d):
    add_device(d, "2001:db8::9")
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "2001:DB8:0::9", "port1"))


def ext(d):
    add_device(d, "10.0.0.9")
    d["devices"][-1]["infrastructure"] = "infra-wan"
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "10.0.0.9", "port1"))


attempt("E2b hostname '2001:db8::9' annoncé '2001:DB8:0::9'", variant(m, v6))
snap = attempt("E2c hostname IP d'un device d'une AUTRE infrastructure (jamais matérialisé comme device)", variant(m, ext))
if snap:
    print("  nœud :", [(n.kind, n.hostname) for n in snap.nodes if n.hostname == "10.0.0.9"], "(attendu : external)")
