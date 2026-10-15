"""Le bloc de code (lot 16 de docs/11), dans un vrai navigateur : insérer puis écrire (le langage se reconnaît), coller
une configuration Cisco qui porte des valeurs sensibles (l'avertissement s'ouvre avant tout enregistrement, une
ligne de la liste mène à la valeur, « Retirer ces valeurs »), Ctrl+Z ; la coloration coupée puis rendue, la police
changée (son fichier n'est chargé qu'à ce moment), redimensionner (sur la grille) ; la molette sur le bloc sélectionné
seul fait défiler le code sans zoomer, sur un bloc non sélectionné elle zoome ; Page suiv. ; double-clic = écriture
ouverte là où on lisait, Échap n'écrit rien, Ctrl+Entrée enregistre ; copier. Revue du 2026-10-15 : un texte trop long
garde le brouillon ouvert avec ce qui a été écrit (M2) ; un collage de deux lignes qui porte des valeurs sensibles passe
par l'avertissement au lieu de devenir une note (M3). Passe de finition du 2026-10-15 : après un collage, le focus est
dans l'avertissement et Tab n'écrit rien dans le texte (il tourne dans l'avertissement, modal) ; à 1280 la fiche
ouverte, l'avertissement ne passe pas sous elle ; Ctrl+Maj+V et « coller comme bloc de code » font un bloc d'un texte
non reconnu (texte brut) ; une valeur gardée telle quelle dit au survol sa nature et qui la lit, jamais la valeur. Les
textes sont factices (secrets inventés)."""

import json
import os
import shutil
import subprocess
import threading

import pytest

from tests.test_app import ASSETS, CTRL, JS_TESTS, NOTE, READY, SHIFT, _fbar, _intent_doc, _press
from tests.test_render import CHROMIUM

PYTHON = "\n".join(
    [
        "from netmiko import ConnectHandler",
        "",
        "def optiques(hote: str) -> list[str]:",
        "    with ConnectHandler(host=hote) as nx:",
        '        return nx.send_command("show interface transceiver")',
        "",
        "for hote in COEURS:",
        "    print(optiques(hote))",
    ]
)
PASTE_CISCO = "\n".join(
    [
        "hostname dc01-acc-03",
        "!",
        "enable secret 5 $1$Xk2p$9fQe7rV0nWm3ZbH1uYt8s/",
        "username netadmin privilege 15 secret 9 $9$h1aB2cD3eF4gH5$Qm8vL0pZr7TnW2xYk4sJ6uE1oI9",
        "!",
        "interface Vlan10",
        " ip address 10.0.10.23 255.255.255.0",
        "!",
        "snmp-server community Dc01-RoCommunity! RO 99",
        "tacacs-server host 10.0.10.40 key 7 0822455D0A16544541",
        "line vty 0 15",
        " password 7 13061E010803557878",
        " transport input ssh",
        "end",
    ]
)
KINDS = ["mot de passe", "mot de passe d'un compte", "communauté SNMP", "clé RADIUS / TACACS", "mot de passe"]
BLOCK = "document.querySelector('.react-flow__node[data-id=\"annotation:{0}\"] svg.annotation')"
RECT = "JSON.parse(JSON.stringify({0}.getBoundingClientRect()))"
FIRST = "Number(({0}.querySelector('.code-nums text') || {{ textContent: '0' }}).textContent)"
ZOOM = "LDApp.debug.handle().toile.viewport().zoom"
# l'écriture (lot 16 bis) : CodeMirror, sa vue exposée aux tests (`LDApp.debug.editor()`)
EDITING = "!!document.querySelector('.code-cm') && document.activeElement && !!document.activeElement.closest('.code-cm')"
VIEW = "LDApp.debug.editor()"
EDITOR_TEXT = f"{VIEW}.state.doc.toString()"
SELECTED = f"(() => {{ const s = {VIEW}.state.selection.main; return {VIEW}.state.sliceDoc(s.from, s.to); }})()"
CARET_LINE = f"(() => {{ const v = {VIEW}; return v.state.doc.lineAt(v.state.selection.main.head).number; }})()"
OPEN = "!!document.querySelector('.code-cm')"
ABANDON = "document.querySelector('.fbar.writing .fb[data-id=code_abandon]')"
WARN_KINDS = (
    "Array.from(document.querySelectorAll('.code-warn-row .code-warn-kind')).map((e) => e.firstChild.textContent)"
)
PLEX_LOADED = "performance.getEntriesByType('resource').some((e) => /ibm-plex-mono/.test(e.name))"
wait = threading.Event().wait


