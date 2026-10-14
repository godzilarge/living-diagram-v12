"""Lot 1 (docs/11) : poignées, ancres, survol. Captures sur demo-dc à 1440 × 900, sombre : note sélectionnée (poignées
seules, aucune ancre, aucune bulle), outil connecteur armé (marques sur l'élément survolé), glissé d'un bout (contour en
accent et quatre ancres sur la cible), redimensionnement (pastille L × H, bouton tenu), poignées à 0,4 et à 2 (deux
captures recadrées). Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie>"""
from __future__ import annotations
import base64, json, sys, tempfile, threading
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
PICKED = "LDApp.debug.state().selection"
wait = lambda s: threading.Event().wait(s)

def box(tab, sel):
    return tab.js(f"(() => {{ const el = document.querySelector({json.dumps(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return {{x: r.left + r.width/2, y: r.top + r.height/2, l: r.left, t: r.top, w: r.width, h: r.height}}; }})()")

def click(tab, x, y):
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
        tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1})

def key(tab, k, code):
    for kind in ("keyDown", "keyUp"):
        tab.call("Input.dispatchKeyEvent", {"type": kind, "key": k, "code": k, "windowsVirtualKeyCode": code})

def crop(tab, path, b, margin):
    clip = {"x": b["l"] - margin, "y": b["t"] - margin, "width": b["w"] + 2 * margin, "height": b["h"] + 2 * margin, "scale": 1}
    path.write_bytes(base64.b64decode(tab.call("Page.captureScreenshot", {"format": "png", "clip": clip})["data"]))

settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot1-")), max_bundle_bytes=30_000_000)
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
        _wait(tab, READY); wait(1.5)
        # 1. une note insérée, posée à l'écart, sélectionnée, le pointeur dessus : poignées seules, ni ancre ni bulle
        tab.js("document.querySelector(\".toolbar button[aria-label='insérer une note']\").click()")
        _wait(tab, f"/annotation créée/.test({NOTE})"); wait(1.0)
        nid = tab.js(f"{PICKED}.id")
        node = f".react-flow__node[data-id='annotation:{nid}']"
        n = box(tab, node)
        tab.drag((n["x"], n["y"]), (440, 772)); wait(1.2)
        n = box(tab, node)
        click(tab, n["x"], n["y"]); wait(0.8)
        tab.mouse_move(n["x"] + 6, n["y"] + 4); wait(0.6)
        print("1 ancres:", tab.js("document.querySelectorAll('.anchor-dot').length"), "bulle:", tab.js("document.querySelector('.tip-layer .tip').getAttribute('visibility')"))
        tab.screenshot(OUT / "1-note-selectionnee.png")
        # 2. l'outil connecteur armé (C), le pointeur dans une carte : son contour en accent et ses quatre ancres
        key(tab, "Escape", 27); wait(0.3)
        key(tab, "c", 67); wait(0.4)
        c2 = box(tab, ".react-flow__node[data-id='dc01-core-02']")
        tab.mouse_move(c2["x"] - 10, c2["y"]); wait(0.5)
        print("2 cible:", tab.js("(document.querySelector('.sketch-layer [data-target]') || {dataset: {}}).dataset.target"), "outil:", tab.js("document.querySelector(\".toolbar button[aria-label='outil connecteur']\").getAttribute('aria-pressed')"))
        tab.screenshot(OUT / "2-outil-connecteur.png")
        # 3. un bout tiré depuis un accès jusque dans le second cœur : le brouillon, le contour et les ancres de la cible
        c1 = box(tab, ".react-flow__node[data-id='dc01-acc-01']")
        tab.mouse_move(c1["x"], c1["y"]); tab.mouse_press(c1["x"], c1["y"])
        for i in range(1, 9):
            tab.mouse_move(c1["x"] + (c2["x"] - 20 - c1["x"]) * i / 8, c1["y"] + (c2["y"] + 8 - c1["y"]) * i / 8, pressed=True)
        wait(0.5)
        print("3 contour flottant:", tab.js("!!document.querySelector('.sketch-layer .target-outline.floating')"))
        tab.screenshot(OUT / "3-glisse-de-bout.png")
        key(tab, "Escape", 27); wait(0.2)
        tab.mouse_release(c2["x"] - 20, c2["y"] + 8); wait(0.6)
        print("3 connecteurs:", tab.js("LDApp.debug.handle().toile.model.connectorById.size"))
        # 4. redimensionnement par le coin haut droit, bouton tenu : la pastille L × H
        n = box(tab, node)
        click(tab, n["x"], n["y"]); wait(0.8)
        h = box(tab, f"{node} .handle-ne .annotation-handle-hit")
        tab.mouse_move(h["x"], h["y"]); tab.mouse_press(h["x"], h["y"])
        for i in range(1, 7):
            tab.mouse_move(h["x"] + 12 * i, h["y"] - 7 * i, pressed=True)
        wait(0.4)
        print("4 pastille:", tab.js(f"(document.querySelector({json.dumps(node + ' .gesture-pill')}) || {{}}).textContent"))
        tab.screenshot(OUT / "4-redimensionnement.png")
        tab.mouse_release(h["x"] + 72, h["y"] - 42); wait(1.0)
        tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(nid)} }})"); wait(0.5)
        # 5. les poignées à 0,4 et à 2 : même taille à l'écran
        frame = tab.js(f"(() => {{ const f = LDApp.debug.handle().toile.frames.get({json.dumps(nid)}); return f; }})()")
        for zoom, tag in ((0.4, "0-4"), (2, "2")):
            cx, cy = frame["x"] + frame["w"] / 2, frame["y"] + frame["h"] / 2
            tab.js(f"LDApp.debug.handle().toile.restoreView({{ x: {720 - cx * zoom}, y: {470 - cy * zoom}, zoom: {zoom} }})"); wait(0.8)
            b = box(tab, node)
            print("5", tag, "coin :", tab.js(f"(() => {{ const r = document.querySelector({json.dumps(node + ' .handle-se .annotation-handle')}).getBoundingClientRect(); return [r.width, r.height]; }})()"))
            crop(tab, OUT / f"5-poignees-zoom-{tag}.png", b, 36)
        # le liseré au survol d'une annotation non sélectionnée, et le curseur
        tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.4)
        b = box(tab, node); tab.mouse_move(b["x"], b["y"]); wait(0.4)
        print("survol :", tab.js(f"(() => {{ const r = document.querySelector({json.dumps(node + ' .hover-ring')}); const a = document.querySelector({json.dumps(node + ' svg.annotation')}); return [getComputedStyle(r).stroke, getComputedStyle(r).strokeWidth, getComputedStyle(a).cursor]; }})()"))
        print("console:", [c for c in chrome.console if "Refused" in json.dumps(c) or c.get("level") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=5)
