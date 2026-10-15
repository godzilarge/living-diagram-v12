"""Lot 16 (docs/11) : chaque mutation du bloc de code doit faire échouer un test. Les mutations de la partie pure sont
attrapées par les tests sous Node (`backend/tests/js/code.test.js`), celles de la toile par le parcours Chromium
(`backend/tests/test_app_code.py`). Chemins absolus du worktree ; chaque fichier est rétabli quoi qu'il arrive, puis
l'application est reconstruite. Lancer : python3 <ce fichier> [--chromium]"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENGINE, BACKEND = ROOT / "engine", ROOT / "backend"
SRC = ENGINE / "src/app"
NODE = [
    ("nom d'hôte colorié à moitié", SRC / "code/tokens.ts", "if (/[A-Za-z_]$/.test(prev)) return true;", "if (/[A-Z]$/.test(prev)) return true;"),
    ("tiret seul après une espace", SRC / "code/tokens.ts", "return i >= 2 && /\\w$/.test(runs[i - 2].t);", "return true;"),
    ("variable de boucle Bash", SRC / "code/tokens.ts", '  variable: "variable", parameter:', '  "for-or-select": "keyword", variable: "variable", parameter:'),
    ("marqueur <removed>", SRC / "code/tokens.ts", 'if (k) out[out.length - 1].push({ t: MASK, c: "masked" });', 'if (k) out[out.length - 1].push({ t: MASK, c: run.c });'),
    ("coupure d'une ligne", SRC / "code/tokens.ts", "const room = max - 1;", "const room = max;"),
    ("ancrage des mots de passe", SRC / "code/secrets.ts", '{ kind: "password", re: rx(/^[ \\t]*(?:enable', '{ kind: "password", re: rx(/(?:enable'),
    ("une référence n'est pas une valeur", SRC / "code/secrets.ts", "const NOT_A_SECRET = /^[\"']?(?:\\$\\{?\\w|", "const NOT_A_SECRET = /^[\"']?(?:"),
    ("type 7 réversible", SRC / "code/secrets.ts", 'if (type === "7") return "type7";', ""),
    ("guillemets gardés", SRC / "code/secrets.ts", "const value = line.slice(f.start, f.end), q = /^[\"']/.test(value) ? value[0] : \"\";", "const value = line.slice(f.start, f.end), q = \"\";"),
    ("valeur gardée marquée", SRC / "code/secrets.ts", '? "secret" : s.c });', "? s.c : s.c });"),
    ("dernière page", SRC / "code/geometry.ts", "Math.min(Math.max(0, Math.round(first || 0)), Math.max(0, maxFirst))", "Math.max(0, Math.round(first || 0))"),
    ("reste de la molette", SRC / "code/geometry.ts", "return { lines, acc: px - lines * step };", "return { lines, acc: 0 };"),
    ("pied d'un bloc ajusté", SRC / "code/geometry.ts", "(total > max ? CODE.FOOT : 0)", "0"),
    ("chasse de Cascadia", SRC / "code/geometry.ts", 'short: "Cascadia", em: 0.59', 'short: "Cascadia", em: 0.6'),
    ("tabulation à quatre colonnes", SRC / "code/languages.ts", 'const k = 4 - (col % 4); out += " ".repeat(k); col += k;', 'out += " "; col += 1;'),
    ("trois lignes pour un bloc", SRC / "code/languages.ts", "if (normal.split(\"\\n\").length < 3) return null;", "if (normal.split(\"\\n\").length < 2) return null;"),
    ("ajuster absent quand inutile", SRC / "state/code-bar.ts", "const fit = a.h === fitHeight(total, a.style.text_size) ? []", "const fit = false ? []"),
    ("pas de coloration sur un texte brut", SRC / "state/code-bar.ts", 'const colored = c.language === "plain" ? [] :', "const colored = false ? [] :"),
    ("recherche à la ligne", SRC / "state/search.ts", "let at = lines.findIndex((l) => terms.every((t) => t.regex.test(l)));", "let at = -1;"),
    ("Journal sans texte", SRC / "state/journal-text.ts", '+ " " + tx("fact.code"', '+ " " + str(c.text) + tx("fact.code"'),
    ("contraste du commentaire", SRC / "styles/code.css", "--tk-comment: #8a9bb1;", "--tk-comment: #3a4b61;"),
]
CHROMIUM = [
    ("la molette passe à la toile", SRC / "canvas/code.tsx", "event.preventDefault(); event.stopPropagation();\n      const step", "const step"),
    ("le collage enregistre sans avertir", SRC / "state/code-commands.ts", "if (findSecrets(text).length) codeView.setDraft(draft); else", "if (false) codeView.setDraft(draft); else"),
    ("pas de grille au redimensionnement", SRC / "canvas/annotation.tsx", 'const next = a.content.kind === "code" && done ?', "const next = false ?"),
    ("l'écriture s'ouvre au début", SRC / "canvas/code-edit.tsx", "const at = offsetOfLine(el.value, first);", "const at = 0;"),
    ("Page suiv. ignorée", SRC / "canvas/code.tsx", "const next = keyScroll(now(), event.key);", "const next = null as number | null;"),
]


def build() -> None:
    subprocess.run(["npm", "run", "build"], cwd=ENGINE, check=True, capture_output=True)


def node_passes() -> bool:
    return subprocess.run(["node", "--test", str(BACKEND / "tests/js/code.test.js")], cwd=BACKEND, capture_output=True).returncode == 0


def chromium_passes() -> bool:
    command = ["uv", "run", "pytest", "-x", "-q", "tests/test_app_code.py", "-k", "browser"]
    return subprocess.run(command, cwd=BACKEND, capture_output=True).returncode == 0


def run(mutations, passes) -> tuple[list[str], list[str]]:
    caught, survived = [], []
    for name, path, before, after in mutations:
        original = path.read_text()
        assert original.count(before) == 1, f"mutation introuvable ou ambiguë : {name}"
        try:
            path.write_text(original.replace(before, after))
            if path.suffix != ".css" or "styles" not in str(path):
                build()
            (survived if passes() else caught).append(name)
        finally:
            path.write_text(original)
        print(("attrapée  " if name in caught else "SURVIVANTE"), name, flush=True)
    return caught, survived


try:
    caught, survived = run(NODE, node_passes)
    if "--chromium" in sys.argv:
        more, alive = run(CHROMIUM, chromium_passes)
        caught, survived = caught + more, survived + alive
finally:
    build()
print(f"{len(caught)} attrapées, {len(survived)} survivantes : {survived}")
print("tests sur l'original :", "verts" if node_passes() else "ROUGES")
