"""Sondes : câbles en double, contrôles contradictoires, incohérences details / lien."""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import (
    attempt,
    cdp_doc,
    interface,
    lldp_doc,
    load_minimal,
    order_independent,
    show_checks,
    show_links,
    task_subject,
    variant,
)

m = load_minimal()


# S1 : LLDP réciproque parfait, mais fw-edge-01 annonce une MAC en port-id et ses mac_address ne sont pas fournies
def s1(d):
    for i in d["interfaces"]:
        if i["hostname"] == "fw-edge-01":
            i["mac_address"] = None
    task_subject(d, "fw-edge-01", "lldp", "success")
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "70:4c:a5:aa:bb:01"))
    d["lldp"].append(lldp_doc("fw-edge-01", "x1", "sw-core-01", "Ethernet1/3"))


snap = attempt("S1 LLDP réciproque, port-id en MAC non résoluble (mac_address null)", variant(m, s1))
if snap:
    show_links(snap, "Ethernet1/3")
    show_checks(snap, "one_way_observation", "multiple_observed_neighbors", "description_disagrees_with_observed")
order_independent("S1", variant(m, s1))


# S2 : même voisin vu par LLDP (port-id MAC) et par CDP (port nommé) sur le même port local
def s2(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "ap-12", "aa:bb:cc:00:00:01", ("wlan_access_point",)))
    d["cdp"].append(cdp_doc("sw-core-01", "Ethernet1/5", "ap-12", "GigabitEthernet0", ("trans_bridge",)))


snap = attempt("S2 même stub vu en LLDP (MAC) et en CDP (nom) sur un port", variant(m, s2))
if snap:
    show_links(snap, "Ethernet1/5")
    show_checks(snap, "multiple_observed_neighbors")


# S3 : descriptions croisées contradictoires entre trois devices, rien d'observé
def s3(d):
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|fw-edge-01|ha1|"
    interface(d, "fw-edge-01", "ha1")["description"] = "C1|sw-core-02|Ethernet1/4|"
    interface(d, "sw-core-02", "Ethernet1/4")["description"] = "C1|sw-core-01|Ethernet1/5|"


snap = attempt("S3 trois descriptions en cercle", variant(m, s3))
if snap:
    show_links(snap, "Ethernet1/5", "ha1", "Ethernet1/4")
    show_checks(snap, "description_disagrees_with_observed")
order_independent("S3", variant(m, s3))


# S4 : deux descriptions de devices différents citant le même port
def s4(d):
    interface(d, "sw-core-01", "Ethernet1/5")["description"] = "C1|fw-edge-01|ha1|"
    interface(d, "sw-core-02", "Ethernet1/4")["description"] = "C1|fw-edge-01|ha1|"


snap = attempt("S4 deux descriptions vers fw-edge-01/ha1", variant(m, s4))
if snap:
    show_links(snap, "ha1")
order_independent("S4", variant(m, s4))


# S5 : un port vu par deux témoins différents, lui-même muet (hub côté non collecté)
def s5(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/5", "fw-edge-01", "ha1"))
    d["lldp"].append(lldp_doc("sw-core-02", "Ethernet1/4", "fw-edge-01", "ha1"))


snap = attempt("S5 fw-edge-01/ha1 vu depuis deux switches", variant(m, s5))
if snap:
    show_links(snap, "ha1")
    show_checks(snap, "multiple_observed_neighbors", "description_disagrees_with_observed")
order_independent("S5", variant(m, s5))


# S6 : voisin résolu par adresse (MAC d'une interface), port en MAC aussi, + description d'en face
def s6(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "70:4c:a5:aa:bb:10", "70:4c:a5:aa:bb:10"))


snap = attempt("S6 voisin = MAC de fw-edge-01/ha1, port = même MAC", variant(m, s6))
if snap:
    show_links(snap, "Ethernet1/3")
    show_checks(snap, "neighbor_resolved_by_address", "description_disagrees_with_observed")


# S7 : hub + description concordante + description d'en face
def s7(d):
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "fw-edge-01", "x1"))
    d["lldp"].append(lldp_doc("sw-core-01", "Ethernet1/3", "srv-q", "eth0", ("station",)))


snap = attempt("S7 hub sur Ethernet1/3 (fw-edge-01/x1 + srv-q)", variant(m, s7))
if snap:
    show_links(snap, "Ethernet1/3")
    show_checks(snap, "multiple_observed_neighbors", "description_disagrees_with_observed")
order_independent("S7", variant(m, s7))
