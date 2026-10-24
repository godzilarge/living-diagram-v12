"""Sonde : un verdict de Contrôle dit « N <choses> » avec N = nombre de contrôles (state/control.ts, verdictGroups).

Pour quatre codes, B1 écrit plusieurs contrôles pour une seule chose : la phrase du catalogue compte alors des
choses qui n'existent pas. Lancer depuis backend/ :  uv run python ../docs/revues/2026-10-21-controle-sondes/compte_par_chose.py
"""

import copy

from tests.correlate.conftest import checks, lldp_doc, load_minimal, run, task_subject, variant

CORE_1, CORE_2, FW_1, FW_2 = "sw-core-01", "sw-core-02", "fw-edge-01", "fw-edge-02"


def cdp_doc(hostname, local, neighbor, port):
    return {"hostname": hostname, "local_interface": local, "neighbor": neighbor, "neighbor_interface": port,
            "neighbor_platform": None, "neighbor_capabilities": ["router"], "neighbor_address": None, "extras": {}}


def say(code, found, things, noun):
    print(f"{code}: {len(found)} contrôles -> la phrase dit « {len(found)} {noun} » ; choses distinctes : {len(things)} {sorted(things)}")


m = load_minimal()

# 1. one_way_observation : sw-core-01 Eth1/1 vu par LLDP et CDP, sw-core-02 ne répond par aucun des deux
def one_way(d):
    task_subject(d, CORE_2, "cdp", "success")
    d["lldp"] = [x for x in d["lldp"] if not (x["hostname"] == CORE_2 and x["local_interface"] == "Ethernet1/1")]
snap = run(variant(m, one_way))
found = checks(snap, "one_way_observation")
say("one_way_observation", found, {str([r for r in c.refs if r.kind == "link"][0]) for c in found}, "câbles observés d'un seul côté")

# 2. neighbor_unknown : un même voisin inconnu annoncé sur deux ports (le cas de dc01-acc-02 dans la fixture e2e)
def unknown(d):
    d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/5", "ghost-01", "eth0"))
    d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/3", "ghost-01", "eth1"))
snap = run(variant(m, unknown))
found = [c for c in checks(snap, "neighbor_unknown") if c.details.get("neighbor") == "ghost-01"]
say("neighbor_unknown", found, {c.details["neighbor"] for c in found}, "voisins inconnus de l'inventaire")
print("   Livraison « Non résolus » lit report.unresolved_names :", list(snap.report.unresolved_names))

# 3. self_observation : un port qui se cite lui-même par LLDP et CDP
def selfish(d):
    d["lldp"].append(lldp_doc(CORE_1, "Ethernet1/5", CORE_1, "Ethernet1/5"))
    tpl = copy.deepcopy(next(x for x in d["cdp"]))
    tpl.update(local_interface="Ethernet1/5", neighbor=CORE_1, neighbor_interface="Ethernet1/5")
    d["cdp"].append(tpl)
snap = run(variant(m, selfish))
found = checks(snap, "self_observation")
say("self_observation", found, {(c.refs[0].hostname, getattr(c.refs[0], "name", None) or c.details.get("interface")) for c in found}, "ports qui se désignent eux-mêmes")

# 4. ha_view_mismatch : la variante de backend/tests/correlate/test_structures.py (un seul cluster)
def ha(d):
    subject = {"status": "success", "started_at": None, "ended_at": None, "error": None}
    d["tasks"] = [t for t in d["tasks"] if t["hostname"] != FW_2] + [
        {"hostname": FW_2, "status": "success", "status_per_subject": {"ha": dict(subject)}, "error": None}]
    d["ha"].append({"hostname": FW_2, "mode": "active_active", "cluster_name": "EDGE-CLUSTER", "members": [
        {"name": FW_2, "serial": None, "role": "primary", "state": "up", "priority": 300},
        {"name": FW_1, "serial": None, "role": "secondary", "state": "up", "priority": 200}],
        "heartbeat_interfaces": [], "extras": {}})
snap = run(variant(m, ha))
found = checks(snap, "ha_view_mismatch")
say("ha_view_mismatch", found, {c.refs[0].members for c in found}, "grappes décrites différemment par leurs membres")
