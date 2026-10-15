"""Sondes de la revue de session (2026-10-15), lancées dans Chromium sans écran, en lecture seule sur le dépôt.

cd backend && uv run pytest <chemin>/test_sondes_revue.py -q -s -p no:cacheprovider

S1 : flèches puis Suppr avant la fin de la rafale (400 ms) : exception non rattrapée, épingle du bloc perdue.
S2 : bloc de code sélectionné seul, focus dans la barre contextuelle : Origine / Fin ne parcourent plus la barre.
S3 : Échap pendant le redimensionnement d'une note (Ctrl tenu) : la couche des repères et `guiding` restent.
"""

import json
import sys
import threading
from pathlib import Path

BACKEND = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo/backend")
sys.path.insert(0, str(BACKEND))

import httpx  # noqa: E402
import pytest  # noqa: E402

from tests.conftest import TOKEN, bundle_dict, settings  # noqa: E402,F401
from tests.test_app import CTRL, READY, _press  # noqa: E402
from tests.test_render import CHROMIUM  # noqa: E402
from tests.test_view import _serve, _wait  # noqa: E402

AUTH = {"Authorization": f"Bearer {TOKEN}"}
PARAMS = {"infrastructure": "infra-lab"}


def _post(base, ops):
    done = httpx.post(f"{base}/api/intent/patches", params=PARAMS, headers=AUTH, json={"author": "orhan", "ops": ops})
    assert done.status_code == 200, done.text
    return done.json()


def _doc(base):
    return httpx.get(f"{base}/api/intent", params=PARAMS, headers=AUTH).json()


def _open(chrome, base):
    tab = chrome.open(f"{base}/")
    _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
    tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
    tab.js("localStorage.setItem('ld-author', 'orhan')")
    tab.navigate(f"{base}/?infrastructure=infra-lab")
    _wait(tab, READY)
    threading.Event().wait(0.5)
    return tab


