"""Lot 3 (docs/11) : le presse-papiers. Captures sur demo-dc à 1440 × 900, sombre : un original (deux notes et le
connecteur qui les relie), sa copie collée au pointeur, et le menu contextuel ouvert sur la copie (copier, couper, coller,
dupliquer et leurs raccourcis) ; puis le fantôme d'un Alt + glissé, bouton enfoncé. Mesures : le temps d'un collage de
20 annotations et 10 connecteurs (deux requêtes), de la touche Ctrl+V à la copie sélectionnée et peinte, sur demo-dc et
sur une série du générateur (500 équipements).
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
CTRL, ALT = 2, 1
wait = lambda s: threading.Event().wait(s)  # noqa: E731
FRAMES = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"
# De la touche (keydown à la capture) à la copie sélectionnée (20 annotations, 10 connecteurs), puis deux images.
ARM = "window.__before = LDApp.debug.handle().toile.state.multi.annotations.join(); window.__t0 = 0; window.addEventListener('keydown', () => { window.__t0 = performance.now(); }, { capture: true, once: true })"
DONE = """(async () => {
  for (let i = 0; i < 4000; i++) { const m = LDApp.debug.handle().toile.state.multi; if (m.annotations.length === 20 && m.connectors.length === 10 && m.annotations.join() !== window.__before) break; await new Promise((r) => setTimeout(r, 2)); }
  await %s;
  return performance.now() - window.__t0;
})()""" % FRAMES


def key(tab, k: str, code: int, modifiers: int = 0) -> None:
    event = {"key": k, "code": "Key" + k.upper(), "windowsVirtualKeyCode": code, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def seed(base: str, auth: dict, infra: str, at: dict) -> None:
    """20 notes en grille, et 10 connecteurs qui en relient deux à deux (la seconde requête d'un collage)."""
    notes = [{"op": "annotation_create", "content": {"kind": "note", "text": f"N{i:02d}"}, "x": at["x"] + 220 * (i % 5), "y": at["y"] + 120 * (i // 5), "w": 160, "h": 60} for i in range(20)]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infra}, headers=auth, json={"author": "orhan", "ops": notes}, timeout=30)
    ids = [a["id"] for a in r.json()["annotations"]]
    lines = [{"op": "connector_create", "start": {"kind": "annotation", "ref": ids[2 * i], "side": "auto"}, "end": {"kind": "annotation", "ref": ids[2 * i + 1], "side": "auto"}} for i in range(10)]
    httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infra}, headers=auth, json={"author": "orhan", "ops": lines}, timeout=30)


def measure(tab, tag: str, results: list) -> None:
    sel = "(() => { const t = LDApp.debug.handle().toile, m = t.model.intent; t.selectItems(m.annotations.map((a) => ({ kind: 'annotation', id: a.id })).concat(m.connectors.map((c) => ({ kind: 'connector', id: c.id })))); })()"
    tab.js(sel); wait(0.6)
    tab.mouse_move(720, 20)
    key(tab, "c", 67, CTRL)
    _wait(tab, f"/20 éléments copiés|30 éléments copiés/.test({NOTE})")
    for _ in range(3):
        tab.js(ARM)
        key(tab, "v", 86, CTRL)
        ms = tab.js(DONE)
        results.append((tag, ms))
        wait(0.6)
        key(tab, "z", 90, CTRL)
        _wait(tab, f"/annulé : ajout de 30 éléments/.test({NOTE})")
        wait(0.8)
        tab.js(sel); wait(0.6)


settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot3-")), max_bundle_bytes=30_000_000)
server, thread, base = _serve(settings)
results: list = []
try:
    auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    for path in [PROJECT / "samples/demo-dc" / f"run-0{i}.json" for i in (1, 2, 3)] + [S500]:
        r = httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=auth, timeout=180)
        print(path.name, r.status_code)
    with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
        chrome.call("Browser.grantPermissions", {"origin": base, "permissions": ["clipboardReadWrite", "clipboardSanitizedWrite"]})
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); wait(1.5)
        # l'original : deux notes au-dessus des cœurs, un connecteur qui les relie
        pos = tab.js("Object.fromEntries(['dc01-core-01', 'dc01-core-02'].map((h) => [h, LDApp.debug.handle().toile.state.positions.get(h)]))")
        a, b = pos["dc01-core-01"], pos["dc01-core-02"]
        # à gauche du parc, dans le vide : l'original et sa copie se lisent sans carte dessous
        xs = tab.js("Array.from(LDApp.debug.handle().toile.state.positions.values()).map((p) => p.x)")
        left, top = min(xs) - 900, min(a["y"], b["y"]) - 120
        ops = [
            {"op": "annotation_create", "content": {"kind": "note", "text": "Salle B — rangée 4"}, "x": left, "y": top, "w": 200, "h": 70},
            {"op": "annotation_create", "content": {"kind": "shape", "shape": "rectangle", "label": "Baie 12"}, "x": left + 300, "y": top, "w": 160, "h": 70, "style": {"hue": "teal"}},
        ]
        r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=auth, json={"author": "orhan", "ops": ops}, timeout=30)
        n1, n2 = [x["id"] for x in r.json()["annotations"]][-2:]
        line = {"op": "connector_create", "start": {"kind": "annotation", "ref": n1, "side": "e"}, "end": {"kind": "annotation", "ref": n2, "side": "w"}, "label": "fibre"}
        r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=auth, json={"author": "orhan", "ops": [line]}, timeout=30)
        cid = r.json()["connectors"][-1]["id"]
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); wait(1.5)
        items = [{"kind": "annotation", "id": n1}, {"kind": "annotation", "id": n2}, {"kind": "connector", "id": cid}]
        tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps(items)})"); wait(0.4)
        tab.js("LDApp.debug.handle().toile.frame()"); wait(1.2)
        tab.js("document.querySelector('.app').focus()")
        key(tab, "c", 67, CTRL)
        _wait(tab, f"/3 éléments copiés/.test({NOTE})")
        # 1. la copie, collée au pointeur (sous l'original, un peu à droite), puis le menu contextuel sur elle
        frame = tab.js(f"(() => {{ const r = document.querySelector('.react-flow__node[data-id=\"annotation:{n1}\"]').getBoundingClientRect(); return [r.left, r.bottom]; }})()")
        tab.mouse_move(frame[0] + 90, frame[1] + 110); wait(0.2)
        key(tab, "v", 86, CTRL)
        _wait(tab, f"/3 éléments collés/.test({NOTE})"); wait(1.0)
        copy = tab.js("LDApp.debug.state().picked.annotations[1]")  # la forme copiée, la plus à droite : le menu s'ouvre à côté
        at = tab.js(f"(() => {{ const r = document.querySelector('.react-flow__node[data-id=\"annotation:{copy}\"]').getBoundingClientRect(); return [r.right - 12, r.top + 14]; }})()")
        for kind in ("mousePressed", "mouseReleased"):
            tab.call("Input.dispatchMouseEvent", {"type": kind, "x": at[0], "y": at[1], "button": "right", "buttons": 2, "clickCount": 1})
        _wait(tab, "!!document.querySelector('.context-menu')"); wait(0.4)
        print("1", tab.js(NOTE), "|", tab.js("Array.from(document.querySelectorAll('.context-menu .context-item')).map((b) => b.textContent).join(' / ')"))
        tab.screenshot(OUT / "1-collage.png")
        tab.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27})
        tab.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27})
        wait(0.4)
        key(tab, "z", 90, CTRL)  # la copie défaite : la capture suivante ne montre que l'original et le fantôme
        _wait(tab, f"/annulé : ajout de 3 éléments/.test({NOTE})"); wait(0.8)
        # 2. Alt + glissé de la forme d'origine : le fantôme, bouton enfoncé
        tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(n2)} }})"); wait(0.5)
        start = tab.js(f"(() => {{ const r = document.querySelector('.react-flow__node[data-id=\"annotation:{n2}\"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
        end = (start[0] + 190, start[1] + 150)
        alt = {"key": "Alt", "code": "AltLeft", "windowsVirtualKeyCode": 18}
        tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **alt, "modifiers": ALT})
        mouse = {"button": "left", "clickCount": 1, "modifiers": ALT}
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start[0], "y": start[1], "buttons": 0, **mouse})
        tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": 1, **mouse})
        for step in range(1, 11):
            tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start[0] + 19 * step, "y": start[1] + 15 * step, "buttons": 1, **mouse})
        wait(0.4)
        print("2 fantôme :", tab.js("!!document.querySelector('.clone-layer[data-ghost]')"))
        tab.screenshot(OUT / "2-alt-glisse.png")
        tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})
        tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **alt})
        _wait(tab, f"/1 élément collé/.test({NOTE})")
        # mesures : 20 notes et 10 connecteurs, sur demo-dc puis sur 500 équipements
        for infra in ("demo-dc", "infra-synth"):
            tab.navigate(f"{base}/?infrastructure={infra}")
            _wait(tab, READY); wait(2.0)
            if infra == "demo-dc":  # les éléments des captures partent : la mesure ne colle que les 30 qu'elle pose
                doc = httpx.get(f"{base}/api/intent", params={"infrastructure": infra}, headers=auth).json()
                gone = [{"op": "connector_delete", "id": x["id"]} for x in doc["connectors"]] + [{"op": "annotation_delete", "id": x["id"]} for x in doc["annotations"]]
                httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infra}, headers=auth, json={"author": "orhan", "ops": gone}, timeout=30)
            center = tab.js("LDApp.debug.handle().toile.viewCenter()")
            seed(base, auth, infra, center)
            tab.navigate(f"{base}/?infrastructure={infra}")
            _wait(tab, READY); wait(2.5)
            print(infra, "nœuds dessinés :", tab.js("document.querySelectorAll('.react-flow__node').length"))
            measure(tab, infra, results)
        print("console:", [c for c in chrome.console if c.get("level") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=5)
for tag, ms in results:
    print(f"{tag}: collage de 20 annotations + 10 connecteurs : {ms:.0f} ms")
