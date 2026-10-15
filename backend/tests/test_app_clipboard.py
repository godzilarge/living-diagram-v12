"""L'application dans un vrai navigateur : le presse-papiers (lot 3 de docs/11).

Ctrl+C / Ctrl+V d'une note et du connecteur qui la relie (une seule entrée Ctrl+Z pour les deux requêtes du collage),
collages répétés décalés, collage au pointeur, Ctrl+D et la répétition de l'écart d'un Alt + glissé (fantôme pendant le
geste, original resté), Ctrl+X, copier des équipements (leurs noms en texte, Ctrl+V ne crée rien), texte et image venus
d'ailleurs (comportement d'avant), le menu contextuel, la vue Contrôle et l'absence de nom ; puis un collage d'une
infrastructure à l'autre, avec une image renvoyée au magasin de destination.

Le presse-papiers du système : Chromium sans écran en a un, en mémoire ; Ctrl+C et Ctrl+V passent par les événements
natifs `copy` / `paste` (le format propre et le texte) ; les permissions de l'API asynchrone (menu « copier », « coller
ici ») sont accordées par `Browser.grantPermissions`. Ce que ce test exerce est donc le chemin du système, pas le repli
interne de l'onglet, sauf là où il le dit."""

import base64
import json
import threading

import pytest

from tests.test_app import CTRL, NOTE, PANE_POINT, READY, SHIFT, _click, _intent_doc, _settled
from tests.test_app_selection import _ctrl_click, _mode, _screen
from tests.test_render import CHROMIUM

ALT = 1  # Input.dispatchMouseEvent : le modificateur Alt
INFRA = {"infrastructure": "infra-lab"}
PICKED = "JSON.stringify(LDApp.debug.state().picked)"
GHOST = "!!document.querySelector('.clone-layer[data-ghost]')"
UNDO_LABEL = "document.querySelector('.toolbar [aria-label^=\"annuler\"]').getAttribute('aria-label')"
OUTSIDE = (720, 20)  # au-dessus de la barre : le pointeur n'est pas sur la toile


def _key(tab, key: str, code: int, modifiers: int = 0) -> None:
    """Une touche réelle (keyDown / keyUp) : Ctrl+C, Ctrl+X, Ctrl+V déclenchent les événements natifs."""
    event = {"key": key, "code": "Key" + key.upper(), "windowsVirtualKeyCode": code, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def _copy(tab) -> None:
    _key(tab, "c", 67, CTRL)


def _paste(tab) -> None:
    _key(tab, "v", 86, CTRL)


def _move(tab, x: float, y: float) -> None:
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none", "buttons": 0})


def _note_center(tab, aid: str) -> tuple[float, float]:
    box = tab.js(
        f"(() => {{ const r = document.querySelector('.react-flow__node[data-id=\"annotation:{aid}\"]')"
        ".getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"
    )
    return box[0], box[1]


def _by_text(doc: dict, text: str) -> list[dict]:
    return [a for a in doc["annotations"] if a["content"].get("text") == text]


def _wait_note(tab, pattern: str) -> None:
    from tests.test_view import _wait

    _wait(tab, f"/{pattern}/.test({NOTE})")


def _alt_drag(tab, start: tuple[float, float], end: tuple[float, float], *, during=None, free: bool = False) -> None:
    """Un Alt + glissé réel : Alt tenu au clavier et sur chaque événement de souris ; `during`, bouton enfoncé. `free` :
    Ctrl tenu aussi, ni repère ni aimant (lot 8 de docs/11 : sans lui, la copie s'aligne sur ce qui l'entoure)."""
    alt = {"key": "Alt", "code": "AltLeft", "windowsVirtualKeyCode": 18}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **alt, "modifiers": ALT})
    mouse = {"button": "left", "clickCount": 1, "modifiers": ALT | (CTRL if free else 0)}
    tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": start[0], "y": start[1], "buttons": 0, **mouse})
    tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": 1, **mouse})
    for step in range(1, 9):
        x, y = start[0] + (end[0] - start[0]) * step / 8, start[1] + (end[1] - start[1]) * step / 8
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 1, **mouse})
    if during:
        during()
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **alt})


