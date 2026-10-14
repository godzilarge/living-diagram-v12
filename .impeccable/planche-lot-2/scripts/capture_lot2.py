"""Lot 2 (docs/11) : sélection mixte et clavier de base. Captures sur demo-dc à 1440 × 900, sombre : sélection mixte
(deux cartes, une note, un connecteur ; fiche qui compte par sorte), la même après « aligner en haut », Suppr sur un
équipement (la ligne d'état et « masquer ») ; puis la barre d'outils d'une sélection mixte à 1280 × 800, clair. Mesures :
rectangle, Ctrl+A puis flèche, sur demo-dc et sur une série du générateur (500 équipements).
Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie> <bundle à 500 équipements>"""
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
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
NOTE = "(LDApp.debug.state().note || {text: ''}).text"
wait = lambda s: threading.Event().wait(s)  # noqa: E731

# Deux images après un changement d'état : React a rendu, React Flow a posé les nœuds, le navigateur a peint.
FRAMES = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"
SELECT_ALL_THEN_ARROW = """(async () => {
  const h = LDApp.debug.handle();
  let t0 = performance.now();
  h.toile.selectItems(h.toile.allItems());
  await %s;
  const all = performance.now() - t0;
  t0 = performance.now();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await %s;
  const arrow = performance.now() - t0;
  return { items: h.toile.state.multi.hosts.length + h.toile.state.multi.annotations.length, all, arrow };
})()""" % (FRAMES, FRAMES)
# Le temps d'un rectangle réel (Maj + glissé) : de la relâche (pointerup) à la sélection peinte.
ARM = "window.__t0 = 0; window.addEventListener('pointerup', () => { window.__t0 = performance.now(); }, { capture: true, once: true })"
RECT_DONE = """(async () => {
  for (let i = 0; i < 400 && !(LDApp.debug.handle().toile.state.multi.hosts.length >= 2); i++) await new Promise((r) => setTimeout(r, 5));
  await %s;
  return { ms: performance.now() - window.__t0, hosts: LDApp.debug.handle().toile.state.multi.hosts.length };
})()""" % FRAMES


def gesture(tab, start, end):
    """Maj + glissé sur le fond : le rectangle de sélection (D1, révisée le 2026-10-14 : le glissé nu déplace la vue)."""
    shift = {"key": "Shift", "code": "ShiftLeft", "windowsVirtualKeyCode": 16}
    tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **shift, "modifiers": 8})
    wait(0.15)
    mouse = {"button": "left", "clickCount": 1, "modifiers": 8}
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start[0], "y": start[1], "buttons": 0, **mouse})
    tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": 1, **mouse})
    for step in range(1, 9):
        x, y = start[0] + (end[0] - start[0]) * step / 8, start[1] + (end[1] - start[1]) * step / 8
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 1, **mouse})
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **shift})


def pane_rect(tab):
    """Un rectangle qui part du fond, au milieu de la toile, d'un tiers de sa taille."""
    start = tab.js(
        "(() => { for (let x = 360; x < 700; x += 12) for (let y = 220; y < 420; y += 12) {"
        " const el = document.elementFromPoint(x, y); if (el && el.classList.contains('react-flow__pane')) return [x, y]; } return null; })()"
    )
    return start, (start[0] + 480, start[1] + 300)


def measure(tab, tag, results):
    tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.6)
    start, end = pane_rect(tab)
    tab.js(ARM)
    gesture(tab, start, end)
    rect = tab.js(RECT_DONE)
    wait(0.8)
    timing = tab.js(SELECT_ALL_THEN_ARROW)
    wait(1.0)
    results.append((tag, rect, timing))


settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot2-")), max_bundle_bytes=30_000_000)
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
        # une note au-dessus des deux cœurs, un connecteur libre qui y mène (l'API, sous le nom donné)
        pos = tab.js("Object.fromEntries(['dc01-core-01', 'dc01-core-02'].map((h) => [h, LDApp.debug.handle().toile.state.positions.get(h)]))")
        a, b = pos["dc01-core-01"], pos["dc01-core-02"]
        left, top = min(a["x"], b["x"]) - 100, min(a["y"], b["y"]) - 40
        ops = [{"op": "annotation_create", "content": {"kind": "note", "text": "Salle B — rangée 4"}, "x": left - 280, "y": top + 70, "w": 200, "h": 80}]
        r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=auth, json={"author": "orhan", "ops": ops}, timeout=30)
        note = [x for x in r.json()["annotations"]][-1]["id"]
        line = {"op": "connector_create", "start": {"kind": "free", "x": left - 300, "y": top + 260}, "end": {"kind": "annotation", "ref": note, "side": "s"}}
        r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=auth, json={"author": "orhan", "ops": [line]}, timeout=30)
        cid = r.json()["connectors"][-1]["id"]
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); wait(1.5)
        items = [{"kind": "node", "id": "dc01-core-01"}, {"kind": "node", "id": "dc01-core-02"}, {"kind": "annotation", "id": note}, {"kind": "connector", "id": cid}]
        tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps(items)})"); wait(0.4)
        tab.js("LDApp.debug.handle().toile.frame()"); wait(1.2)
        tab.mouse_move(1300, 860); wait(0.4)
        print("1", tab.js("document.querySelector('.panel h2').textContent"), "|", tab.js("document.querySelector('.panel .insp-meta').textContent"))
        tab.screenshot(OUT / "1-selection-mixte.png")
        # 2. « aligner en haut » : les deux cartes et la note sur le bord le plus haut ; une écriture
        tab.js("document.querySelector('.toolbar [aria-label=\"aligner en haut\"]').click()")
        _wait(tab, f"/aligné/.test({NOTE})"); wait(1.2)
        print("2", tab.js(NOTE), "| annuler :", tab.js("document.querySelector('.toolbar [aria-label^=\"annuler\"]').getAttribute('aria-label')"))
        tab.screenshot(OUT / "2-alignement-mixte.png")
        # 3. Suppr sur un équipement : rien ne part, la ligne d'état le dit et propose de le masquer
        tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'dc01-core-02' })"); wait(0.5)
        tab.js("document.querySelector('.app').focus()")
        for kind in ("keyDown", "keyUp"):
            tab.call("Input.dispatchKeyEvent", {"type": kind, "key": "Delete", "code": "Delete", "windowsVirtualKeyCode": 46})
        _wait(tab, "!!document.querySelector('.toast .toast-action')"); wait(0.4)
        print("3", tab.js("document.querySelector('.toast').textContent"))
        tab.screenshot(OUT / "3-suppr-equipement.png")
        # mesures sur demo-dc, puis sur 500 équipements
        tab.js("document.querySelector('.toast .toast-action') && LDApp.debug.handle().toile.select(null)")
        measure(tab, "demo-dc", results)
        tab.navigate(f"{base}/?infrastructure=infra-synth")
        _wait(tab, READY); wait(3.0)
        print("s500 nœuds dessinés :", tab.js("document.querySelectorAll('.react-flow__node').length"))
        measure(tab, "s500", results)
        # 4. la barre d'outils d'une sélection mixte, 1280 × 800, clair : tient-elle à côté de la recherche ?
        tab.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False})
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), theme: 'light' }))")
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); wait(1.5)
        tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps(items)})"); wait(0.4)
        tab.js("LDApp.debug.handle().toile.frame()"); wait(1.2)
        tab.mouse_move(1200, 780); wait(0.3)
        tab.screenshot(OUT / "4-barre-1280-clair.png")
        print("console:", [c for c in chrome.console if "Refused" in json.dumps(c) or c.get("level") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=5)
for tag, rect, timing in results:
    print(f"{tag}: rectangle {rect['ms']:.0f} ms ({rect['hosts']} équipements) · Ctrl+A {timing['all']:.0f} ms ({timing['items']} éléments) · flèche {timing['arrow']:.0f} ms")
