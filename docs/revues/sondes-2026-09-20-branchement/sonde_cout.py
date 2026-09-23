"""Sonde a5 : coût du chemin d'ingestion avec B1 dans la requête (500 devices × 48 ports, LLDP réciproque)."""
import copy
import json
import resource
import sys
import time
from pathlib import Path
from tempfile import mkdtemp

from ld_backend import snapshots
from ld_backend.archive import BundleArchive
from ld_backend.ingest import ingest_bundle

HERE = Path(__file__).resolve().parent
N_DEV, N_ITF, N_UP = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])  # N_DEV puissance de 2
base = json.loads(Path("../contracts/fixtures/bundle-minimal.json").read_text(encoding="utf-8"))
tmpl_dev = base["devices"][0]
tmpl_itf = next(i for i in base["interfaces"] if i["name"] == "Ethernet1/1")
tmpl_task = base["tasks"][0]
TOPICS = ("devices", "tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha")
doc = {k: v for k, v in base.items() if k not in TOPICS}
doc.update({t: [] for t in TOPICS})
names = [f"sw-{i:04d}" for i in range(N_DEV)]
for n in names:
    doc["devices"].append({**copy.deepcopy(tmpl_dev), "hostname": n, "serial_number": "S" + n})
    doc["tasks"].append({**copy.deepcopy(tmpl_task), "hostname": n})
    for k in range(N_ITF):
        doc["interfaces"].append({**copy.deepcopy(tmpl_itf), "hostname": n, "name": f"Ethernet1/{k + 1}", "mac_address": None, "description": None})
for idx, n in enumerate(names):
    for k in range(N_UP):
        peer = names[idx ^ (k + 1)]  # involution : le câble est vu des deux bouts, même port
        doc["lldp"].append({"hostname": n, "local_interface": f"Ethernet1/{k + 1}", "neighbor": peer,
                            "neighbor_interface": f"Ethernet1/{k + 1}", "neighbor_capabilities": ["bridge"], "extras": {}})
print(f"bundle : {len(json.dumps(doc)) / 1e6:.1f} Mo, {len(doc['interfaces'])} interfaces, {len(doc['lldp'])} lldp")

timings: dict[str, float] = {}
real_correlate, real_canonical = snapshots.correlate, snapshots.canonical_json


def timed(name, fn):
    def wrapper(*a):
        t = time.perf_counter(); out = fn(*a); timings[name] = time.perf_counter() - t; return out
    return wrapper


snapshots.correlate = timed("correlate", real_correlate)
snapshots.canonical_json = timed("canonical_json", real_canonical)
archive = BundleArchive(Path(mkdtemp(dir=HERE)))
rss0 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
t0 = time.perf_counter(); result = ingest_bundle(doc, archive); total = time.perf_counter() - t0
rss1 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
snap = archive.find_run(doc["infrastructure"], doc["run"]["collector_run_id"]).path / "snapshot.json"
print(f"ingestion totale {total:.2f}s dont correlate {timings['correlate']:.2f}s, canonical_json {timings['canonical_json']:.2f}s")
print(f"correlation={result.correlation}")
print(f"snapshot.json : {snap.stat().st_size / 1e6:.1f} Mo ; pic RSS avant {rss0 / 1024:.0f} Mo → après {rss1 / 1024:.0f} Mo")
t0 = time.perf_counter(); again = ingest_bundle(doc, archive); print(f"livraison identique : {time.perf_counter() - t0:.2f}s ({again.correlation.status}) — relit tout snapshot.json pour tester sa présence")