def _open(chrome, base: str, url: str):
    from tests.conftest import TOKEN
    from tests.test_view import _wait

    tab = chrome.open(f"{base}/")
    _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
    tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
    tab.js("localStorage.setItem('ld-author', 'orhan')")
    tab.navigate(url)
    _wait(tab, READY)
    return tab


def _grant(chrome, base: str) -> None:
    """L'API asynchrone du presse-papiers (le menu) : lecture et écriture accordées à l'origine du serveur de test."""
    chrome.call(
        "Browser.grantPermissions",
        {"origin": base, "permissions": ["clipboardReadWrite", "clipboardSanitizedWrite"]},
    )


def _post(base: str, auth: dict, ops: list[dict], infrastructure: str = "infra-lab") -> dict:
    import httpx

    done = httpx.post(
        f"{base}/api/intent/patches",
        params={"infrastructure": infrastructure},
        headers=auth,
        json={"author": "orhan", "ops": ops},
        timeout=30,
    )
    assert done.status_code == 200, done.text
    return done.json()


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_clipboard_in_a_browser(settings, bundle_dict):
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            url = f"{base}/?infrastructure=infra-lab"
            tab = _open(chrome, base, url)
            core = tab.js("LDApp.debug.handle().toile.state.positions.get('sw-core-01')")
            nx, ny = core["x"] - 140, core["y"] + 140
            note = {"op": "annotation_create", "w": 160, "h": 60}
            _post(
                base,
                auth,
                [
                    {**note, "content": {"kind": "note", "text": "Baie"}, "x": nx, "y": ny},
                    {**note, "content": {"kind": "note", "text": "Salle"}, "x": nx + 260, "y": ny},
                ],
            )
            link = {
                "op": "connector_create",
                "start": {"kind": "annotation", "ref": "a1-1", "side": "e"},
                "end": {"kind": "annotation", "ref": "a1-2", "side": "w"},
            }
            _post(base, auth, [link])
            tab.navigate(url)
            _wait(tab, READY)
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a1-2\"]')")
            threading.Event().wait(0.4)

            # la sélection : les deux notes et le connecteur qui les relie
            _click(tab, *_note_center(tab, "a1-1"))
            _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-1'")
            _ctrl_click(tab, *_note_center(tab, "a1-2"))
            ends = tab.js("(() => { const e = LDApp.debug.handle().toile.ends.get('c2-1'); return [e.a, e.b]; })()")
            _ctrl_click(tab, *_screen(tab, (ends[0]["x"] + ends[1]["x"]) / 2, (ends[0]["y"] + ends[1]["y"]) / 2))
            _wait(tab, "LDApp.debug.state().picked.connectors.join() === 'c2-1'")
            assert json.loads(tab.js(PICKED))["annotations"] == ["a1-1", "a1-2"]

            # Ctrl+C puis Ctrl+V, le pointeur hors de la toile : la copie à +20 / +20, sélectionnée, reliée
            _move(tab, *OUTSIDE)
            _copy(tab)
            _wait_note(tab, "3 éléments copiés")
            text = tab.js("navigator.clipboard.readText()")
            assert text.startswith('{"living-diagram":1,"infrastructure":"infra-lab"'), text[:80]
            revision = _intent_doc(base, auth)["revision"]
            _paste(tab)
            _wait_note(tab, "3 éléments collés \\(orhan\\)")
            _wait(
                tab,
                "LDApp.debug.state().picked.connectors.length === 1"
                " && LDApp.debug.state().picked.annotations.length === 2",
            )
            doc = _intent_doc(base, auth)
            assert doc["revision"] == revision + 2, "deux requêtes : les notes, puis le connecteur qui les vise"
            [copy_a] = [a for a in _by_text(doc, "Baie") if a["id"] != "a1-1"]
            [copy_b] = [a for a in _by_text(doc, "Salle") if a["id"] != "a1-2"]
            assert (copy_a["x"], copy_a["y"], copy_b["x"]) == (nx + 20, ny + 20, nx + 280)
            [copy_line] = [c for c in doc["connectors"] if c["id"] != "c2-1"]
            assert copy_line["start"] == {"kind": "annotation", "ref": copy_a["id"], "side": "e"}
            assert copy_line["end"] == {"kind": "annotation", "ref": copy_b["id"], "side": "w"}
            picked = json.loads(tab.js(PICKED))
            assert picked["annotations"] == sorted([copy_a["id"], copy_b["id"]]) and picked["connectors"] == [
                copy_line["id"]
            ]
            assert tab.js(UNDO_LABEL) == "annuler : ajout de 3 éléments", "une seule entrée pour les deux requêtes"
            # un seul Ctrl+Z défait tout le collage
            _key(tab, "z", 90, CTRL)
            _wait_note(tab, "annulé : ajout de 3 éléments")
            doc = _intent_doc(base, auth)
            assert len(doc["annotations"]) == 2 and [c["id"] for c in doc["connectors"]] == ["c2-1"]
            # Ctrl+Y le refait : le connecteur recréé tient aux notes recréées (revue du lot 3, B8) ; Ctrl+Z, de nouveau
            _key(tab, "y", 89, CTRL)
            _wait_note(tab, "rétabli : ajout de 3 éléments")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.connectors.length === 2")
            doc = _intent_doc(base, auth)
            ids = {a["id"] for a in doc["annotations"]}
            [again] = [c for c in doc["connectors"] if c["id"] != "c2-1"]
            assert again["start"]["ref"] in ids - {"a1-1", "a1-2"} and again["end"]["ref"] in ids - {"a1-1", "a1-2"}
            _key(tab, "z", 90, CTRL)
            _wait_note(tab, "annulé : ajout de 3 éléments")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 2")

            # collages répétés : chacun décale encore
            _paste(tab)
            _wait_note(tab, "3 éléments collés")
            _paste(tab)
            _wait(tab, "LDApp.debug.state().history.undo && LDApp.debug.state().history.undo.key === 'createdItems'")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 6")
            xs = sorted(a["x"] for a in _by_text(_intent_doc(base, auth), "Baie"))
            assert xs == [nx, nx + 40, nx + 60], xs
            for _ in range(2):
                _key(tab, "z", 90, CTRL)
                _wait_note(tab, "annulé : ajout de 3 éléments")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 2")

            # au pointeur : le coin haut gauche du collage sous lui
            pane = json.loads(tab.js(PANE_POINT.format(900, 300)))
            _move(tab, *pane)
            pointer = tab.js("LDApp.debug.handle().toile.pointer")
            _paste(tab)
            _wait_note(tab, "3 éléments collés")
            _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 4")
            pasted = [a for a in _by_text(_intent_doc(base, auth), "Baie") if a["id"] != "a1-1"][0]
            assert (pasted["x"], pasted["y"]) == (round(pointer["x"]), round(pointer["y"])), (pasted, pointer)
            _key(tab, "z", 90, CTRL)
            _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 2")

            _duplicate_and_clone(tab, base, auth, (nx, ny))
            _cut_devices_and_foreign(tab, base, auth)
            _menu_and_read_only(tab, base, auth)
        assert not [m for m in chrome.console if m.get("level") == "error"], chrome.console
    finally:
        server.should_exit = True
        thread.join(timeout=10)


