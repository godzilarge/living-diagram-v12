"""Sonde : deux alias du même topic dans une task, statuts différents. À lancer sous plusieurs PYTHONHASHSEED.

Imprime le statut retenu pour `aggregates` et l'empreinte du snapshot : ils doivent être les mêmes d'un processus
à l'autre.
"""

import hashlib
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from common import SHA, itf, load_minimal, run, task_subject, variant
from ld_contracts.snapshot.serialize import canonical_json


def mutate(d):
    # sw-core-01 : le collecteur a tenté deux sujets amont pour le même topic, l'un a réussi, l'autre non
    task = next(t for t in d["tasks"] if t["hostname"] == "sw-core-01")
    task["status_per_subject"].pop("aggregates")
    task_subject(d, "sw-core-01", "port_channels", "success")
    task_subject(d, "sw-core-01", "etherchannels", "failed")
    d["aggregates"] = [a for a in d["aggregates"] if a["hostname"] != "sw-core-01"]


snap = run(variant(load_minimal(), mutate), SHA)
status = next(c for c in snap.coverage if c.hostname == "sw-core-01").topics.aggregates
digest = hashlib.sha256(canonical_json(snap).encode()).hexdigest()[:12]
print(f"aggregates={status}  Ethernet1/1.aggregate={itf(snap, 'sw-core-01', 'Ethernet1/1').aggregate}  sha={digest}")
