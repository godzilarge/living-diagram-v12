"""La mise en forme du texte (lot 4 bis de docs/11), dans un vrai navigateur : la taille libre (le volet « − n + », un
champ, la police), gras, italique, souligné et barré au clavier (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Maj+X, Ctrl+Maj+> et <) et à
la souris, la couleur du texte (encre, teinte de l'objet, une des douze), la position (alignements d'une note ; neuf
positions et dehors pour un groupe ; place et côté de l'étiquette d'un connecteur) ; une sélection mixte dit « — » et
change tout en une écriture, Ctrl+Z la défait. La fiche fait de même (parité). Les vrais italiques se chargent quand un
texte en porte. Aucune violation de la CSP."""

import json
import threading

import pytest

from tests.test_app import CTRL, READY, SHIFT, _intent_doc, _press
from tests.test_render import CHROMIUM

wait = threading.Event().wait
CSP_PROBE = (
    "window.__csp = 0; document.addEventListener('securitypolicyviolation', (e) => { window.__csp += 1;"
    " (window.__cspList = window.__cspList || []).push(e.violatedDirective + ' ' + e.blockedURI); });"
)
FBAR = ".fbar:not(.suspended):not(.offscreen)"
ITALIC_LOADED = "performance.getEntriesByType('resource').some((e) => /-latin-wght-italic/.test(e.name))"


def _doc(base: str, auth: dict) -> dict:
    return _intent_doc(base, auth)


def _annotation(base: str, auth: dict, ident: str) -> dict:
    return next(a for a in _doc(base, auth)["annotations"] if a["id"] == ident)


def _until(check, what: str) -> None:
    for _ in range(100):
        if check():
            return
        wait(0.05)
    raise AssertionError(f"jamais vrai : {what}")


def _seed(base: str, auth: dict) -> dict:
    import httpx

    ops = [
        {"op": "annotation_create", "content": {"kind": "note", "text": "Baie 12, rangée B"}, "x": -900, "y": 400, "w": 220, "h": 90},
        {"op": "annotation_create", "content": {"kind": "shape", "shape": "rectangle", "label": "Zone DMZ"}, "x": -600, "y": 400, "w": 200, "h": 90},
        {"op": "connector_create", "start": {"kind": "free", "x": -900, "y": 650}, "end": {"kind": "free", "x": -500, "y": 650}, "label": "10G"},
        {"op": "group_create", "label": "Cœurs", "members": ["sw-core-01"]},
    ]
    done = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "infra-lab"}, headers=auth, json={"author": "orhan", "ops": ops})
    assert done.status_code == 200, done.text
    doc = done.json()
    return {"note": doc["annotations"][0]["id"], "shape": doc["annotations"][1]["id"], "line": doc["connectors"][0]["id"], "group": doc["groups"][0]["id"]}


def _select(tab, kind: str, ident: str) -> None:
    from tests.test_view import _wait

    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: {json.dumps(kind)}, id: {json.dumps(ident)} }})")
    wait(0.5)
    tab.js(f"LDApp.debug.handle().toile.select({{ kind: {json.dumps(kind)}, id: {json.dumps(ident)} }})")
    _wait(tab, f"!!document.querySelector('{FBAR} .fb[data-id=text_size]')")


def _button(tab, ident: str) -> None:
    tab.js(f"document.querySelector('{FBAR} .fb[data-id={ident}]').click()")


def _volet(tab, ident: str, inside: str) -> None:
    """Ouvre le volet d'un bouton de la barre et clique un élément dedans."""
    from tests.test_view import _wait

    _button(tab, ident)
    _wait(tab, f"!!document.querySelector('.fvolet {inside}')")
    tab.js(f"document.querySelector('.fvolet {inside}').click()")


def _canvas_key(tab, key: str, code: int, modifiers: int) -> None:
    """Une touche sur la toile (hors d'un champ) : le focus rendu à l'application d'abord."""
    tab.js("document.querySelector('.app').focus()")
    _press(tab, key, code, modifiers)


