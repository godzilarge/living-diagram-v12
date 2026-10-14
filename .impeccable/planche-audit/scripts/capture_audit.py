"""Captures d'audit de l'application sur demo-dc : équipement sélectionné, note sélectionnée (poignées, ancres,
panneau), rectangle + note, vue cadrée. Lancer depuis backend/ : uv run python <ce fichier> <dossier de sortie>."""
from __future__ import annotations
import json, sys, threading
from pathlib import Path
import httpx
from ld_backend.config import Settings
from tests.browser import Chrome
from tests.conftest import TOKEN
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
NOTE = "(LDApp.debug.state().note || {text: ''}).text"

def center(tab, sel):
    return tab.js(f"(() => {{ const el = document.querySelector({json.dumps(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return {{x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height}}; }})()")

def click(tab, x, y, mods=0):
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": mods})
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": mods})

settings = Settings(api_token=TOKEN, archive_dir=OUT / "archive", max_bundle_bytes=30_000_000)
server, thread, base = _serve(settings)
try:
    auth = {"Authorization": f"Bearer {TOKEN}"}
    for run in ("run-01", "run-02", "run-03"):
        r = httpx.post(f"{base}/api/ingest/bundles", content=(PROJECT / "samples/demo-dc" / f"{run}.json").read_bytes(), headers={**auth, "Content-Type": "application/json"}, timeout=120)
        print(run, r.status_code)
    with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); threading.Event().wait(1.5)
        tab.screenshot(OUT / "1-ouverture.png")
        # équipement sélectionné : survol puis clic
        c = center(tab, ".react-flow__node[data-id='dc01-core-01']")
        print("core", c)
        tab.mouse_move(c["x"], c["y"]); threading.Event().wait(0.3)
        click(tab, c["x"], c["y"]); threading.Event().wait(1.0)
        tab.mouse_move(c["x"] + 10, c["y"] + 5); threading.Event().wait(0.4)
        tab.screenshot(OUT / "2-equipement-selectionne.png")
        # cadrer tout
        tab.js("document.querySelector(\".toolbar button[aria-label='cadrer tout']\").click()"); threading.Event().wait(1.0)
        tab.screenshot(OUT / "3-cadrer-tout.png")
        # insérer une note puis un rectangle
        tab.js("document.querySelector(\".toolbar button[aria-label='insérer une note']\").click()")
        _wait(tab, f"/annotation créée/.test({NOTE})"); threading.Event().wait(1.0)
        def last_id():
            doc = httpx.get(f"{base}/api/intent?infrastructure=demo-dc", headers=auth, timeout=30).json()
            return doc["annotations"][-1]["id"]
        nid = last_id(); print("note id", nid)
        n = center(tab, f".react-flow__node[data-id='annotation:{nid}']")
        print("note", n)
        if n:
            tab.drag((n["x"], n["y"]), (n["x"] - 260, n["y"] - 160)); threading.Event().wait(1.2)
        tab.js("document.querySelector(\".toolbar button[aria-label='insérer un rectangle']\").click()")
        threading.Event().wait(1.5); rid = last_id(); print("rect id", rid)
        n = center(tab, f".react-flow__node[data-id='annotation:{nid}']")
        if n:
            tab.mouse_move(n["x"], n["y"]); threading.Event().wait(0.3)
            click(tab, n["x"], n["y"]); threading.Event().wait(1.0)
            tab.mouse_move(n["x"] + 8, n["y"] + 4); threading.Event().wait(0.5)
        tab.screenshot(OUT / "4-note-selectionnee.png")
        tab.screenshot(OUT / "4b-note-selectionnee.png")
        print("labels:", tab.js("[...document.querySelectorAll('.toolbar button')].map(b => b.getAttribute('aria-label'))"))
        print("console:", chrome.console[:5])
finally:
    server.should_exit = True; thread.join(timeout=5)
