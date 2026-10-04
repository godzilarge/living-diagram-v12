"""Sonde A : fabrique les pages à comparer, avec la toile construite (`viewer.js`) et avec les douze modules JS
d'origine (commit a277b38, avant le portage), à partir des mêmes données et du même gabarit.

Pour chaque variante des tests du dépôt (page, hub, aggstop, unread, diff, unreachable, shell), deux fichiers :
`<variante>-new.html` (ce que `ld render` produit aujourd'hui) et `<variante>-old.html` (le même HTML où le bloc
`<script id="ld-viewer">` est remplacé par la concaténation des anciens modules, dans l'ordre de l'ancien `JS_FILES`,
et où l'empreinte CSP du script est recalculée). Tout le reste (CSS, données, gabarit) est identique à l'octet.

Lancer depuis `backend/` :
    uv run python ../docs/revues/sondes-2026-10-04-toile/probe_pages.py ../docs/revues/sondes-2026-10-04-toile/tmp

Tout argument supplémentaire est une page `ld render` existante (par exemple la page à la jauge, 500 devices du
générateur) : elle est recopiée en `<nom>-new.html` et son jumeau à ancien script écrit en `<nom>-old.html`.
"""

import base64
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from ld_backend.render import render_shell  # noqa: E402
from tests.correlate.conftest import load_minimal, variant  # noqa: E402
from tests.test_render import _aggstop, _diff_page, _hub, _page, _page_with_previous, _unread, _unreachable_pair  # noqa: E402

BEFORE_PORT = "a277b38"  # dernier commit avec les modules JS dans backend/src/ld_backend/render/assets/js/
OLD_JS_FILES = ("model.js", "layout.js", "dom.js", "icons.js", "geometry.js", "graph.js", "inspect.js", "structures.js", "tip.js", "tables.js", "main.js")
SCRIPT_BLOCK = re.compile(r'(<script id="ld-viewer">)(.*?)(</script>)', re.DOTALL)
SCRIPT_SRC = re.compile(r"script-src 'sha256-[A-Za-z0-9+/=]+'")


def old_module(name: str) -> str:
    return subprocess.run(["git", "show", f"{BEFORE_PORT}:backend/src/ld_backend/render/assets/js/{name}"],
                          capture_output=True, text=True, check=True, cwd=ROOT).stdout


def csp_source(text: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii") + "'"


def with_old_script(page: str, shell: bool) -> str:
    names = (*OLD_JS_FILES, "shell.js") if shell else OLD_JS_FILES
    script = "\n".join(old_module(name) for name in names)
    assert "</script" not in script.lower()
    swapped, count = SCRIPT_BLOCK.subn(lambda m: m.group(1) + script + m.group(3), page)
    assert count == 1
    swapped, count = SCRIPT_SRC.subn("script-src " + csp_source(script), swapped)
    assert count == 1
    return swapped


def main(out: Path, existing: list[Path]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    bundle = load_minimal()
    pages = {
        "page": _page(bundle),
        "hub": _page(variant(bundle, _hub)),
        "aggstop": _page(variant(bundle, _aggstop)),
        "unread": _page(variant(bundle, _unread)),
        "diff": _diff_page(bundle),
        "unreachable": _page_with_previous(_unreachable_pair(bundle)),
        "shell": render_shell(),
    }
    pages.update({path.stem: path.read_text(encoding="utf-8") for path in existing})
    for name, page in pages.items():
        (out / f"{name}-new.html").write_text(page, encoding="utf-8")
        (out / f"{name}-old.html").write_text(with_old_script(page, shell=name == "shell"), encoding="utf-8")
        print(f"{name}: {len(page)} octets (new), script ancien substitué (old)")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "tmp", [Path(p) for p in sys.argv[2:]])
