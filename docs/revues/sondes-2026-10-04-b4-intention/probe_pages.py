"""Sonde C : quatre pages avec couche d'intention (chaînes hostiles, fantôme épinglé, stub épinglé, 501 épingles),
interrogées sous le faux DOM des tests (`probe_viewer.js`) puis, si Chromium est là, la page hostile dans un vrai
navigateur sous sa CSP.

Commande : cd backend && uv run python ../docs/revues/sondes-2026-10-04-b4-intention/probe_pages.py
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from ld_backend.render import build_page_data, render_page  # noqa: E402
from ld_contracts.intent import Intent  # noqa: E402
from tests.conftest import FIXTURES  # noqa: E402
from tests.test_render import CHROMIUM, _data, _diff_pair, _page, _page_with_previous  # noqa: E402

HOSTILE_HOST = "</script><img src=x onerror=alert(1)>"
HOSTILE_AUTHOR = "<b onclick=alert(2)>bob</b>"
HOSTILE_AUTHOR_2 = '"><script>alert(3)</script>'
AT = "2026-10-04T18:30:00Z"


def pin(hostname: str, x: int, y: int, author: str = "orhan") -> dict:
    return {"hostname": hostname, "x": x, "y": y, "author": author, "at": AT}


def intent_doc(pins: list[dict]) -> dict:
    pins = sorted(pins, key=lambda p: p["hostname"])
    doc = {"intent_version": "1.0.0", "infrastructure": "infra-lab", "revision": len(pins) or 1, "updated_at": AT, "pins": pins}
    return Intent.model_validate(doc).model_dump(mode="json")


def with_intent(page: str, pins: list[dict]) -> str:
    data = _data(page)
    return render_page(build_page_data(data["snapshot"], data["ingest"], origin="archive · infra-lab · run", diff=data.get("diff"), intent=intent_doc(pins)))


def main() -> int:
    bundle = json.loads((FIXTURES / "bundle-minimal.json").read_text(encoding="utf-8"))
    out = Path(tempfile.mkdtemp())
    pages = {
        "LD_PAGE_HOSTILE": with_intent(_page(bundle), [pin(HOSTILE_HOST, 1, 2, HOSTILE_AUTHOR), pin("sw-core-01", 120, -40, HOSTILE_AUTHOR_2)]),
        "LD_PAGE_GHOST": with_intent(_page_with_previous(_diff_pair(bundle)), [pin("srv-hyp-07", -999, -999), pin("sw-core-01", 120, -40)]),
        "LD_PAGE_STUB": with_intent(_page(bundle), [pin("srv-hyp-07", 777, 777)]),
        "LD_PAGE_MANY": with_intent(_page(bundle), [pin(f"h-{i:03d}", i, i) for i in range(501)]),
        "LD_PAGE_PLAIN": with_intent(_page(bundle), [pin("sw-core-01", 120, -40), pin("gone-host", -300, 200)]),
    }
    env = {**os.environ, "LD_FAKEDOM": str(BACKEND / "tests" / "js" / "fakedom.js")}
    for key, html in pages.items():
        path = out / (key.lower() + ".html")
        path.write_text(html, encoding="utf-8")
        env[key] = str(path)
    done = subprocess.run(["node", str(HERE / "probe_viewer.js")], env=env, capture_output=True, text=True, check=False)
    print(done.stdout, end="")
    if done.returncode:
        print(done.stderr[-3000:])
        return done.returncode
    if CHROMIUM is None:
        print("C-chromium : Chromium absent, non vérifié dans un vrai navigateur")
        return 0
    from tests.browser import Chrome

    with Chrome(CHROMIUM) as chrome:
        tab = chrome.open(f"file://{out / 'ld_page_hostile.html'}")
        tab.js("LD.app.activate('intent')")
        tab.js("LD.app.graph.select({ kind: 'node', id: 'sw-core-01' })")
        foreign = tab.js("document.querySelectorAll('img, b, script:not([type]):not(#ld-viewer)').length")
        verbatim = tab.js("document.getElementById('view-intent').textContent.includes(" + json.dumps(HOSTILE_HOST) + ")")
        fiche = tab.js("document.getElementById('inspector').textContent.includes(" + json.dumps(HOSTILE_AUTHOR_2) + ")")
        print(f"C-chromium page hostile sous CSP : éléments img/b/script étrangers {foreign} · hostname hostile verbatim dans l'onglet {verbatim} · auteur hostile verbatim dans la fiche {fiche}")
    noise = [e for e in chrome.console if "Refused" in json.dumps(e) or e.get("type") == "error"]
    print(f"C-chromium console : {len(noise)} erreur(s) / refus CSP")
    return 0


if __name__ == "__main__":
    sys.exit(main())
