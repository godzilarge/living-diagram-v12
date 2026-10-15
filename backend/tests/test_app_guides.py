"""L'application dans un vrai navigateur : les repères d'alignement, l'aimant aux objets, « mettre en grille » (lot 8 de
docs/11, prototype validé le 2026-10-14).

Un glissé qui passe à 6 px d'écran d'un alignement se colle, et la ligne se voit pendant le geste ; Ctrl tenu l'en
empêche ; Alt + glissé clone, et la copie s'aligne ; le redimensionnement d'une note aligne son bord ; les préférences
(repères allumés, leur couleur) se rangent dans le navigateur ; « mettre en grille » depuis le volet (aperçu au survol,
« 5 → 3 × 2 ») et par Alt+G, épingles écrites sous le nom ; Ctrl+Z rend les places."""

import json
import threading

import pytest

from tests.test_app import CTRL, NOTE, READY, _click, _fbar, _intent_doc, _press
from tests.test_render import CHROMIUM

ALT = 1
REVISION = "(LDApp.debug.handle().toile.model.intent || { revision: 0 }).revision"
POSITIONS = "JSON.stringify(Object.fromEntries(LDApp.debug.handle().toile.state.positions))"
ZOOM = "LDApp.debug.handle().toile.viewport().zoom"
GUIDE = "!!document.querySelector('.guide-layer [data-guide={0}] .guide-line')"
NO_GUIDE = "!document.querySelector('.guide-layer .guide-line')"
ORDER_BUTTON = "Array.from(document.querySelectorAll('.fvolet .grid-order button')).find((b) => b.textContent === {0})"
# le bouton des repères, en bas à gauche (Controls), par son nom
GUIDES_BUTTON = (
    "Array.from(document.querySelectorAll('.controls button')).find((b) => b.ariaLabel === \"repères d'alignement\")"
)


def _positions(tab) -> dict:
    return json.loads(tab.js(POSITIONS))


def _plan_to_screen(tab, x: float, y: float) -> tuple[float, float]:
    """Un point du plan à l'écran : la vue de React Flow (décalage, zoom) depuis le coin de la toile."""
    at = tab.js(
        "(() => { const v = LDApp.debug.handle().toile.viewport(), r = document.querySelector('.flow-host .react-flow')"
        f".getBoundingClientRect(); return [r.left + v.x + {x} * v.zoom, r.top + v.y + {y} * v.zoom]; }})()"
    )
    return at[0], at[1]


def _center(tab, node_id: str) -> tuple[float, float]:
    r = tab.js(
        f"JSON.parse(JSON.stringify(document.querySelector('.react-flow__node[data-id={json.dumps(node_id)}]')"
        ".getBoundingClientRect()))"
    )
    return r["left"] + r["width"] / 2, r["top"] + r["height"] / 2


# React Flow prend son départ au pas qui passe le seuil de 4 px (le premier pas est absorbé) : un premier pas de 6 px,
# puis le chemin décalé d'autant, et l'élément se déplace exactement de `end - start`.
PRIME = 6


def _drag(tab, start, end, *, modifiers: int = 0, hold=None, steps: int = 8, prime: int = PRIME) -> None:
    """Un glissé réel ; `hold` est appelé bouton tenu (le geste en cours), avant la relâche ; `prime` = 0 pour un geste
    que la page tient elle-même (Alt + glissé, poignée : rien n'est absorbé)."""
    mouse = {"button": "left", "clickCount": 1, "modifiers": modifiers}
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start[0], "y": start[1], "buttons": 0, **mouse})
    tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": 1, **mouse})
    first = (start[0] + prime, start[1])
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": first[0], "y": first[1], "buttons": 1, **mouse})
    end = (end[0] + prime, end[1])
    for step in range(1, steps + 1):
        x, y = first[0] + (end[0] - first[0]) * step / steps, first[1] + (end[1] - first[1]) * step / steps
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 1, **mouse})
    if hold:
        hold()
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})