def _free_size(tab, base: str, auth: dict, ids: dict) -> None:
    """La taille libre : le champ du volet (Entrée), puis « − » ; le bouton dit la valeur."""
    from tests.test_view import _wait

    note = ids["note"]
    _select(tab, "annotation", note)
    assert tab.js(f"document.querySelector('{FBAR} .fb[data-id=text_size] .fval').textContent") == "13"
    _button(tab, "text_size")
    _wait(tab, "!!document.querySelector('.fvolet .step-input')")
    tab.js("document.querySelector('.fvolet .step-input').focus()")
    tab.js("document.querySelector('.fvolet .step-input').select()")
    tab.call("Input.insertText", {"text": "22"})
    _press(tab, "Enter", 13)
    _until(lambda: _annotation(base, auth, note)["style"]["text_size"] == 22, "taille 22")
    _wait(tab, f"document.querySelector('{FBAR} .fb[data-id=text_size] .fval').textContent === '22'")
    _wait(tab, "!!document.querySelector('.fvolet .step')")
    tab.js("document.querySelector('.fvolet .step').click()")  # « − »
    _until(lambda: _annotation(base, auth, note)["style"]["text_size"] == 21, "taille 21")
    tab.js("Array.from(document.querySelectorAll('.fvolet .seg-item')).find((b) => b.textContent === 'JetBrains Mono').click()")
    _until(lambda: _annotation(base, auth, note)["style"]["text_font"] == "mono", "police mono")
    _press(tab, "Escape", 27)
    _canvas_key(tab, ">", 190, CTRL | SHIFT)
    _until(lambda: _annotation(base, auth, note)["style"]["text_size"] == 24, "Ctrl+Maj+> : le cran suivant de l'échelle")
    _canvas_key(tab, "<", 188, CTRL | SHIFT)
    _until(lambda: _annotation(base, auth, note)["style"]["text_size"] == 20, "Ctrl+Maj+< : le cran précédent")


def _decorations(tab, base: str, auth: dict, ids: dict) -> None:
    """Gras, italique, souligné, barré : au clavier, puis à la souris ; le dessin suit (attributs SVG), l'italique vrai se
    charge."""
    from tests.test_view import _wait

    note = ids["note"]
    _select(tab, "annotation", note)
    assert tab.js(ITALIC_LOADED) is False, "aucun texte en italique : le fichier n'est pas chargé"
    _canvas_key(tab, "b", 66, CTRL)
    _canvas_key(tab, "i", 73, CTRL)
    _canvas_key(tab, "u", 85, CTRL)
    _canvas_key(tab, "X", 88, CTRL | SHIFT)
    want = {"text_weight": "bold", "text_italic": True, "text_underline": True, "text_strike": True}
    _until(lambda: all(_annotation(base, auth, note)["style"][k] == v for k, v in want.items()), "les quatre au clavier")
    text = f"document.querySelector('.react-flow__node[data-id=\"annotation:{note}\"] .annotation-text')"
    _wait(tab, f"{text}.getAttribute('font-style') === 'italic' && {text}.getAttribute('text-decoration') === 'underline line-through'")
    assert tab.js(f"getComputedStyle({text}).fontWeight") == "750"
    _wait(tab, ITALIC_LOADED)
    _wait(tab, f"document.querySelector('{FBAR} .fb[data-id=italic]').getAttribute('aria-pressed') === 'true'")
    for ident in ("italic", "underline", "strike", "bold"):
        _button(tab, ident)
        _wait(tab, f"document.querySelector('{FBAR} .fb[data-id={ident}]').getAttribute('aria-pressed') === 'false'")
    style = _annotation(base, auth, note)["style"]
    assert (style["text_weight"], style["text_italic"], style["text_underline"], style["text_strike"]) == ("regular", False, False, False)


