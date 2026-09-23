"""Sondes diverses : MAC partagée de la fixture, noms non résolus, taille d'un hub."""

import copy
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SHA, attempt, lldp_doc, load_minimal, run, show_checks, show_links, task_subject, variant
from ld_contracts.snapshot.serialize import canonical_json

m = load_minimal()


# M1 : la fixture telle quelle : x1, agg-core et agg-core.400 partagent la MAC 70:4c:a5:aa:bb:01 (bond Linux / agrégat
# FortiGate : les membres portent la MAC de l'agrégat). LLDP parfaitement réciproque entre sw-core-01 et fw-edge-01.
def s1bis(d):
    task_subject(d, "fw-edge-01", "lldp", "success")
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "70:4c:a5:aa:bb:01"))
    d["lldp"].append(lldp_doc("fw-edge-01", "x1", "sw-core-01", "Ethernet1/3"))


snap = attempt("M1 LLDP réciproque, port-id = MAC partagée par x1 / agg-core / agg-core.400 (MAC de la fixture)", variant(m, s1bis))
show_links(snap, "Ethernet1/3")
show_checks(snap, "one_way_observation", "remote_port_is_mac")


# M2 : noms non résolus vs nœuds stub
def names(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "SRV-Z", "eth0", ("station",)))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "srv-z", "eth1", ("station",)))
    d["lldp"].append(lldp_doc("fw-edge-01", "ha1", "2001:DB8:0::9", "eth0", ("station",)))


snap = attempt("M2 unresolved_names face aux stubs", variant(m, names))
print("  stubs            :", [n.hostname for n in snap.nodes if n.kind == "stub"])
print("  unresolved_names :", list(snap.report.unresolved_names))


# M3 : taille du snapshot pour un port qui voit k voisins
def hub(k):
    doc = copy.deepcopy(m)
    for n in range(k):
        doc["cdp"].append(lldp_doc("sw-core-01", "Ethernet1/5", f"sw-flood-{n:04d}", "GigabitEthernet0/1", ("switch",)))
    return doc


for k in (50, 100, 200):
    size = len(canonical_json(run(hub(k), SHA)))
    print(f"  hub k={k:4d} : snapshot = {size / 1024:8.0f} Kio")
