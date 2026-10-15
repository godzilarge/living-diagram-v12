"""L'écriture d'un bloc de code dans CodeMirror (lot 16 bis de docs/11), dans un vrai navigateur.

Aucun saut entre la lecture (SVG) et l'écriture (CodeMirror) : le premier caractère de chaque rangée lue est au même
pixel dans l'éditeur, à deux zooms, retour à la ligne compris ; les rangées de CodeMirror sont celles de la règle
(wrap.ts) sur des lignes et des largeurs variées. Ctrl+Z / Ctrl+Y défont le texte, jamais le diagramme. Ctrl+F et Ctrl+H
cherchent et remplacent dans la barre (une seule barre : bloc, écriture, recherche) ; Échap ferme la recherche, puis
enregistre et sort. Ctrl + molette change la taille (une écriture après la rafale), sans zoomer la toile. Le retour à
la ligne se bascule depuis la barre. Abandonner demande deux clics s'il y a des modifications. Une valeur sensible est
marquée en direct, l'avertissement s'ouvre avant l'enregistrement. Aucune violation de la CSP. Textes factices."""

import json
import threading

import pytest

from tests.test_app import CTRL, NOTE, READY, SHIFT, _intent_doc, _press
from tests.test_render import CHROMIUM

wait = threading.Event().wait
CISCO = "\n".join(
    [
        "hostname dc01-acc-07",
        "!",
        "interface GigabitEthernet1/0/24",
        " description C1|dc01-core-01|Ethernet1/21|uplink vers le coeur, chemin principal du site nord-est",
        " switchport trunk allowed vlan 10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200",
        " switchport mode trunk",
        "!",
        "vlan 20",
        " name voix-et-video-des-batiments-administratifs-avec-un-nom-tres-long-sans-espace-du-tout",
        "!",
        "end",
    ]
)
BLOCK = "document.querySelector('.react-flow__node[data-id=\"annotation:{0}\"] svg.annotation')"
EDITING = "!!document.querySelector('.code-cm .cm-content') && document.activeElement && !!document.activeElement.closest('.code-cm')"
CM = "LDApp.debug.editor()"
TEXT = f"{CM}.state.doc.toString()"
WBAR = ".fbar.writing:not(.offscreen)"
# La CSP de l'application : une violation se compte avant tout chargement de la page.
CSP_PROBE = (
    "window.__csp = 0; document.addEventListener('securitypolicyviolation', (e) => { window.__csp += 1;"
    " (window.__cspList = window.__cspList || []).push(e.violatedDirective + ' ' + e.blockedURI); });"
)
# Lecture : le premier caractère de chaque rangée dessinée, en pixels d'écran ; écriture : le même caractère dans CodeMirror.
JS_ROWS = """
((block) => Array.from(block.querySelectorAll('.code-text text')).filter((t) => t.getNumberOfChars() > 0).map((t) => {
  const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT), node = w.nextNode(), r = document.createRange();
  r.setStart(node, 0); r.setEnd(node, 1);
  const b = r.getClientRects()[0] || r.getBoundingClientRect();
  return { line: +t.dataset.line, from: +t.dataset.from, x: b.left, y: b.top };
}))
"""
JS_CM_AT = """
((pairs) => {
  const view = LDApp.debug.editor(), doc = view.state.doc;
  return pairs.map(([line, from]) => {
    const pos = doc.line(line + 1).from + from, d = view.domAtPos(pos), r = document.createRange();
    let node = d.node, off = d.offset;
    if (node.nodeType !== 3) { const w = document.createTreeWalker(node.childNodes[off] || node, NodeFilter.SHOW_TEXT); node = w.nextNode(); off = 0; }
    if (!node) return null;
    r.setStart(node, off); r.setEnd(node, Math.min(off + 1, node.length));
    const b = r.getClientRects()[0] || r.getBoundingClientRect();
    return { x: b.left, y: b.top };
  });
})
"""
# Les rangées de CodeMirror relevées au DOM : pour chaque ligne rendue, les colonnes où une rangée commence.
JS_CM_ROWS = """
(() => {
  const view = LDApp.debug.editor(), doc = view.state.doc, out = {};
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n), starts = [0];
    let top = null, seen = true;
    for (let c = 0; c < line.length; c++) {
      const r = view.coordsAtPos(line.from + c, 1);
      if (!r) { seen = false; break; }
      if (top !== null && r.top > top + 2) starts.push(c);
      top = r.top;
    }
    if (seen) out[n - 1] = starts;
  }
  return out;
})()
"""


