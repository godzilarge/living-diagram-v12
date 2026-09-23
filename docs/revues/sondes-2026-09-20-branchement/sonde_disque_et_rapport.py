"""Sonde c/d : (1) panne disque à l'écriture du snapshot ⇒ `failed`, pas de temporaire ? (chemin annoncé, non testé)
(2) rapport archivé AVANT le branchement (sans clé `correlation`) : GET /report le relit-il ?
(3) `ld correlate` : la trace sort-elle bien sur stderr ?"""
import errno
import json
import subprocess
import sys
from pathlib import Path
from tempfile import mkdtemp

from fastapi.testclient import TestClient

from ld_backend.api import create_app
from ld_backend.archive import BundleArchive
from ld_backend.config import Settings
from ld_backend.ingest import ingest_bundle

HERE = Path(__file__).resolve().parent
doc = json.loads(Path("../contracts/fixtures/bundle-minimal.json").read_text(encoding="utf-8"))
INFRA, RUN = doc["infrastructure"], doc["run"]["collector_run_id"]

root = Path(mkdtemp(dir=HERE))
real_replace = Path.replace


def enospc(self, target):
    if Path(target).name == "snapshot.json":
        raise OSError(errno.ENOSPC, "No space left on device")
    return real_replace(self, target)


Path.replace = enospc
result = ingest_bundle(doc, BundleArchive(root))
Path.replace = real_replace
print("(1) disque plein au replace :", result.status, "/", result.correlation.status, "| dossier :", sorted(p.name for p in (root / INFRA / RUN).iterdir()))

report = root / INFRA / RUN / "report.json"
old = json.loads(report.read_text(encoding="utf-8")); old.pop("correlation")
report.write_text(json.dumps(old), encoding="utf-8")
client = TestClient(create_app(Settings(api_token="t", archive_dir=root, max_bundle_bytes=10**7)))
res = client.get("/api/ingest/report", params={"infrastructure": INFRA, "run_id": RUN}, headers={"Authorization": "Bearer t"})
print("(2) rapport d'avant le branchement :", res.status_code, "correlation =", res.json().get("correlation", "<clé absente>"))

code = f"""
import ld_backend.snapshots as s
def boom(*_): raise RuntimeError("bug de B1")
s.correlate = boom
from ld_backend import cli
raise SystemExit(cli.main(["correlate", "--infrastructure", {INFRA!r}, "--archive", {str(root)!r}]))
"""
proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
print("(3) ld correlate en échec : code", proc.returncode, "| stdout :", proc.stdout.strip(), "| trace sur stderr :", "bug de B1" in proc.stderr)
