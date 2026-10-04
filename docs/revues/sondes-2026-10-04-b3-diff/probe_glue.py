"""Sonde D : le branchement (diffs.py, API).

D1 : `SnapshotUnavailableError` est une dataclass gelée héritant de LookupError : `add_note` et les attributs
d'exception.
D2 : `GET /api/diff` quand les deux snapshots archivés ne sont pas de la même infrastructure (DiffError non traduite).

Lancer depuis `backend/` : `uv run python ../docs/revues/sondes-2026-10-04-b3-diff/probe_glue.py`.
"""

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from ld_backend.api import create_app  # noqa: E402
from ld_backend.config import Settings  # noqa: E402
from ld_backend.diffs import SnapshotUnavailableError  # noqa: E402
from tests.correlate.conftest import load_minimal  # noqa: E402
from tests.diff.conftest import LATER_RUN_ID, later  # noqa: E402

print("--- D1 SnapshotUnavailableError")
exc = SnapshotUnavailableError("unknown", "from")
print("  str :", str(exc), "| args :", exc.args, "| repr :", repr(exc))
try:
    exc.add_note("contexte")
    print("  add_note : ok")
except Exception as got:  # noqa: BLE001
    print("  add_note :", type(got).__name__, got)
try:
    raise exc
except LookupError as caught:
    print("  attrapée comme LookupError, traceback posé :", caught.__traceback__ is not None)

print("--- D2 deux snapshots archivés d'infrastructures différentes")
with tempfile.TemporaryDirectory() as tmp:
    archive = Path(tmp) / "archive"
    settings = Settings(api_token="t", archive_dir=archive, max_bundle_bytes=50_000_000)
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    auth = {"Authorization": "Bearer t"}
    minimal = load_minimal()
    assert client.post("/api/ingest/bundles", json=minimal, headers=auth).status_code == 201
    assert client.post("/api/ingest/bundles", json=later(minimal), headers=auth).status_code == 201
    snap = archive / "infra-lab" / minimal["run"]["collector_run_id"] / "snapshot.json"
    doc = json.loads(snap.read_text(encoding="utf-8"))
    doc["source"]["infrastructure"] = "autre-site"
    snap.write_text(json.dumps(doc, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    res = client.get("/api/diff", params={"infrastructure": "infra-lab", "from": minimal["run"]["collector_run_id"], "to": LATER_RUN_ID}, headers=auth)
    print("  statut :", res.status_code, "| corps :", res.text[:120])