def _key(tab, key, code, vk, modifiers=0, kind_down="rawKeyDown"):
    event = {"key": key, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": kind_down, **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_s1_nudge_then_delete(settings, bundle_dict):  # noqa: F811
    from tests.browser import Chrome

    server, thread, base = _serve(settings)
    try:
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=AUTH, timeout=60).status_code == 201
        note = {"op": "annotation_create", "content": {"kind": "note", "text": "Baie 12"}, "x": 0, "y": -400, "w": 200, "h": 80}
        ident = f"a{_post(base, [note])['revision']}-1"
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base)
            before = {p["hostname"]: (p["x"], p["y"]) for p in _doc(base)["pins"]}
            pos0 = tab.js("JSON.stringify(LDApp.debug.handle().toile.state.positions.get('fw-edge-02'))")
            tab.js(f"LDApp.debug.handle().toile.selectItems([{{kind:'annotation', id:'{ident}'}}, {{kind:'node', id:'fw-edge-02'}}])")
            tab.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            threading.Event().wait(0.2)
            tab.js("window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)))")
            _press(tab, "ArrowRight", 39)  # rafale ouverte (400 ms)
            _press(tab, "Delete", 46)      # supprime la note, avant la fin de la rafale
            threading.Event().wait(1.2)
            errors = [c for c in chrome.console if "exceptionDetails" in c]
            print("\nS1 console:", [json.dumps(c)[:300] for c in chrome.console])
            print("S1 erreurs de la page:", tab.js("JSON.stringify(window.__errs)"))
            print("S1 note:", tab.js("(LDApp.debug.state().note || {text: ''}).text"))
            pos1 = tab.js("JSON.stringify(LDApp.debug.handle().toile.state.positions.get('fw-edge-02'))")
            after = {p["hostname"]: (p["x"], p["y"]) for p in _doc(base)["pins"]}
            notes = [a["id"] for a in _doc(base)["annotations"]]
            print("\nS1 erreurs:", [json.dumps(e["exceptionDetails"].get("exception", {}).get("description", ""))[:160] for e in errors])
            print("S1 position fw-edge-02 avant/après (toile):", pos0, pos1)
            print("S1 épingle fw-edge-02 avant/après (serveur):", before.get("fw-edge-02"), after.get("fw-edge-02"))
            print("S1 annotations restantes:", notes)
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_s2_home_end_in_bar_with_code_block(settings, bundle_dict):  # noqa: F811
    from tests.browser import Chrome

    server, thread, base = _serve(settings)
    try:
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=AUTH, timeout=60).status_code == 201
        content = {"kind": "code", "text": "\n".join(f"line {i}" for i in range(60)), "language": "plain", "title": "t",
                   "highlight": False, "line_numbers": True, "font": "jetbrains_mono"}
        ident = f"a{_post(base, [{'op': 'annotation_create', 'x': 0, 'y': -600, 'w': 400, 'h': 200, 'content': content}])['revision']}-1"
        note = {"op": "annotation_create", "content": {"kind": "note", "text": "témoin"}, "x": 400, "y": -600, "w": 200, "h": 80}
        other = f"a{_post(base, [note])['revision']}-1"
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base)
            results = {}
            for name, target in (("note", other), ("code", ident)):
                tab.js(f"LDApp.debug.handle().toile.reveal({{kind:'annotation', id:'{target}'}})")
                threading.Event().wait(0.6)
                _key(tab, "t", "KeyT", 84, modifiers=1)  # Alt+T : le focus dans la barre
                threading.Event().wait(0.3)
                first = tab.js("document.activeElement && document.activeElement.dataset.id")
                _key(tab, "End", "End", 35)
                threading.Event().wait(0.2)
                end = tab.js("document.activeElement && document.activeElement.dataset.id")
                _key(tab, "Home", "Home", 36)
                threading.Event().wait(0.2)
                home = tab.js("document.activeElement && document.activeElement.dataset.id")
                count = tab.js("document.querySelectorAll('.fbar .fb').length")
                results[name] = (first, end, home, count)
                _key(tab, "Escape", "Escape", 27)
                threading.Event().wait(0.3)
            print("\nS2 (premier, après Fin, après Origine, boutons):", results)
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_s3_escape_during_resize(settings, bundle_dict):  # noqa: F811
    from tests.browser import Chrome

    server, thread, base = _serve(settings)
    try:
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=AUTH, timeout=60).status_code == 201
        note = {"op": "annotation_create", "content": {"kind": "note", "text": "Baie 12"}, "x": 0, "y": -400, "w": 200, "h": 80}
        ident = f"a{_post(base, [note])['revision']}-1"
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base)
            tab.js(f"LDApp.debug.handle().toile.reveal({{kind:'annotation', id:'{ident}'}})")
            threading.Event().wait(0.6)
            hit = f"document.querySelector('.react-flow__node[data-id=\"annotation:{ident}\"] .handle-se .annotation-handle-hit')"
            r = tab.js(f"JSON.parse(JSON.stringify({hit}.getBoundingClientRect()))")
            x, y = r["left"] + r["width"] / 2, r["top"] + r["height"] / 2
            mouse = {"button": "left", "clickCount": 1, "modifiers": CTRL}
            tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 0, **mouse})
            tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "buttons": 1, **mouse})
            for i in range(1, 6):
                tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x + 8 * i, "y": y + 5 * i, "buttons": 1, **mouse})
            threading.Event().wait(0.15)
            during = tab.js("[!!document.querySelector('.guide-layer .guide-pill'), document.querySelector('.flow-host').classList.contains('guiding')]")
            _key(tab, "Escape", "Escape", 27)
            threading.Event().wait(0.2)
            tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x + 40, "y": y + 25, "buttons": 0, **mouse})
            threading.Event().wait(0.8)
            after = tab.js("[!!document.querySelector('.guide-layer .guide-pill'), document.querySelector('.flow-host').classList.contains('guiding'), document.querySelector('.guide-layer').dataset.guides]")
            print("\nS3 pendant (pastille, guiding):", during, " après Échap + relâche (pastille, guiding, data-guides):", after)
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_s4_nudge_card_with_attached_note(settings, bundle_dict):  # noqa: F811
    """S4 : une carte et la note attachée à elle, sélectionnées ensemble, poussées d'un carreau (→) puis mises en
    grille avec une troisième carte : la note bouge deux fois (son écart à l'ancre ET son ancre)."""
    from tests.browser import Chrome

    server, thread, base = _serve(settings)
    try:
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=AUTH, timeout=60).status_code == 201
        note = {"op": "annotation_create", "content": {"kind": "note", "text": "attachée"}, "anchor": {"kind": "device", "ref": "fw-edge-02"},
                "x": 60, "y": -120, "w": 160, "h": 60, "leader": True}
        ident = f"a{_post(base, [note])['revision']}-1"
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base)
            card = "JSON.stringify(LDApp.debug.handle().toile.state.positions.get('fw-edge-02'))"
            frame = f"JSON.stringify(LDApp.debug.handle().toile.frames.get('{ident}'))"
            c0, f0 = json.loads(tab.js(card)), json.loads(tab.js(frame))
            rev = tab.js("LDApp.debug.handle().toile.model.intent.revision")
            tab.js(f"LDApp.debug.handle().toile.selectItems([{{kind:'annotation', id:'{ident}'}}, {{kind:'node', id:'fw-edge-02'}}])")
            tab.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            threading.Event().wait(0.2)
            _press(tab, "ArrowRight", 39)
            _wait(tab, f"LDApp.debug.handle().toile.model.intent.revision > {rev}")
            threading.Event().wait(0.5)
            c1, f1 = json.loads(tab.js(card)), json.loads(tab.js(frame))
            doc = _doc(base)
            a = [x for x in doc["annotations"] if x["id"] == ident][0]
            print("\nS4 carte dx:", c1["x"] - c0["x"], " note (boîte dans le plan) dx:", f1["x"] - f0["x"], " écart enregistré:", a["x"], "(était 60)")
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_s5_shift_c_during_rectangle(settings, bundle_dict):  # noqa: F811
    """S5 : Maj + rectangle, Maj+C (l'outil connecteur s'arme) avant la relâche : React Flow n'appelle pas
    `onSelectionEnd` ; `selecting` reste posé, la sélection ne suit plus les clics, la barre contextuelle ne revient pas."""
    from tests.browser import Chrome
    from tests.test_app import SHIFT, _click

    server, thread, base = _serve(settings)
    try:
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=AUTH, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base)
            r = tab.js("JSON.parse(JSON.stringify(document.querySelector('.react-flow__pane').getBoundingClientRect()))")
            start, end = (r["left"] + 40, r["top"] + 120), (r["left"] + 160, r["top"] + 220)
            shift = {"key": "Shift", "code": "ShiftLeft", "windowsVirtualKeyCode": 16}
            tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **shift, "modifiers": SHIFT})
            mouse = {"button": "left", "clickCount": 1, "modifiers": SHIFT}
            tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": 1, **mouse})
            for step in range(1, 6):
                x, y = start[0] + (end[0] - start[0]) * step / 5, start[1] + (end[1] - start[1]) * step / 5
                tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 1, **mouse})
            c = {"key": "C", "code": "KeyC", "windowsVirtualKeyCode": 67, "modifiers": SHIFT, "text": "C"}
            tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **c})
            tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **c})
            threading.Event().wait(0.2)
            armed = tab.js("LDApp.debug.state().tool")
            tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})
            tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **shift})
            _key(tab, "Escape", "Escape", 27)  # range l'outil
            threading.Event().wait(0.4)
            # un clic sur une carte : la toile devrait la sélectionner
            card = tab.js("JSON.parse(JSON.stringify(document.querySelector('.react-flow__node[data-id=\"sw-core-01\"]').getBoundingClientRect()))")
            _click(tab, card["left"] + card["width"] / 2, card["top"] + card["height"] / 2)
            threading.Event().wait(0.5)
            sel = tab.js("JSON.stringify(LDApp.debug.handle().toile.state.selection)")
            rf = tab.js("document.querySelector('.react-flow__node[data-id=\"sw-core-01\"]').classList.contains('selected')")
            bar = tab.js("!!document.querySelector('.fbar') && !document.querySelector('.fbar').classList.contains('suspended')")
            print("\nS5 outil armé pendant le rectangle:", armed, "| sélection de la toile après clic:", sel, "| React Flow: sélectionnée", rf, "| barre visible:", bar)
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium absent")
def test_s6_ctrl_before_drag(settings, bundle_dict):  # noqa: F811
    """S6 : une carte sélectionnée ; Ctrl tenu AVANT d'appuyer (pour glisser « libre », lot 8) sur une autre carte, puis
    glissé : Ctrl est aussi la touche « ajouter à la sélection » (D1, lot 2) ; les deux cartes partent ensemble."""
    from tests.browser import Chrome
    from tests.test_app import _click

    server, thread, base = _serve(settings)
    try:
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=AUTH, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base)
            pos = "JSON.parse(JSON.stringify(Object.fromEntries(LDApp.debug.handle().toile.state.positions)))"
            rect = lambda host: tab.js(f"JSON.parse(JSON.stringify(document.querySelector('.react-flow__node[data-id=\"{host}\"]').getBoundingClientRect()))")  # noqa: E731
            a = rect("sw-core-01")
            _click(tab, a["left"] + a["width"] / 2, a["top"] + a["height"] / 2)
            threading.Event().wait(0.4)
            p0 = tab.js(pos)
            b = rect("fw-edge-02")
            x, y = b["left"] + b["width"] / 2, b["top"] + b["height"] / 2
            ctrl = {"key": "Control", "code": "ControlLeft", "windowsVirtualKeyCode": 17, "modifiers": CTRL}
            tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **ctrl})
            mouse = {"button": "left", "clickCount": 1, "modifiers": CTRL}
            tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 0, **mouse})
            tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "buttons": 1, **mouse})
            for i in range(1, 9):
                tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x + 10 * i, "y": y + 7 * i, "buttons": 1, **mouse})
            tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x + 80, "y": y + 56, "buttons": 0, **mouse})
            tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **{**ctrl, "modifiers": 0}})
            threading.Event().wait(0.8)
            p1 = tab.js(pos)
            moved = sorted(h for h in p1 if p0.get(h) != p1[h])
            print("\nS6 équipements déplacés par Ctrl + glissé de fw-edge-02 (sw-core-01 sélectionné avant):", moved)
    finally:
        server.should_exit = True
        thread.join(timeout=5)
