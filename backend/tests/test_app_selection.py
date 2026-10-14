"""L'application dans un vrai navigateur : la sélection mixte et le clavier de base (lot 2 de docs/11).

D1 et D2 révisées par Orhan le 2026-10-14 : glissé nu = panoramique, Maj + glissé = rectangle qui ajoute, molette =
zoom. Ctrl + clic ajoute et retire ; un bloc mixte glisse d'un coup (une écriture, un Ctrl+Z) ; l'alignement par les
boîtes ; Suppr (D5) ; Ctrl+A ; les flèches ; Tab ; Espace + glissé et le bouton du milieu, depuis le fond comme depuis
une carte ; F2 et Entrée ; en vue Contrôle, le glissé nu qui déplace la vue."""

import json
import threading

import pytest

from tests.test_app import (
    CENTER,
    CTRL,
    NOTE,
    PANE_POINT,
    READY,
    SHIFT,
    _click,
    _double_click,
    _fbar_align,
    _intent_doc,
    _press,
    _settled,
)
from tests.test_render import CHROMIUM

PICKED = "JSON.stringify(LDApp.debug.state().picked)"
VIEW = "LDApp.debug.handle().toile.viewport()"
PANEL_TITLE = "document.querySelector('.panel h2').textContent"
SPACE = {"key": " ", "code": "Space", "windowsVirtualKeyCode": 32}
SHIFT_KEY = {"key": "Shift", "code": "ShiftLeft", "windowsVirtualKeyCode": 16}
CONTROL = {"key": "Control", "code": "ControlLeft", "windowsVirtualKeyCode": 17}


def _picked(tab) -> dict:
    return json.loads(tab.js(PICKED))


def _screen(tab, x: float, y: float) -> tuple[float, float]:
    """Un point du plan à l'écran, lu sur une carte : son centre à l'écran est sa position dans le plan."""
    at = tab.js(
        "(() => { const t = LDApp.debug.handle().toile, k = t.viewport().zoom, c = t.state.positions.get('rt-wan-01'),"
        " r = document.querySelector('.react-flow__node[data-id=\"rt-wan-01\"]').getBoundingClientRect();"
        f" return [r.left + r.width / 2 + ({x} - c.x) * k, r.top + r.height / 2 + ({y} - c.y) * k]; }})()"
    )
    return at[0], at[1]


def _gesture(tab, start, end, *, modifiers: int = 0, key: dict | None = None, button: str = "left") -> None:
    """Un glissé réel, une touche tenue au clavier pendant tout le geste (React Flow lit la touche)."""
    if key:
        tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **key, "modifiers": modifiers})
        threading.Event().wait(0.15)  # une touche tenue avant d'appuyer : la page a le temps de le savoir
    buttons = {"left": 1, "middle": 4}[button]
    mouse = {"button": button, "clickCount": 1, "modifiers": modifiers}
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start[0], "y": start[1], "buttons": 0, **mouse})
    tab.call(
        "Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": buttons, **mouse}
    )
    for step in range(1, 9):
        x, y = start[0] + (end[0] - start[0]) * step / 8, start[1] + (end[1] - start[1]) * step / 8
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": buttons, **mouse})
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})
    if key:
        tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **key})


def _ctrl_click(tab, x: float, y: float) -> None:
    tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **CONTROL, "modifiers": CTRL})
    for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
        event = {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1, "modifiers": CTRL}
        tab.call("Input.dispatchMouseEvent", event)
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **CONTROL})


