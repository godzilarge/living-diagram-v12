"""Lot 13 (docs/11) : captures 1440 × 900 sombre, sur demo-dc et sur 500 équipements (`generate --seed 7`), pour comparer
le rendu avant et après le lot (le lot ne doit rien changer à ce qui se voit). Quatre vues par infrastructure :
l'ouverture, « cadrer tout », un équipement sélectionné (fiche et barre contextuelle), les couches vitesses et
port-channels allumées. La vue est posée par la toile (aucune animation en cours), le pointeur hors de la toile.
Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie> <bundle à 500 équipements> <étiquette>
Pour « avant » : poser app.js et app.css du dernier commit (git show HEAD:…) à la place des fichiers construits, puis
`npm run build` pour revenir."""
from __future__ import annotations

import json
import sys
import tempfile
import threading
from pathlib import Path

import httpx

from ld_backend.config import Settings
from tests.browser import Chrome
from tests.conftest import TOKEN
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
S500 = Path(sys.argv[2])
LABEL = sys.argv[3]
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
TOILE = "LDApp.debug.handle().toile"
CALM = "!document.querySelector('.toast') && !document.querySelector('.react-flow__node[style*=\"visibility: hidden\"]')"
wait = lambda s: threading.Event().wait(s)  # noqa: E731


def settle(tab, extra: float = 1.2) -> None:
    tab.mouse_move(1150, 20)  # sur la barre du haut, hors de la toile : aucune bulle de survol
    for _ in range(200):
        if tab.js(CALM):
            break
        wait(0.05)
    wait(extra)


def shoot(tab, base: str, infra: str, host: str | None, tag: str) -> None:
    url = f"{base}/?infrastructure={infra}"
    tab.navigate(url); _wait(tab, READY); settle(tab, 2.0)
    tab.screenshot(OUT / f"{LABEL}-{tag}-1-ouverture.png")
    tab.js(f"{TOILE}.fit()"); settle(tab)
    tab.screenshot(OUT / f"{LABEL}-{tag}-2-cadrer-tout.png")
    target = host or tab.js(f"Array.from({TOILE}.state.positions.keys()).filter((h) => /core-01$/.test(h)).sort()[0]")
    tab.js(f"{TOILE}.reveal({{ kind: 'node', id: {json.dumps(target)} }})"); settle(tab, 1.8)
    tab.screenshot(OUT / f"{LABEL}-{tag}-3-selection.png")
    tab.navigate(url + "#speeds=1&beams=1"); _wait(tab, READY); settle(tab, 2.0)
    tab.screenshot(OUT / f"{LABEL}-{tag}-4-vitesses-faisceaux.png")


def main() -> None:
    settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-cap13-")), max_bundle_bytes=30_000_000)
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        for path in [PROJECT / "samples/demo-dc" / f"run-0{i}.json" for i in (1, 2, 3)] + [S500]:
            print(path.name, httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=auth, timeout=180).status_code)
        with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            for infra in ("demo-dc", "infra-synth"):  # une première ouverture mémorise le placement
                tab.navigate(f"{base}/?infrastructure={infra}"); _wait(tab, READY); wait(3.0)
            shoot(tab, base, "demo-dc", "dc01-core-01", "demo-dc")
            shoot(tab, base, "infra-synth", None, "s500")
            print("console:", [c for c in chrome.console if "exceptionDetails" in c or c.get("level") == "error"][:2])
    finally:
        server.should_exit = True
        thread.join(timeout=5)


main()