def _codes(base: str, auth: dict) -> list[dict]:
    return [a for a in _intent_doc(base, auth)["annotations"] if a["content"]["kind"] == "code"]


def _code(base: str, auth: dict, ident: str) -> dict:
    return next(a for a in _codes(base, auth) if a["id"] == ident)


def _until(check, what: str) -> None:
    for _ in range(100):
        if check():
            return
        wait(0.05)
    raise AssertionError(f"jamais vrai : {what}")


def _seed(base: str, auth: dict, text: str, w: int, h: int, x: int, size: int = 13, wrap: bool = True) -> str:
    import httpx

    content = {"kind": "code", "text": text, "language": "cisco_ios", "title": "acc-07"}
    content |= {"highlight": True, "line_numbers": True, "font": "jetbrains_mono", "wrap": wrap}
    op = {"op": "annotation_create", "x": x, "y": 700, "w": w, "h": h, "content": content, "style": {"text_size": size}}
    done = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "infra-lab"}, headers=auth,
                      json={"author": "orhan", "ops": [op]})
    assert done.status_code == 200, done.text
    return done.json()["annotations"][-1]["id"]


def _center(tab, expression: str) -> tuple[float, float]:
    box = tab.js(f"JSON.parse(JSON.stringify({expression}.getBoundingClientRect()))")
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def _dblclick(tab, x: float, y: float) -> None:
    tab.mouse_move(x, y)
    for count in (1, 2):
        for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
            event = {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": count}
            tab.call("Input.dispatchMouseEvent", event)


def _reveal(tab, ident: str, zoom: float | None = None) -> None:
    """Le bloc en vue, au zoom donné."""
    from tests.test_view import _wait

    if zoom is not None:
        tab.js(f"(() => {{ const t = LDApp.debug.handle().toile, v = t.viewport(); t.restoreView({{ ...v, zoom: {zoom} }}); }})()")
        wait(0.3)
    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    wait(0.6)
    _wait(tab, f"!!{BLOCK.format(ident)}")


def _open(tab, ident: str) -> None:
    """L'écriture ouverte par un double-clic sur le code (le bloc déjà en vue)."""
    from tests.test_view import _wait

    x, y = _center(tab, f"{BLOCK.format(ident)}.querySelector('.code-body')")
    _dblclick(tab, x, y)
    _wait(tab, EDITING)
    wait(0.4)


def _no_jump(tab, ident: str, zoom: float | None = None) -> dict:
    """Lecture puis écriture : chaque rangée lue commence au même pixel dans CodeMirror."""
    _reveal(tab, ident, zoom)
    rows = tab.js(f"({JS_ROWS})({BLOCK.format(ident)})")
    assert len(rows) >= 6, rows
    _open(tab, ident)
    cm = tab.js(f"({JS_CM_AT})({json.dumps([[r['line'], r['from']] for r in rows])})")
    dx = max(abs(a["x"] - b["x"]) for a, b in zip(rows, cm, strict=True) if b)
    dy = max(abs(a["y"] - b["y"]) for a, b in zip(rows, cm, strict=True) if b)
    return {"rows": len(rows), "dx": round(dx, 3), "dy": round(dy, 3)}


def _long(lines: int) -> str:
    out = ["hostname dc01-acc-01", "!"]
    port = 1
    while len(out) < lines:
        out += [f"interface GigabitEthernet1/0/{port}", f" description C1|dc01-core-0{port % 2 + 1}|Ethernet1/{port}|liaison d'acces du bureau {port}", "!"]
        port += 1
    return "\n".join(out[:lines])


def _scrolled_no_jump(tab, base: str, auth: dict, zoom: float) -> dict:
    """Un bloc qui défile, lu plus bas (la molette sur le bloc sélectionné) : l'écriture s'ouvre là, sans saut ; enregistrée
    sans rien changer (Échap), la lecture reprend à la même rangée."""
    from tests.test_view import _wait

    ident = _seed(base, auth, _long(120), 460, 420, -2400 - int(zoom * 1000))
    tab.navigate(f"{base}/?infrastructure=infra-lab")
    _wait(tab, READY)
    _reveal(tab, ident, zoom)
    tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    wait(0.4)
    x, y = _center(tab, f"{BLOCK.format(ident)}.querySelector('.code-body')")
    for _ in range(6):
        tab.call("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": 100})
    first = f"{BLOCK.format(ident)}.querySelector('.code-text text').dataset.line"
    _wait(tab, f"Number({first}) > 10")
    reading = tab.js(f"Number({first})")
    rows = tab.js(f"({JS_ROWS})({BLOCK.format(ident)})")
    _open(tab, ident)
    cm = tab.js(f"({JS_CM_AT})({json.dumps([[r['line'], r['from']] for r in rows])})")
    dx = max(abs(a["x"] - b["x"]) for a, b in zip(rows, cm, strict=True) if b)
    dy = max(abs(a["y"] - b["y"]) for a, b in zip(rows, cm, strict=True) if b)
    _close(tab)
    _wait(tab, f"Number({first}) === {reading}")
    return {"reading": reading, "dx": round(dx, 3), "dy": round(dy, 3)}