def _color_and_position(tab, base: str, auth: dict, ids: dict) -> None:
    """La couleur du texte (une teinte nommée, puis l'encre) et la position (centré, en bas) d'une note."""
    from tests.test_view import _wait

    note = ids["note"]
    _select(tab, "annotation", note)
    _volet(tab, "text_color", ".hue-swatch[aria-label=violet]")
    _until(lambda: _annotation(base, auth, note)["style"]["text_color"] == "violet", "texte violet")
    text = f"document.querySelector('.react-flow__node[data-id=\"annotation:{note}\"] .annotation-text')"
    _wait(tab, f"{text}.classList.contains('tc-violet')")
    _press(tab, "Escape", 27)
    _volet(tab, "text_color", ".seg-item[aria-label=encre]")
    _until(lambda: _annotation(base, auth, note)["style"]["text_color"] == "ink", "texte à l'encre")
    _press(tab, "Escape", 27)
    _volet(tab, "text_position", ".seg-item[aria-label=centre]")
    _until(lambda: _annotation(base, auth, note)["style"]["text_align"] == "center", "centré")
    tab.js("document.querySelector('.fvolet .seg-item[aria-label=bas]').click()")
    _until(lambda: _annotation(base, auth, note)["style"]["text_valign"] == "bottom", "en bas")
    _press(tab, "Escape", 27)


def _connector_and_group(tab, base: str, auth: dict, ids: dict) -> None:
    """L'étiquette d'un connecteur : à la fin du tracé, au-dessus ; celle d'un groupe : en bas à droite, dehors."""
    from tests.test_view import _wait

    line, group = ids["line"], ids["group"]
    _select(tab, "connector", line)
    box = f"document.querySelector('.react-flow__node[data-id=\"connector:{line}\"] .connector-label-box')"
    before = tab.js(f"JSON.parse(JSON.stringify({box}.getBoundingClientRect()))")
    _volet(tab, "text_position", ".seg-item[aria-label=fin]")
    _until(lambda: next(c for c in _doc(base, auth)["connectors"] if c["id"] == line)["style"]["label_at"] == 90, "à 90 %")
    tab.js("document.querySelector('.fvolet .seg-item[aria-label=\"au-dessus\"]').click()")
    _until(lambda: next(c for c in _doc(base, auth)["connectors"] if c["id"] == line)["style"]["label_side"] == "above", "au-dessus")
    _press(tab, "Escape", 27)
    wait(0.3)
    after = tab.js(f"JSON.parse(JSON.stringify({box}.getBoundingClientRect()))")
    assert after["x"] > before["x"] + 50 and after["y"] + after["height"] < before["y"] + before["height"] / 2 + 2, (before, after)
    _select(tab, "group", group)
    _volet(tab, "text_position", ".pos9-cell[aria-label=\"bas droite\"]")
    _until(lambda: _doc(base, auth)["groups"][0]["style"]["label_position"] == "bottom_right", "en bas à droite")
    tab.js("document.querySelector('.fvolet .seg-item[aria-label=\"hors du cadre\"]').click()")
    _until(lambda: _doc(base, auth)["groups"][0]["style"]["label_placement"] == "outside", "dehors")
    _press(tab, "Escape", 27)
    _canvas_key(tab, "i", 73, CTRL)
    _until(lambda: _doc(base, auth)["groups"][0]["style"]["label_italic"] is True, "étiquette du groupe en italique")
    _wait(tab, f"document.querySelector('.react-flow__node[data-id=\"group:{group}\"] .frame-label').getAttribute('font-style') === 'italic'")