def _long_config() -> str:
    """Une configuration de 120 lignes, déjà masquée : de quoi défiler."""
    lines = ["hostname dc01-acc-01", "!", "enable secret 9 <removed>", "!"]
    port = 1
    while len(lines) < 116:
        vlan = 20 if port % 2 else 30
        lines += [
            f"interface GigabitEthernet1/0/{port}",
            f" switchport access vlan {vlan}",
            " switchport mode access",
            "!",
        ]
        port += 1
    return "\n".join(lines[:116] + ["line vty 0 15", " transport input ssh", "!", "end"])


def _codes(base: str, auth: dict) -> list[dict]:
    return [a for a in _intent_doc(base, auth)["annotations"] if a["content"]["kind"] == "code"]


def _code(base: str, auth: dict, ident: str) -> dict:
    return next(a for a in _codes(base, auth) if a["id"] == ident)


def _until(check, what: str) -> None:
    """Attendre que le serveur dise vrai (l'écriture de la page part après le geste)."""
    for _ in range(100):
        if check():
            return
        wait(0.05)
    raise AssertionError(f"jamais vrai : {what}")


def _paste(tab, text: str) -> None:
    """Un collage réel : l'événement `paste` du navigateur, avec son presse-papiers (ce que Ctrl+V déclenche)."""
    tab.js("document.querySelector('.app').focus()")
    data = f"const d = new DataTransfer(); d.setData('text/plain', {json.dumps(text)});"
    event = "new ClipboardEvent('paste', { clipboardData: d, bubbles: true })"
    tab.js(f"(() => {{ {data} window.dispatchEvent({event}); }})()")


def _abandon(tab, *, dirty: bool) -> None:
    """Abandonner l'écriture par la barre (lot 16 bis : Échap enregistre) : un clic, deux s'il y a des modifications."""
    from tests.test_view import _wait

    _wait(tab, f"!!{ABANDON}")
    tab.js(f"{ABANDON}.click()")
    if dirty:
        _wait(tab, f"{ABANDON}.getAttribute('aria-pressed') === 'true'")
        tab.js(f"{ABANDON}.click()")


def _wheel(tab, x: float, y: float, dy: float) -> None:
    tab.call("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": x, "y": y, "deltaX": 0, "deltaY": dy})


