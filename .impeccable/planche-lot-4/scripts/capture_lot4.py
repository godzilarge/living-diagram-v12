"""Lot 4 (docs/11) : la barre contextuelle flottante. Captures sur demo-dc (1440 × 900 sombre, 1280 × 800 clair), gestes
réels (souris, clavier) : 1-note (volet des teintes, une teinte survolée), 2-connecteur (barre au milieu du tracé,
infobulle du tracé), 3-multi (sélection mixte, volet « aligner et répartir »), 4-equipement (un équipement, infobulle
de l'épingle), 5-clair (une forme, volet de la bordure), 6-masquee (barre masquée par Ctrl + ., la ligne d'état).
Mesures : du clic à la barre peinte, et les images d'un panoramique avec la barre affichée (et masquée, pour comparer),
sur demo-dc et sur 500 équipements ; la version de la toile ne bouge pas pendant un panoramique.
Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie> <bundle à 500 équipements>"""
from __future__ import annotations

import json
import statistics
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
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
SHOWN = "!!document.querySelector('.fbar:not(.suspended):not(.offscreen)')"
NOTE = "(LDApp.debug.state().note || {text: ''}).text"
CTRL = 2
wait = lambda s: threading.Event().wait(s)  # noqa: E731


def key(tab, k: str, code: str, vk: int, modifiers: int = 0) -> None:
    event = {"key": k, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def click(tab, x: float, y: float) -> None:
    tab.mouse_move(x, y)
    for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
        tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1})


def center_of(tab, selector: str) -> tuple[float, float]:
    r = tab.js(f"JSON.parse(JSON.stringify(document.querySelector({json.dumps(selector)}).getBoundingClientRect()))")
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2


def hover(tab, selector: str, settle: float = 0.8) -> None:
    x, y = center_of(tab, selector)
    tab.mouse_move(x - 20, y + 30)
    tab.mouse_move(x, y)
    wait(settle)


def select(tab, kind: str, ident: str) -> None:
    tab.mouse_move(5, 300)
    tab.js("document.querySelector('.app').focus()")  # le focus laissé dans une barre précédente ne se montre pas
    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: {json.dumps(kind)}, id: {json.dumps(ident)} }})")
    wait(0.6)
    _wait(tab, SHOWN)
    wait(0.4)


def fb(tab, ident: str) -> str:
    return f".fbar .fb[data-id={json.dumps(ident)}]"


def open_volet(tab, ident: str) -> None:
    x, y = center_of(tab, fb(tab, ident))
    click(tab, x, y)
    _wait(tab, "!!document.querySelector('.fvolet')")
    wait(0.3)


def scene(base: str, auth: dict, tab) -> dict:
    """Une note de maintenance au-dessus des cœurs, reliée au second ; une forme « Baie 12 » ; un groupe de deux accès."""
    pos = tab.js("Object.fromEntries(['dc01-core-01', 'dc01-core-02', 'dc01-rt-01', 'dc01-acc-01', 'dc01-acc-02'].map((h) => [h, LDApp.debug.handle().toile.state.positions.get(h)]))")
    c1, c2 = pos["dc01-core-01"], pos["dc01-core-02"]
    ys = tab.js("Array.from(LDApp.debug.handle().toile.state.positions.values()).map((p) => p.y)")
    top = min(ys) - 260
    params = {"infrastructure": "demo-dc"}
    ops = [
        {"op": "annotation_create", "content": {"kind": "note", "text": "Maintenance le 18/10\nremplacer l'optique Eth1/49\navant 6 h"},
         "x": round(c2["x"] - 100), "y": round(top), "w": 220, "h": 90, "style": {"hue": "amber", "fill_opacity": 20}},
        {"op": "annotation_create", "content": {"kind": "shape", "shape": "rectangle", "label": "Baie 12"},
         "x": round(c2["x"] + 220), "y": round(top + 10), "w": 160, "h": 70, "style": {"hue": "teal", "fill_opacity": 25}},
    ]
    r = httpx.post(f"{base}/api/intent/patches", params=params, headers=auth, json={"author": "orhan", "ops": ops}, timeout=30)
    note, shape = [a["id"] for a in r.json()["annotations"]][-2:]
    line = {"op": "connector_create", "start": {"kind": "annotation", "ref": note, "side": "s"}, "end": {"kind": "device", "ref": "dc01-core-02", "side": "n"},
            "route": "elbow", "label": "optique Eth1/49", "style": {"hue": "amber"}}
    group = {"op": "group_create", "label": "Salle B — rangée 4", "members": ["dc01-acc-01", "dc01-acc-02"]}
    r = httpx.post(f"{base}/api/intent/patches", params=params, headers=auth, json={"author": "orhan", "ops": [line, group]}, timeout=30)
    doc = r.json()
    return {"note": note, "shape": shape, "line": doc["connectors"][-1]["id"], "group": doc["groups"][-1]["id"], "c1": c1}


