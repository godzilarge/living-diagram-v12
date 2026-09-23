"""Fuzz à graine fixe : bundles tordus mais valides, ports locaux canoniques (pour chercher AUTRE chose que C1).

Pour chaque tirage : B1 ne doit pas lever, et une permutation des sections doit donner les mêmes octets.
Invariants vérifiés en plus : pas deux liens de même clé ; un contrôle `link` référence un lien présent.
"""

import copy
import random
import sys
from collections import Counter

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SECTIONS, SHA, load_minimal, lldp_doc, run
from ld_contracts.bundle import RunBundle
from ld_contracts.snapshot.serialize import canonical_json
from pydantic import ValidationError

m = load_minimal()
LOCAL = [(i["hostname"], i["name"]) for i in m["interfaces"]]
HOSTS = ["sw-core-01", "sw-core-02", "fw-edge-01", "fw-edge-02", "rt-wan-01", "SW-CORE-02", "Sw-Core-01", "srv-a", "SRV-A",
         "srv-b", "70:4c:a5:aa:bb:10", "00:3a:9c:11:22:01", "192.0.2.0", "198.51.100.9", "2001:DB8::1", "aa:bb:cc:00:00:09"]
PORTS = ["Ethernet1/1", "Eth1/1", "Ethernet1/2", "Eth1/3", "Ethernet1/3", "Ethernet1/4", "Ethernet1/5", "Eth1/5", "x1", "x2",
         "ha1", "Gi0/0/0", "GigabitEthernet0/0/0", "eth0", "70:4c:a5:aa:bb:01", "70:4c:a5:aa:bb:10", "00:3a:9c:11:22:05",
         "aa:bb:cc:00:00:01", "port-channel10", "Po10", "mgmt0", "Mgmt0"]
STATUSES = ["success", "failed", None]


def draw(rng: random.Random) -> dict:
    d = copy.deepcopy(m)
    d["lldp"], d["cdp"] = [], []
    for section, count in (("lldp", rng.randint(0, 14)), ("cdp", rng.randint(0, 8))):
        seen = set()
        for _ in range(count):
            host, local = rng.choice(LOCAL)
            key = (host, local, rng.choice(HOSTS), rng.choice(PORTS))
            if key in seen:
                continue
            seen.add(key)
            d[section].append(lldp_doc(*key))
    for itf in d["interfaces"]:
        roll = rng.random()
        if roll < 0.45:
            port = rng.choice([*PORTS, ""])
            itf["description"] = f"C{rng.randint(1, 3)}|{rng.choice(HOSTS)}|{port}|"
        elif roll < 0.55:
            itf["description"] = rng.choice(["uplink", "C1||", "a|b c|d", None])
        if rng.random() < 0.2:
            itf["mac_address"] = None
    for task in d["tasks"]:
        if task["status"] == "unreachable":
            continue
        for topic in ("lldp", "cdp", "aggregates", "interfaces"):
            status = rng.choice(STATUSES)
            if status is None:
                task["status_per_subject"].pop(topic, None)
            else:
                task["status_per_subject"][topic] = {"status": status, "started_at": None, "ended_at": None, "error": None}
    return d


failures, unstable, invalid, broken = Counter(), 0, 0, 0
TRIES = 1500
for seed in range(TRIES):
    rng = random.Random(seed)
    doc = draw(rng)
    try:
        RunBundle.model_validate(doc)
    except ValidationError:
        invalid += 1
        continue
    try:
        snap = run(doc, SHA)
    except Exception as exc:  # noqa: BLE001
        kind = str(exc).splitlines()[1].strip() if isinstance(exc, ValidationError) else repr(exc)
        failures[f"{type(exc).__name__}: {kind[:90]}"] += 1
        if failures[f"{type(exc).__name__}: {kind[:90]}"] == 1:
            print(f"  premier échec graine {seed}: {type(exc).__name__}: {kind[:160]}")
        continue
    shuffled = copy.deepcopy(doc)
    for section in SECTIONS:
        rng.shuffle(shuffled[section])
    if canonical_json(run(shuffled, SHA)) != canonical_json(snap):
        unstable += 1
        if unstable <= 3:
            print(f"  non déterministe : graine {seed}")
    keys = Counter((l.a.hostname, l.a.interface, l.b.hostname, l.b.interface) for l in snap.links)
    if any(n > 1 for n in keys.values()):
        broken += 1

print(f"tirages={TRIES} invalides(contrat)={invalid} exceptions={sum(failures.values())} non_déterministes={unstable} clés_en_double={broken}")
for kind, count in failures.most_common():
    print(f"  {count:5d} x {kind}")