def _dblclick(tab, x: float, y: float) -> None:
    tab.mouse_move(x, y)
    for count in (1, 2):
        for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
            event = {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": count}
            tab.call("Input.dispatchMouseEvent", event)


def _middle(tab, selector: str) -> tuple[float, float]:
    box = tab.js(RECT.format(selector))
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def _reveal(tab, ident: str) -> None:
    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    wait(0.6)


@pytest.mark.skipif(shutil.which("node") is None, reason="Node absent : les tests du bloc de code ne tournent pas")
def test_the_code_block_passes_its_node_tests():
    """La partie pure sous Node : coloration en familles (Prism), détection, valeurs sensibles, géométrie, barre."""
    done = subprocess.run(
        ["node", "--test", str(JS_TESTS / "code.test.js")],
        capture_output=True,
        text=True,
        timeout=120,
        env={**os.environ, "LD_APP": str(ASSETS / "app.js")},
        check=False,
    )
    assert done.returncode == 0, done.stdout[-4000:] + done.stderr[-2000:]


def _insert_and_write(tab, base: str, auth: dict) -> None:
    """Insérer : un brouillon, l'écriture ouverte ; rien n'existe avant Ctrl+Entrée ; le langage se reconnaît."""
    from tests.test_view import _wait

    tab.js("document.querySelector('.toolbar [aria-label=\"insérer un bloc de code\"]').click()")
    _wait(tab, EDITING)
    assert _codes(base, auth) == [], "un brouillon n'est rien tant qu'il n'est pas enregistré"
    tab.call("Input.insertText", {"text": PYTHON})
    _press(tab, "Enter", 13, CTRL)
    _wait(tab, "!document.querySelector('.code-draft')")
    _wait(tab, f"/bloc de code créé/.test({NOTE})")
    made = _codes(base, auth)
    assert len(made) == 1 and made[0]["content"]["language"] == "python", made
    assert made[0]["content"]["text"] == PYTHON and made[0]["content"]["highlight"] is True


def _too_long_keeps_the_draft(tab, base: str, auth: dict) -> None:
    """Un texte qui dépasse 20 000 caractères une fois normalisé (les tabulations deviennent des espaces) : Ctrl+Entrée
    le dit, le brouillon reste ouvert avec tout ce qui a été écrit ; Échap l'abandonne (revue du lot 16, M2)."""
    from tests.test_view import _wait

    before = len(_codes(base, auth))
    tab.js("document.querySelector('.toolbar [aria-label=\"insérer un bloc de code\"]').click()")
    _wait(tab, EDITING)
    tab.call("Input.insertText", {"text": "x" * 19990})
    tab.call("Input.insertText", {"text": "\t\t\t\t\tx"})
    _wait(tab, f"{EDITOR_TEXT}.length === 20009")
    assert "\t" not in tab.js(EDITOR_TEXT), "une tabulation devient des espaces dès qu'elle entre"
    _press(tab, "Enter", 13, CTRL)
    _wait(tab, f"/bloc de code trop long/.test({NOTE})")
    assert tab.js(f"{OPEN} && {EDITOR_TEXT}.length === 20009"), "le brouillon reste, avec son texte"
    assert len(_codes(base, auth)) == before
    _abandon(tab, dirty=True)
    _wait(tab, "!document.querySelector('.code-draft')")
    assert len(_codes(base, auth)) == before


def _short_paste_with_secrets(tab, base: str, auth: dict) -> None:
    """Deux lignes qui portent des valeurs sensibles : plus une note en silence, l'avertissement s'ouvre (revue du
    lot 16, M3) ; « Retirer ces valeurs » enregistre un bloc sans elles ; Ctrl+Z le défait."""
    from tests.test_view import _wait

    before = len(_codes(base, auth))
    tab.js("LDApp.debug.handle().toile.select(null)")
    _paste(tab, "enable secret 0 Cl34r-S3cret\nusername admin password 0 Adm-S3cret")
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    assert tab.js("document.querySelectorAll('.code-warn-row').length") == 2
    assert len(_codes(base, auth)) == before, "rien n'est enregistré avant le choix"
    tab.js("document.querySelector('.code-warn-panel .pbtn.primary').click()")
    _wait(tab, "!document.querySelector('.code-draft')")
    _until(lambda: len(_codes(base, auth)) == before + 1, "le bloc enregistré")
    text = _codes(base, auth)[-1]["content"]["text"]
    assert text == "enable secret 0 <removed>\nusername admin password 0 <removed>", text
    notes = [a for a in _intent_doc(base, auth)["annotations"] if "S3cret" in json.dumps(a["content"])]
    assert not notes, "aucune note"
    tab.js("document.querySelector('.app').focus()")
    _press(tab, "z", 90, CTRL)
    _until(lambda: len(_codes(base, auth)) == before, "Ctrl+Z défait le collage")


def _paste_with_secrets(tab, base: str, auth: dict) -> None:
    """Coller une configuration qui porte des valeurs sensibles : l'avertissement, rien d'enregistré avant le choix ;
    une ligne de la liste mène à la valeur ; « Retirer ces valeurs » ; Ctrl+Z défait le collage."""
    from tests.test_view import _wait

    tab.js("LDApp.debug.handle().toile.select(null)")
    tab.mouse_move(5, 5)
    _paste(tab, PASTE_CISCO)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    assert tab.js(WARN_KINDS) == KINDS
    assert tab.js("document.querySelectorAll('.code-cm .cm-lineNumbers .cm-gutterElement.flag').length") == 5, "un point rouge par ligne"
    shown = tab.js("document.querySelector('.code-warn-panel').textContent")
    assert "Dc01-RoCommunity" not in shown, "jamais revue en clair"
    assert len(_codes(base, auth)) == 1, "rien n'est enregistré avant le choix"
    tab.js("document.querySelectorAll('.code-warn-row')[2].click()")
    _wait(tab, f"{SELECTED} === 'Dc01-RoCommunity!'")
    tab.js("document.querySelector('.code-warn-panel .pbtn.primary').click()")
    _wait(tab, "!document.querySelector('.code-draft')")
    _wait(tab, f"/5 valeurs retirées du texte/.test({NOTE})")
    pasted = _codes(base, auth)[-1]
    text = pasted["content"]["text"]
    assert pasted["content"]["language"] == "cisco_ios" and text.count("<removed>") == 5, text
    assert "Dc01-RoCommunity" not in text and "13061E01" not in text
    assert "snmp-server community <removed> RO 99" in text
    tab.js("document.querySelector('.app').focus()")
    _press(tab, "z", 90, CTRL)
    _until(lambda: len(_codes(base, auth)) == 1, "Ctrl+Z défait le collage")


def _seed_long(tab, base: str, auth: dict, url: str) -> str:
    """Un bloc de 120 lignes dans une boîte de 25, écrit par l'API : la page le lit en se rouvrant."""
    import httpx

    from tests.test_view import _wait

    content = {"kind": "code", "text": _long_config(), "language": "cisco_ios", "title": "running-config"}
    content |= {"highlight": True, "line_numbers": True, "font": "jetbrains_mono", "wrap": True}
    op = {"op": "annotation_create", "x": 0, "y": 600, "w": 560, "h": 580, "content": content}
    params = {"infrastructure": "infra-lab"}
    done = httpx.post(f"{base}/api/intent/patches", params=params, headers=auth, json={"author": "orhan", "ops": [op]})
    tab.navigate(url)
    _wait(tab, READY)
    return done.json()["annotations"][-1]["id"]


def _scroll_and_settings(tab, base: str, auth: dict, ident: str) -> None:
    """La molette sur le bloc sélectionné seul fait défiler sans zoomer ; Page suiv., Origine ; la coloration coupée
    puis rendue ; la police changée, son fichier chargé à ce moment seulement."""
    from tests.test_view import _wait

    block = BLOCK.format(ident)
    _reveal(tab, ident)
    _wait(tab, f"!!{block}")
    assert tab.js(f"{block}.querySelectorAll('.code-text text').length") < 30, "seules les lignes visibles"
    assert tab.js(f"{block}.querySelectorAll('.code-text tspan.tk-keyword').length") > 0, "coloré"
    assert "lignes 1-" in tab.js(f"{block}.querySelector('.code-foot-hint').textContent")
    x, y = _middle(tab, block)
    zoom = tab.js(ZOOM)
    for _ in range(3):
        _wheel(tab, x, y, 100)
    _wait(tab, f"{FIRST.format(block)} > 5")
    assert tab.js(ZOOM) == zoom, "la vue n'a pas zoomé"
    before = tab.js(FIRST.format(block))
    tab.js("document.querySelector('.app').focus()")
    _press(tab, "PageDown", 34)
    _wait(tab, f"{FIRST.format(block)} > {before + 10}")
    _press(tab, "Home", 36)
    _wait(tab, f"{FIRST.format(block)} === 1")
    _fbar(tab, "code_highlight")
    _wait(tab, f"{block}.querySelectorAll('.code-text tspan.tk-keyword').length === 0")
    assert _code(base, auth, ident)["content"]["highlight"] is False
    _fbar(tab, "code_highlight")
    _wait(tab, f"{block}.querySelectorAll('.code-text tspan.tk-keyword').length > 0")
    assert tab.js(PLEX_LOADED) is False, "aucun bloc en Plex : son fichier n'est pas téléchargé"
    _fbar(tab, "text_size")  # la police est dans le volet de la taille (lot 16 bis)
    _wait(tab, "!!document.querySelector('.fvolet .font-item.cf-ibm_plex_mono')")
    tab.js("document.querySelector('.fvolet .font-item.cf-ibm_plex_mono').click()")
    _wait(tab, f"!!{block}.querySelector('.code-block.cf-ibm_plex_mono')")
    assert _code(base, auth, ident)["content"]["font"] == "ibm_plex_mono"
    _wait(tab, PLEX_LOADED)
    family = tab.js(f"getComputedStyle({block}.querySelector('.code-text text')).fontFamily")
    assert family.startswith('"IBM Plex Mono"'), family


def _resize_and_zoom(tab, base: str, auth: dict, ident: str) -> None:
    """Redimensionner par le bas, aimant mis : une écriture, sur la grille de 20 (règle du lot 8 : repères, puis la
    grille si l'aimant est mis, comme toute annotation) ; la molette sur un bloc non sélectionné zoome."""
    from tests.test_view import _wait

    magnet = "document.querySelector('[aria-label=\"aimanter les glissés à la grille\"]')"
    if tab.js(f"{magnet}.getAttribute('aria-pressed')") != "true":
        tab.js(f"{magnet}.click()")
    _wait(tab, f"{magnet}.getAttribute('aria-pressed') === 'true'")
    tab.js("document.querySelector('.app').focus()")
    _press(tab, "Escape", 27)
    _reveal(tab, ident)
    node = f"document.querySelector('.react-flow__node[data-id=\"annotation:{ident}\"]')"
    handle = f"{node}.querySelector('.handle-s .annotation-handle-hit')"
    _wait(tab, f"!!{handle}")
    wait(0.3)
    x, y = _middle(tab, handle)
    tab.drag((x, y), (x, y - 107))
    _until(lambda: _code(base, auth, ident)["h"] < 580, "la boîte plus basse")
    assert _code(base, auth, ident)["h"] % 20 == 0, _code(base, auth, ident)["h"]
    tab.js("LDApp.debug.handle().toile.select(null)")  # le bloc reste en vue, il n'est plus sélectionné
    wait(0.6)
    block = BLOCK.format(ident)
    box = tab.js(RECT.format(block))
    zoom = tab.js(ZOOM)
    _wheel(tab, box["x"] + box["width"] / 2, box["y"] + 60, -100)
    _wait(tab, f"{ZOOM} !== {zoom}")


def _edit_and_copy(tab, base: str, auth: dict, ident: str) -> None:
    """Double-clic : l'écriture s'ouvre là où on lisait ; Échap n'écrit rien ; Ctrl+Entrée enregistre ; copier."""
    from tests.test_view import _wait

    block = BLOCK.format(ident)
    _reveal(tab, ident)
    x, y = _middle(tab, block)
    for _ in range(4):
        _wheel(tab, x, y, 100)
    _wait(tab, f"{FIRST.format(block)} > 5")
    reading = tab.js(FIRST.format(block))
    _dblclick(tab, x, y)
    _wait(tab, EDITING)
    wait(0.3)  # CodeMirror mesure à l'image suivante, puis aligne la rangée lue en haut (editor.ts, alignTop)
    assert tab.js(CARET_LINE) == reading, "le curseur sur la première ligne lue"
    tab.call("Input.insertText", {"text": "! oublié\n"})
    _abandon(tab, dirty=True)  # abandonner : deux clics s'il y a des modifications (lot 16 bis)
    _wait(tab, f"!{OPEN}")
    assert "oublié" not in _code(base, auth, ident)["content"]["text"]
    _dblclick(tab, x, y)
    _wait(tab, EDITING)
    wait(0.3)
    tab.call("Input.insertText", {"text": "! relu le 14/10\n"})
    _press(tab, "Enter", 13, CTRL)
    _wait(tab, f"!{OPEN}")
    _wait(tab, f"/annotation modifiée/.test({NOTE})")
    edited = _code(base, auth, ident)["content"]["text"]
    assert edited.split("\n").index("! relu le 14/10") == reading - 1
    tab.js(f"{block}.querySelector('.code-copy').dispatchEvent(new MouseEvent('click', {{ bubbles: true }}))")
    _wait(tab, f"/copié : 121 lignes de running-config/.test({NOTE})")
    assert tab.js("navigator.clipboard.readText()") == edited, "le texte tel qu'enregistré"
    assert tab.js(f"!!{block}.querySelector('.code-copy .lucide-check')"), "l'icône passe à la coche"


ACTIVE = "(document.activeElement && (document.activeElement.className || '').toString())"
TIP_TEXT = "(document.querySelector('.tip-layer .tip') || { textContent: '' }).textContent"
TIP_ON = "document.querySelector('.tip-layer .tip')?.getAttribute('visibility') === 'visible'"


def _paste_keeps_focus_in_the_warning(tab, base: str, auth: dict) -> None:
    """Audit du 2026-10-15, P1 : après un collage qui porte des valeurs sensibles, le focus est sur « Retirer » (pas
    dans le champ) ; Tab et Maj+Tab tournent dans l'avertissement (modal, une vraie liste) et n'écrivent rien dans le
    texte ; depuis le champ, Tab va à l'avertissement ; Échap revient au texte, puis abandonne le brouillon."""
    from tests.test_view import _wait

    before = len(_codes(base, auth))
    tab.js("LDApp.debug.handle().toile.select(null)")
    tab.mouse_move(5, 5)
    _paste(tab, PASTE_CISCO)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    _wait(tab, f"/pbtn primary/.test({ACTIVE})")
    panel = "document.querySelector('.code-warn-panel')"
    assert tab.js(f"{panel}.getAttribute('aria-modal')") == "true"
    rows = f"{panel}.querySelectorAll('ul.code-warn-list > li > button.code-warn-row').length"
    assert tab.js(rows) == 5, "ul / li / button"
    text = tab.js(EDITOR_TEXT)
    for _ in range(6):
        _press(tab, "Tab", 9)
        assert tab.js(f"{panel}.contains(document.activeElement)"), "Tab reste dans l'avertissement"
    _press(tab, "Tab", 9, SHIFT)
    assert tab.js(f"{panel}.contains(document.activeElement)"), "Maj+Tab aussi"
    assert tab.js(EDITOR_TEXT) == text, "rien n'est écrit dans le texte collé"
    tab.js(f"{VIEW}.focus()")
    _press(tab, "Tab", 9)
    assert tab.js(f"{panel}.contains(document.activeElement)"), "du champ, Tab va à l'avertissement"
    assert tab.js(EDITOR_TEXT) == text, "sans rien écrire"
    _press(tab, "Escape", 27)
    _wait(tab, f"!document.querySelector('.code-warn-panel') && {EDITING}")
    _abandon(tab, dirty=False)  # Échap enregistrerait (lot 16 bis) : abandonner passe par la barre
    _wait(tab, "!document.querySelector('.code-draft')")
    assert len(_codes(base, auth)) == before, "rien n'a été enregistré"


def _warning_beside_the_sheet(tab, base: str, auth: dict, ident: str) -> None:
    """Audit du 2026-10-15, P1 : à 1280 × 800, la fiche ouverte, l'avertissement d'une écriture ne passe pas sous elle ;
    il reste dans la fenêtre. Échap le referme, puis abandonne l'écriture (rien n'est enregistré)."""
    from tests.test_view import _wait

    metrics = {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False}
    tab.call("Emulation.setDeviceMetricsOverride", metrics)
    try:
        _reveal(tab, ident)
        tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(ident)} }})")
        _wait(tab, "!!document.querySelector('.panel')")
        wait(0.4)
        x, y = _middle(tab, BLOCK.format(ident))
        _dblclick(tab, x, y)
        _wait(tab, EDITING)
        before = _code(base, auth, ident)["content"]["text"]
        tab.call("Input.insertText", {"text": "enable password 0 Fini-S3cret\n"})
        _press(tab, "Enter", 13, CTRL)
        _wait(tab, "!!document.querySelector('.code-warn-panel')")
        wait(0.3)
        got = tab.js(
            "(() => { const e = document.querySelector('.code-warn-panel'), w = e.getBoundingClientRect(),"
            " p = document.querySelector('.panel').getBoundingClientRect();"
            " return { right: w.right, left: w.left, top: w.top, bottom: w.bottom, panel: p.left,"
            " height: innerHeight, side: e.dataset.side }; })()"
        )
        assert got["right"] <= got["panel"] and got["left"] >= 0, got
        assert got["top"] >= 0 and got["bottom"] <= got["height"], got
        _press(tab, "Escape", 27)
        _wait(tab, f"!document.querySelector('.code-warn-panel') && {EDITING}")
        _abandon(tab, dirty=True)
        _wait(tab, f"!{OPEN}")
        assert _code(base, auth, ident)["content"]["text"] == before
    finally:
        tab.call("Emulation.clearDeviceMetricsOverride")
        wait(0.3)