def _count(base: str, auth: dict, text: str) -> list[dict]:
    return _by_text(_intent_doc(base, auth), text)


def _duplicate_and_clone(tab, base: str, auth: dict, origin: tuple[int, int]) -> None:
    """Ctrl+D à +20 / +20, encore ; Alt + glissé (fantôme pendant, copie à la relâche, original resté) ; puis Ctrl+D
    répète l'écart du clone."""
    from tests.test_view import _wait

    nx, ny = origin
    _click(tab, *_note_center(tab, "a1-1"))
    _wait(
        tab,
        "LDApp.debug.state().picked.annotations.join() === 'a1-1'"
        " && LDApp.debug.state().picked.connectors.length === 0",
    )
    _key(tab, "d", 68, CTRL)
    _wait_note(tab, "1 élément collé")
    _wait(
        tab,
        "LDApp.debug.state().picked.annotations.length === 1 && LDApp.debug.state().picked.annotations[0] !== 'a1-1'",
    )
    _key(tab, "d", 68, CTRL)
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 4")
    assert sorted((a["x"], a["y"]) for a in _count(base, auth, "Baie")) == [
        (nx, ny),
        (nx + 20, ny + 20),
        (nx + 40, ny + 40),
    ]
    for _ in range(2):
        _key(tab, "z", 90, CTRL)
        _wait_note(tab, "annulé")
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 2")

    # Alt + glissé : pendant le geste, le fantôme ; l'original ne bouge pas ; à la relâche, la copie, sélectionnée
    _click(tab, *_note_center(tab, "a1-1"))
    _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-1'")
    start = _note_center(tab, "a1-1")
    zoom = tab.js("LDApp.debug.handle().toile.viewport().zoom")
    seen = {}

    def during() -> None:
        seen["ghost"] = tab.js(GHOST)
        seen["original"] = _note_center(tab, "a1-1")
        seen["count"] = tab.js("LDApp.debug.handle().toile.model.intent.annotations.length")

    _alt_drag(tab, start, (start[0] + 120, start[1] + 80), during=during, free=True)
    assert seen == {"ghost": True, "original": start, "count": 2}, seen
    _wait_note(tab, "1 élément collé")
    _wait(tab, f"!{GHOST}")
    dx, dy = round(120 / zoom), round(80 / zoom)
    clone = [a for a in _count(base, auth, "Baie") if a["id"] != "a1-1"][0]
    assert abs(clone["x"] - nx - dx) <= 1 and abs(clone["y"] - ny - dy) <= 1, (clone, dx, dy)
    original = [a for a in _count(base, auth, "Baie") if a["id"] == "a1-1"][0]
    assert (original["x"], original["y"]) == (nx, ny), "l'original est resté"
    _wait(tab, f"LDApp.debug.state().picked.annotations.join() === {json.dumps(clone['id'])}")
    # Ctrl+D répète l'écart du clone tant que la sélection est la copie
    _key(tab, "d", 68, CTRL)
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 4")
    third = [a for a in _count(base, auth, "Baie") if a["id"] not in ("a1-1", clone["id"])][0]
    assert (third["x"] - clone["x"], third["y"] - clone["y"]) == (clone["x"] - nx, clone["y"] - ny), (third, clone)
    for _ in range(2):
        _key(tab, "z", 90, CTRL)
        _wait_note(tab, "annulé")
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 2")