def _close(tab) -> None:
    """Échap : enregistre et sort (rien n'a changé : rien ne s'écrit)."""
    from tests.test_view import _wait

    _press(tab, "Escape", 27)
    _wait(tab, "!document.querySelector('.code-cm')")
    wait(0.2)


WORDS = ["interface", "GigabitEthernet1/0/24", "description", "C1|dc01-core-01|Ethernet1/21|", "vlan", "10,20,30", "a-b-c",
         "x/y/z", "(test)", "10.0.10.40", "aes256-sha256", "set", "kQ9vX3mZp0Lr7TnW2xYk4sJ6uE1oI9aC3dF5gH7jK0lM2nB8", "é", "cœur",
         "--long-option=valeur", "a", "bb", "http://exemple.net/chemin/vers/une/ressource?x=1&y=2", "=>", "!=", "{", "}"]


def _fuzz_text(seed: int, lines: int) -> str:
    import random

    rnd = random.Random(seed)
    out = []
    for _ in range(lines):
        indent = " " * rnd.choice([0, 0, 1, 2, 4, 8])
        parts = [rnd.choice(WORDS) for _ in range(rnd.randint(1, 18))]
        out.append(indent + "".join(p + rnd.choice([" ", " ", "  "]) for p in parts).rstrip())
    return "\n".join(out)


def _rule_rows(tab, ident: str) -> dict:
    """Les rangées que la règle (wrap.ts) donne au bloc, par ligne : les colonnes où une rangée commence."""
    script = (
        f"(() => {{ const a = LDApp.debug.handle().toile.model.annotationById.get({json.dumps(ident)}), c = a.content;"
        " const l = LDApp.code.layout({ w: a.w, h: a.h, size: a.style.text_size, font: c.font, numbers: c.line_numbers,"
        " text: c.text, wrap: c.wrap }); const by = {}; for (const r of l.rows) (by[r.line] = by[r.line] || []).push(r.from);"
        " return by; })()"
    )
    return tab.js(script)


def _wrap_rule(tab, base: str, auth: dict) -> int:
    """Les rangées de CodeMirror sont celles de la règle : des lignes tirées au hasard, trois largeurs, deux tailles."""
    compared = 0
    for seed, w, size in ((7, 360, 13), (8, 520, 13), (9, 760, 11), (10, 300, 18)):
        ident = _seed(base, auth, _fuzz_text(seed, 40), w, 2400, 2000 + seed * 900, size)
        tab.navigate(f"{base}/?infrastructure=infra-lab")
        from tests.test_view import _wait

        _wait(tab, READY)
        _reveal(tab, ident, 1)
        want = _rule_rows(tab, ident)
        _open(tab, ident)
        got = tab.js(JS_CM_ROWS)
        assert got, "des lignes rendues"
        for line, starts in got.items():
            assert want[line] == starts, (seed, w, size, line, want[line], starts)
            compared += 1
        _close(tab)
    return compared


def _history(tab, base: str, auth: dict, ident: str) -> None:
    """Ctrl+Z / Ctrl+Y dans l'écriture : l'historique du texte ; celui du diagramme ne bouge pas."""
    from tests.test_view import _wait

    _reveal(tab, ident)
    undo = tab.js("JSON.stringify(LDApp.debug.state().history)")
    _open(tab, ident)
    tab.js(f"{CM}.dispatch({{ selection: {{ anchor: 0 }} }})")
    tab.call("Input.insertText", {"text": "ABC"})
    _wait(tab, f"{TEXT}.startsWith('ABC')")
    _press(tab, "z", 90, CTRL)
    _wait(tab, f"!{TEXT}.startsWith('ABC')")
    _press(tab, "y", 89, CTRL)
    _wait(tab, f"{TEXT}.startsWith('ABC')")
    _press(tab, "Z", 90, CTRL | SHIFT)  # déjà rétabli : rien de plus
    assert tab.js(f"{TEXT}.startsWith('ABCABC')") is False
    _press(tab, "z", 90, CTRL)
    _wait(tab, f"!{TEXT}.startsWith('ABC')")
    assert tab.js("JSON.stringify(LDApp.debug.state().history)") == undo, "le diagramme n'a rien à défaire"
    _close(tab)
    assert _code(base, auth, ident)["content"]["text"] == CISCO, "défait avant de sortir : rien ne s'écrit"