def _wheel(tab, x: float, y: float, dy: float, modifiers: int = 0) -> None:
    event = {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": dy, "modifiers": modifiers}
    tab.call("Input.dispatchMouseEvent", event)


def _on_pane(tab, x: float, y: float) -> bool:
    return tab.js(f"document.elementFromPoint({x}, {y}).classList.contains('react-flow__pane')")


def _mode(tab, word: str) -> None:
    """Un vrai clic sur la bascule des vues."""
    at = tab.js(
        "(() => { const b = [...document.querySelectorAll('.mode-switch button')]"
        f".find((b) => b.textContent.includes({json.dumps(word)})).getBoundingClientRect();"
        " return [b.left + b.width / 2, b.top + b.height / 2]; })()"
    )
    _click(tab, *at)


def _annotation(doc: dict, aid: str) -> dict:
    return next(a for a in doc["annotations"] if a["id"] == aid)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_mixed_selection_and_keyboard_in_a_browser(settings, bundle_dict):
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            url = f"{base}/?infrastructure=infra-lab"
            tab.navigate(url)
            _wait(tab, READY)
            # une note sous le premier cœur, à gauche ; un connecteur qui part d'un point libre et tient à la note
            core = tab.js("LDApp.debug.handle().toile.state.positions.get('sw-core-01')")
            nx, ny = core["x"] - 140, core["y"] + 110
            ops = [
                {
                    "op": "annotation_create",
                    "content": {"kind": "note", "text": "Baie"},
                    "x": nx,
                    "y": ny,
                    "w": 200,
                    "h": 80,
                },
                {
                    "op": "annotation_create",
                    "content": {"kind": "shape", "shape": "rectangle", "label": ""},
                    "x": nx,
                    "y": ny + 400,
                    "w": 160,
                    "h": 60,
                },
            ]
            done = httpx.post(
                f"{base}/api/intent/patches",
                params={"infrastructure": "infra-lab"},
                headers=auth,
                json={"author": "orhan", "ops": ops},
                timeout=30,
            )
            assert done.status_code == 200, done.text
            nid, sid = "a1-1", "a1-2"
            line = {
                "op": "connector_create",
                "start": {"kind": "free", "x": nx - 20, "y": ny + 180},
                "end": {"kind": "annotation", "ref": nid, "side": "auto"},
            }
            group = {"op": "group_create", "label": "Cœurs", "members": ["sw-core-01", "sw-core-02"]}
            done = httpx.post(
                f"{base}/api/intent/patches",
                params={"infrastructure": "infra-lab"},
                headers=auth,
                json={"author": "orhan", "ops": [line, group]},
                timeout=30,
            )
            assert done.status_code == 200, done.text
            cid, gid = "c2-1", "g2-1"
            tab.navigate(url)
            _wait(tab, READY)
            _wait(tab, f"!!document.querySelector('.react-flow__node[data-id=\"annotation:{nid}\"]')")
            threading.Event().wait(0.4)

            # D1, révisée par Orhan le 2026-10-14 : le glissé nu sur le fond déplace la vue, rien n'est sélectionné ;
            # un clic sans glisser sur le fond vide la sélection
            pane = json.loads(tab.js(PANE_POINT.format(720, 520)))
            before = tab.js(VIEW)
            _gesture(tab, pane, (pane[0] + 60, pane[1] + 30))
            _wait(tab, f"{VIEW}.x > {before['x'] + 30}")
            assert tab.js(VIEW)["zoom"] == before["zoom"] and _picked(tab)["hosts"] == []
            threading.Event().wait(1.2)  # d3-zoom avale le clic qui suit un panoramique jusqu'à son setTimeout(0)
            two = _settled(tab, "sw-core-02")
            _click(tab, two["x"], two["y"])
            _wait(tab, "LDApp.debug.state().hosts.join() === 'sw-core-02'")
            pane = json.loads(tab.js(PANE_POINT.format(720, 520)))
            _click(tab, *pane)
            _wait(tab, "!LDApp.debug.state().selection && !LDApp.debug.state().hosts.length")
            # Maj + glissé : le rectangle, qui ajoute à la sélection ce qu'il touche : le premier cœur et la note (ni le
            # connecteur plus bas, ni l'autre cœur)
            _click(tab, two["x"], two["y"])
            _wait(tab, "LDApp.debug.state().hosts.join() === 'sw-core-02'")
            start = _screen(tab, core["x"] - 170, core["y"] - 60)
            # jusqu'au haut de la note (+110 à +190), sans toucher le connecteur qui en part (+190 à +290)
            end = _screen(tab, core["x"] + 70, core["y"] + 150)
            assert _on_pane(tab, *start), "le rectangle part du fond"
            view_before = tab.js(VIEW)
            _gesture(tab, start, end, modifiers=SHIFT, key=SHIFT_KEY)
            _wait(tab, f"LDApp.debug.state().picked.annotations.join() === '{nid}'")
            picked = _picked(tab)
            expected = {"hosts": ["sw-core-01", "sw-core-02"], "annotations": [nid], "connectors": [], "groups": []}
            assert picked == expected, picked
            assert tab.js(VIEW) == view_before, "le rectangle ne déplace pas la vue"
            assert tab.js(PANEL_TITLE) == "3 éléments", "la fiche multiple compte les éléments"
            assert tab.js("document.querySelector('.panel .insp-meta').textContent") == "2 équipements, 1 annotation"
            two = _settled(tab, "sw-core-02")
            _ctrl_click(tab, two["x"], two["y"])  # Ctrl + clic retire
            _wait(tab, "LDApp.debug.state().picked.hosts.join() === 'sw-core-01'")
            assert tab.js(PANEL_TITLE) == "2 éléments"
            assert tab.js("document.querySelector('.panel .insp-meta').textContent") == "1 équipement, 1 annotation"
            assert "sélection : 1 équipement, 1 annotation" in tab.js("document.getElementById('live').textContent")
            # Ctrl + clic : le connecteur s'ajoute ; l'autre cœur s'ajoute puis se retire
            # le milieu du tracé, lu dans la toile (du point libre au contour de la note) : là, le connecteur se prend
            ends = tab.js(f"(() => {{ const e = LDApp.debug.handle().toile.ends.get('{cid}'); return [e.a, e.b]; }})()")
            mid = _screen(tab, (ends[0]["x"] + ends[1]["x"]) / 2, (ends[0]["y"] + ends[1]["y"]) / 2)
            assert tab.js(f"document.elementFromPoint({mid[0]}, {mid[1]}).closest('[data-connector]') !== null"), (
                "le tracé est dessiné là où la toile le calcule"
            )
            _ctrl_click(tab, *mid)
            _wait(tab, f"LDApp.debug.state().picked.connectors.join() === '{cid}'")
            two = _settled(tab, "sw-core-02")
            _ctrl_click(tab, two["x"], two["y"])
            _wait(tab, "LDApp.debug.state().picked.hosts.length === 2")
            _ctrl_click(tab, two["x"], two["y"])
            _wait(tab, "LDApp.debug.state().picked.hosts.join() === 'sw-core-01'")
            assert _picked(tab)["annotations"] == [nid] and tab.js(PANEL_TITLE) == "3 éléments"
            assert (
                tab.js("document.querySelector('.toolbar .toolbar-count').getAttribute('title')")
                == "3 éléments sélectionnés"
            )

            # le bloc glisse d'un coup : épingle du cœur, place de la note, bout libre du connecteur, une seule écriture
            revision = _intent_doc(base, auth)["revision"]
            card = _settled(tab, "sw-core-01")
            tab.drag((card["x"], card["y"]), (card["x"] + 90, card["y"] + 60), steps=8)
            _wait(tab, f"/3 éléments déplacés, enregistrés \\(orhan\\)/.test({NOTE})")
            doc = _intent_doc(base, auth)
            assert doc["revision"] == revision + 1, "une seule écriture"
            pin = {p["hostname"]: (p["x"], p["y"]) for p in doc["pins"]}["sw-core-01"]
            dx, dy = pin[0] - core["x"], pin[1] - core["y"]
            assert dx > 40 and dy > 25, (dx, dy)
            note = _annotation(doc, nid)
            assert abs(note["x"] - nx - dx) <= 2 and abs(note["y"] - ny - dy) <= 2, (note, dx, dy)
            moved_line = doc["connectors"][0]
            assert abs(moved_line["start"]["x"] - (nx - 20) - dx) <= 2, moved_line
            assert moved_line["end"] == {"kind": "annotation", "ref": nid, "side": "auto"}, (
                "le bout attaché reste attaché"
            )
            undo = "document.querySelector('.toolbar [aria-label^=\"annuler\"]').getAttribute('aria-label')"
            assert tab.js(undo) == "annuler : déplacement de 3 éléments"
            # un seul Ctrl+Z défait les trois
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"/annulé : déplacement de 3 éléments/.test({NOTE})")
            doc = _intent_doc(base, auth)
            assert "sw-core-01" not in {p["hostname"] for p in doc["pins"]}
            assert (_annotation(doc, nid)["x"], _annotation(doc, nid)["y"]) == (nx, ny)
            assert doc["connectors"][0]["start"] == {"kind": "free", "x": nx - 20, "y": ny + 180}

            # l'alignement par les boîtes : « aligner en haut » met la note au bord haut du cœur
            _wait(tab, "LDApp.debug.state().picked.annotations.length === 1")
            _fbar_align(tab, "aligner en haut")  # la barre contextuelle (lot 4 de docs/11, D10)
            _wait(tab, f"/aligné, enregistré \\(orhan\\)/.test({NOTE})")
            top = tab.js("LDApp.debug.handle().toile.state.positions.get('sw-core-01').y") - 40
            assert _annotation(_intent_doc(base, auth), nid)["y"] == top
            _press(tab, "z", 90, CTRL)
            _wait(
                tab,
                f"LDApp.debug.handle().toile.model.annotationById.get({json.dumps(nid)}).y === {ny}",
            )

            # les flèches sur une note : la rafale part en une écriture, 400 ms après la dernière
            tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: '{nid}' }})")
            _wait(tab, f"LDApp.debug.state().selection && LDApp.debug.state().selection.id === '{nid}'")
            tab.js("document.querySelector('.app').focus()")
            revision = _intent_doc(base, auth)["revision"]
            _press(tab, "ArrowRight", 39)
            _press(tab, "ArrowRight", 39)
            _press(tab, "ArrowDown", 40, SHIFT)
            _wait(tab, f"LDApp.debug.handle().toile.model.annotationById.get('{nid}').x === {nx + 40}")
            doc = _intent_doc(base, auth)
            assert (_annotation(doc, nid)["x"], _annotation(doc, nid)["y"]) == (nx + 40, ny + 100)
            assert doc["revision"] == revision + 1, "une rafale, une écriture"

            # Ctrl+A : tous les équipements, les annotations et le connecteur ; jamais le cadre du groupe
            _press(tab, "a", 65, CTRL)
            _wait(tab, "LDApp.debug.state().picked.hosts.length === 5")
            picked = _picked(tab)
            assert picked["annotations"] == [nid, sid] and picked["connectors"] == [cid] and picked["groups"] == [], (
                picked
            )

            # Tab : l'élément suivant dans l'ordre de lecture, le focus suit
            tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'rt-wan-01' })")
            _wait(tab, "LDApp.debug.state().selection && LDApp.debug.state().selection.id === 'rt-wan-01'")
            tab.js("document.querySelector('.react-flow__node[data-id=\"rt-wan-01\"]').focus()")
            _press(tab, "Tab", 9)
            _wait(tab, "LDApp.debug.state().selection && LDApp.debug.state().selection.id !== 'rt-wan-01'")
            first = tab.js("LDApp.debug.state().selection.id")
            assert first == "sw-core-01", first  # rt-wan-01 en haut, puis la rangée des cœurs, de gauche à droite
            assert tab.js("document.activeElement.dataset.id") == first, "le focus suit la sélection"
            _press(tab, "Tab", 9, SHIFT)
            _wait(tab, "LDApp.debug.state().selection.id === 'rt-wan-01'")

            # Suppr : la note et le connecteur partent (une écriture), l'équipement reste, la page propose de le masquer
            tab.js(
                "LDApp.debug.handle().toile.selectItems([{ kind: 'node', id: 'sw-core-01' },"
                f" {{ kind: 'annotation', id: '{nid}' }}, {{ kind: 'connector', id: '{cid}' }}])"
            )
            _wait(tab, "LDApp.debug.state().picked.connectors.length === 1")
            tab.js("document.querySelector('.app').focus()")
            _press(tab, "Delete", 46)
            _wait(tab, f"/2 éléments supprimés \\(orhan\\)/.test({NOTE})")
            doc = _intent_doc(base, auth)
            assert [a["id"] for a in doc["annotations"]] == [sid] and doc["connectors"] == []
            assert "un équipement vient de la donnée" in tab.js(NOTE)
            assert tab.js("LDApp.debug.state().hosts.join()") == "sw-core-01", "l'équipement reste sélectionné"
            # un seul Ctrl+Z les rend, et le connecteur tient à la note recréée
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"/annulé : suppression de 2 éléments/.test({NOTE})")
            _wait(tab, "LDApp.debug.handle().toile.model.connectorById.size === 1")
            doc = _intent_doc(base, auth)
            recreated = next(a["id"] for a in doc["annotations"] if a["content"]["kind"] == "note")
            assert doc["connectors"][0]["end"]["ref"] == recreated, doc["connectors"]
            # l'équipement seul : rien ne part, la ligne d'état le dit, « masquer » le masque
            tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'sw-core-01' })")
            _wait(tab, "LDApp.debug.state().hosts.join() === 'sw-core-01'")
            revision = _intent_doc(base, auth)["revision"]
            tab.js("document.querySelector('.app').focus()")
            _press(tab, "Delete", 46)
            _wait(tab, "!!document.querySelector('.toast .toast-action')")
            assert "un équipement vient de la donnée" in tab.js("document.querySelector('.toast').textContent")
            assert _intent_doc(base, auth)["revision"] == revision, "rien n'est écrit"
            tab.js("document.querySelector('.toast .toast-action').click()")
            _wait(
                tab,
                "location.hash.includes('hide=')"
                " && !document.querySelector('.react-flow__node[data-id=\"sw-core-01\"]')",
            )
            tab.js("document.querySelector('.rule-chip button').click()")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"sw-core-01\"]')")

            # F2 : l'étiquette d'une forme en place ; Entrée : le nom du groupe sur son cadre
            tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: '{sid}' }})")
            _wait(tab, f"LDApp.debug.state().selection && LDApp.debug.state().selection.id === '{sid}'")
            tab.js("document.querySelector('.app').focus()")
            _press(tab, "F2", 113)
            _wait(tab, "document.activeElement && document.activeElement.classList.contains('inline-editor')")
            tab.call("Input.insertText", {"text": "Baie 4"})
            _press(tab, "Enter", 13)
            _wait(tab, f"LDApp.debug.handle().toile.model.annotationById.get('{sid}').content.label === 'Baie 4'")
            tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'group', id: '{gid}' }})")
            _wait(tab, f"LDApp.debug.state().selection && LDApp.debug.state().selection.id === '{gid}'")
            tab.js("document.querySelector('.app').focus()")
            _press(tab, "Enter", 13)
            _wait(tab, "document.activeElement && document.activeElement.classList.contains('inline-editor')")
            tab.js("document.activeElement.select()")
            tab.call("Input.insertText", {"text": "Cœur DC"})
            _press(tab, "Enter", 13)
            _wait(tab, f"LDApp.debug.handle().toile.model.groupById.get('{gid}').label === 'Cœur DC'")
            # un double-clic sur la forme rouvre son étiquette ; Échap abandonne
            tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: '{sid}' }})")
            threading.Event().wait(0.5)
            shape = tab.js(CENTER.format(f"document.querySelector('.react-flow__node[data-id=\"annotation:{sid}\"]')"))
            _double_click(tab, shape["x"], shape["y"])
            _wait(tab, "document.activeElement && document.activeElement.classList.contains('inline-editor')")
            _press(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.inline-editor')")

            # D2, révisée par Orhan le 2026-10-14 : la molette zoome (comme avant) ; Ctrl + molette aussi, du même pas
            tab.js("LDApp.debug.handle().toile.select(null)")
            pane = json.loads(tab.js(PANE_POINT.format(720, 520)))
            before = tab.js(VIEW)
            _wheel(tab, *pane, 120)
            _wait(tab, f"{VIEW}.zoom < {before['zoom']}")
            after = tab.js(VIEW)
            _wheel(tab, *pane, -100, CTRL)
            _wait(tab, f"{VIEW}.zoom > {after['zoom']}")
            ratio = tab.js(VIEW)["zoom"] / after["zoom"]
            assert 1.1 < ratio < 1.2, ratio

            # Espace + glissé déplace la vue, depuis le fond comme depuis une carte : rien n'est sélectionné, la carte
            # ne bouge pas (Orhan, 2026-10-14 : « avec Espace + glisser, je déplace encore les éléments »)
            positions = tab.js("JSON.stringify(Array.from(LDApp.debug.handle().toile.state.positions))")
            pins = len(_intent_doc(base, auth)["pins"])
            for origin in ("pane", "card", "line"):
                if origin == "pane":
                    at = tuple(json.loads(tab.js(PANE_POINT.format(720, 520))))
                else:
                    tab.js("LDApp.debug.handle().toile.fit()")  # la carte et le connecteur dans la vue
                    threading.Event().wait(0.3)
                    card = _settled(tab, "sw-core-02")
                    at = (card["x"], card["y"])
                if origin == "line":  # un tracé de connecteur (`nopan`, son propre glissé) : la vue bouge aussi
                    line_ends = "Array.from(LDApp.debug.handle().toile.ends.values())[0]"  # recréé par Ctrl+Z
                    ends = tab.js(f"(() => {{ const e = {line_ends}; return [e.a, e.b]; }})()")
                    at = _screen(tab, (ends[0]["x"] + ends[1]["x"]) / 2, (ends[0]["y"] + ends[1]["y"]) / 2)
                before = tab.js(VIEW)
                _gesture(tab, at, (at[0] + 120, at[1] + 40), key=SPACE)
                _wait(tab, f"{VIEW}.x > {before['x'] + 60}")
                assert _picked(tab) == {"hosts": [], "annotations": [], "connectors": [], "groups": []}, origin
            assert tab.js("JSON.stringify(Array.from(LDApp.debug.handle().toile.state.positions))") == positions
            assert len(_intent_doc(base, auth)["pins"]) == pins, "Espace + glissé n'épingle rien"

            # le bouton du milieu déplace la vue, que l'appui commence sur le fond ou sur une carte ; rien n'est
            # sélectionné ni déplacé, et l'action du navigateur (défilement automatique, collage) est annulée
            tab.js(
                "window.__middle = []; window.addEventListener('mousedown', (e) => { if (e.button === 1)"
                " window.__middle.push(e); }, true)"  # gardé, lu après la fin de sa propagation
            )
            positions = tab.js("JSON.stringify(Array.from(LDApp.debug.handle().toile.state.positions))")
            pins = len(_intent_doc(base, auth)["pins"])
            for origin in ("pane", "card"):
                if origin == "pane":
                    at = tuple(json.loads(tab.js(PANE_POINT.format(720, 520))))
                else:
                    card = _settled(tab, "sw-core-02")
                    at = (card["x"], card["y"])
                before = tab.js(VIEW)
                _gesture(tab, at, (at[0] - 90, at[1] + 50), button="middle")
                _wait(tab, f"{VIEW}.x < {before['x'] - 50} && {VIEW}.y > {before['y'] + 25}")
                assert tab.js(VIEW)["zoom"] == before["zoom"], origin
                assert _picked(tab)["hosts"] == [] and not tab.js("LDApp.debug.state().selection"), origin
            assert tab.js("JSON.stringify(Array.from(LDApp.debug.handle().toile.state.positions))") == positions
            assert len(_intent_doc(base, auth)["pins"]) == pins, "aucune épingle : la carte n'a pas bougé"
            prevented = tab.js("window.__middle.map((e) => e.defaultPrevented)")
            assert prevented == [True, True], "l'appui du milieu n'a pas d'action du navigateur"

            # en vue Contrôle aussi, le glissé nu déplace la vue et ne sélectionne rien
            # d3-zoom avale le clic qui suit un panoramique jusqu'à son `setTimeout(0)`, que l'onglet sans écran de
            # Chromium retarde : on le laisse passer avant le vrai clic suivant
            threading.Event().wait(1.2)
            _mode(tab, "Contrôle")
            _wait(tab, "LDApp.debug.state().view.mode === 'control'")
            threading.Event().wait(0.3)
            pane = json.loads(tab.js(PANE_POINT.format(720, 520)))
            before = tab.js(VIEW)
            _gesture(tab, pane, (pane[0] - 150, pane[1] - 60))
            _wait(tab, f"{VIEW}.x < {before['x'] - 80}")
            assert _picked(tab)["hosts"] == [], "pas de rectangle sans Maj"
            threading.Event().wait(1.2)
            _mode(tab, "Diagramme")
            _wait(tab, "LDApp.debug.state().view.mode === 'diagram'")

            # l'outil connecteur (lot 1) prend toujours les appuis avant le rectangle : deux clics, un connecteur
            count = tab.js("LDApp.debug.handle().toile.model.connectorById.size")
            _press(tab, "c", 67)
            _wait(tab, "!!document.querySelector('.flow.tool-connector')")
            first = json.loads(tab.js(PANE_POINT.format(560, 600)))
            second = json.loads(tab.js(PANE_POINT.format(first[0] + 160, first[1])))
            for at in (first, second):
                tab.mouse_move(*at)
                for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
                    tab.call(
                        "Input.dispatchMouseEvent",
                        {"type": kind, "x": at[0], "y": at[1], "button": "left", "buttons": buttons, "clickCount": 1},
                    )
            _wait(tab, f"LDApp.debug.handle().toile.model.connectorById.size === {count + 1}")
            assert _picked(tab)["connectors"] and not _picked(tab)["hosts"], "un connecteur, pas un rectangle"
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("level") == "error"]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)
