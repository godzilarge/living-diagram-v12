"""D5 : mêmes snapshots ⇒ mêmes octets, aussi entre processus (l'ordre des dictionnaires dépend de la graine de
hachage ; un test de permutation en un seul processus ne le verrait pas)."""

import os
import subprocess
import sys

from tests.diff.conftest import FIXTURES

SCRIPT = """
import hashlib, json, sys
from datetime import UTC, datetime
from pathlib import Path
from ld_contracts.bundle import RunBundle
from ld_contracts.diff.serialize import canonical_json
from ld_contracts.snapshot import Snapshot
from ld_contracts.synth import MUTATION_KINDS, GenerationSpec, generate_series
from ld_backend.correlate import correlate
from ld_backend.diff import diff

fixtures = Path(sys.argv[1])
load = lambda name: Snapshot.model_validate(json.loads((fixtures / name).read_text(encoding="utf-8")))
skeleton = diff(load("snapshot-skeleton.json"), load("snapshot-skeleton-cable-down.json"))
digests = [hashlib.sha256(canonical_json(skeleton).encode()).hexdigest()]
spec = GenerationSpec(seed="b3", devices=12, runs=2, scenario=MUTATION_KINDS, start=datetime(2026, 1, 5, 2, tzinfo=UTC))
series = generate_series(spec)
snapshots = [correlate(RunBundle.model_validate(b), "0" * 64) for b in series.bundles]
digests.append(hashlib.sha256(canonical_json(diff(*snapshots)).encode()).hexdigest())
print(" ".join(digests))
"""


def test_the_same_diff_has_the_same_bytes_under_three_hash_seeds():
    outputs = set()
    for seed in ("0", "1", "4242"):
        result = subprocess.run(
            [sys.executable, "-c", SCRIPT, str(FIXTURES)],
            check=True,
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONHASHSEED": seed},
        )
        outputs.add(result.stdout.strip())
    assert len(outputs) == 1, outputs
    digests = outputs.pop().split()
    assert len(digests) == 2 and digests[0] != digests[1]