def _paste_as_code(tab, base: str, auth: dict) -> None:
    """Ctrl+Maj+V (Orhan, 2026-10-15) : un texte qui n'est pas reconnu comme du code (Ctrl+V en ferait une note) devient
    un bloc « Texte brut » ; « coller comme bloc de code » du menu du fond fait de même ; Ctrl+Z défait."""
    from tests.test_app import _right_click
    from tests.test_view import _wait

    plain = "liste des vlans\n- 10 users\n- 20 voix"
    tab.js(f"navigator.clipboard.writeText({json.dumps(plain)})")
    before = len(_codes(base, auth))
    tab.js("LDApp.debug.handle().toile.select(null)")
    tab.js("document.querySelector('.app').focus()")
    tab.mouse_move(300, 500)
    _press(tab, "V", 86, CTRL | SHIFT)
    _until(lambda: len(_codes(base, auth)) == before + 1, "Ctrl+Maj+V : un bloc")
    made = _codes(base, auth)[-1]["content"]
    assert made["language"] == "plain" and made["text"] == plain, made
    _wait(tab, f"/bloc de code créé : 3 lignes, Texte brut/.test({NOTE})")
    annotations = _intent_doc(base, auth)["annotations"]
    notes = [a for a in annotations if a["content"]["kind"] == "note" and "vlans" in a["content"]["text"]]
    assert not notes, "pas une note"
    wait(0.5)  # la vue se pose sur le bloc créé (reveal) : le clic droit vise le fond, loin de lui
    _right_click(tab, 220, 260)
    item = (
        "Array.from(document.querySelectorAll('.context-menu .context-item'))"
        ".find((b) => /coller comme bloc de code/.test(b.textContent))"
    )
    _wait(tab, f"!!{item}")
    assert tab.js(f"{item}.getAttribute('aria-keyshortcuts')") == "Control+Shift+V"
    assert tab.js(f"{item}.querySelector('.context-keys').textContent") == "Ctrl+Maj+V"
    tab.js(f"{item}.click()")
    _until(lambda: len(_codes(base, auth)) == before + 2, "le menu : un bloc")
    assert _codes(base, auth)[-1]["content"]["language"] == "plain"
    for count in (before + 1, before):
        tab.js("document.querySelector('.app').focus()")
        _press(tab, "z", 90, CTRL)
        _until(lambda c=count: len(_codes(base, auth)) == c, "Ctrl+Z")
        _wait(tab, f"/annul/.test({NOTE})")
        wait(0.3)