FRAMES = """(async (ms) => {
  const t = [], v0 = LDApp.debug.handle().toile.version();
  const t0 = performance.now();
  await new Promise((done) => { const step = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  return { frames: gaps.length, mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, max: Math.max(...gaps), version: LDApp.debug.handle().toile.version() - v0 };
})(%d)"""


def pan_frames(tab, start: tuple[float, float]) -> dict:
    """Un panoramique réel (glissé nu sur le fond, D1), pendant qu'une boucle d'images compte les intervalles."""
    tab.js("window.__pan = " + (FRAMES % 1600).replace("(async", "(async", 1))
    x, y = start
    tab.mouse_move(x, y)
    tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "buttons": 1, "clickCount": 1})
    for i in range(1, 41):
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x + 3 * i, "y": y + i, "button": "left", "buttons": 1})
        wait(0.03)
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x + 120, "y": y + 40, "button": "left", "buttons": 0, "clickCount": 1})
    return tab.js("window.__pan")


PANE = """(() => { for (let r = 40; r < 600; r += 20) for (let a = 0; a < 6.28; a += 0.4) {
  const x = 720 + r * Math.cos(a), y = 450 + r * Math.sin(a), el = document.elementFromPoint(x, y);
  if (el && el.classList.contains('react-flow__pane')) return [x, y]; } return [720, 450]; })()"""
CLICK_TO_BAR = """(async () => {
  for (let i = 0; i < 4000 && !(%s); i++) await new Promise((r) => setTimeout(r, 1));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return performance.now() - window.__t0;
})()""" % SHOWN.replace("!!", "")


def measure(tab, host: str, tag: str, results: list) -> None:
    for _ in range(3):
        tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.5)
        tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'node', id: {json.dumps(host)} }})"); wait(0.8)
        tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.5)
        x, y = center_of(tab, f".react-flow__node[data-id={json.dumps(host)}]")
        tab.js("window.__t0 = 0; window.addEventListener('pointerdown', () => { window.__t0 = performance.now(); }, { capture: true, once: true })")
        click(tab, x, y)
        results.append((tag, "clic → barre peinte (ms)", tab.js(CLICK_TO_BAR)))
    pane = tab.js(PANE)
    shown = pan_frames(tab, tuple(pane))
    results.append((tag, "panoramique, barre affichée", shown))
    key(tab, ".", "Period", 190, CTRL); wait(0.5)
    results.append((tag, "panoramique, barre masquée", pan_frames(tab, tuple(tab.js(PANE)))))
    key(tab, ".", "Period", 190, CTRL); wait(0.5)


settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot4-")), max_bundle_bytes=30_000_000)
server, thread, base = _serve(settings)
results: list = []
try:
    auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    for path in [PROJECT / "samples/demo-dc" / f"run-0{i}.json" for i in (1, 2, 3)] + [S500]:
        r = httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=auth, timeout=180)
        print(path.name, r.status_code)
    with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); wait(1.5)
        ids = scene(base, auth, tab)
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); wait(1.5)
        # 1. la note : le volet des teintes ouvert, une teinte survolée (« ambre → violet »)
        select(tab, "annotation", ids["note"])
        open_volet(tab, "hue")
        hover(tab, ".fvolet .hue-swatch[aria-label='violet']")
        print("1", tab.js("document.querySelector('.fvolet .volet-cap').textContent"), "| covers", tab.js("document.querySelector('.fbar').dataset.covers"))
        tab.screenshot(OUT / "1-note.png")
        key(tab, "Escape", "Escape", 27); wait(0.3)
        # 2. le connecteur : la barre au milieu du tracé, l'infobulle du tracé
        select(tab, "connector", ids["line"])
        hover(tab, fb(tab, "route"), 0.9)
        print("2", tab.js("document.querySelector('.ftip') && document.querySelector('.ftip').textContent"))
        tab.screenshot(OUT / "2-connecteur.png")
        # 3. la sélection mixte : la note, la forme et le PE, le volet « aligner et répartir », une case survolée
        tab.mouse_move(5, 300)
        tab.js("document.querySelector('.app').focus()")
        items = [{"kind": "node", "id": "dc01-pe-01"}, {"kind": "annotation", "id": ids["note"]}, {"kind": "annotation", "id": ids["shape"]}]
        tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps(items)})")
        tab.js("LDApp.debug.handle().toile.frame()"); wait(0.9)
        _wait(tab, SHOWN); wait(0.3)
        open_volet(tab, "align")
        hover(tab, ".fvolet [aria-label='aligner en haut']", 0.5)
        print("3", tab.js("Array.from(document.querySelectorAll('.toolbar button')).map((b) => b.ariaLabel).join(' | ')"))
        tab.screenshot(OUT / "3-multi.png")
        key(tab, "Escape", "Escape", 27); wait(0.3)
        # 4. un équipement : sa barre, l'infobulle de l'épingle
        select(tab, "node", "dc01-rt-01")
        hover(tab, fb(tab, "pin"), 0.9)
        print("4", tab.js("document.querySelector('.fbar').getAttribute('aria-label')"), tab.js("document.querySelector('.fbar').className"))
        tab.screenshot(OUT / "4-equipement.png")
        # 6. masquée : Ctrl + ., la ligne d'état le dit (la note reste sélectionnée, sans barre)
        select(tab, "annotation", ids["note"])
        tab.js("document.querySelector('.app').focus()")
        key(tab, ".", "Period", 190, CTRL)
        _wait(tab, f"/barre contextuelle masquée/.test({NOTE})"); wait(0.5)
        tab.screenshot(OUT / "6-masquee.png")
        key(tab, ".", "Period", 190, CTRL); wait(0.5)
        _wait(tab, "!document.querySelector('.toast')")  # la ligne d'état de la bascule s'est effacée
        # 5. clair, 1280 × 800 : la forme, le volet de la bordure
        tab.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False})
        tab.js("document.querySelector('.controls [aria-label=\"passer au thème clair\"]').click()"); wait(0.6)
        select(tab, "annotation", ids["shape"])
        open_volet(tab, "stroke_style")
        hover(tab, ".fvolet [aria-label='tirets']", 0.5)
        tab.screenshot(OUT / "5-clair.png")
        key(tab, "Escape", "Escape", 27)
        tab.js("document.querySelector('.controls [aria-label=\"passer au thème sombre\"]').click()")
        tab.call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        wait(0.5)
        # mesures
        measure(tab, "dc01-acc-05", "demo-dc", results)
        tab.navigate(f"{base}/?infrastructure=infra-synth")
        _wait(tab, READY); wait(3.0)
        print("infra-synth nœuds :", tab.js("document.querySelectorAll('.react-flow__node').length"))
        host = tab.js("Array.from(LDApp.debug.handle().toile.state.positions.keys()).find((h) => /core/.test(h))")
        measure(tab, host, "500 équipements", results)
        print("console:", [c for c in chrome.console if c.get("level") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=5)
for tag, what, value in results:
    print(tag, "·", what, ":", json.dumps(value) if isinstance(value, dict) else f"{value:.0f}")
clicks = {}
for tag, what, value in results:
    if what.startswith("clic"):
        clicks.setdefault(tag, []).append(value)
for tag, values in clicks.items():
    print(tag, "clic → barre : médiane", round(statistics.median(values)), "ms, de", round(min(values)), "à", round(max(values)))