def _mixed(tab, base: str, auth: dict, ids: dict) -> None:
    """Une note (20, mono) et une forme (12) : « — » sur la taille, un état mixte ; Ctrl+B met les deux en gras en une
    écriture ; Ctrl+Z les rend telles qu'avant."""
    from tests.test_view import _wait

    note, shape = ids["note"], ids["shape"]
    _select(tab, "annotation", note)  # la sélection en vue (la barre se pose contre elle)
    tab.js(f"LDApp.debug.handle().toile.selectItems([{{ kind: 'annotation', id: {json.dumps(note)} }}, {{ kind: 'annotation', id: {json.dumps(shape)} }}])")
    _wait(tab, f"!!document.querySelector('{FBAR} .fb[data-id=align]')")
    assert tab.js(f"document.querySelector('{FBAR} .fb[data-id=text_size] .fval').textContent") == "—"
    weights = (_annotation(base, auth, note)["style"]["text_weight"], _annotation(base, auth, shape)["style"]["text_weight"])
    assert weights == ("regular", "semibold"), weights
    revision = _doc(base, auth)["revision"]
    _canvas_key(tab, "b", 66, CTRL)
    _until(lambda: _annotation(base, auth, shape)["style"]["text_weight"] == "bold", "les deux en gras")
    assert _annotation(base, auth, note)["style"]["text_weight"] == "bold" and _doc(base, auth)["revision"] == revision + 1, "une écriture"
    _wait(tab, f"document.querySelector('{FBAR} .fb[data-id=bold]').getAttribute('aria-pressed') === 'true'")
    _canvas_key(tab, "z", 90, CTRL)
    _until(lambda: _annotation(base, auth, shape)["style"]["text_weight"] == "semibold", "Ctrl+Z")
    assert _annotation(base, auth, note)["style"]["text_weight"] == "regular"
    _wait(tab, f"document.querySelector('{FBAR} .fb[data-id=bold]').getAttribute('aria-pressed') === 'false'")
    _canvas_key(tab, "u", 85, CTRL)  # un seul souligné : l'état devient mixte une fois l'un défait
    _until(lambda: _annotation(base, auth, note)["style"]["text_underline"] is True, "les deux soulignés")
    tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(note)} }})")
    _wait(tab, f"!!document.querySelector('.fbar[aria-label=\"actions rapides : note\"]:not(.suspended):not(.offscreen) .fb[data-id=underline]')")
    _button(tab, "underline")
    _until(lambda: _annotation(base, auth, note)["style"]["text_underline"] is False, "la note seule")
    tab.js(f"LDApp.debug.handle().toile.selectItems([{{ kind: 'annotation', id: {json.dumps(note)} }}, {{ kind: 'annotation', id: {json.dumps(shape)} }}])")
    _wait(tab, f"document.querySelector('{FBAR} .fb[data-id=underline]').getAttribute('aria-pressed') === 'mixed'")


def _panel_parity(tab, base: str, auth: dict, ids: dict) -> None:
    """La fiche : la même section du texte (parité) ; l'interligne d'une note s'y règle."""
    from tests.test_view import _wait

    note = ids["note"]
    _select(tab, "annotation", note)
    _wait(tab, "!!document.querySelector('.panel')")
    tab.js("Array.from(document.querySelectorAll('.panel .insp-section-toggle')).find((b) => /Texte/.test(b.textContent)).click()")
    field = "document.querySelector('.panel input[aria-label=interligne]')"
    _wait(tab, f"!!{field}")
    tab.js(f"{field}.focus()")
    tab.js(f"{field}.select()")
    tab.call("Input.insertText", {"text": "180"})
    _press(tab, "Enter", 13)
    _until(lambda: _annotation(base, auth, note)["style"]["text_line_height"] == 180, "interligne 180")
    tab.js("document.querySelector('.panel .ibtn[aria-label^=italique]').click()")
    _until(lambda: _annotation(base, auth, note)["style"]["text_italic"] is True, "italique depuis la fiche")


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_formatting_text_in_a_browser(settings, bundle_dict):
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        ids = _seed(base, auth)
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open("about:blank")
            tab.call("Page.addScriptToEvaluateOnNewDocument", {"source": CSP_PROBE})
            tab.navigate(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, READY)
            _free_size(tab, base, auth, ids)
            _decorations(tab, base, auth, ids)
            _color_and_position(tab, base, auth, ids)
            _connector_and_group(tab, base, auth, ids)
            _mixed(tab, base, auth, ids)
            _panel_parity(tab, base, auth, ids)
            assert tab.js("window.__csp") == 0, tab.js("window.__cspList")
            errors = [c for c in chrome.console if c.get("level") == "error" or (c.get("entry") or {}).get("level") == "error"]
            assert not errors, errors[:3]
    finally:
        server.should_exit = True
        thread.join(timeout=5)