def _kept_value_reminder(tab, base: str, auth: dict) -> None:
    """Une valeur gardée telle quelle (Orhan, 2026-10-15) : au survol, la bulle dit sa nature et qui la lit, jamais la
    valeur ; le bouclier de l'en-tête les dit toutes ; la fiche dit la même chose au survol (`title`)."""
    from tests.test_view import _wait

    tab.js("LDApp.debug.handle().toile.select(null)")
    tab.mouse_move(5, 5)
    _paste(tab, PASTE_CISCO)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    tab.js(
        "Array.from(document.querySelectorAll('.code-warn-panel .pbtn')).find((b) => /Garder/.test(b.textContent))"
        ".click()"
    )
    _wait(tab, "!document.querySelector('.code-draft')")
    kept = _codes(base, auth)[-1]
    assert "Dc01-RoCommunity!" in kept["content"]["text"]
    ident = kept["id"]
    _reveal(tab, ident)
    tab.js("LDApp.debug.handle().toile.select(null)")
    block = BLOCK.format(ident)
    _wait(tab, f"{block} && {block}.querySelectorAll('[data-secret]').length === 5")
    hit = f"{block}.querySelectorAll('[data-secret]')[2]"
    x, y = _middle(tab, hit)
    tab.mouse_move(x - 3, y)
    tab.mouse_move(x, y)
    _wait(tab, TIP_ON)
    said = tab.js(TIP_TEXT)
    assert "communauté SNMP" in said and "EN CLAIR" in said, said  # la nature en pastille
    assert "lisible par tous ceux qui ouvrent infra-lab" in said, said
    assert "Dc01-RoCommunity" not in said, "jamais la valeur"
    x, y = _middle(tab, f"{block}.querySelector('[data-shield]')")
    tab.mouse_move(x, y)
    _wait(tab, f"/5 valeurs sensibles gardées/.test({TIP_TEXT})")
    tab.mouse_move(5, 5)
    tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    _wait(tab, "document.querySelectorAll('.insp-code span.tk-secret[title]').length === 5")
    title = tab.js("document.querySelectorAll('.insp-code span.tk-secret[title]')[2].title")
    assert title == "communauté SNMP, en clair, ligne 9 ; lisible par tous ceux qui ouvrent infra-lab", title
    assert "valeurs sensibles gardées telles quelles" in tab.js("document.querySelector('.insp-warn-icon').title")
    tab.js("LDApp.debug.handle().toile.select(null)")