def _search(tab, base: str, auth: dict, ident: str) -> None:
    """Ctrl+F : la barre devient celle de la recherche, le champ a le focus ; Entrée va au suivant ; Ctrl+H déplie
    « remplacer par » ; tout remplacer ; Échap ferme la recherche (l'écriture reste ouverte), puis enregistre et sort."""
    from tests.test_view import _wait

    _reveal(tab, ident)
    _open(tab, ident)
    _press(tab, "f", 70, CTRL)
    _wait(tab, f"!!document.querySelector('{WBAR} .fb-input') && document.activeElement === document.querySelector('{WBAR} .fb-input')")
    tab.call("Input.insertText", {"text": "vlan"})
    _wait(tab, f"/sur 2|2 résultats/.test(document.querySelector('{WBAR} .fb-count').textContent)")
    _press(tab, "Enter", 13)
    _wait(tab, f"/1 sur 2|2 sur 2/.test(document.querySelector('{WBAR} .fb-count').textContent)")
    sel = tab.js(f"(() => {{ const s = {CM}.state.selection.main; return {TEXT}.slice(s.from, s.to); }})()")
    assert sel == "vlan", sel
    _press(tab, "h", 72, CTRL)
    _wait(tab, f"document.querySelectorAll('{WBAR} .fb-input').length === 2")
    tab.call("Input.insertText", {"text": "VLAN"})
    _press(tab, "Enter", 13, CTRL)
    _wait(tab, f"!{TEXT}.includes('vlan')")
    assert tab.js(f"{TEXT}.split('VLAN').length - 1") == 2
    _press(tab, "Escape", 27)
    _wait(tab, f"!document.querySelector('{WBAR} .fb-input') && {EDITING}")
    _press(tab, "Escape", 27)
    _wait(tab, "!document.querySelector('.code-cm')")
    _until(lambda: "VLAN 20" in _code(base, auth, ident)["content"]["text"], "le remplacement enregistré")
    _wait(tab, f"/annotation modifiée/.test({NOTE})")


def _wheel_size(tab, base: str, auth: dict, ident: str) -> None:
    """Ctrl + molette dans l'écriture : la taille du code, une écriture après la rafale ; la toile ne zoome pas."""
    from tests.test_view import _wait

    _reveal(tab, ident)
    _open(tab, ident)
    zoom = tab.js("LDApp.debug.handle().toile.viewport().zoom")
    size = _code(base, auth, ident)["style"]["text_size"]
    x, y = _center(tab, "document.querySelector('.code-cm')")
    for _ in range(2):
        tab.call("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": -100, "modifiers": CTRL})
    _until(lambda: _code(base, auth, ident)["style"]["text_size"] == 16, f"13 → 14 → 16 (l'échelle), depuis {size}")
    assert tab.js("LDApp.debug.handle().toile.viewport().zoom") == zoom, "la toile n'a pas zoomé"
    assert tab.js(EDITING), "toujours en écriture"
    assert tab.js(f"getComputedStyle(document.querySelector('.code-cm .cm-scroller')).fontSize") == "16px"
    _close(tab)


def _wrap_toggle(tab, base: str, auth: dict, ident: str) -> None:
    """Le retour à la ligne, depuis la barre de l'écriture : écrit tout de suite, l'éditeur suit."""
    from tests.test_view import _wait

    _reveal(tab, ident)
    _open(tab, ident)
    assert tab.js("document.querySelector('.code-cm .cm-content').classList.contains('ld-wrap')")
    tab.js(f"document.querySelector('{WBAR} .fb[data-id=code_wrap]').click()")
    _until(lambda: _code(base, auth, ident)["content"]["wrap"] is False, "wrap faux")
    _wait(tab, "!document.querySelector('.code-cm .cm-content').classList.contains('ld-wrap')")
    tab.js(f"document.querySelector('{WBAR} .fb[data-id=code_wrap]').click()")
    _until(lambda: _code(base, auth, ident)["content"]["wrap"] is True, "wrap vrai")
    _close(tab)


