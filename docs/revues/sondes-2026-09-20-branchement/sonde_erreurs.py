"""Sonde a3 : où part ArchiveCorruptError / OSError sur les trois chemins (CLI, POST, GET) ?"""
import json
import traceback
from pathlib import Path
from tempfile import mkdtemp

from fastapi.testclient import TestClient

from ld_backend import cli
from ld_backend.api import create_app
from ld_backend.config import Settings

doc = json.loads(Path("../contracts/fixtures/bundle-minimal.json").read_text(encoding="utf-8"))
RUN = "66db3f0e9a1c2b0012f4a7d1"


def fresh(*run_ids: str) -> Path:
    root = Path(mkdtemp(dir=Path(__file__).resolve().parent))
    for run_id in run_ids:
        path = root / f"{run_id}.json"
        path.write_text(json.dumps(doc).replace(RUN, run_id), encoding="utf-8")
        assert cli.main(["ingest", str(path), "--archive", str(root / "archive")]) == 0
    return root / "archive"


def section(title: str) -> None:
    print(f"\n=== {title}")


import contextlib, io

with contextlib.redirect_stdout(io.StringIO()):
    archive = fresh("run-1", "run-2", "run-3")
# 1. un bundle.json abîmé (un octet) dans la 2e run de trois : ld correlate sans --run-id
bundle2 = archive / "infra-lab" / "run-2" / "bundle.json"
bundle2.write_bytes(bundle2.read_bytes().replace(b"sw-core-01", b"sw-core-02", 1))
(archive / "infra-lab" / "run-3" / "snapshot.json").write_text("PERIME\n", encoding="utf-8")
section("1. ld correlate (toutes les runs), bundle.json de run-2 abîmé")
try:
    code = cli.main(["correlate", "--infrastructure", "infra-lab", "--archive", str(archive)])
    print("code de sortie :", code)
except Exception as exc:  # noqa: BLE001
    print("EXCEPTION NON RATTRAPÉE dans la CLI :", type(exc).__name__, "-", exc)
print("run-3 recalculée ?", (archive / "infra-lab" / "run-3" / "snapshot.json").read_text()[:7] != "PERIME\n")

# 2. meta.json cassé, --run-id visé
with contextlib.redirect_stdout(io.StringIO()):
    archive = fresh("run-1")
(archive / "infra-lab" / "run-1" / "meta.json").write_text("{", encoding="utf-8")
section("2. ld correlate --run-id run-1, meta.json cassé")
try:
    print("code :", cli.main(["correlate", "--infrastructure", "infra-lab", "--run-id", "run-1", "--archive", str(archive)]))
except Exception as exc:  # noqa: BLE001
    print("EXCEPTION NON RATTRAPÉE dans la CLI :", type(exc).__name__, "-", exc)

# 3. POST d'une livraison identique alors que snapshot.json est illisible (ici : un dossier ; en vrai : droits)
root = Path(mkdtemp(dir=Path(__file__).resolve().parent))
client = TestClient(create_app(Settings(api_token="t", archive_dir=root, max_bundle_bytes=10**7)), raise_server_exceptions=False)
auth = {"Authorization": "Bearer t"}
assert client.post("/api/ingest/bundles", json=doc, headers=auth).status_code == 201
snap = root / "infra-lab" / RUN / "snapshot.json"
snap.unlink(); snap.mkdir()
section("3. snapshot.json illisible (OSError) : POST identique puis GET")
res = client.post("/api/ingest/bundles", json=doc, headers=auth)
print("POST identique →", res.status_code, repr(res.text[:80]))
res = client.get("/api/snapshot", params={"infrastructure": "infra-lab", "run_id": RUN}, headers=auth)
print("GET snapshot   →", res.status_code, repr(res.text[:80]))

# 4. snapshot.json vide ou tronqué : servi tel quel, jamais réparé par une nouvelle livraison
snap.rmdir(); snap.write_bytes(b"")
section("4. snapshot.json vide (coupure après rename sans fsync, disque plein hors replace…)")
res = client.get("/api/snapshot", params={"infrastructure": "infra-lab", "run_id": RUN}, headers=auth)
print("GET snapshot   →", res.status_code, res.headers["content-type"], "corps =", repr(res.content))
res = client.post("/api/ingest/bundles", json=doc, headers=auth)
print("POST identique →", res.status_code, res.json()["correlation"])
snap.write_text('{"contract_version": "1.0.0", "nodes": [', encoding="utf-8")
res = client.get("/api/snapshot", params={"infrastructure": "infra-lab", "run_id": RUN}, headers=auth)
print("GET tronqué    →", res.status_code, repr(res.text))
