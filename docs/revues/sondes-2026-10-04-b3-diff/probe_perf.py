"""Sonde G : ce que coûte un diff à la jauge (500 devices, deux runs), B3 seul puis le chemin de `GET /api/diff`
(relire et valider deux snapshots archivés, puis comparer, puis sérialiser).

Lancer depuis `backend/` : `uv run python ../docs/revues/sondes-2026-10-04-b3-diff/probe_perf.py [devices]`.
"""

import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from ld_contracts.bundle import RunBundle  # noqa: E402
from ld_contracts.diff.serialize import canonical_json  # noqa: E402
from ld_contracts.snapshot import Snapshot  # noqa: E402
from ld_contracts.snapshot.serialize import canonical_json as snapshot_json  # noqa: E402
from ld_contracts.synth import MUTATION_KINDS, GenerationSpec, generate_series  # noqa: E402

from ld_backend.correlate import correlate  # noqa: E402
from ld_backend.diff import diff  # noqa: E402

devices = int(sys.argv[1]) if len(sys.argv) > 1 else 500
spec = GenerationSpec(seed="perf", devices=devices, runs=2, scenario=MUTATION_KINDS, start=datetime(2026, 1, 5, 2, tzinfo=UTC))
t = time.perf_counter()
series = generate_series(spec)
print(f"{devices} devices : génération {time.perf_counter() - t:.1f} s")
t = time.perf_counter()
snapshots = [correlate(RunBundle.model_validate(b), "0" * 64) for b in series.bundles]
print(f"B1 × 2 : {time.perf_counter() - t:.1f} s ; nœuds {len(snapshots[1].nodes)}, interfaces {len(snapshots[1].interfaces)}, liens {len(snapshots[1].links)}")

raws = [snapshot_json(s) for s in snapshots]
print(f"snapshot.json : {len(raws[1]) // 1024} Ko")
t = time.perf_counter()
reloaded = [Snapshot.model_validate(json.loads(raw)) for raw in raws]
load = time.perf_counter() - t
t = time.perf_counter()
d = diff(*reloaded)
compute = time.perf_counter() - t
t = time.perf_counter()
text = canonical_json(d)
dump = time.perf_counter() - t
print(f"GET /api/diff ≈ relire + valider deux snapshots {load:.2f} s + diff {compute:.2f} s + sérialiser {dump:.2f} s = {load + compute + dump:.2f} s")
print(f"diff : {len(text) // 1024} Ko ; summary : {d.summary.model_dump()}")
