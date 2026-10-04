"""Sonde E (1/2) : fabrique deux pages `ld render --from` pour `probe_viewer.js`.

- `diff-ghost-link.html` : la paire des tests du dépôt (`_diff_pair`) : câble des cœurs tombé, `srv-hyp-07` disparu
  (un nœud et un câble fantômes).
- `diff-unreachable.html` : une semaine plus tard, `fw-edge-01` est injoignable : ses interfaces disparaissent du
  snapshot (interfaces fantômes sur un nœud vivant), ses câbles documentés depuis les cœurs restent.

Lancer depuis `backend/` : `uv run python ../docs/revues/sondes-2026-10-04-b3-diff/probe_pages.py <dossier de sortie>`.
"""

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from ld_backend.diff import diff  # noqa: E402
from ld_backend.render import page_from_bundle  # noqa: E402
from tests.correlate.conftest import interface, load_minimal, run  # noqa: E402
from tests.diff.conftest import cable_down_later, later  # noqa: E402

TOPICS = ("interfaces", "lldp", "cdp", "aggregates", "system", "ha")


def ghost_link_pair(minimal: dict) -> tuple[dict, dict]:
    after = cable_down_later(minimal)
    after["lldp"] = [doc for doc in after["lldp"] if doc["neighbor"] != "srv-hyp-07"]
    interface(after, "sw-core-02", "Ethernet1/3")["description"] = None
    return minimal, after


def unreachable_pair(minimal: dict) -> tuple[dict, dict]:
    after = later(minimal)
    for task in after["tasks"]:
        if task["hostname"] == "fw-edge-01":
            task["status"], task["status_per_subject"], task["error"] = "unreachable", {}, "ssh: connect timeout"
    for topic in TOPICS:
        after[topic] = [doc for doc in after[topic] if doc["hostname"] != "fw-edge-01"]
    return minimal, after


def write(out: Path, name: str, pair: tuple[dict, dict]) -> None:
    before, after = pair
    outcome = page_from_bundle(after, origin=name, previous=before)
    assert outcome.page is not None, (outcome.problem, outcome.errors)
    (out / name).write_text(outcome.page, encoding="utf-8")
    d = diff(run(before), run(after))
    print(name, "→ summary :", json.dumps({"nodes": d.summary.nodes.model_dump(), "interfaces": d.summary.interfaces.model_dump(), "links": d.summary.links.model_dump()}))


out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
minimal = load_minimal()
write(out, "diff-ghost-link.html", ghost_link_pair(minimal))
write(out, "diff-unreachable.html", unreachable_pair(copy.deepcopy(minimal)))
