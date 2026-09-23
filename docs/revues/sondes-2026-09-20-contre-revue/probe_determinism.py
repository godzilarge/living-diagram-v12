"""Sondes de déterminisme : même bundle, documents permutés, octets comparés."""

import copy
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SHA, cdp_doc, interface, itf, lldp_doc, load_minimal, order_independent, run, task_subject, variant
from ld_contracts.snapshot.serialize import canonical_json

m = load_minimal()


# D1 : un port membre de deux agrégats dans aggregates[] (le contrat ne le refuse pas)
def d1(d):
    second = copy.deepcopy(next(a for a in d["aggregates"] if a["hostname"] == "sw-core-01" and a["name"] == "port-channel10"))
    second["name"] = "port-channel20"
    second["members"] = [dict(second["members"][0], status="suspended")]
    d["aggregates"] = [a for a in d["aggregates"] if not (a["hostname"] == "sw-core-01" and a["name"] == "port-channel20")]
    d["aggregates"].append(second)


doc = variant(m, d1)
order_independent("D1 Ethernet1/1 membre de port-channel10 ET port-channel20 (aggregates[])", doc)
first = run(doc, SHA)
swapped = copy.deepcopy(doc)
swapped["aggregates"] = swapped["aggregates"][::-1]
second = run(swapped, SHA)
print("  ordre du fichier :", itf(first, "sw-core-01", "Ethernet1/1").aggregate)
print("  ordre inversé    :", itf(second, "sw-core-01", "Ethernet1/1").aggregate)


# D2 : même chose par le repli interfaces[].members (topic aggregates absent)
def d2(d):
    d["aggregates"].clear()
    for t in d["tasks"]:
        t["status_per_subject"].pop("aggregates", None)
    interface(d, "sw-core-01", "port-channel20")["members"] = ["Ethernet1/1", "Ethernet1/3"]


doc = variant(m, d2)
order_independent("D2 Ethernet1/1 membre de deux agrégats par interfaces[].members", doc)
first = run(doc, SHA)
swapped = copy.deepcopy(doc)
swapped["interfaces"] = swapped["interfaces"][::-1]
second = run(swapped, SHA)
print("  ordre du fichier :", itf(first, "sw-core-01", "Ethernet1/1").aggregate)
print("  ordre inversé    :", itf(second, "sw-core-01", "Ethernet1/1").aggregate)


# D3 : bundle tordu complet (hubs des deux côtés, MAC, double forme, descriptions croisées, boucle, adresse)
def d3(d):
    d["lldp"] += [
        lldp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Ethernet1/4"),
        lldp_doc("sw-core-01", "Ethernet1/5", "srv-c", "Gi0/1", ("station",)),
        lldp_doc("sw-core-01", "Ethernet1/5", "SRV-C", "GigabitEthernet0/1", ("station",)),
        lldp_doc("sw-core-02", "Ethernet1/4", "sw-core-01", "Ethernet1/5"),
        lldp_doc("sw-core-02", "Ethernet1/4", "srv-c", "Gi0/1", ("station",)),
        lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "70:4c:a5:ff:ff:01"),
        lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "70:4c:a5:ff:ff:02"),
        lldp_doc("sw-core-02", "Ethernet1/3", "70:4c:a5:aa:bb:10", "ha1"),
        lldp_doc("sw-core-01", "Ethernet1/2", "sw-core-01", "Ethernet1/2"),
    ]
    d["cdp"] += [
        cdp_doc("sw-core-01", "Ethernet1/5", "srv-c", "GigabitEthernet0/1"),
        cdp_doc("sw-core-01", "Ethernet1/5", "sw-core-02", "Eth1/4"),
    ]
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|sw-core-02|"
    interface(d, "fw-edge-01", "ha1")["description"] = "C1|sw-core-02|Eth1/3|"
    task_subject(d, "fw-edge-01", "lldp", "success")


order_independent("D3 bundle tordu complet", variant(m, d3), seeds=12)
snap = run(variant(m, d3), SHA)
print("  liens :", len(snap.links), " contrôles :", len(snap.checks))
print("  octets :", len(canonical_json(snap)))
