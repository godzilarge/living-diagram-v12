"""Le presse-papiers dans un vrai navigateur, ce que la revue du lot 3 a trouvé (docs/revues/2026-10-14-lot-3-...).

H1 : un collage commencé dans une infrastructure ne s'écrit jamais dans celle qu'on regarde ensuite ; il s'arrête et le
dit. M1 : une seconde requête refusée défait la première (aucune entrée d'annulation, un seul message). M3 : une
sélection de texte laissée dans la page ne détourne plus Ctrl+C après un appui sur la toile ; un texte sélectionné dans
une fiche garde la copie native. M4 : couper ne supprime pas un groupe. B1 : deux Ctrl+D rapprochés posent deux copies
à deux places. B3 : sans nom, Alt + glissé ne fait rien (glissé normal, et une annotation ne se glisse pas sans nom)."""

import json
import threading

import httpx
import pytest

from tests.test_app import _PASTE_TEXT, CTRL, NOTE, READY, _click
from tests.test_app_clipboard import (
    GHOST,
    OUTSIDE,
    _alt_drag,
    _copy,
    _grant,
    _key,
    _move,
    _note_center,
    _open,
    _paste,
    _post,
    _wait_note,
)
from tests.test_render import CHROMIUM

# La lecture des images ralentie de 1,5 s (la fenêtre où l'on change d'infrastructure), chaque appel noté.
SLOW_ASSET_GET = (
    "(() => { const real = window.fetch; window.__fetches = [];"
    " window.fetch = (url, init) => { const u = String(url), post = !!(init && init.method === 'POST');"
    " window.__fetches.push([post ? 'POST' : 'GET', u]);"
    " const slow = u.includes('/api/intent/assets') && !post;"
    " return slow ? new Promise((ok) => setTimeout(ok, 1500)).then(() => real(url, init)) : real(url, init); };"
    " return true; })()"
)
SWITCH = (
    "(() => {{ history.pushState(null, '', location.pathname + '?infrastructure=' + {0});"
    " window.dispatchEvent(new PopStateEvent('popstate')); return true; }})()"
)


def _doc(base: str, auth: dict, infra: str = "infra-lab") -> dict:
    return httpx.get(f"{base}/api/intent", params={"infrastructure": infra}, headers=auth, timeout=30).json()