def _language_volet_keyboard(tab, base: str, auth: dict, url: str) -> None:
    """Audit du 2026-10-15, P1 : le volet du langage avec une suggestion s'ouvre au clavier sur le langage coché (pas
    sur « appliquer ») ; ↓ parcourt les langages ; Tab va à « appliquer » et revient à la liste ; le volet reste
    ouvert."""
    import httpx

    from tests.test_view import _wait

    content = {"kind": "code", "text": PYTHON, "language": "plain", "title": "brut"}
    content |= {"highlight": True, "line_numbers": True, "font": "jetbrains_mono", "wrap": True}
    op = {"op": "annotation_create", "x": 900, "y": 600, "w": 520, "h": 260, "content": content}
    params, body = {"infrastructure": "infra-lab"}, {"author": "orhan", "ops": [op]}
    done = httpx.post(f"{base}/api/intent/patches", params=params, headers=auth, json=body)
    ident = done.json()["annotations"][-1]["id"]
    tab.navigate(url)
    _wait(tab, READY)
    _reveal(tab, ident)
    tab.js(f"LDApp.debug.handle().toile.select({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    _wait(tab, "!!document.querySelector('.fbar:not(.suspended):not(.offscreen) .fb[data-id=code_language]')")
    tab.js("document.querySelector('.fbar .fb[data-id=code_language]').focus()")
    _press(tab, "ArrowDown", 40)
    _wait(tab, "!!document.querySelector('.fvolet .vsuggest')")
    _wait(tab, "document.activeElement && document.activeElement.getAttribute('aria-checked') === 'true'")
    assert tab.js("document.activeElement.textContent") == "Texte brut"
    _press(tab, "ArrowDown", 40)
    assert tab.js("document.activeElement.textContent") == "Python", "↓ : les langages"
    _press(tab, "Tab", 9)
    assert tab.js("document.activeElement.classList.contains('vbtn')"), "Tab : « appliquer »"
    _press(tab, "Tab", 9)
    checked = tab.js("document.activeElement.getAttribute('aria-checked')")
    assert checked == "true", "Tab : retour à la liste, sur le coché"
    _press(tab, "Escape", 27)
    _wait(tab, "!document.querySelector('.fvolet')")


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_code_block_in_a_browser(settings, bundle_dict):
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            permissions = ["clipboardReadWrite", "clipboardSanitizedWrite"]
            chrome.call("Browser.grantPermissions", {"origin": base, "permissions": permissions})
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            url = f"{base}/?infrastructure=infra-lab"
            tab.navigate(url)
            _wait(tab, READY)
            _insert_and_write(tab, base, auth)
            _paste_with_secrets(tab, base, auth)
            _too_long_keeps_the_draft(tab, base, auth)
            _short_paste_with_secrets(tab, base, auth)
            _paste_keeps_focus_in_the_warning(tab, base, auth)
            _paste_as_code(tab, base, auth)
            _kept_value_reminder(tab, base, auth)
            ident = _seed_long(tab, base, auth, url)
            _warning_beside_the_sheet(tab, base, auth, ident)
            _scroll_and_settings(tab, base, auth, ident)
            _resize_and_zoom(tab, base, auth, ident)
            _edit_and_copy(tab, base, auth, ident)
            _language_volet_keyboard(tab, base, auth, url)
            errors = [c for c in chrome.console if c.get("level") == "error"]
            assert not errors, errors[:3]
    finally:
        server.should_exit = True
        thread.join(timeout=5)
