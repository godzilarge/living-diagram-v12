"""Lot 13 (docs/11) : chaque mutation des protections de la toile à la jauge doit faire échouer la garde Chromium
(`backend/tests/test_app_gauge.py`). Chemins absolus ; chaque fichier est rétabli quoi qu'il arrive, puis l'application
est reconstruite. Lancer : python3 <ce fichier>"""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
CANVAS = ROOT / "engine/src/app/canvas"
ENGINE = ROOT / "engine"
BACKEND = ROOT / "backend"
MUTATIONS = [
    ("culture : tout monté", CANVAS / "Flow.tsx", "panOnDrag={PAN_BUTTONS} onlyRenderVisibleElements", "panOnDrag={PAN_BUTTONS}"),
    ("boîte du connecteur", CANVAS / "flow-build.ts", " width: Math.max(1, origin.w), height: Math.max(1, origin.h),", ""),
    ("demande rejouée", CANVAS / "annotation.tsx", "if (claimed.has(request)) return false; claimed.add(request); return true;", "return true;"),
    ("champ qui sort sans enregistrer", CANVAS / "inline.tsx", "if (!done.current) { done.current = true; latest.current(value.current, false); }", ""),
    ("Tab sans aller à l'élément", ROOT / "engine/src/app/components/Shell.tsx", "if (tries === 0) commands.center();", ""),
    ("fondu d'arrivée", ROOT / "engine/src/app/styles/canvas.css", "  .speed-pill.on { opacity: 0; }\n", ""),
    ("pastilles jamais replacées", CANVAS / "Flow.tsx", "freshTags.current = true; setTagsTick((n) => n + 1);", ""),
    ("mesures perdues", CANVAS / "reuse.ts", "? ({ ...item, measured: m } as T) : item;", "? item : item;"),
]


def build() -> None:
    subprocess.run(["npm", "run", "build"], cwd=ENGINE, check=True, capture_output=True)


def gauge_passes() -> bool:
    command = ["uv", "run", "pytest", "tests/test_app_gauge.py", "-q", "-p", "no:warnings", "-x"]
    return subprocess.run(command, cwd=BACKEND, capture_output=True).returncode == 0


originals = {path: path.read_text() for _, path, _, _ in MUTATIONS}
caught, survived = [], []
try:
    for name, path, before, after in MUTATIONS:
        source = originals[path]
        assert source.count(before) == 1, f"mutation introuvable ou ambiguë : {name}"
        path.write_text(source.replace(before, after))
        build()
        (survived if gauge_passes() else caught).append(name)
        path.write_text(source)
        print(("attrapée  " if name in caught else "SURVIVANTE"), name, flush=True)
finally:
    for path, text in originals.items():
        path.write_text(text)
    build()
assert all(path.read_text() == text for path, text in originals.items())
print(f"{len(caught)} attrapées, {len(survived)} survivantes : {survived}")
print("garde sur l'original :", "verte" if gauge_passes() else "ROUGE")
