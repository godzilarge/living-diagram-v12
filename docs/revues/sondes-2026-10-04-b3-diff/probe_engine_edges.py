"""Sonde B : cas limites du moteur B3.

B1 : un `reboot` (série du générateur) : combien d'événements `flapped` accompagnent le `rebooted` ?
B2 : un contrôle de même (code, refs) dont seule la sévérité change entre les deux runs : `persisted` ?
B3 : `rebooted` quand l'uptime d'avant n'est pas lu (device injoignable à la run 1).

Lancer depuis `backend/` : `uv run python ../docs/revues/sondes-2026-10-04-b3-diff/probe_engine_edges.py`.
"""

import copy
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from ld_contracts.snapshot import Snapshot  # noqa: E402
from ld_contracts.snapshot.codes import CATALOGUE  # noqa: E402
from ld_contracts.synth import GenerationSpec, generate_series  # noqa: E402

from ld_backend.diff import diff  # noqa: E402
from tests.correlate.conftest import FIXTURES, load_minimal, run  # noqa: E402
from tests.diff.conftest import later  # noqa: E402

# B1 — reboot : rebooted, et combien de flapped ?
spec = GenerationSpec(seed="b3", devices=12, runs=2, scenario=("reboot",), mutations_per_run=0, start=datetime(2026, 1, 5, 2, tzinfo=UTC))
series = generate_series(spec)
subject = series.manifest["runs"][1]["mutations"][0]["subject"]
d = diff(run(series.bundles[0]), run(series.bundles[1]))
kinds = Counter(str(e.kind) for e in d.events)
on_subject = [e for e in d.events if e.kind == "flapped" and e.ref.hostname == subject]
elsewhere = [e for e in d.events if e.kind == "flapped" and e.ref.hostname != subject]
up_ports = [i for i in run(series.bundles[1]).interfaces if i.hostname == subject and i.oper_status == "up"]
print("--- B1 reboot de", subject)
print("  events :", dict(kinds), "| summary.events :", d.summary.events)
print("  flapped sur le device redémarré :", len(on_subject), "| ports up de ce device :", len(up_ports), "| flapped ailleurs :", len(elsewhere))
print("  exemple :", on_subject[0].ref.name if on_subject else None, on_subject[0].details if on_subject else None)
print("  sections vides :", all(not getattr(getattr(d, n), p) for n in ("nodes", "interfaces", "links") for p in ("added", "removed", "changed")))

# B2 — même (code, refs), sévérité différente.
spec_entry = CATALOGUE["documented_not_observed"]
print("--- B2 sévérités admises pour documented_not_observed :", sorted(str(s) for s in spec_entry.severities))
before = json.loads((FIXTURES / "snapshot-skeleton.json").read_text(encoding="utf-8"))
after = json.loads((FIXTURES / "snapshot-skeleton-cable-down.json").read_text(encoding="utf-8"))
link_ref = {"kind": "link", "a": {"hostname": "sw-a", "interface": "Ethernet1/1"}, "b": {"hostname": "sw-b", "interface": "Ethernet1/1"}}


def with_check(doc: dict, severity: str) -> Snapshot:
    out = copy.deepcopy(doc)
    check = {"code": "documented_not_observed", "severity": severity, "origin": "correlation", "refs": [link_ref], "details": {}}
    out["checks"] = sorted([*out["checks"], check], key=lambda c: c["code"])
    out["report"]["counts"]["checks"] = len(out["checks"])
    return Snapshot.model_validate(out)


d2 = diff(with_check(before, "info"), with_check(after, "warning"))
print("  appeared :", [str(c.code) for c in d2.checks.appeared], "| resolved :", [str(c.code) for c in d2.checks.resolved], "| persisted :", d2.checks.persisted)
print("  la sévérité info → warning est-elle visible quelque part ? ", any("severity" in json.dumps(c.model_dump(mode="json")) for c in [*d2.checks.appeared, *d2.checks.resolved]))

# B3 — uptime d'avant non lu.
minimal = load_minimal()
unreachable_before = copy.deepcopy(minimal)
for t in unreachable_before["tasks"]:
    if t["hostname"] == "sw-core-01":
        t["status"], t["status_per_subject"] = "unreachable", {}
for topic in ("interfaces", "lldp", "cdp", "aggregates", "system", "ha"):
    unreachable_before[topic] = [doc for doc in unreachable_before[topic] if doc["hostname"] != "sw-core-01"]
after3 = later(minimal)
next(s for s in after3["system"] if s["hostname"] == "sw-core-01")["uptime_seconds"] = 100
d3 = diff(run(unreachable_before), run(after3))
print("--- B3 device injoignable avant, redémarré après :", [(str(e.kind), e.ref.hostname, e.details) for e in d3.events if e.kind == "rebooted"])
