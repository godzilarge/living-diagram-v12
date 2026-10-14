"""Lot 13 (docs/11) : chaque mutation de `engine/src/app/canvas/reuse.ts` doit faire échouer les tests Node de
l'application (`backend/tests/js/app.test.js`). Chemins absolus ; le fichier d'origine est rétabli quoi qu'il arrive,
puis l'application est reconstruite. Lancer : python3 <ce fichier>"""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
SOURCE = ROOT / "engine/src/app/canvas/reuse.ts"
ENGINE = ROOT / "engine"
TESTS = ROOT / "backend/tests/js/app.test.js"
MUTATIONS = [
    ("profondeur", "if (depth <= 0 ||", "if (depth < 0 ||"),
    ("NaN", "return Number.isNaN(a) && Number.isNaN(b);", "return false;"),
    ("mesures de React Flow", "!(key in n) && !OWN.has(key) &&", "!(key in n) &&"),
    ("glissé fini", "s[key] !== undefined && s[key] !== false) return false;", "s[key] !== undefined) return false;"),
    ("ordre", "if (shown[i] !== old) changed = true;", ""),
    ("mesure incomplète", "m && m.width !== undefined && m.height !== undefined ?", "m ?"),
    ("nombre de clés", "if (keys.length !== Object.keys(y).length) return false;", ""),
    ("liste reprise", "return changed ? out : (shown as T[]);", "return out;"),
    ("mesures reprises", "? ({ ...item, measured: m } as T) : item;", "? item : item;"),
    ("royaume", "return proto === null || Object.getPrototypeOf(proto) === null;", "return proto === Object.prototype || proto === null;"),
    ("identité d'un abonnement", "a.every((value, i) => Object.is(value, b[i]))", "a.every((value, i) => same(value, b[i]))"),
]


def build() -> None:
    subprocess.run(["npm", "run", "build"], cwd=ENGINE, check=True, capture_output=True)


def tests_pass() -> bool:
    return subprocess.run(["node", "--test", str(TESTS)], cwd=ENGINE, capture_output=True).returncode == 0


original = SOURCE.read_text()
caught, survived = [], []
try:
    for name, before, after in MUTATIONS:
        assert original.count(before) == 1, f"mutation introuvable ou ambiguë : {name}"
        SOURCE.write_text(original.replace(before, after))
        build()
        (survived if tests_pass() else caught).append(name)
        print(("attrapée  " if name in caught else "SURVIVANTE"), name, flush=True)
finally:
    SOURCE.write_text(original)
    build()
assert SOURCE.read_text() == original
print(f"{len(caught)} attrapées, {len(survived)} survivantes : {survived}")
print("tests sur l'original :", "verts" if tests_pass() else "ROUGES")
