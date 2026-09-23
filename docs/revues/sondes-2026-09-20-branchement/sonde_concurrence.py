"""Sonde a1 : deux POST simultanés de la même run sur un vrai uvicorn ; /api/health pendant B1 ; fichiers restants.

Puis : `ld correlate` tué (SIGKILL simulé par os._exit) entre l'écriture du temporaire et le replace.
"""
import copy
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from tempfile import mkdtemp

import httpx
import uvicorn

from ld_backend import snapshots
from ld_backend.api import create_app
from ld_backend.archive import BundleArchive
from ld_backend.config import Settings

HERE = Path(__file__).resolve().parent
base = json.loads(Path("../contracts/fixtures/bundle-minimal.json").read_text(encoding="utf-8"))
TOPICS = ("devices", "tasks", "interfaces", "aggregates", "lldp", "cdp", "system", "ha")
doc = {k: v for k, v in base.items() if k not in TOPICS} | {t: [] for t in TOPICS}
tmpl_dev, tmpl_task = base["devices"][0], base["tasks"][0]
tmpl_itf = next(i for i in base["interfaces"] if i["name"] == "Ethernet1/1")
names = [f"sw-{i:04d}" for i in range(256)]
for idx, n in enumerate(names):
    doc["devices"].append({**copy.deepcopy(tmpl_dev), "hostname": n, "serial_number": "S" + n})
    doc["tasks"].append({**copy.deepcopy(tmpl_task), "hostname": n})
    for k in range(48):
        doc["interfaces"].append({**copy.deepcopy(tmpl_itf), "hostname": n, "name": f"Ethernet1/{k + 1}", "mac_address": None, "description": None})
    for k in range(6):
        doc["lldp"].append({"hostname": n, "local_interface": f"Ethernet1/{k + 1}", "neighbor": names[idx ^ (k + 1)],
                            "neighbor_interface": f"Ethernet1/{k + 1}", "neighbor_capabilities": ["bridge"], "extras": {}})

calls = []
real = snapshots.correlate
snapshots.correlate = lambda b, s: (calls.append(threading.get_ident()), real(b, s))[1]

root = Path(mkdtemp(dir=HERE))
sock = socket.socket(); sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]; sock.close()
app = create_app(Settings(api_token="t", archive_dir=root, max_bundle_bytes=10**8))
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
threading.Thread(target=server.run, daemon=True).start()
url, auth = f"http://127.0.0.1:{port}", {"Authorization": "Bearer t"}
while True:
    try:
        httpx.get(url + "/api/health"); break
    except httpx.TransportError:
        time.sleep(0.05)

body = json.dumps(doc).encode()
results, health = [], []


def post():
    t = time.perf_counter()
    r = httpx.post(url + "/api/ingest/bundles", content=body, headers={**auth, "Content-Type": "application/json"}, timeout=120)
    results.append((r.status_code, r.json()["status"], r.json()["correlation"]["status"], round(time.perf_counter() - t, 2)))


threads = [threading.Thread(target=post) for _ in range(2)]
[t.start() for t in threads]
while any(t.is_alive() for t in threads):
    t = time.perf_counter(); httpx.get(url + "/api/health", timeout=60); health.append(time.perf_counter() - t); time.sleep(0.02)
[t.join() for t in threads]
print("deux POST simultanés :", sorted(results))
print("B1 exécuté", len(calls), "fois")
run_dir = next((root / "infra-lab").iterdir())
print("dossier de run :", sorted(p.name for p in run_dir.iterdir()))
print(f"/api/health pendant l'ingestion : n={len(health)} médiane={sorted(health)[len(health) // 2] * 1000:.0f} ms max={max(health) * 1000:.0f} ms")
server.should_exit = True

# --- ld correlate tué entre write_text et replace
killer = f"""
import os, sys
from pathlib import Path
from ld_backend import cli
Path.replace = lambda self, target: os._exit(137)
cli.main(["correlate", "--infrastructure", "infra-lab", "--archive", {str(root)!r}])
"""
proc = subprocess.run([sys.executable, "-c", killer], capture_output=True, text=True)
print("\nld correlate tué avant replace : code", proc.returncode)
print("dossier de run :", sorted(p.name for p in run_dir.iterdir()))
archive = BundleArchive(root)
print("list_runs :", [r.run_id for r in archive.list_runs("infra-lab")], "| snapshot toujours lisible :", archive.load_snapshot_bytes("infra-lab", doc["run"]["collector_run_id"]) is not None)
proc = subprocess.run([sys.executable, "-m", "ld_backend.cli", "correlate", "--infrastructure", "infra-lab", "--archive", str(root)], capture_output=True, text=True)
print("ld correlate suivant : code", proc.returncode, "| le temporaire orphelin est-il nettoyé ?", not any(p.name.startswith(".tmp-") for p in run_dir.iterdir()))
