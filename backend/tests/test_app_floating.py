"""L'application dans un vrai navigateur : la barre contextuelle flottante (lot 4 de docs/11).

Les réglages fréquents de l'élément sélectionné, à un clic, au-dessus de lui. Présente sur une note, sans la recouvrir ;
cachée pendant son glissé, revenue après ; une teinte posée par la barre s'écrit (et un Ctrl+Z la défait) ; l'alignement
d'une sélection mixte depuis la barre (plus d'alignements en haut, D10), son volet ne recouvre pas la sélection ; ancrée
au milieu d'un connecteur ; Alt+T puis ← → puis Échap ; Ctrl + . la masque (préférence rangée, tenue au rechargement,
case d'Affichage en accord), Alt+T la rappelle ; Maj tenue la cache ; absente en Contrôle et sans nom."""

import json
import threading

import pytest

from tests.test_app import CTRL, FBAR_SHOWN, NOTE, READY, _fbar, _intent_doc, _press
from tests.test_render import CHROMIUM

ALT = 1
BAR = "document.querySelector('.fbar')"
BAR_RECT = "JSON.parse(JSON.stringify(document.querySelector('.fbar-body').getBoundingClientRect()))"
NODE_RECT = (
    "JSON.parse(JSON.stringify(document.querySelector('.react-flow__node[data-id=\"{0}\"]').getBoundingClientRect()))"
)
FOCUSED = "document.activeElement && document.activeElement.getAttribute('aria-label')"
SHIFT_KEY = {"key": "Shift", "code": "ShiftLeft", "windowsVirtualKeyCode": 16}