def _cut_devices_and_foreign(tab, base: str, auth: dict) -> None:
    """Ctrl+X (copie puis suppression, Ctrl+Z rend) ; deux équipements copiés = leurs noms en texte, Ctrl+V ne crée
    rien ; un texte et une image d'ailleurs gardent le comportement d'avant ; une charge illisible ne colle rien."""
    from tests.test_api_assets import png
    from tests.test_app import _PASTE_IMAGE, _PASTE_TEXT
    from tests.test_view import _wait

    _click(tab, *_note_center(tab, "a1-2"))
    _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-2'")
    _key(tab, "x", 88, CTRL)
    _wait_note(tab, "1 élément coupé \\(orhan\\)")
    assert not _count(base, auth, "Salle")
    assert tab.js("navigator.clipboard.readText()").startswith('{"living-diagram":1')
    _key(tab, "z", 90, CTRL)
    _wait_note(tab, "annulé")
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 2")

    one, two = _settled(tab, "sw-core-01"), _settled(tab, "sw-core-02")
    _click(tab, one["x"], one["y"])
    _click(tab, two["x"], two["y"], SHIFT)
    _wait(tab, "LDApp.debug.state().picked.hosts.length === 2")
    _move(tab, *OUTSIDE)
    _copy(tab)
    _wait_note(tab, "noms de 2 équipements copiés en texte")
    assert tab.js("navigator.clipboard.readText()") == "sw-core-01\nsw-core-02"
    revision = _intent_doc(base, auth)["revision"]
    _paste(tab)
    _wait_note(tab, "les équipements ne se collent pas")
    assert _intent_doc(base, auth)["revision"] == revision, "rien ne se crée (D6)"
    # le repli de l'onglet : un texte collé sans le format propre, mais exactement celui de notre dernière copie,
    # est notre copie (des noms d'équipements : rien ne se crée, et non une note « sw-core-01 sw-core-02 »)
    said = tab.js("LDApp.debug.state().note.at")
    tab.js(_PASTE_TEXT.format(json.dumps("sw-core-01\nsw-core-02")))
    _wait(tab, f"LDApp.debug.state().note.at !== {said} && /les équipements ne se collent pas/.test({NOTE})")
    assert _intent_doc(base, auth)["revision"] == revision
    # d'ailleurs : un texte devient une note, une image une annotation image (docs/10 §6.6, inchangé)
    tab.js(_PASTE_TEXT.format(json.dumps("Baie externe")))
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.some((a) => a.content.text === 'Baie externe')")
    encoded = base64.b64encode(png(40, 30)).decode()
    tab.js(_PASTE_IMAGE.format(json.dumps(encoded)))
    _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.some((a) => a.content.kind === 'image')")
    revision = _intent_doc(base, auth)["revision"]
    tab.js(_PASTE_TEXT.format(json.dumps('{"living-diagram": 9, "annotations": []}')))
    _wait_note(tab, "illisible")
    assert _intent_doc(base, auth)["revision"] == revision