def _abandon(tab, base: str, auth: dict, ident: str) -> None:
    """Abandonner : un clic sans modification ; deux s'il y en a (le premier arme le bouton)."""
    from tests.test_view import _wait

    before = _code(base, auth, ident)["content"]["text"]
    _reveal(tab, ident)
    _open(tab, ident)
    button = f"document.querySelector('{WBAR} .fb[data-id=code_abandon]')"
    tab.call("Input.insertText", {"text": "! a jeter\n"})
    _wait(tab, f"{TEXT}.includes('a jeter')")
    tab.js(f"{button}.click()")
    _wait(tab, f"{button}.getAttribute('aria-pressed') === 'true'")
    assert tab.js(EDITING) or tab.js("!!document.querySelector('.code-cm')"), "un clic : armé, pas fermé"
    tab.js(f"{button}.click()")
    _wait(tab, "!document.querySelector('.code-cm')")
    assert _code(base, auth, ident)["content"]["text"] == before
    _reveal(tab, ident)
    _open(tab, ident)
    tab.js(f"document.querySelector('{WBAR} .fb[data-id=code_abandon]').click()")
    _wait(tab, "!document.querySelector('.code-cm')")


def _secrets(tab, base: str, auth: dict, ident: str) -> None:
    """Une valeur sensible : marquée en direct (décoration, point dans la gouttière) ; Ctrl+Entrée ouvre
    l'avertissement ; Échap y revient au texte ; « Retirer » enregistre sans elle."""
    from tests.test_view import _wait

    _reveal(tab, ident)
    _open(tab, ident)
    tab.js(f"{CM}.dispatch({{ selection: {{ anchor: 0 }} }})")
    tab.call("Input.insertText", {"text": "enable secret 0 Cl34r-S3cret\n"})
    _wait(tab, "!!document.querySelector('.code-cm .cm-secret') && !!document.querySelector('.code-cm .cm-gutterElement.flag')")
    _press(tab, "Enter", 13, CTRL)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    _press(tab, "Escape", 27)
    _wait(tab, f"!document.querySelector('.code-warn-panel') && {EDITING}")
    _press(tab, "Enter", 13, CTRL)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    tab.js("document.querySelector('.code-warn-panel .pbtn.primary').click()")
    _wait(tab, "!document.querySelector('.code-cm')")
    _until(lambda: _code(base, auth, ident)["content"]["text"].startswith("enable secret 0 <removed>"), "retirée")


def _start(tab, base: str) -> None:
    from tests.conftest import TOKEN
    from tests.test_view import _wait

    tab.call("Page.addScriptToEvaluateOnNewDocument", {"source": CSP_PROBE})
    tab.navigate(f"{base}/")
    _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
    tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
    tab.js("localStorage.setItem('ld-author', 'orhan')")
    tab.navigate(f"{base}/?infrastructure=infra-lab")
    _wait(tab, READY)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_writing_a_code_block_in_codemirror(settings, bundle_dict):
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        ident = _seed(base, auth, CISCO, 420, 330, 0)
        with Chrome(CHROMIUM) as chrome:
            chrome.call("Browser.grantPermissions", {"origin": base, "permissions": ["clipboardReadWrite", "clipboardSanitizedWrite"]})
            tab = chrome.open("about:blank")
            _start(tab, base)
            for zoom in (1, 1.6, 0.7):
                jump = _no_jump(tab, ident, zoom)
                assert jump["dx"] < 0.6 and jump["dy"] < 0.6, (zoom, jump)
                _close(tab)
            plex = _seed(base, auth, CISCO, 520, 400, 900, 18)
            tab.js(f"null")
            _history(tab, base, auth, ident)
            _search(tab, base, auth, ident)
            _wheel_size(tab, base, auth, ident)
            _wrap_toggle(tab, base, auth, ident)
            _abandon(tab, base, auth, ident)
            _secrets(tab, base, auth, ident)
            for zoom in (1, 1.3, 0.8):
                scrolled = _scrolled_no_jump(tab, base, auth, zoom)
                assert scrolled["dx"] < 0.6 and scrolled["dy"] < 0.6, (zoom, scrolled)
            assert _wrap_rule(tab, base, auth) > 100
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            from tests.test_view import _wait
            _wait(tab, READY)
            jump = _no_jump(tab, plex, 1.2)
            assert jump["dx"] < 0.6 and jump["dy"] < 0.6, ("taille 18", jump)
            _close(tab)
            assert tab.js("window.__csp") == 0, tab.js("window.__cspList")
            errors = [c for c in chrome.console if c.get("level") == "error" or (c.get("entry") or {}).get("level") == "error"]
            assert not errors, errors[:3]
    finally:
        server.should_exit = True
        thread.join(timeout=5)
