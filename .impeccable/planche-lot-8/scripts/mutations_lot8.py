"""Lot 8 (docs/11) : les tests attrapent-ils une règle cassée ? Chaque mutation remplace un texte d'une source (chemins
absolus), reconstruit l'application, lance les tests (Node, ou le parcours Chromium `test_app_guides.py`), note s'ils
échouent, puis rend la source. Lancer depuis backend/ : uv run python <ce fichier> [node|chromium|all]"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
ENGINE = ROOT / "engine"
APP = ROOT / "backend/src/ld_backend/render/assets/app/app.js"
GUIDES = ENGINE / "src/app/canvas/guides.ts"
ALIGN = ENGINE / "src/canvas/align.ts"
PREFS = ENGINE / "src/app/state/prefs.ts"
CONTEXT = ENGINE / "src/app/state/context.ts"
FLOATING = ENGINE / "src/app/state/floating.ts"
DRAG = ENGINE / "src/app/canvas/guide-drag.ts"
FLOW = ENGINE / "src/app/canvas/Flow.tsx"
CLONE = ENGINE / "src/app/canvas/clone.tsx"
CANVAS = ENGINE / "src/app/components/Canvas.tsx"
BAR = ENGINE / "src/app/components/FloatingBar.tsx"

NODE = [
    ("centre avant bord", GUIDES, "const RANK = { center: 0, edge: 1, space: 1 } as const;", "const RANK = { center: 1, edge: 1, space: 1 } as const;"),
    ("centre ↔ centre seulement", GUIDES, "if ((k === 1) !== (ck === 1)) continue;", "if (false) continue;"),
    ("la grille sur l'axe libre seulement", GUIDES, "if (!g.took.x) x = snapTo(x, options.grid);", "x = snapTo(x, options.grid);"),
    ("Ctrl suspend tout", GUIDES, "const g = !options.free && options.guides ? snapMove", "const g = options.guides ? snapMove"),
    ("l'espacement égal", GUIDES, "if (gap > 0 && Math.abs(d) <= tol) out.push", "if (gap < 0 && Math.abs(d) <= tol) out.push"),
    ("400 au plus", GUIDES, ".slice(0, max).map((e) => e.c);", ".slice(0, max + 1).map((e) => e.c);"),
    ("un trait interrompu", GUIDES, "return a0 < line.at - 0.5 && line.at + 0.5 < a1; })", "return false; })"),
    ("teintes sous 3:1 exclues", GUIDES, 'HUES.filter((hue) => hue !== "orange" && hue !== "green")', 'HUES.filter((hue) => hue !== "orange")'),
    ("taille minimale", GUIDES, "out[size] = Math.max(options.min, edge - start[lo]);", "out[size] = edge - start[lo];"),
    ("colonnes : la plus large à égalité", ALIGN, "if (holes < empty) { best = cols; empty = holes; }", "if (holes <= empty) { best = cols; empty = holes; }"),
    ("ordre naturel des chiffres", ALIGN, "if (digits) { const d = Number(pa[i]) - Number(pb[i]); if (d) return d; }", "if (digits) { /* rien */ }"),
    ("une boîte centrée dans sa case", ALIGN, "+ Math.round((cw - GRID_GAP - g.box.w) / 2)", "+ 0"),
    ("par nom par défaut", ALIGN, 'options.order === "screen" ? screenOrder(items)', 'options.order !== "name" ? screenOrder(items)'),
    ("teinte des repères validée", PREFS, "if (isGuideHue(got.guideHue)) prefs.guideHue = got.guideHue;", "if (typeof got.guideHue === \"string\") prefs.guideHue = got.guideHue as HueName;"),
    ("menu : mettre en grille", CONTEXT, "...(ctx.grid ? [gridItem()] : []), item(\"group\", \"group\")", "item(\"group\", \"group\")"),
    ("volet : trois éléments", FLOATING, "grid: count >= GRID_MIN } }), SEP);", "grid: count >= 2 } }), SEP);"),
]
CHROMIUM = [
    ("le glissé se colle", DRAG, "    if (!shift || (!shift.dx && !shift.dy)) return changes;", "    if (shift) return changes;"),
    ("Ctrl lu pendant le geste", FLOW, "const pointer = (event: PointerEvent): void => { freeRef.current = event.ctrlKey || event.metaKey; };", "const pointer = (event: PointerEvent): void => { freeRef.current = false; };"),
    ("la copie s'aligne", CLONE, "const fix = latest.current.guide && g.moved ?", "const fix = false && latest.current.guide && g.moved ?"),
    ("la grille dit son message", CANVAS, 'cause === "gridded" ? "shell:messages.itemsGridded"', 'cause === "gridded" ? "shell:messages.itemsMoved"'),
    ("Alt+G", BAR, "if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && isGridKey(event.key, event.code)) {", "if (false) {"),
    ("le bord tiré s'aligne", DRAG, "return placed.box;\n  }\n  function resizeEnd", "return raw;\n  }\n  function resizeEnd"),
]


def build() -> None:
    subprocess.run(["node", "build.mjs"], cwd=ENGINE, check=True, capture_output=True)


def run_node() -> bool:
    done = subprocess.run(["node", "--test", str(ROOT / "backend/tests/js/app.test.js")], capture_output=True, text=True, env={**os.environ, "LD_APP": str(APP)})
    return done.returncode != 0


def run_chromium() -> bool:
    done = subprocess.run(["uv", "run", "pytest", "-x", "-q", "-p", "no:warnings", "tests/test_app_guides.py"], cwd=ROOT / "backend", capture_output=True, text=True)
    return done.returncode != 0


def mutate(name: str, path: Path, old: str, new: str, run) -> bool:
    text = path.read_text(encoding="utf-8")
    assert text.count(old) == 1, (name, path, text.count(old))
    try:
        path.write_text(text.replace(old, new), encoding="utf-8")
        build()
        caught = run()
    finally:
        path.write_text(text, encoding="utf-8")
    print(("attrapée  " if caught else "SURVIVANTE"), name, flush=True)
    return caught


which = sys.argv[1] if len(sys.argv) > 1 else "all"
results = []
if which in ("node", "all"):
    results += [mutate(n, p, o, w, run_node) for n, p, o, w in NODE if len(sys.argv) < 3 or n in sys.argv[2:]]
if which in ("chromium", "all"):
    results += [mutate(n, p, o, w, run_chromium) for n, p, o, w in CHROMIUM]
build()
print(f"{sum(results)} attrapées sur {len(results)}")
