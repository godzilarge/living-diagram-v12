"""Lot 5 (docs/11) : la page `/view` autonome (ld render) sur demo-dc run-03, pour montrer qu'elle suit card.ts (nom à 18,
disque des voisins inconnus à 10) sans rien d'autre. Lancer depuis backend/ : uv run python <ce fichier> <dossier>."""
from __future__ import annotations
import subprocess, sys, tempfile, threading
from pathlib import Path
from tests.browser import Chrome
from tests.test_render import CHROMIUM
from tests.test_view import _wait

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
page = Path(tempfile.mkdtemp(prefix="ld-lot5-view-")) / "page.html"
subprocess.run(["uv", "run", "ld", "render", str(PROJECT / "samples/demo-dc/run-03.json"), "--out", str(page)], check=True, cwd=PROJECT / "backend")
with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open(page.as_uri())
    _wait(tab, "!!document.querySelector('#canvas .link')")
    threading.Event().wait(1.0)
    print("nom", tab.js("(() => { const t = document.querySelector('#canvas .node:not(.kind-stub) .node-label'); return [getComputedStyle(t).fontSize, t.getScreenCTM().a]; })()"))
    print("largeur", tab.js("LD.app.model.cardWidth"))
    tab.screenshot(OUT / "4-view.png")
    print("console:", [c for c in chrome.console if "Refused" in str(c)][:3])