def _key(tab, key: str, code: str, vk: int, modifiers: int = 0) -> None:
    event = {"key": key, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def _pins(base: str, auth: dict) -> dict:
    return {p["hostname"]: (p["x"], p["y"]) for p in _intent_doc(base, auth)["pins"]}


def _seed_note(base: str, auth: dict, x: float, y: float) -> str:
    import httpx

    note = {
        "op": "annotation_create",
        "content": {"kind": "note", "text": "Baie 12"},
        "x": x,
        "y": y,
        "w": 200,
        "h": 80,
    }
    done = httpx.post(
        f"{base}/api/intent/patches",
        params={"infrastructure": "infra-lab"},
        headers=auth,
        json={"author": "orhan", "ops": [note]},
    )
    assert done.status_code == 200, done.text
    return f"a{done.json()['revision']}-1"


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_alignment_guides_in_a_browser(settings, bundle_dict):
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
            threading.Event().wait(0.4)
            assert tab.js("JSON.parse(localStorage.getItem('ld-prefs') || '{}').guides") in (None, True)
            assert tab.js(f"{GUIDES_BUTTON}.getAttribute('aria-pressed')") == "true", "allumés par défaut"

            # 1. Un glissé à 6 px d'écran du centre d'une autre carte s'y colle ; la ligne se voit, bouton tenu
            pos, k = _positions(tab), tab.js(ZOOM)
            a, b = pos["fw-edge-02"], pos["sw-core-01"]
            start = _center(tab, "fw-edge-02")
            target = _plan_to_screen(tab, b["x"], a["y"] - 200)
            seen = {}

            def look() -> None:
                threading.Event().wait(0.1)
                seen["guide"] = tab.js(GUIDE.format("center"))
                seen["dom"] = _center(tab, "fw-edge-02")[0]
                seen["pill"] = tab.js("(document.querySelector('.guide-layer .guide-pill text') || {}).textContent")
                seen["guiding"] = tab.js("document.querySelector('.flow-host').classList.contains('guiding')")
                seen["hit"] = tab.js("!!document.querySelector('.react-flow__node.guide-hit[data-id=\"sw-core-01\"]')")
                card = "document.querySelector('.react-flow__node[data-id=\"sw-core-01\"] .node')"
                seen["lit"] = tab.js(f"getComputedStyle({card}).opacity")

            _drag(tab, start, (target[0] + 6, target[1]), hold=look)
            assert seen["guide"], ("la ligne de centre se voit pendant le glissé", seen, start, target)
            assert seen["guiding"] and seen["hit"], "l'estompage s'allège ; la carte alignée repasse à pleine opacité"
            assert seen["lit"] == "1", seen
            assert abs(seen["dom"] - target[0]) < 1.5, (seen, target, k)
            assert seen["pill"] and "," in seen["pill"], "la pastille du geste dit X, Y"
            _wait(tab, NO_GUIDE)
            assert tab.js("!document.querySelector('.flow-host.guiding') && !document.querySelector('.guide-hit')")
            moved = _positions(tab)["fw-edge-02"]
            assert moved["x"] == b["x"], (moved, b)
            _wait(tab, f"{NOTE}.includes('orhan')")
            assert _pins(base, auth)["fw-edge-02"][0] == b["x"], "l'épingle est écrite à la place alignée"

            # 2. Ctrl tenu pendant le geste : ni repère ni aimant (Ctrl+Z d'abord, pour repartir d'une place connue)
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"LDApp.debug.handle().toile.state.positions.get('fw-edge-02').x === {a['x']}")
            start = _center(tab, "fw-edge-02")
            target = _plan_to_screen(tab, b["x"], a["y"] - 200)
            seen.clear()

            def look_free() -> None:
                threading.Event().wait(0.1)
                seen["guide"] = tab.js("!!document.querySelector('.guide-layer .guide-line')")
                seen["free"] = tab.js("(document.querySelector('.guide-layer .guide-pill .free') || {}).textContent")

            revision = tab.js(REVISION)
            _drag(tab, start, (target[0] + 6, target[1]), modifiers=CTRL, hold=look_free)
            _wait(tab, f"{REVISION} > {revision}")
            assert not seen["guide"], "Ctrl : aucune ligne"
            assert seen["free"] == "libre", "la pastille dit « libre »"
            assert _positions(tab)["fw-edge-02"]["x"] != b["x"], "Ctrl : rien ne s'aligne"
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"LDApp.debug.handle().toile.state.positions.get('fw-edge-02').x === {a['x']}")

            # 3. Alt + glissé clone une note, et la copie s'aligne sur l'original (une candidate comme une autre)
            note_id = _seed_note(base, auth, int(b["x"]) - 600, int(b["y"]) - 40)
            tab.navigate(url)
            _wait(tab, READY)
            _wait(tab, f"LDApp.debug.handle().toile.frames.has({json.dumps(note_id)})")
            tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: {json.dumps(note_id)} }})")
            threading.Event().wait(0.5)
            frame = tab.js(f"LDApp.debug.handle().toile.frames.get({json.dumps(note_id)})")
            start = _center(tab, f"annotation:{note_id}")
            seen.clear()

            def look_clone() -> None:
                threading.Event().wait(0.1)
                seen["guide"] = tab.js("!!document.querySelector('.guide-layer .guide-line')")

            _drag(tab, start, (start[0] + 5, start[1] + 220), modifiers=ALT, hold=look_clone, prime=0)
            assert seen["guide"], "le fantôme d'Alt + glissé montre ses repères"
            _wait(tab, "LDApp.debug.handle().toile.model.annotationById.size === 2")
            copy = next(x for x in _intent_doc(base, auth)["annotations"] if x["id"] != note_id)
            assert copy["x"] == frame["x"], ("la copie est alignée sur l'original", copy, frame)
            assert copy["y"] != frame["y"]

            # 4. Redimensionner la note : son bord droit se colle au bord droit de la copie posée dessous
            tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(note_id)} }})")
            _wait(tab, f"!!{_node(note_id)}.querySelector('.handle-e')")
            wider = {"author": "orhan", "ops": [{"op": "annotation_update", "id": copy["id"], "w": 260}]}
            done = httpx.post(
                f"{base}/api/intent/patches", params={"infrastructure": "infra-lab"}, headers=auth, json=wider
            )
            assert done.status_code == 200, done.text
            _wait(tab, f"LDApp.debug.handle().toile.frames.get({json.dumps(copy['id'])}) && true")
            tab.navigate(url)
            _wait(tab, READY)
            tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: {json.dumps(note_id)} }})")
            threading.Event().wait(0.5)
            _wait(tab, f"LDApp.debug.handle().toile.frames.get({json.dumps(copy['id'])}).w === 260")
            k = tab.js(ZOOM)
            handle = tab.js(
                f'JSON.parse(JSON.stringify(document.querySelector(\'.react-flow__node[data-id="annotation:{note_id}"]'
                " .annotation-handle-slot.handle-e .annotation-handle-hit').getBoundingClientRect()))"
            )
            hx, hy = handle["left"] + handle["width"] / 2, handle["top"] + handle["height"] / 2
            seen.clear()

            def look_resize() -> None:
                threading.Event().wait(0.1)
                seen["guide"] = tab.js(GUIDE.format("edge"))

            _drag(tab, (hx, hy), (hx + 60 * k - 5, hy), hold=look_resize, prime=0)
            assert seen["guide"], "le bord tiré montre son repère"
            _wait(tab, f"{_ann(note_id)}.w === 260")

            # 5. Préférences : les repères éteints ne collent plus ; la couleur se choisit dans Affichage, rangée
            tab.js(f"{GUIDES_BUTTON}.click()")
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).guides === false")
            assert tab.js(f"{GUIDES_BUTTON}.getAttribute('aria-pressed')") == "false"
            tab.js("LDApp.debug.handle().toile.reveal({ kind: 'node', id: 'fw-edge-02' })")
            threading.Event().wait(0.5)
            tab.js("LDApp.debug.handle().toile.select(null)")
            start, target = _center(tab, "fw-edge-02"), _plan_to_screen(tab, b["x"], a["y"] - 200)
            seen.clear()
            revision = tab.js(REVISION)
            _drag(tab, start, (target[0] + 6, target[1]), hold=look_clone)
            _wait(tab, f"{REVISION} > {revision}")
            assert not seen["guide"] and _positions(tab)["fw-edge-02"]["x"] != b["x"], "repères éteints : rien ne colle"
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"{_at('fw-edge-02')}.x === {a['x']}")
            tab.js(f"{GUIDES_BUTTON}.click()")
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).guides === true")
            tab.js("document.querySelector('.display-toggle').click()")
            _wait(tab, "!!document.querySelector('.guide-swatches')")
            names = tab.js("Array.from(document.querySelectorAll('.guide-swatch')).map((b) => b.ariaLabel)")
            assert names[0] == "chartreuse" and "turquoise" in names and "orange" not in names, names
            tab.js("document.querySelector('.guide-swatch.guide-teal').click()")
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).guideHue === 'teal'")
            assert tab.js("document.documentElement.style.getPropertyValue('--guide')") == "var(--hue-teal)"
            assert "guide" not in tab.js("location.href"), "jamais dans l'adresse"
            tab.navigate(url)
            _wait(tab, READY)
            assert tab.js("document.documentElement.style.getPropertyValue('--guide')") == "var(--hue-teal)", "tenu"
            tab.js("document.querySelector('.display-toggle').click()")
            _wait(tab, "!!document.querySelector('.guide-reset')")
            tab.js("document.querySelector('.guide-reset').click()")
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).guideHue === null")
            assert tab.js("document.documentElement.style.getPropertyValue('--guide')") == ""
            tab.js("document.querySelector('.display-toggle').click()")

            # 6. Mettre en grille depuis le volet : l'en-tête dit le résultat, le survol montre les places, une écriture
            hosts = ["sw-core-01", "sw-core-02", "fw-edge-01", "fw-edge-02", "rt-wan-01"]
            tab.js(f"LDApp.debug.handle().toile.selectHosts({json.dumps(hosts)})")
            before = _positions(tab)
            _fbar(tab, "align")
            _wait(tab, "!!document.querySelector('.fvolet .grid-go')")
            assert tab.js("document.querySelector('.fvolet .volet-cap b').textContent") == "5 → 3 × 2"
            order = tab.js("document.querySelector('.fvolet .grid-order [aria-checked=true]').textContent")
            assert order == "par nom"
            # les colonnes au pas à pas : l'en-tête suit ; l'ordre « à l'écran » se range dans le navigateur
            tab.js("document.querySelector('.fvolet .step[aria-label=\"une colonne de plus\"]').click()")
            _wait(tab, "document.querySelector('.fvolet .volet-cap b').textContent === '5 → 4 × 2'")
            tab.js("document.querySelector('.fvolet .step[aria-label=\"une colonne de moins\"]').click()")
            _wait(tab, "document.querySelector('.fvolet .volet-cap b').textContent === '5 → 3 × 2'")
            tab.js(ORDER_BUTTON.format(json.dumps("à l'écran")) + ".click()")
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).gridOrder === 'screen'")
            tab.js(ORDER_BUTTON.format(json.dumps("par nom")) + ".click()")
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).gridOrder === 'name'")
            go = tab.js(
                "JSON.parse(JSON.stringify(document.querySelector('.fvolet .grid-go').getBoundingClientRect()))"
            )
            tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": go["left"] + 20, "y": go["top"] + 10})
            _wait(tab, "document.querySelectorAll('.guide-layer .grid-place').length === 5")
            places = tab.js(
                "Array.from(document.querySelectorAll('.guide-layer .grid-ghost-name')).map((t) => t.textContent)"
            )
            assert places[0].startswith("FW-EDGE-01"), places
            assert tab.js("document.querySelector('.flow-host').classList.contains('previewing')")
            _click(tab, go["left"] + 20, go["top"] + 10)
            _wait(tab, "document.querySelectorAll('.guide-layer .grid-place').length === 0")
            _wait(tab, f"{NOTE}.includes('mis en grille')")
            after = _positions(tab)
            xs = sorted({after[h]["x"] for h in hosts})
            ys = sorted({after[h]["y"] for h in hosts})
            assert len(xs) == 3 and len(ys) == 2, (xs, ys)
            assert after["fw-edge-01"]["x"] == xs[0] and after["fw-edge-01"]["y"] == ys[0], (
                "par nom : fw-edge-01 d'abord"
            )
            pins = _pins(base, auth)
            assert all(pins[h] == (after[h]["x"], after[h]["y"]) for h in hosts), "un paquet d'épingles sous le nom"

            # 7. Ctrl+Z rend les places ; Alt+G refait la grille ; Ctrl+Z encore
            _press(tab, "z", 90, CTRL)
            back = " && ".join(f"{_at(h)}.x === {before[h]['x']} && {_at(h)}.y === {before[h]['y']}" for h in hosts)
            _wait(tab, back)
            revision = tab.js(REVISION)
            _key(tab, "g", "KeyG", 71, ALT)
            _wait(tab, f"{REVISION} > {revision}")
            assert "mis en grille" in tab.js(NOTE)
            assert _positions(tab)["fw-edge-01"] == after["fw-edge-01"], "Alt+G : la même grille"
            _press(tab, "z", 90, CTRL)
            _wait(tab, back)

            # 8. Le menu contextuel d'une sélection le propose avec son raccourci
            tab.js(f"LDApp.debug.handle().toile.selectHosts({json.dumps(hosts)})")
            at = _center(tab, "sw-core-01")
            for kind in ("mousePressed", "mouseReleased"):
                tab.call(
                    "Input.dispatchMouseEvent",
                    {"type": kind, "x": at[0], "y": at[1], "button": "right", "buttons": 2, "clickCount": 1},
                )
            _wait(tab, "!!document.querySelector('.context-menu')")
            entry = tab.js(
                "(() => { const b = Array.from(document.querySelectorAll('.context-menu .context-item'))"
                ".find((b) => b.textContent.includes('mettre en grille')); return b ? b.textContent : null; })()"
            )
            assert entry and "Alt+G" in entry, entry
            _key(tab, "Escape", "Escape", 27)
            assert not tab.js("location.href").count("grid")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


def _at(host: str) -> str:
    return f"LDApp.debug.handle().toile.state.positions.get({json.dumps(host)})"


def _node(aid: str) -> str:
    return f"document.querySelector('.react-flow__node[data-id=\"annotation:{aid}\"]')"


def _ann(aid: str) -> str:
    return f"LDApp.debug.handle().toile.model.annotationById.get({json.dumps(aid)})"
