"""Sonde A : l'identité de B3 est sensible à la casse, celle du snapshot ne l'est pas.

A1 : un voisin annoncé `SW-Core-02`, inconnu de `devices` à la run 1 (stub `sw-core-02`, casefold imposé par le
contrat), entre dans `devices` à la run 2 sous `SW-Core-02`. Le contrat Diff (NodeChanges) dit « un stub devenu
device est un nœud changé » : qu'en dit B3 ?
A2 : le même device dans les deux runs, écrit `sw-core-02` à la run 1 et `SW-Core-02` à la run 2.

Lancer depuis `backend/` : `uv run python ../docs/revues/sondes-2026-10-04-b3-diff/probe_identity_case.py`.
"""

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from ld_backend.diff import diff  # noqa: E402
from tests.correlate.conftest import load_minimal, run  # noqa: E402
from tests.diff.conftest import later  # noqa: E402

OLD, NEW = "sw-core-02", "SW-Core-02"
TOPICS = ("interfaces", "lldp", "cdp", "aggregates", "system", "ha")


def recased(doc: dict) -> dict:
    text = json.dumps(doc).replace(f'"{OLD}"', f'"{NEW}"').replace(f"|{OLD}|", f"|{NEW}|")
    return json.loads(text)


def without_device(doc: dict, hostname: str) -> dict:
    out = copy.deepcopy(doc)
    out["devices"] = [d for d in out["devices"] if d["hostname"] != hostname]
    out["tasks"] = [t for t in out["tasks"] if t["hostname"] != hostname]
    for topic in TOPICS:
        out[topic] = [d for d in out[topic] if d["hostname"] != hostname]
    return out


def summary(d, label: str) -> None:
    print(f"--- {label}")
    print("  nodes   added", [(n.kind, n.hostname) for n in d.nodes.added])
    print("  nodes removed", [(n.kind, n.hostname) for n in d.nodes.removed])
    print("  nodes changed", [c.ref.hostname for c in d.nodes.changed])
    touching = lambda link: {link.a.hostname.casefold(), link.b.hostname.casefold()} & {OLD}  # noqa: E731
    print("  links   added", sum(1 for link in d.links.added if touching(link)), "removed", sum(1 for link in d.links.removed if touching(link)),
          "changed", sum(1 for c in d.links.changed if touching(c.ref)))
    print("  interfaces added", sum(1 for i in d.interfaces.added if i.hostname.casefold() == OLD),
          "removed", sum(1 for i in d.interfaces.removed if i.hostname.casefold() == OLD))
    print("  summary nodes", d.summary.nodes, "links", d.summary.links)


minimal = load_minimal()

# A1 : stub (run 1) → device (run 2), le device s'écrit avec des majuscules.
run2 = later(recased(minimal))
run1 = without_device(recased(minimal), NEW)
s1, s2 = run(run1), run(run2)
print("run 1 : nœuds dont le nom replié vaut", OLD, "→", [(n.kind, n.hostname) for n in s1.nodes if n.hostname.casefold() == OLD])
print("run 2 : nœuds dont le nom replié vaut", OLD, "→", [(n.kind, n.hostname) for n in s2.nodes if n.hostname.casefold() == OLD])
summary(diff(s1, s2), "A1 : stub `sw-core-02` → device `SW-Core-02`")

# A1 bis : même scénario, tout en minuscules (ce que le générateur produit toujours).
s1_lower, s2_lower = run(without_device(minimal, OLD)), run(later(minimal))
summary(diff(s1_lower, s2_lower), "A1 bis : stub `sw-core-02` → device `sw-core-02`")

# A2 : même device, casse différente entre les deux runs.
summary(diff(run(minimal), run(later(recased(minimal)))), "A2 : device `sw-core-02` (run 1) et `SW-Core-02` (run 2)")
