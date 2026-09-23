"""Sondes : bundles VALIDES pour le contrat d'entrée sur lesquels B1 pourrait lever une exception."""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import attempt, cdp_doc, interface, lldp_doc, load_minimal, show_checks, show_links, task_subject, variant

m = load_minimal()


# E1 : le même port local sous deux écritures équivalentes (LLDP en forme courte, description sur le nom canonique)
def e1(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Eth1/5", "srv-a", "eth0", ("station",)))
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C3|srv-a|eth0|"


snap = attempt("E1 port local 'Eth1/5' (lldp) + description sur 'Ethernet1/5'", variant(m, e1))


# E1b : deux témoins observés, deux écritures (lldp court, cdp long)
def e1b(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Eth1/5", "srv-a", "eth0", ("station",)))
    d["cdp"].append(cdp_doc("sw-core-01", "Ethernet1/5", "srv-a", "eth0"))


snap = attempt("E1b lldp local 'Eth1/5' + cdp local 'Ethernet1/5'", variant(m, e1b))


# E1c : mgmt : 'Mgmt0' et 'mgmt0'
def e1c(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Mgmt0", "srv-a", "eth0", ("station",)))
    d["cdp"].append(cdp_doc("sw-core-01", "mgmt0", "srv-a", "eth0"))


snap = attempt("E1c lldp local 'Mgmt0' + cdp local 'mgmt0'", variant(m, e1c))


# E2 : un device dont le hostname d'inventaire est une IP, cité par un voisin
def e2(d):
    dev = dict(next(x for x in d["devices"] if x["hostname"] == "fw-edge-02"))
    dev["hostname"] = "10.0.0.9"
    dev["serial_number"] = None
    d["devices"].append(dev)
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "10.0.0.9", "port1"))


snap = attempt("E2 hostname d'inventaire = '10.0.0.9', annoncé tel quel en LLDP", variant(m, e2))


# E3 : interfaces en échec d'un côté, descriptions de l'autre
def e3(d):
    d["interfaces"] = [i for i in d["interfaces"] if i["hostname"] != "fw-edge-01"]
    d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != "fw-edge-01"]
    d["ha"] = []
    task_subject(d, "fw-edge-01", "interfaces", "failed")


snap = attempt("E3 topic interfaces de fw-edge-01 en échec, descriptions côté cœurs", variant(m, e3))
if snap:
    show_links(snap, "fw-edge-01")


# E4 : boucle A/p -> A/q, descriptions croisées, plus une auto-citation sans port
def e4(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-01", "Ethernet1/3"))
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|sw-core-01|"


snap = attempt("E4 boucle Ethernet1/5 -> Ethernet1/3 du même device + description sans port", variant(m, e4))
if snap:
    show_links(snap, "Ethernet1/5")
    show_checks(snap, "description_disagrees_with_observed", "self_observation")


# E5 : hub + MAC + description
def e5(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "aa:bb:cc:00:00:01", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-a", "aa:bb:cc:00:00:02", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "srv-b", "eth0", ("station",)))
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C3|srv-a|eno1|"


snap = attempt("E5 hub + deux MAC du même stub + description", variant(m, e5))
if snap:
    show_links(snap, "Ethernet1/5")


# E6 : voisin = hostname fait d'espaces / de caractères exotiques (NonEmptyStr)
def e6(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", " ", " "))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "ǅ", "İ"))


snap = attempt("E6 voisin et port faits d'un espace, casefold exotique", variant(m, e6))


# E7 : stub cité par description et observé sous une autre casse
def e7(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "SRV-Z", "eth0", ("station",)))
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C3|srv-z|eth0|"


snap = attempt("E7 stub observé 'SRV-Z', documenté 'srv-z'", variant(m, e7))
if snap:
    show_links(snap, "srv-z")


# E8 : description citant un port d'un externe et d'un injoignable
def e8(d):
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C3|fw-edge-02|x9|"
    interface(d, "fw-edge-01", "ha1")["description"] = "C3|rt-wan-01|Gi0/0/1|"


snap = attempt("E8 descriptions vers injoignable et externe", variant(m, e8))
if snap:
    show_links(snap, "fw-edge-02", "rt-wan-01")
