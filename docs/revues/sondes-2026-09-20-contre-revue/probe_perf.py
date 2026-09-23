"""Sonde de coût : B1 seul (hors validation du bundle), anneau avec descriptions, puis un port-hub à k voisins."""

import copy
import sys
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SHA, interface, lldp_doc, load_minimal
from ld_backend.correlate import correlate
from ld_contracts.bundle import RunBundle

m = load_minimal()
SECTIONS = ("devices", "tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha")


def ring(devices: int, ports: int, described: bool) -> dict:
    device, task = m["devices"][0], m["tasks"][0]
    port = interface(m, "sw-core-01", "Ethernet1/1")
    doc = {**{k: v for k, v in m.items() if k not in SECTIONS}, **{k: [] for k in SECTIONS}}
    names = [f"sw-{n:04d}" for n in range(devices)]
    for n, host in enumerate(names):
        doc["devices"].append({**device, "hostname": host, "serial_number": None})
        doc["tasks"].append({**copy.deepcopy(task), "hostname": host})
        for k in range(1, ports + 1):
            peer = names[(n + k) % devices]
            back = names[(n - k) % devices]
            # le port k de n va vers le port ports+k de n+k, et réciproquement
            for name, other, other_port in ((f"Ethernet1/{k}", peer, f"Ethernet1/{ports + k}"), (f"Ethernet1/{ports + k}", back, f"Ethernet1/{k}")):
                description = f"C1|{other}|{other_port}|" if described else None
                doc["interfaces"].append({**port, "hostname": host, "name": name, "description": description, "mac_address": None})
                doc["lldp"].append(lldp_doc(host, name, other, other_port))
    return doc


def hub(k: int) -> dict:
    doc = copy.deepcopy(m)
    for n in range(k):
        doc["cdp"].append(lldp_doc("sw-core-01", "Ethernet1/5", f"sw-flood-{n:04d}", "GigabitEthernet0/1", ("switch",)))
    return doc


def timed(doc: dict) -> tuple[float, int, int]:
    bundle = RunBundle.model_validate(doc)
    start = time.perf_counter()
    snap = correlate(bundle, SHA)
    return time.perf_counter() - start, len(snap.links), len(snap.checks)


print("anneau réciproque avec descriptions des deux côtés (claims = 2 x lldp)")
for devices in (100, 200, 400):
    doc = ring(devices, 12, described=True)
    seconds, links, found = timed(doc)
    print(f"  {len(doc['lldp']):6d} lldp + {len(doc['interfaces']):6d} descriptions : {seconds:6.2f} s  liens={links} contrôles={found}")

print("un port qui voit k voisins CDP (inondation derrière un switch tiers)")
for k in (250, 500, 1000, 2000):
    seconds, links, found = timed(hub(k))
    print(f"  k={k:5d} : {seconds:6.2f} s  liens={links} contrôles={found}")