def _serve_with(settings, bundle_dict, *, second: bool = False):
    from tests.conftest import TOKEN
    from tests.test_review_e2e import _relabel
    from tests.test_view import _serve

    server, thread, base = _serve(settings)
    auth = {"Authorization": f"Bearer {TOKEN}"}
    assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
    if second:
        other = _relabel(bundle_dict, "infra-b", "run-b")
        assert httpx.post(f"{base}/api/ingest/bundles", json=other, headers=auth, timeout=60).status_code == 201
    return server, thread, base, auth


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_a_paste_never_lands_in_the_infrastructure_shown_afterwards(settings, bundle_dict):
    """H1 (la sonde de la revue) : copie d'infra-lab (une image, une note), collage dans infra-b, lecture de l'image
    ralentie, retour à infra-lab pendant ce temps : rien n'est écrit, ni ici ni là-bas, et la page le dit."""
    from tests.browser import Chrome
    from tests.test_api_assets import png
    from tests.test_view import _wait

    server, thread, base, auth = _serve_with(settings, bundle_dict, second=True)
    try:
        headers = {**auth, "Content-Type": "image/png"}
        sent = httpx.post(
            f"{base}/api/intent/assets", params={"infrastructure": "infra-lab"}, headers=headers, content=png(48, 32)
        )
        asset = sent.json()["asset"]
        image = {"kind": "image", "asset": asset, "alt": "Baie"}
        note = {"kind": "note", "text": "SONDE"}
        _post(
            base,
            auth,
            [
                {"op": "annotation_create", "content": image, "x": 0, "y": 0, "w": 96, "h": 64},
                {"op": "annotation_create", "content": note, "x": 200, "y": 0},
            ],
        )
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a1-2\"]')")
            tab.js(
                "LDApp.debug.handle().toile.selectItems([{kind:'annotation',id:'a1-1'},{kind:'annotation',id:'a1-2'}])"
            )
            _wait(tab, "LDApp.debug.state().picked.annotations.length === 2")
            _move(tab, *OUTSIDE)
            _copy(tab)
            _wait_note(tab, "2 éléments copiés")
            tab.navigate(f"{base}/?infrastructure=infra-b")
            _wait(tab, READY)
            tab.js(SLOW_ASSET_GET)
            _move(tab, *OUTSIDE)
            _paste(tab)
            threading.Event().wait(0.3)
            tab.js(SWITCH.format(json.dumps("infra-lab")))
            _wait(tab, "LDApp.debug.state().address.infrastructure === 'infra-lab'")
            _wait_note(tab, "collage abandonné")
            threading.Event().wait(1.0)
            assert len(_doc(base, auth)["annotations"]) == 2, "rien dans l'infrastructure qu'on regarde ensuite"
            assert _doc(base, auth, "infra-b")["annotations"] == [], "rien là où le collage a commencé"
            posts = [u for method, u in tab.js("window.__fetches") if method == "POST"]
            assert posts == [], posts
            assert "infra-b" in tab.js(NOTE)
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_a_refused_second_request_undoes_the_paste(settings, bundle_dict):
    """M1 (la sonde de la revue) : le connecteur qui vise la note collée est refusé (tracé inconnu) : la note créée par
    la première requête est défaite, aucune entrée d'annulation, un seul message « collage refusé »."""
    from tests.browser import Chrome

    server, thread, base, auth = _serve_with(settings, bundle_dict)
    try:
        _post(base, auth, [{"op": "annotation_create", "content": {"kind": "note", "text": "x"}, "x": 0, "y": 0}])
        style = _doc(base, auth)["annotations"][0]["style"]
        with Chrome(CHROMIUM) as chrome:
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            free = {"kind": "free", "ref": None}
            payload = {
                "living-diagram": 1,
                "infrastructure": "infra-lab",
                "hosts": [],
                "annotations": [
                    {
                        "id": "n1",
                        "anchor": free,
                        "x": 0,
                        "y": 0,
                        "w": 100,
                        "h": 40,
                        "z": "front",
                        "leader": False,
                        "content": {"kind": "note", "text": "PARTIEL"},
                        "style": style,
                        "frame": {"x": 0, "y": 0, "w": 100, "h": 40},
                    }
                ],
                "connectors": [
                    {
                        "id": "k1",
                        "start": {"kind": "free", "x": 0, "y": 0},
                        "end": {"kind": "annotation", "ref": "n1", "side": "auto"},
                        "heads": {"start": "none", "end": "arrow"},
                        "route": "zigzag",
                        "bend": 0,
                        "label": "",
                        "z": "front",
                        "style": {"hue": "slate"},
                        "a": {"x": 0, "y": 0},
                        "b": {"x": 9, "y": 9},
                    }
                ],
            }
            revision = _doc(base, auth)["revision"]
            tab.js(_PASTE_TEXT.format(json.dumps(json.dumps(payload))))
            _wait_note(tab, "collage refusé : ")
            doc = _doc(base, auth)
            assert doc["revision"] == revision + 2, "la note, puis sa suppression"
            assert not [a for a in doc["annotations"] if a["content"].get("text") == "PARTIEL"]
            assert not doc["connectors"]
            assert tab.js("JSON.stringify(LDApp.debug.state().history)") == '{"undo":null,"redo":null}'
            assert json.loads(tab.js("JSON.stringify(LDApp.debug.state().picked)"))["annotations"] == []
            assert "collés" not in tab.js(NOTE)
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_copy_cut_and_duplicate_guards_in_a_browser(settings, bundle_dict):
    """M3 : du texte resté sélectionné dans la barre, un clic sur une note, Ctrl+C : la note est copiée ; du texte
    sélectionné dans une fiche, Ctrl+C : ce texte. M4 : Ctrl+X d'une note et d'un groupe : la note part, le groupe reste
    et la page le dit. B1 : deux Ctrl+D rapprochés. B3 : sans nom, Alt + glissé ne fait rien."""
    from tests.browser import Chrome
    from tests.test_view import _wait

    server, thread, base, auth = _serve_with(settings, bundle_dict)
    try:
        group = {"op": "group_create", "label": "Cœurs", "members": ["sw-core-01", "sw-core-02"]}
        baie = {"kind": "note", "text": "Baie"}
        note = {"op": "annotation_create", "content": baie, "x": 0, "y": 0, "w": 160, "h": 60}
        _post(base, auth, [group, note])
        with Chrome(CHROMIUM) as chrome:
            _grant(chrome, base)
            tab = _open(chrome, base, f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.react-flow__node[data-id=\"annotation:a1-1\"]')")
            threading.Event().wait(0.4)
            # M3 : la sélection de texte de la barre est effacée par l'appui sur la toile
            select_bar = (
                "(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.bar'));"
                " const s = getSelection(); s.removeAllRanges(); s.addRange(r); return String(s).length; })()"
            )
            assert tab.js(select_bar) > 20
            _click(tab, *_note_center(tab, "a1-1"))
            _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-1'")
            assert tab.js("String(getSelection())") == ""
            _move(tab, *OUTSIDE)
            _copy(tab)
            _wait_note(tab, "1 élément copié")
            assert tab.js("navigator.clipboard.readText()").startswith('{"living-diagram":1')
            # ... un texte sélectionné dans la fiche (sans appui sur la toile) garde la copie native
            title = "document.querySelector('.panel h2')"
            tab.js(
                f"(() => {{ const r = document.createRange(); r.selectNodeContents({title});"
                " const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()"
            )
            expected = tab.js(f"{title}.textContent")
            _copy(tab)
            _wait(tab, f"navigator.clipboard.readText().then((t) => t === {json.dumps(expected)})")
            tab.js("getSelection().removeAllRanges()")

            # B1 : deux Ctrl+D rapprochés, sur la même sélection : deux copies, à +20 puis +40
            _click(tab, *_note_center(tab, "a1-1"))
            _wait(tab, "LDApp.debug.state().picked.annotations.join() === 'a1-1'")
            _key(tab, "d", 68, CTRL)
            _key(tab, "d", 68, CTRL)
            _wait(tab, "LDApp.debug.handle().toile.model.intent.annotations.length === 3")
            assert sorted((a["x"], a["y"]) for a in _doc(base, auth)["annotations"]) == [(0, 0), (20, 20), (40, 40)]

            # M4 : couper une note et un groupe : la note part, le groupe reste et la page le dit
            tab.js("LDApp.debug.handle().toile.selectItems([{kind:'annotation',id:'a1-1'},{kind:'group',id:'g1-1'}])")
            _wait(tab, "LDApp.debug.state().picked.groups.length === 1")
            _key(tab, "x", 88, CTRL)
            _wait_note(tab, "1 élément coupé \\(orhan\\) · .*1 groupe gardé")
            doc = _doc(base, auth)
            assert [g["id"] for g in doc["groups"]] == ["g1-1"] and "a1-1" not in {a["id"] for a in doc["annotations"]}

            # B3 : sans nom, Alt + glissé n'est pas pris (et une annotation ne se glisse pas sans nom) : rien ne bouge
            tab.js("LDApp.debug.handle().writer.author = ''")
            revision = _doc(base, auth)["revision"]
            survivor = _doc(base, auth)["annotations"][0]["id"]
            start = _note_center(tab, survivor)
            seen = {}
            _alt_drag(tab, start, (start[0] + 120, start[1] + 80), during=lambda: seen.update(ghost=tab.js(GHOST)))
            threading.Event().wait(0.5)
            assert seen == {"ghost": False} and _doc(base, auth)["revision"] == revision
            tab.js("LDApp.debug.handle().writer.author = 'orhan'")
        assert not [m for m in chrome.console if m.get("level") == "error"], chrome.console
    finally:
        server.should_exit = True
        thread.join(timeout=10)