def _menu_and_read_only(tab, base: str, auth: dict) -> None:
    """Le menu contextuel porte copier, couper, coller, dupliquer et leurs raccourcis ; « copier » puis « coller ici »
    (l'API asynchrone du presse-papiers) au point du clic ; en vue Contrôle et sans nom, rien ne se colle, la page le
    dit."""
    from tests.test_app import _right_click
    from tests.test_view import _wait

    items = (
        "Array.from(document.querySelectorAll('.context-menu .context-item'))"
        ".map((b) => [b.querySelector('.context-label').textContent,"
        " (b.querySelector('.context-keys') || {}).textContent"
        " || '', b.getAttribute('aria-keyshortcuts') || ''])"
    )
    # le quart droit de la note : la note « Baie externe » collée plus haut, posée au centre de la vue sans aimant
    # (revue de session, J1 : une insertion ne s'aimante qu'avec l'aimant), en recouvre le bord gauche
    x, y = _note_center(tab, "a1-1")
    _right_click(tab, x + 50, y)
    _wait(tab, "!!document.querySelector('.context-menu')")
    got = [entry for entry in tab.js(items) if entry[1]]
    assert got == [
        ["copier", "Ctrl+C", "Control+C"],
        ["couper", "Ctrl+X", "Control+X"],
        ["coller ici", "Ctrl+V", "Control+V"],
        ["dupliquer", "Ctrl+D", "Control+D"],
    ], got
    tab.js(
        "Array.from(document.querySelectorAll('.context-menu .context-item'))"
        ".find((b) => b.textContent.startsWith('copier')).click()"
    )
    _wait_note(tab, "1 élément copié")
    _wait(tab, 'navigator.clipboard.readText().then((t) => t.includes(\'"id":"a1-1"\'))')
    pane = json.loads(tab.js(PANE_POINT.format(500, 650)))
    _right_click(tab, *pane)
    _wait(tab, "!!document.querySelector('.context-menu')")
    plan = tab.js("LDApp.debug.state().context.plan")
    before = len(_count(base, auth, "Baie"))
    tab.js(
        "Array.from(document.querySelectorAll('.context-menu .context-item'))"
        ".find((b) => b.textContent.startsWith('coller ici')).click()"
    )
    _wait_note(tab, "1 élément collé")
    _wait(
        tab,
        "LDApp.debug.handle().toile.model.intent.annotations"
        f".filter((a) => a.content.text === 'Baie').length === {before + 1}",
    )
    placed = [a for a in _count(base, auth, "Baie") if a["id"] != "a1-1"][-1]
    assert (placed["x"], placed["y"]) == (round(plan["x"]), round(plan["y"])), (placed, plan)

    # la vue Contrôle se lit : rien ne se colle, ni par Ctrl+V ni par Ctrl+D, et la page le dit
    revision = _intent_doc(base, auth)["revision"]
    _mode(tab, "Contrôle")
    _wait(tab, "LDApp.debug.state().view.mode === 'control'")
    _paste(tab)
    _wait_note(tab, "lecture seule")
    _right_click(tab, *json.loads(tab.js(PANE_POINT.format(500, 650))))
    _wait(tab, "!!document.querySelector('.context-menu')")
    assert not [entry for entry in tab.js(items) if entry[0] == "coller ici"], "en lecture seule, le menu ne colle pas"
    _key(tab, "Escape", 27)
    _mode(tab, "Diagramme")
    _wait(tab, "LDApp.debug.state().view.mode === 'diagram'")
    # sans nom : rien ne s'écrit, la page le dit
    tab.js("LDApp.debug.handle().writer.author = ''")
    _paste(tab)
    _wait_note(tab, "sans nom")
    tab.js("LDApp.debug.handle().writer.author = 'orhan'")
    assert _intent_doc(base, auth)["revision"] == revision


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_pastes_from_one_infrastructure_to_another_in_a_browser(settings, bundle_dict):
    """Un collage d'une infrastructure à l'autre : l'image est renvoyée au magasin de destination (même empreinte),
    une note attachée à un équipement du même nom le reste, une note attachée à un groupe d'ici devient libre là-bas
    (un id de groupe ne veut rien dire ailleurs) ; une image introuvable devient une note qui le dit."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_api_assets import png
    from tests.test_app import _PASTE_TEXT
    from tests.test_review_e2e import _relabel
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        other = _relabel(bundle_dict, "infra-b", "run-b")
        assert httpx.post(f"{base}/api/ingest/bundles", json=other, headers=auth, timeout=60).status_code == 201
        sent = httpx.post(
            f"{base}/api/intent/assets",
            params=INFRA,
            headers={**auth, "Content-Type": "image/png"},
            content=png(48, 32),
            timeout=30,
        )
        assert sent.status_code == 201, sent.text
        asset = sent.json()["asset"]
        _post(base, auth, [{"op": "group_create", "label": "Cœurs", "members": ["sw-core-01", "sw-core-02"]}])
        _post(
            base,
            auth,
            [
                {
                    "op": "annotation_create",
                    "content": {"kind": "image", "asset": asset, "alt": "Baie 12"},
                    "x": 0,
                    "y": 0,
                    "w": 96,
                    "h": 64,
                },
                {
                    "op": "annotation_create",
                    "content": {"kind": "note", "text": "Cœur"},
                    "anchor": {"kind": "device", "ref": "sw-core-01"},
                    "x": 60,
                    "y": -120,
                    "leader": True,
                },
                {
                    "op": "annotation_create",
                    "content": {"kind": "note", "text": "Groupe"},
                    "anchor": {"kind": "group", "ref": "g1-1"},
                    "x": 0,
                    "y": -100,
                    "leader": True,
                },
            ],
        )
        assert (
            httpx.get(
                f"{base}/api/intent/assets", params={"infrastructure": "infra-b", "asset": asset}, headers=auth
            ).status_code
            == 404
        )
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a2-3\"]')")
            tab.js(
                "LDApp.debug.handle().toile.selectItems(['a2-1', 'a2-2', 'a2-3']"
                ".map((id) => ({ kind: 'annotation', id })))"
            )
            _wait(tab, "LDApp.debug.state().picked.annotations.length === 3")
            _move(tab, *OUTSIDE)
            _copy(tab)
            _wait_note(tab, "3 éléments copiés")
            # l'autre infrastructure, dans le même onglet : la mémoire de l'onglet est partie, le presse-papiers reste
            tab.navigate(f"{base}/?infrastructure=infra-b")
            _wait(tab, READY)
            _move(tab, *OUTSIDE)
            _paste(tab)
            _wait_note(tab, "3 éléments collés")
            doc = httpx.get(f"{base}/api/intent", params={"infrastructure": "infra-b"}, headers=auth).json()
            kinds = {a["content"].get("text") or a["content"]["kind"]: a for a in doc["annotations"]}
            assert kinds["image"]["content"] == {"kind": "image", "asset": asset, "alt": "Baie 12"}
            got = httpx.get(
                f"{base}/api/intent/assets", params={"infrastructure": "infra-b", "asset": asset}, headers=auth
            )
            assert got.status_code == 200 and got.content == png(48, 32), "l'image est dans le magasin de destination"
            assert (
                kinds["Cœur"]["anchor"] == {"kind": "device", "ref": "sw-core-01"} and kinds["Cœur"]["leader"] is True
            )
            assert kinds["Groupe"]["anchor"] == {"kind": "free", "ref": None} and kinds["Groupe"]["leader"] is False
            _wait(tab, "!!document.querySelector('.annotation.kind-image image')")
            # une image que rien ne sert (une autre instance, un magasin vidé) : une note qui porte son texte
            lost = {
                "living-diagram": 1,
                "infrastructure": "infra-ailleurs",
                "hosts": [],
                "connectors": [],
                "annotations": [
                    {
                        "id": "a9-1",
                        "anchor": {"kind": "free", "ref": None},
                        "x": 0,
                        "y": 0,
                        "w": 96,
                        "h": 64,
                        "z": "front",
                        "leader": False,
                        "content": {"kind": "image", "asset": "e" * 64, "alt": "Plan perdu"},
                        "style": kinds["image"]["style"],
                        "frame": {"x": 0, "y": 0, "w": 96, "h": 64},
                    }
                ],
            }
            tab.js(_PASTE_TEXT.format(json.dumps(json.dumps(lost))))
            _wait_note(tab, "1 image introuvable, collée en note")
            doc = httpx.get(f"{base}/api/intent", params={"infrastructure": "infra-b"}, headers=auth).json()
            assert [a["content"] for a in doc["annotations"] if a["content"].get("text") == "Plan perdu"] == [
                {"kind": "note", "text": "Plan perdu"}
            ]
            # un bloc de code venu d'ailleurs avec une valeur gardée là-bas : rien n'est collé avant le choix, proposé
            # par la ligne d'état ; « retirer ces valeurs » colle le bloc sans elle, « coller tel quel » avec (revue du
            # lot 16, M3)
            code = {"kind": "code", "text": "snmp-server community Comm-S3cret RO\nend", "language": "cisco_ios"}
            code |= {"title": ""}
            code |= {"highlight": True, "line_numbers": True, "font": "jetbrains_mono"}
            block = {**lost["annotations"][0], "id": "a9-2", "content": code, "w": 480, "h": 120}
            block["frame"] = {"x": 0, "y": 0, "w": 480, "h": 120}
            secret = {**lost, "annotations": [block]}

            def codes() -> list[str]:
                doc = httpx.get(f"{base}/api/intent", params={"infrastructure": "infra-b"}, headers=auth).json()
                return [a["content"]["text"] for a in doc["annotations"] if a["content"]["kind"] == "code"]

            tab.js(_PASTE_TEXT.format(json.dumps(json.dumps(secret))))
            _wait_note(tab, "rien n'est collé avant votre choix")
            assert codes() == [], "rien n'est écrit avant le choix"
            tab.js("Array.from(document.querySelectorAll('.toast-action'))[0].click()")
            _wait_note(tab, "1 valeur sensible retirée")
            assert codes() == ["snmp-server community <removed> RO\nend"]
            tab.js(_PASTE_TEXT.format(json.dumps(json.dumps(secret))))
            _wait_note(tab, "rien n'est collé avant votre choix")
            tab.js("Array.from(document.querySelectorAll('.toast-action'))[1].click()")
            _wait(tab, "LDApp.debug.state().note === null || !/avant votre choix/.test(LDApp.debug.state().note.text)")
            for _ in range(100):
                if len(codes()) == 2:
                    break
                threading.Event().wait(0.05)
            assert codes()[1] == "snmp-server community Comm-S3cret RO\nend", "tel quel, sur demande"
        assert not [m for m in chrome.console if m.get("level") == "error"], chrome.console
    finally:
        server.should_exit = True
        thread.join(timeout=10)