def _key(tab, key: str, code: str, vk: int, modifiers: int = 0) -> None:
    """Une touche, avec sa place sur le clavier (`code`) : Alt+T et Ctrl + . se lisent par elle aussi."""
    event = {"key": key, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def _overlap(a: dict, b: dict) -> float:
    w = min(a["right"], b["right"]) - max(a["left"], b["left"])
    h = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
    return max(0, w) * max(0, h)


def _note(base: str, auth: dict, nid: str) -> dict:
    return next(a for a in _intent_doc(base, auth)["annotations"] if a["id"] == nid)


def _seed(base: str, auth: dict, core: dict, left: float) -> tuple[str, str]:
    """Une note seule, loin à gauche du parc (rien au-dessus d'elle), et un connecteur de la note à un point libre."""
    import httpx

    note = {
        "op": "annotation_create",
        "content": {"kind": "note", "text": "Baie 12"},
        "x": left,
        "y": core["y"] - 40,
        "w": 200,
        "h": 80,
    }
    params = {"infrastructure": "infra-lab"}
    patches = f"{base}/api/intent/patches"
    done = httpx.post(patches, params=params, headers=auth, json={"author": "orhan", "ops": [note]})
    assert done.status_code == 200, done.text
    line = {
        "op": "connector_create",
        "start": {"kind": "annotation", "ref": "a1-1", "side": "auto"},
        "end": {"kind": "free", "x": left + 100, "y": core["y"] + 260},
    }
    done = httpx.post(patches, params=params, headers=auth, json={"author": "orhan", "ops": [line]})
    assert done.status_code == 200, done.text
    return "a1-1", "c2-1"


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_floating_bar_in_a_browser(settings, bundle_dict):
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_app_selection import _mode
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
            core = tab.js("LDApp.debug.handle().toile.state.positions.get('sw-core-01')")
            xs = tab.js("Array.from(LDApp.debug.handle().toile.state.positions.values()).map((p) => p.x)")
            nid, cid = _seed(base, auth, core, min(xs) - 700)
            tab.navigate(url)
            _wait(tab, READY)
            note = f"annotation:{nid}"
            # posée hors champ : la toile la dessine (sa boîte est connue) ; React Flow ne la monte qu'une fois en vue
            # (lot 13 de docs/11, `onlyRenderVisibleElements`), ce que fait la ligne suivante
            _wait(tab, f"LDApp.debug.handle().toile.frames.has({json.dumps(nid)})")

            # une note sélectionnée : la barre au-dessus, centrée, sans la recouvrir ; un toolbar nommé
            tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: {json.dumps(nid)} }})")
            _wait(tab, FBAR_SHOWN)
            threading.Event().wait(0.5)  # la vue a fini de glisser vers la note
            box, bar = tab.js(NODE_RECT.format(note)), tab.js(BAR_RECT)
            assert tab.js(f"{BAR}.getAttribute('role')") == "toolbar"
            assert tab.js(f"{BAR}.getAttribute('aria-label')") == "actions rapides : note"
            assert not tab.js(f"{BAR}.classList.contains('below')"), "rien au-dessus de la note : la barre y est"
            assert bar["bottom"] <= box["top"] - 6, (bar, box)
            assert abs((bar["left"] + bar["right"]) / 2 - (box["left"] + box["right"]) / 2) < 2, "centrée sur la note"
            labels = tab.js("Array.from(document.querySelectorAll('.fbar .fb')).map((b) => b.ariaLabel)")
            assert labels[0].startswith("teinte : "), "le bouton teinte dit sa valeur"
            assert labels[1:] == [
                "taille du texte : moyen",
                "gras",
                "alignement du texte : à gauche",
                "plan",
                "verrouiller",
                "dupliquer",
                "supprimer",
            ], labels

            # un glissé de la note : la barre se cache dès qu'il commence, revient après la relâche
            cx, cy = (box["left"] + box["right"]) / 2, (box["top"] + box["bottom"]) / 2
            tab.mouse_move(cx, cy)
            tab.mouse_press(cx, cy)
            for step in range(1, 7):
                tab.mouse_move(cx + 10 * step, cy + 6 * step, pressed=True)
            _wait(tab, f"{BAR}.classList.contains('suspended')")
            tab.mouse_release(cx + 60, cy + 36)
            _wait(tab, FBAR_SHOWN)
            _wait(tab, f"/annotation modifiée \\(orhan\\)/.test({NOTE})")

            # la teinte par la barre : un volet (qui ne recouvre pas la note), le document l'écrit, Ctrl+Z la défait
            before = _note(base, auth, nid)["style"]["hue"]
            _fbar(tab, "hue")
            _wait(tab, "!!document.querySelector('.fvolet .hue-swatch')")
            volet = tab.js("JSON.parse(JSON.stringify(document.querySelector('.fvolet').getBoundingClientRect()))")
            assert _overlap(volet, tab.js(NODE_RECT.format(note))) == 0, "le volet ne masque pas l'objet"
            expanded = "document.querySelector('.fbar .fb[data-id=\"hue\"]').getAttribute('aria-expanded')"
            assert tab.js(expanded) == "true"
            tab.js("document.querySelector('.fvolet .hue-swatch[aria-label=\"violet\"]').click()")
            hue = f"LDApp.debug.handle().toile.model.annotationById.get('{nid}').style.hue"
            _wait(tab, f"{hue} === 'violet'")
            assert _note(base, auth, nid)["style"]["hue"] == "violet"
            _press(tab, "Escape", 27)  # le volet se ferme, la barre et la sélection restent
            _wait(tab, f"!document.querySelector('.fvolet') && {FBAR_SHOWN}")
            assert tab.js("LDApp.debug.state().selection.id") == nid
            tab.js("document.querySelector('.app').focus()")
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"{hue} === {json.dumps(before)}")
            assert _note(base, auth, nid)["style"]["hue"] == before

            # un connecteur seul : la barre s'ancre au milieu de son tracé, l'ergot le pointe ; ce tracé descend de la
            # note (presque vertical) : la barre se pose à côté, sans jamais le couvrir
            tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'connector', id: {json.dumps(cid)} }})")
            _wait(tab, f"{FBAR_SHOWN} && {BAR}.getAttribute('aria-label') === 'actions rapides : connecteur'")
            threading.Event().wait(0.5)
            mid = tab.js(
                f"(() => {{ const t = LDApp.debug.handle().toile, e = t.ends.get('{cid}'), v = t.viewport(),"
                " m = e.mid || { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 },"
                " r = document.querySelector('.flow-host').getBoundingClientRect();"
                " return [r.left + v.x + m.x * v.zoom, r.top + v.y + m.y * v.zoom]; })()"
            )
            assert tab.js(f"{BAR}.classList.contains('left') || {BAR}.classList.contains('right')"), "à côté du tracé"
            caret = tab.js("JSON.parse(JSON.stringify(document.querySelector('.fbar-caret').getBoundingClientRect()))")
            assert abs((caret["top"] + caret["bottom"]) / 2 - mid[1]) < 3, (caret, mid)
            line = f"document.querySelector('.react-flow__node[data-id=\"connector:{cid}\"] path.connector-line')"
            # les points du tracé, à l'écran : aucun dans la barre
            points = tab.js(
                f"(() => {{ const p = {line}, m = p.getScreenCTM(), n = p.getTotalLength();"
                " return Array.from({ length: 41 }, (_, i) => { const q = p.getPointAtLength(n * i / 40);"
                " const s = new DOMPoint(q.x, q.y).matrixTransform(m); return [s.x, s.y]; }); })()"
            )
            bar = tab.js(BAR_RECT)
            inside = [q for q in points if bar["left"] <= q[0] <= bar["right"] and bar["top"] <= q[1] <= bar["bottom"]]
            assert not inside, ("la barre ne couvre pas le tracé", inside, bar)

            # une sélection mixte : les alignements ne sont plus en haut (D10) ; la barre les ouvre, son volet ne
            # recouvre pas la sélection ; « aligner en haut » met la note au bord haut du cœur
            items = [{"kind": "node", "id": "sw-core-01"}, {"kind": "annotation", "id": nid}]
            tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps(items)})")
            tab.js("LDApp.debug.handle().toile.frame()")
            _wait(tab, f"{FBAR_SHOWN} && {BAR}.getAttribute('aria-label') === 'actions rapides : 2 éléments'")
            threading.Event().wait(0.5)
            toolbar = "Array.from(document.querySelectorAll('.toolbar button')).map((b) => b.ariaLabel).join('|')"
            assert "aligner" not in tab.js(toolbar) and "répartir" not in tab.js(toolbar)
            assert tab.js("Array.from(document.querySelectorAll('.fbar .fb')).map((b) => b.dataset.id)") == [
                "align",
                "group",
                "hue",
                "duplicate",
                "delete",
                "lock",
            ]
            _fbar(tab, "align")
            _wait(tab, "!!document.querySelector('.fvolet [aria-label=\"aligner en haut\"]')")
            volet = tab.js("JSON.parse(JSON.stringify(document.querySelector('.fvolet').getBoundingClientRect()))")
            for picked in (note, "sw-core-01"):
                assert _overlap(volet, tab.js(NODE_RECT.format(picked))) == 0, f"le volet ne recouvre pas {picked}"
            assert not tab.js("!!document.querySelector('.fvolet [aria-label=\"répartir horizontalement\"]')")
            tab.js("document.querySelector('.fvolet [aria-label=\"aligner en haut\"]').click()")
            _wait(tab, f"/aligné, enregistré \\(orhan\\)/.test({NOTE})")
            top = tab.js("LDApp.debug.handle().toile.state.positions.get('sw-core-01').y") - 40
            assert _note(base, auth, nid)["y"] == top
            # le raccourci : Alt + D aligne à droite (le bord droit de la note sur celui du cœur), sans ouvrir de volet
            _press(tab, "Escape", 27)
            _wait(tab, f"!document.querySelector('.fvolet') && {FBAR_SHOWN}")
            assert tab.js("LDApp.debug.state().picked.annotations.length") == 1, "Échap ferme le volet seul"
            right = tab.js(
                "(() => { const t = LDApp.debug.handle().toile; return t.state.positions.get('sw-core-01').x"
                " + t.boxes.get('sw-core-01').w / 2; })()"
            )
            note_x = f"LDApp.debug.handle().toile.model.annotationById.get('{nid}').x"
            assert tab.js(f"{note_x} + 200") != right, "pas encore alignée à droite"
            _key(tab, "d", "KeyD", 68, ALT)
            _wait(tab, f"{note_x} + 200 === {right}")
            assert _note(base, auth, nid)["x"] + 200 == right
            # la teinte d'une sélection mixte : tout ce qui en a une (le cœur et la note), une écriture, un Ctrl+Z
            revision = _intent_doc(base, auth)["revision"]
            _fbar(tab, "hue")
            _wait(tab, "!!document.querySelector('.fvolet .hue-swatch[aria-label=\"turquoise\"]')")
            tab.js("document.querySelector('.fvolet .hue-swatch[aria-label=\"turquoise\"]').click()")
            _wait(tab, f"/teinte turquoise sur 2 éléments \\(orhan\\)/.test({NOTE})")
            doc = _intent_doc(base, auth)
            assert doc["revision"] == revision + 1, "une seule écriture"
            assert ("sw-core-01", "teal") in {(c["hostname"], c["hue"]) for c in doc["device_colors"]}
            assert _note(base, auth, nid)["style"]["hue"] == "teal"
            _press(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.fvolet')")
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"/annulé/.test({NOTE})")
            _wait(tab, f"LDApp.debug.handle().toile.model.annotationById.get('{nid}').style.hue !== 'teal'")
            assert "sw-core-01" not in {c["hostname"] for c in _intent_doc(base, auth)["device_colors"]}

            # le clavier : Alt+T donne la barre, → passe au suivant, Échap rend la toile (la sélection reste)
            tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(nid)} }})")
            _wait(tab, f"{FBAR_SHOWN} && {BAR}.getAttribute('aria-label') === 'actions rapides : note'")
            tab.js("document.querySelector('.app').focus()")
            _key(tab, "t", "KeyT", 84, ALT)
            _wait(tab, f"/^teinte : /.test({FOCUSED})")
            _key(tab, "ArrowRight", "ArrowRight", 39)
            _wait(tab, f"{FOCUSED} === 'taille du texte : moyen'")
            _key(tab, "ArrowLeft", "ArrowLeft", 37)
            _wait(tab, f"/^teinte : /.test({FOCUSED})")
            _key(tab, "ArrowDown", "ArrowDown", 40)  # ↓ ouvre le volet, le focus y entre
            _wait(tab, "!!document.querySelector('.fvolet')?.contains(document.activeElement)")
            _key(tab, "Escape", "Escape", 27)  # Échap ferme le volet, le focus revient au bouton
            _wait(tab, f"!document.querySelector('.fvolet') && /^teinte : /.test({FOCUSED})")
            _key(tab, "Escape", "Escape", 27)  # puis rend la toile
            _wait(tab, "!document.activeElement.closest('.fbar')")
            assert tab.js("LDApp.debug.state().selection.id") == nid, "Échap dans la barre ne vide pas la sélection"

            # Maj tenue : la barre s'efface (pour viser un Maj + clic), revient à la relâche
            tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **SHIFT_KEY, "modifiers": 8})
            _wait(tab, f"{BAR}.classList.contains('suspended')")
            tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **SHIFT_KEY})
            _wait(tab, FBAR_SHOWN)

            # Ctrl + . : masquée, la ligne d'état le dit, la préférence est rangée (jamais dans l'adresse)
            _key(tab, ".", "Period", 190, CTRL)
            hidden = "/barre contextuelle masquée · Ctrl\\+\\. pour la rétablir, Alt\\+T pour la rappeler ici/"
            _wait(tab, f"!{BAR} && {hidden}.test({NOTE})")
            assert json.loads(tab.js("localStorage.getItem('ld-prefs')"))["fbar"] is False
            assert "fbar" not in tab.js("location.href")
            tab.navigate(url + f"#annotation={nid}")
            _wait(tab, READY)
            _wait(tab, f"LDApp.debug.state().selection && LDApp.debug.state().selection.id === '{nid}'")
            threading.Event().wait(0.6)
            assert not tab.js(f"!!{BAR}"), "tenue au rechargement"
            # la case du panneau Affichage dit la même chose
            tab.js("document.querySelector('.display-toggle').click()")
            switch = (
                "Array.from(document.querySelectorAll('.display .layer'))"
                ".find((b) => /barre contextuelle/.test(b.textContent))"
            )
            _wait(tab, f"!!({switch})")
            assert tab.js(f"({switch}).getAttribute('aria-checked')") == "false"
            _press(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.display')")
            # Alt+T la rappelle pour la sélection en cours, sans changer la préférence ; une autre sélection la renvoie
            tab.js("document.querySelector('.app').focus()")
            _key(tab, "t", "KeyT", 84, ALT)
            _wait(tab, f"{FBAR_SHOWN} && /^teinte : /.test({FOCUSED})")
            assert json.loads(tab.js("localStorage.getItem('ld-prefs')"))["fbar"] is False
            tab.js("LDApp.debug.handle().toile.reveal({ kind: 'node', id: 'sw-core-01' })")
            _wait(tab, f"!{BAR}")
            # la case la rétablit : la barre revient sur l'équipement sélectionné
            tab.js("document.querySelector('.display-toggle').click()")
            _wait(tab, f"!!({switch})")
            tab.js(f"({switch}).click()")
            _wait(tab, f"({switch}).getAttribute('aria-checked') === 'true'")
            _press(tab, "Escape", 27)
            _wait(tab, f"{FBAR_SHOWN} && {BAR}.getAttribute('aria-label') === 'actions rapides : sw-core-01'")
            assert json.loads(tab.js("localStorage.getItem('ld-prefs')"))["fbar"] is True
            # et Ctrl + . aussi, dans l'autre sens : la ligne d'état le dit
            _key(tab, ".", "Period", 190, CTRL)
            _wait(tab, f"!{BAR}")
            _key(tab, ".", "Period", 190, CTRL)
            _wait(tab, f"{FBAR_SHOWN} && /barre contextuelle affichée · Ctrl\\+\\. pour la masquer/.test({NOTE})")

            # en Contrôle : aucune barre (la vue se lit)
            _mode(tab, "Contrôle")
            _wait(tab, "LDApp.debug.state().view.mode === 'control'")
            threading.Event().wait(0.4)
            assert tab.js("LDApp.debug.state().selection.id") == "sw-core-01"
            assert not tab.js(f"!!{BAR}"), "en Contrôle, pas de barre"
            _mode(tab, "Diagramme")
            _wait(tab, f"LDApp.debug.state().view.mode === 'diagram' && {FBAR_SHOWN}")

            # sans nom (lecture seule) : aucune barre
            tab.js("localStorage.removeItem('ld-author')")
            tab.navigate(url + f"#annotation={nid}")
            _wait(tab, READY)
            _wait(tab, f"LDApp.debug.state().selection && LDApp.debug.state().selection.id === '{nid}'")
            threading.Event().wait(0.6)
            assert not tab.js(f"!!{BAR}"), "sans nom, pas de barre"
            errors = [c for c in chrome.console if c.get("level") == "error"]
            assert not errors, errors
    finally:
        server.should_exit = True
        thread.join(timeout=5)
