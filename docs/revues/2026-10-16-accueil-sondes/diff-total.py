"""Probe: the same diff counted by the home (`app/src/state/home.ts`, changeTotal) and by the engine reused as is
(`engine/src/canvas/model.ts`, diffCount, the v1 Diff tab), on the e2e fixtures. Run from the repository root:
`python3 -I docs/revues/2026-10-16-accueil-sondes/diff-total.py`."""
import json
from pathlib import Path

SECTIONS = ["nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters"]
diffs = json.loads(Path("app/e2e/fixtures/diffs.json").read_text(encoding="utf-8"))
for to, diff in diffs.items():
    s = diff["summary"]
    sections = sum(s[n]["added"] + s[n]["removed"] + s[n]["changed"] for n in SECTIONS)
    events = s["events"]["rebooted"] + s["events"]["flapped"]
    engine = sections + events + s["checks"]["appeared"] + s["checks"]["resolved"] + s["coverage"]["changed"]
    print(f"{to}: home {sections + events}, engine {engine}")
