"""`GET /` : l'application (React, `engine/src/app/`), servie sans jeton, sans donnée, fichiers lus à la requête."""

import base64
import json
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ld_backend.render.app import APP_CSP, app_asset_names, render_app
from tests.test_render import CHROMIUM, ENGINE, JS_TESTS

APP_SRC = ENGINE / "src" / "app"
ASSETS = Path(__file__).resolve().parents[1] / "src" / "ld_backend" / "render" / "assets" / "app"


def test_the_application_page_is_served_without_token_under_a_self_only_csp(client: TestClient):
    res = client.get("/")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/html")
    assert res.headers["content-security-policy"] == APP_CSP
    assert "'self'" in APP_CSP and "unsafe" not in APP_CSP and "default-src 'none'" in APP_CSP
    page = res.text
    assert 'src="/assets/app/app.js"' in page and 'href="/assets/app/app.css"' in page and 'id="app"' in page
    assert not re.findall(r"https?://", page), "aucune ressource externe, aucune URL"
    assert page == render_app() == client.get("/").text, "même page à chaque requête"
    catalogue = json.loads(re.search(r'id="ld-catalogue">(.*?)</script>', page, re.DOTALL).group(1))
    assert "self_observation" in catalogue and catalogue["documented_not_observed"]["rule"] == "R3"


def test_the_application_files_are_served_at_request_time_with_an_etag(client: TestClient):
    names = app_asset_names()
    assert "app.js" in names and "app.css" in names
    assert any(n.startswith("fonts/") and n.endswith(".woff2") for n in names)
    script = client.get("/assets/app/app.js")
    assert script.status_code == 200 and script.headers["content-type"].startswith("text/javascript")
    assert script.headers["etag"].startswith('"') and script.headers["cache-control"] == "no-cache"
    again = client.get("/assets/app/app.js", headers={"If-None-Match": script.headers["etag"]})
    assert again.status_code == 304 and again.content == b""
    style = client.get("/assets/app/app.css")
    assert style.status_code == 200 and style.headers["content-type"].startswith("text/css")
    css = style.text
    assert "@import" not in css and "url(http" not in css and "url(//" not in css, "rien d'externe"
    fonts = sorted(set(re.findall(r"url\([\"']?\.?/?(fonts/[^)\"']+)", css)))
    assert fonts, "les polices sont embarquées (Inter, JetBrains Mono)"
    for font in fonts:
        got = client.get("/assets/app/" + font)
        assert got.status_code == 200 and got.headers["content-type"] == "font/woff2", font
    assert any("inter" in f for f in fonts) and any("jetbrains" in f for f in fonts)


def test_an_unknown_or_escaped_asset_path_is_a_404(client: TestClient):
    for path in (
        "/assets/app/missing.js",
        "/assets/app/../js/viewer.js",
        "/assets/app/%2e%2e/js/viewer.js",
        "/assets/app/fonts",
        "/assets/app/",
        "/assets/app/app.js/",
    ):
        res = client.get(path)
        assert res.status_code == 404, (path, res.status_code)
        assert b"ld_backend" not in res.content and b"/home/" not in res.content


def test_the_application_sources_never_write_html_from_data():
    """Sur les sources de l'application : React pose des nœuds texte, jamais du HTML depuis une donnée (une description
    est du texte libre, un voisin LLDP annonce ce qu'il veut) ; `dangerouslySetInnerHTML` est interdit par ce test."""
    files = sorted(p for p in APP_SRC.rglob("*") if p.suffix in (".ts", ".tsx", ".css"))
    assert len(files) > 10, "les sources de l'application sont dans engine/src/app"
    sources = "".join(p.read_text(encoding="utf-8") for p in files)
    forbidden = ["dangerouslySetInnerHTML", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]
    forbidden += [
        "new Function",
        "DOMParser",
        "createContextualFragment",
        "srcdoc",
        "javascript:",
        "http://",
        "https://",
    ]
    for word in forbidden:
        assert word not in sources, word
    assert not re.search(r"""setAttribute\(\s*["'](href|src|on\w+)""", sources)
    assert "style={{" not in sources, "jamais de style en ligne : la feuille de style porte tout (CSP style-src 'self')"


def test_the_built_application_is_the_one_in_the_assets():
    """Le bundle versionné est celui que les sources produisent : vérifié par `build.mjs --check` dans
    `test_the_built_viewer_matches_the_engine_sources` ; ici, seulement que les fichiers sont présents et non vides."""
    for name in ("app.js", "app.css"):
        path = ASSETS / name
        assert path.is_file() and path.stat().st_size > 1000, name
    assert (ASSETS / "app.js").read_text(encoding="utf-8").startswith("// Généré par engine/build.mjs")


@pytest.mark.skipif(shutil.which("node") is None, reason="Node absent : les tests de l'application ne tournent pas")
def test_the_application_passes_its_node_tests():
    """Le fichier construit se charge sous Node sans DOM : adresse, réducteur, règles, alignement."""
    done = subprocess.run(
        ["node", "--test", str(JS_TESTS / "app.test.js")],
        capture_output=True,
        text=True,
        timeout=120,
        env={**os.environ, "LD_APP": str(ASSETS / "app.js")},
        check=False,
    )
    assert done.returncode == 0, done.stdout[-4000:] + done.stderr[-2000:]


SHIFT = 8  # Input.dispatchMouseEvent : le modificateur Maj
CTRL = 2  # et Ctrl
NODES = "document.querySelectorAll('.flow [data-node]').length"
PANEL_TITLE = "document.querySelector('.panel h2').textContent"
NOTE = "(LDApp.debug.state().note || {text: ''}).text"
STATE = "JSON.stringify((({ address, hosts, selection }) => ({ address, hosts, selection }))(LDApp.debug.state()))"
READY = (
    "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
)


def _screen(tab, hostname: str) -> dict:
    """Le centre d'un équipement à l'écran, lu sur son nœud React Flow."""
    name = json.dumps(hostname)
    return tab.js(
        f"(() => {{ const el = document.querySelector('.react-flow__node[data-id=' + {name} + ']');"
        " const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()"
    )


def _anchor(node_id: str, side: str) -> str:
    """Le point d'ancrage `side` d'un nœud (expression JS) ; sans côté, la liste de ses ancres."""
    node = f".react-flow__node[data-id={json.dumps(node_id)}]"
    if not side:
        return f"document.querySelectorAll('{node} .anchor')"
    return f"document.querySelector('{node} .anchor[data-side=\"{side}\"] .anchor-hit')"


def _box(node_id: str) -> str:
    """La boîte d'un nœud React Flow à l'écran (expression JS)."""
    return f"document.querySelector('.react-flow__node[data-id={json.dumps(node_id)}]').getBoundingClientRect()"


def _still(tab, element: str) -> dict:
    """Le centre d'un élément une fois la vue posée (un `reveal` anime la vue 220 ms) : deux lectures identiques à
    50 ms d'écart."""
    last = tab.js(CENTER.format(element))
    for _ in range(40):
        threading.Event().wait(0.05)
        now = tab.js(CENTER.format(element))
        if now == last:
            return now
        last = now
    return last


def _settled(tab, hostname: str) -> dict:
    """Le centre d'un équipement une fois la vue posée : React Flow applique un cadrage au rendu suivant, deux lectures
    identiques à 50 ms d'écart disent que la toile ne bouge plus."""
    last = _screen(tab, hostname)
    for _ in range(40):
        threading.Event().wait(0.05)
        now = _screen(tab, hostname)
        if now == last:
            return now
        last = now
    return last


# Une ancre de sélection native dans la barre, comme après un clic sur son texte : Maj + clic ou Maj + glissé sur le
# fond de la toile l'étendait à tout le texte de la page (le fond était sélectionnable). Rien ne doit être sélectionné.
ANCHOR_IN_BAR = (
    "(() => { const n = document.createTreeWalker(document.querySelector('.bar'), NodeFilter.SHOW_TEXT).nextNode();"
    " window.getSelection().collapse(n, 0); })()"
)
NO_TEXT_SELECTED = "window.getSelection().toString() === ''"
# Un point du fond de la toile (ni carte, ni câble) autour de (x, y).
PANE_POINT = (
    "(() => {{ for (let r = 40; r < 400; r += 20) for (let a = 0; a < 6.28; a += 0.4) {{"
    " const x = {0} + r * Math.cos(a), y = {1} + r * Math.sin(a), el = document.elementFromPoint(x, y);"
    " if (el && el.classList.contains('react-flow__pane')) return JSON.stringify([x, y]); }} return 'null'; }})()"
)


def _click(tab, x: float, y: float, modifiers: int = 0) -> None:
    """Un clic réel ; avec Maj, la touche est enfoncée au clavier (React Flow lit la touche, pas le modificateur)."""
    shift = {"key": "Shift", "code": "ShiftLeft", "windowsVirtualKeyCode": 16}
    if modifiers & SHIFT:
        tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **shift, "modifiers": SHIFT})
    for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
        event = {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1}
        tab.call("Input.dispatchMouseEvent", {**event, "modifiers": modifiers})
    if modifiers & SHIFT:
        tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **shift})


def _press(tab, key: str, code: int, modifiers: int = 0) -> None:
    for kind in ("keyDown", "keyUp"):
        event = {"type": kind, "key": key, "code": key, "windowsVirtualKeyCode": code, "modifiers": modifiers}
        tab.call("Input.dispatchKeyEvent", event)


def _shift_rectangle(tab, start: tuple[float, float], end: tuple[float, float]) -> None:
    """Maj + glissé sur le fond : le rectangle de sélection de React Flow, Maj tenue au clavier tout le geste."""
    shift = {"key": "Shift", "code": "ShiftLeft", "windowsVirtualKeyCode": 16}
    tab.call("Input.dispatchKeyEvent", {"type": "keyDown", **shift, "modifiers": SHIFT})
    mouse = {"button": "left", "clickCount": 1, "modifiers": SHIFT}
    tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": start[0], "y": start[1], "buttons": 1, **mouse})
    for step in range(1, 8):
        x, y = start[0] + (end[0] - start[0]) * step / 7, start[1] + (end[1] - start[1]) * step / 7
        tab.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 1, **mouse})
    tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": end[0], "y": end[1], "buttons": 0, **mouse})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **shift})


def _button(tab, text: str, within: str = "body") -> None:
    """Clique le premier bouton de `within` dont le texte contient `text` (la fiche et la recherche ont chacune un
    « masquer » : on vise la bonne)."""
    wanted, scope = json.dumps(text), json.dumps(within)
    script = (
        f"(() => {{ const b = Array.from(document.querySelector({scope}).querySelectorAll('button'))"
        f".find((b) => b.textContent.includes({wanted})); if (!b) return false; b.click(); return true; }})()"
    )
    assert tab.js(script), text


def _open_section(tab, title: str) -> None:
    """Déplie une section repliée de la fiche (« Apparence » ferme la fiche d'un équipement, repliée : les faits
    d'abord)."""
    wanted = json.dumps(title)
    script = (
        "(() => { const b = Array.from(document.querySelectorAll('.panel .insp-section-toggle'))"
        f".find((b) => b.textContent.includes({wanted})); if (!b) return 'absent';"
        " if (b.getAttribute('aria-expanded') === 'false') b.click(); return 'ok'; })()"
    )
    assert tab.js(script) == "ok", title


def _pick_hue(tab, name: str) -> None:
    """Choisit une teinte dans la fiche : le champ ouvre la grille des douze, un clic choisit."""
    from tests.test_view import _wait

    if tab.js("!document.querySelector('.panel .hue-trigger')"):
        _open_section(tab, "Apparence")
        _wait(tab, "!!document.querySelector('.panel .hue-trigger')")
    tab.js("document.querySelector('.panel .hue-trigger').click()")
    _wait(tab, "!!document.querySelector('.panel .hue-pop')")
    tab.js(f"document.querySelector('.panel .hue-swatch[aria-label={json.dumps(name)}]').click()")


def _delete_from_panel(tab) -> None:
    """Supprime ce que montre la fiche : « … » puis « supprimer » (ou la corbeille directe, quand le menu ne
    contiendrait qu'elle), puis la confirmation dans l'en-tête."""
    from tests.test_view import _wait

    if tab.js("!!document.querySelector('.panel .insp-menu')"):
        tab.js("document.querySelector('.panel .insp-menu .ibtn').click()")
        _wait(tab, "!!document.querySelector('.panel .menu')")
        _button(tab, "supprimer", ".panel .menu")
    else:
        tab.js("document.querySelector('.panel .insp-actions [aria-label=supprimer]').click()")
    _wait(tab, "!!document.querySelector('.panel .insp-confirm')")
    _button(tab, "supprimer", ".panel .insp-confirm")


def _intent_doc(base: str, auth: dict) -> dict:
    import httpx

    params = {"infrastructure": "infra-lab"}
    return httpx.get(f"{base}/api/intent", params=params, headers=auth, timeout=30).json()


def _intent_pins(base: str, auth: dict) -> list[dict]:
    return _intent_doc(base, auth)["pins"]


def _open_palette(tab, text: str) -> None:
    from tests.test_view import _wait

    _press(tab, "/", 191)
    _wait(tab, "document.activeElement && document.activeElement.classList.contains('search-input')")
    tab.js("document.activeElement.select()")  # la recherche garde son dernier texte : on le remplace
    tab.call("Input.insertText", {"text": text})
    _wait(tab, "document.querySelectorAll('.search-hit.kind-device').length === 2")


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_end_to_end_in_a_browser(settings, bundle_dict):
    """De bout en bout : uvicorn sert `/`, Chromium l'ouvre sans jeton (accueil), puis avec ; la dernière run s'ouvre
    comparée à la précédente ; un clic ouvre une fiche, Maj + clic fait une sélection multiple, l'alignement pose des
    épingles par l'API sous le nom donné ; la recherche sélectionne et masque par règle, l'adresse suit ; la bande
    change de run en gardant la sélection par identité ; un glissé réel épingle. Aucune erreur de console, jamais le
    jeton dans l'adresse."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.diff.conftest import LATER_RUN_ID, cable_down_later, later
    from tests.test_view import RUN, _serve, _wait

    third_id = "66ee0b1c9a1c2b0012f4a9f3"
    third = later(bundle_dict, weeks=2)
    third["run"]["collector_run_id"] = third_id
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for bundle in (bundle_dict, cable_down_later(bundle_dict), third):
            assert httpx.post(f"{base}/api/ingest/bundles", json=bundle, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            assert tab.js("typeof LDApp") == "object" and tab.js("LDApp.debug.state().connectOpen") is True
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, READY)
            state = json.loads(tab.js(STATE))
            latest = {"infrastructure": "infra-lab", "runId": third_id, "from": LATER_RUN_ID}
            assert state["address"] == latest, "la dernière run, comparée à la précédente"
            assert tab.js("location.search") == f"?infrastructure=infra-lab&run_id={third_id}&from={LATER_RUN_ID}"
            assert tab.js(NODES) == 5, "les voisins inconnus sont masqués"
            assert tab.js("!!document.querySelector('.band') && !document.querySelector('.panel')")
            assert tab.js("document.querySelectorAll('.toolbar button').length") == 10, (
                "au repos : annuler, rétablir, cadrer, centrer, six outils d'insertion (docs/10 §6)"
            )
            assert "orhan" in tab.js("document.querySelector('.bar').textContent")
            # un clic réel sur un équipement : la fiche s'ouvre, l'adresse porte la sélection
            at = _settled(tab, "sw-core-02")
            _click(tab, at["x"], at["y"])
            _wait(tab, "!!document.querySelector('.panel')")
            assert "sw-core-02" in tab.js(PANEL_TITLE)
            assert tab.js("location.hash") == "#node=sw-core-02"
            # une pastille dans la fiche (docs/10) : la couleur s'enregistre par l'API sous ce nom, la carte suit
            _pick_hue(tab, "rouge")
            _wait(tab, f"/couleur de sw-core-02 : rouge \\(orhan\\)/.test({NOTE})")
            red = (
                "document.querySelector('.react-flow__node[data-id=\"sw-core-02\"] .node')"
                + ".classList.contains('hue-red')"
            )
            _wait(tab, red)
            colours = _intent_doc(base, auth)
            assert [(c["hostname"], c["hue"], c["author"]) for c in colours["device_colors"]] == [
                ("sw-core-02", "red", "orhan")
            ]
            shown = "document.querySelector('.panel .hue-trigger').getAttribute('aria-label')"
            assert colours["type_colors"] == [] and tab.js(shown) == "teinte : rouge"
            # Maj + clic : sélection multiple, puis alignement → épingles enregistrées par l'API sous ce nom
            tab.js("LDApp.debug.handle().toile.fit()")  # la fiche ouverte réduit la zone visible : tout y rentre
            at = _settled(tab, "sw-core-01")
            tab.js(ANCHOR_IN_BAR)
            _click(tab, at["x"], at["y"], SHIFT)
            _wait(tab, "LDApp.debug.state().hosts.length === 2")
            assert "2 équipements" in tab.js(PANEL_TITLE)
            assert tab.js(NO_TEXT_SELECTED), "Maj + clic n'étend pas la sélection de texte du navigateur sur la toile"
            # la barre d'outils : au repos, ni alignement ni compte ; avec la sélection multiple, ils entrent
            assert tab.js("document.querySelector('.toolbar .toolbar-count').textContent") == "2"
            assert not tab.js("!!document.querySelector('.toolbar [aria-label=\"répartir horizontalement\"]')"), (
                "répartir : trois au moins"
            )
            tab.js("document.querySelector('.toolbar [aria-label=\"aligner horizontalement\"]').click()")
            _wait(tab, f"/épingles enregistrées \\(orhan\\)/.test({NOTE})")
            pins = _intent_pins(base, auth)
            pinned = {p["hostname"] for p in pins}
            assert pinned and pinned <= {"sw-core-01", "sw-core-02"} and all(p["author"] == "orhan" for p in pins)
            assert tab.js("LDApp.debug.state().hosts.length") == 2, "aligner garde la sélection"
            # une pastille dans la fiche de la sélection : les deux équipements, une requête, sous ce nom (docs/10)
            _pick_hue(tab, "ambre")
            _wait(tab, f"/couleur de 2 équipements : ambre \\(orhan\\)/.test({NOTE})")
            amber = "document.querySelectorAll('.react-flow__node .node.hue-amber').length === 2"
            _wait(tab, amber)
            assert {(c["hostname"], c["hue"]) for c in _intent_doc(base, auth)["device_colors"]} == {
                ("sw-core-01", "amber"),
                ("sw-core-02", "amber"),
            }
            # un groupe depuis la sélection (docs/10 §5) : créé sous ce nom, son cadre apparaît, il est sélectionné
            name_input = "document.querySelector('.panel input[aria-label=\"nom du nouveau groupe\"]')"
            tab.js(
                f"(() => {{ const el = {name_input}; const set = Object.getOwnPropertyDescriptor("
                "HTMLInputElement.prototype, 'value').set; set.call(el, 'Cœur'); "
                "el.dispatchEvent(new Event('input', { bubbles: true })); })()"
            )
            _button(tab, "Grouper", ".panel")
            _wait(tab, f"/groupe Cœur créé \\(orhan\\)/.test({NOTE})")
            groups = _intent_doc(base, auth)["groups"]
            assert [(g["label"], g["members"], g["author"]) for g in groups] == [
                ("Cœur", ["sw-core-01", "sw-core-02"], "orhan")
            ]
            gid = groups[0]["id"]
            frame = f"document.querySelector('.react-flow__node[data-id=\"group:{gid}\"] .frame')"
            _wait(tab, f"!!{frame}")
            _wait(tab, "LDApp.debug.state().selection && LDApp.debug.state().selection.kind === 'group'")
            assert "Cœur" in tab.js("document.querySelector('.panel .insp-title-input').value")
            assert tab.js("location.hash") == f"#group={gid}"
            # l'éditeur de style : ellipse → le cadre change de forme, le document aussi
            _button(tab, "ellipse", ".panel")
            oval = f"document.querySelector('.react-flow__node[data-id=\"group:{gid}\"] ellipse.frame-shape')"
            _wait(tab, f"!!{oval}")
            assert _intent_doc(base, auth)["groups"][0]["style"]["shape"] == "ellipse"
            # sélectionner les membres : la sélection multiple revient (aligner, colorer, grouper encore)
            tab.js("document.querySelector('.panel [aria-label=\"sélectionner les membres\"]').click()")
            _wait(tab, "LDApp.debug.state().hosts.length === 2")

            tab.js("LDApp.debug.handle().toile.fit()")  # la fiche ouverte réduit la zone visible : tout y rentre
            a0, b0 = _settled(tab, "sw-core-01"), _settled(tab, "sw-core-02")
            tab.drag((a0["x"], a0["y"]), (a0["x"] + 60, a0["y"] + 30))
            _wait(tab, f"/2 équipements déplacés, épingles enregistrées \\(orhan\\)/.test({NOTE})")
            a1, b1 = _screen(tab, "sw-core-01"), _screen(tab, "sw-core-02")
            moved = (a1["x"] - a0["x"], a1["y"] - a0["y"])
            assert moved[0] > 30 and moved[1] > 15, moved  # React Flow absorbe le premier pas du glissé (seuil)
            followed = (b1["x"] - b0["x"], b1["y"] - b0["y"])
            assert abs(followed[0] - moved[0]) <= 2 and abs(followed[1] - moved[1]) <= 2, "le second suit du même écart"
            assert tab.js("LDApp.debug.state().hosts.length") == 2, "glisser garde la sélection"
            # la recherche : `/`, un texte, les deux firewalls trouvés (et les ports qui les décrivent), éclairés sans
            # rien masquer ; Maj+Entrée sélectionne les équipements ; « masquer » pose une règle que l'adresse porte
            _press(tab, "Escape", 27)
            _wait(tab, "LDApp.debug.state().hosts.length === 0 && !document.querySelector('.panel')")
            _open_palette(tab, "fw-")
            lit = "Array.from(document.querySelectorAll('.flow .node.match')).map((n) => n.dataset.node)"
            _wait(tab, f"{lit}.includes('fw-edge-01') && {lit}.includes('fw-edge-02')")  # la recherche éclaire
            assert tab.js("document.querySelector('.flow').classList.contains('searching')")
            assert tab.js(NODES) == 5, "chercher ne masque rien"
            _press(tab, "Enter", 13, SHIFT)
            _wait(tab, "LDApp.debug.state().hosts.length === 2 && !document.querySelector('.search-results')")
            hosts = json.loads(tab.js("JSON.stringify(LDApp.debug.state().hosts)"))
            assert sorted(hosts) == ["fw-edge-01", "fw-edge-02"]
            _open_palette(tab, "fw-")
            _button(tab, "masquer", ".search-actions")
            _wait(tab, f"{NODES} === 3")
            assert tab.js("location.hash") == "#hide=fw-"
            assert "fw-" in tab.js("document.querySelector('.rule-chip').textContent")
            tab.js("document.querySelector('.rule-chip button').click()")
            _wait(tab, f"{NODES} === 5")
            assert tab.js("location.hash") == ""
            # l'adresse modifiée à la main : la vue suit
            tab.js("location.hash = '#stubs=1&node=sw-core-01'")
            selected = "LDApp.debug.state().selection && LDApp.debug.state().selection.id === 'sw-core-01'"
            _wait(tab, f"{NODES} === 6 && {selected}")
            # la bande : la run précédente, comparée à celle d'avant ; la sélection par identité traverse
            tab.js("document.querySelectorAll('.band-step')[0].click()")
            _wait(tab, f"{READY} && LDApp.debug.state().address.runId === {json.dumps(LATER_RUN_ID)}")
            assert tab.js("location.search") == f"?infrastructure=infra-lab&run_id={LATER_RUN_ID}&from={RUN['run_id']}"
            _wait(tab, selected)
            assert tab.js("document.querySelectorAll('.flow-host').length") == 1, "une seule toile"
            current = "document.querySelector('.band-run[aria-current=\"true\"]').getAttribute('data-run')"
            assert tab.js(current) == LATER_RUN_ID
            assert "sw-core-01" in tab.js(PANEL_TITLE)
            # un glissé réel épingle sous le nom donné
            tab.js("LDApp.debug.handle().toile.fit()")  # la fiche ouverte réduit la zone visible : tout y rentre
            start = _settled(tab, "sw-core-02")
            tab.drag((start["x"], start["y"]), (start["x"] + 80, start["y"] + 40))
            _wait(tab, f"/épingle de sw-core-02 enregistrée \\(orhan\\)/.test({NOTE})")
            assert "sw-core-02" in {p["hostname"] for p in _intent_pins(base, auth)}
            # annuler / rétablir (docs/10 §7) : Ctrl+Z rend l'épingle d'avant, Ctrl+Y la remet, signés au journal
            pinned = {p["hostname"]: (p["x"], p["y"]) for p in _intent_pins(base, auth)}
            assert "annuler : déplacement de sw-core-02" in tab.js("document.querySelector('.toolbar button').title")
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"/annulé : déplacement de sw-core-02/.test({NOTE})")
            undone = {p["hostname"]: (p["x"], p["y"]) for p in _intent_pins(base, auth)}
            assert undone.get("sw-core-02") != pinned["sw-core-02"]
            assert tab.js("LDApp.debug.state().history.redo") == "déplacement de sw-core-02"
            _press(tab, "y", 89, CTRL)
            _wait(tab, f"/rétabli : déplacement de sw-core-02/.test({NOTE})")
            assert {p["hostname"]: (p["x"], p["y"]) for p in _intent_pins(base, auth)} == pinned
            # les flèches : un carreau de grille, cinq avec Maj ; une rafale = une épingle, après la dernière
            tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'sw-core-01' })")
            _wait(tab, "LDApp.debug.state().hosts.join() === 'sw-core-01'")
            before = json.loads(tab.js("JSON.stringify(LDApp.debug.handle().toile.state.positions.get('sw-core-01'))"))
            _press(tab, "ArrowRight", 39)
            _press(tab, "ArrowRight", 39)
            _press(tab, "ArrowDown", 40, SHIFT)
            _wait(tab, f"/épingle de sw-core-01 enregistrée \\(orhan\\)/.test({NOTE})")
            nudged = {p["hostname"]: (p["x"], p["y"]) for p in _intent_pins(base, auth)}["sw-core-01"]
            assert nudged == (before["x"] + 40, before["y"] + 100)
            # Maj + rectangle ajoute à la sélection, ne la remplace pas
            tab.js("LDApp.debug.handle().toile.fit()")
            other = _settled(tab, "sw-core-02")
            tab.js(ANCHOR_IN_BAR)
            _shift_rectangle(tab, (other["x"] - 60, other["y"] - 30), (other["x"] + 60, other["y"] + 30))
            _wait(tab, "LDApp.debug.state().hosts.length >= 2")
            assert tab.js(NO_TEXT_SELECTED), "Maj + rectangle ne sélectionne aucun texte de la page"
            assert {"sw-core-01", "sw-core-02"} <= set(json.loads(tab.js("JSON.stringify(LDApp.debug.state().hosts)")))
            # Maj + clic sur le fond de la toile, ancre dans la barre : le cas exact du défaut (tout le texte surligné)
            tab.js(ANCHOR_IN_BAR)
            pane = tab.js(PANE_POINT.format(other["x"], other["y"]))
            assert pane != "null", "un point du fond près de sw-core-02"
            _click(tab, *json.loads(pane), SHIFT)
            assert tab.js(NO_TEXT_SELECTED), "Maj + clic sur le fond ne sélectionne aucun texte de la page"
            # les badges HA : A pour le primaire d'un actif-passif, P pour le secondaire, rouge quand il est tombé
            badge = "document.querySelector('.react-flow__node[data-id=\"{}\"] .chip-ha').getAttribute('class')"
            assert "ha-A" in tab.js(badge.format("fw-edge-01")) and "down" not in tab.js(badge.format("fw-edge-01"))
            assert {"ha-P", "down"} <= set(tab.js(badge.format("fw-edge-02")).split())
            ha_text = "document.querySelector('.react-flow__node[data-id=\"{}\"] .chip-ha text').textContent"
            assert tab.js(ha_text.format("fw-edge-01")) == "ACTIF" and tab.js(ha_text.format("fw-edge-02")) == "DOWN"
            # MLAG et port-channels cachés au repos ; un clic sur une patte du vPC 20 révèle aussi l'autre patte et le
            # peer-link ; la vitesse du câble sélectionné se montre même couche éteinte
            tab.js("LDApp.debug.handle().toile.select(null)")
            revealed = "document.querySelectorAll('.beam[class*=\"reveal-\"]').length"
            _wait(tab, f"{revealed} === 0 && !LDApp.debug.state().selection && !LDApp.debug.state().hosts.length")
            tab.js(
                "(() => { const t = LDApp.debug.handle().toile;"
                " const leg = t.model.beams.find((b) => b.mlags.length && b.b.hostname === 'sw-core-01');"
                " t.select({ kind: 'link', id: leg.links[0].id }); })()"
            )
            _wait(tab, f"{revealed} === 3")
            assert tab.js("document.querySelectorAll('.beam.reveal-sibling').length") == 1
            assert tab.js("document.querySelectorAll('.beam.reveal-peer').length") == 1
            _wait(tab, "!!document.querySelector('.speed-pill.on.selected')")  # la vitesse du câble sélectionné
            # le panneau Affichage : les couches vont dans l'adresse, le bouton compte celles qui s'écartent du défaut
            tab.js("LDApp.debug.handle().toile.select(null)")
            count = "(document.querySelector('.display-count') || { textContent: '0' }).textContent"
            before = int(tab.js(count))
            tab.js("document.querySelector('.display-toggle').click()")
            _wait(tab, "!!document.querySelector('.display [role=switch]')")
            for name in ("vitesses", "port-channels et vPC", "épingles"):
                tab.js(
                    "[...document.querySelectorAll('.display .layer')]"
                    f".find((b) => b.textContent.includes({json.dumps(name)})).click()"
                )
            _wait(tab, "['speeds=1', 'beams=1', 'pins=0'].every((key) => location.hash.includes(key))")
            assert int(tab.js(count)) == before + 3, "trois couches de plus hors de leur défaut"
            _wait(tab, "document.querySelectorAll('.speed-pill.on').length >= 3")  # toutes les vitesses lues
            _wait(tab, "!!document.querySelector('.flow.show-beams.hide-pins')")
            tab.js("document.querySelector('.display-toggle').click()")
            _wait(tab, "!document.querySelector('.display')")
            # les commandes de la toile : grille, thème ; des préférences du navigateur, jamais dans l'adresse
            assert tab.js("!!document.querySelector('.react-flow__minimap')"), "la minimap, par défaut"
            assert not tab.js("!!document.querySelector('.react-flow__background')"), "pas de grille par défaut"
            # supprimer le groupe : confirmation dans la fiche, le cadre disparaît, la sélection aussi
            tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'group', id: {json.dumps(gid)} }})")
            _wait(tab, "!!document.querySelector('.panel .insp-title-input')")
            _delete_from_panel(tab)
            gone = f"!document.querySelector('.react-flow__node[data-id=\"group:{gid}\"]')"
            _wait(tab, f"/groupe supprimé \\(orhan\\)/.test({NOTE}) && {gone}")
            assert _intent_doc(base, auth)["groups"] == []
            tab.js("document.querySelector('.controls [aria-label=\"afficher la grille\"]').click()")
            _wait(tab, "!!document.querySelector('.react-flow__background')")
            tab.js("document.querySelector('.controls [aria-label=\"passer au thème clair\"]').click()")
            _wait(tab, "document.documentElement.dataset.theme === 'light'")
            # élargir le panneau par son bord gauche : la largeur suit le glissé et se range dans les préférences
            tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'sw-core-01' })")
            _wait(tab, "!!document.querySelector('.panel .panel-resize')")
            box = json.loads(
                tab.js("JSON.stringify(document.querySelector('.panel .panel-resize').getBoundingClientRect())")
            )
            before = tab.js("document.querySelector('.panel').getBoundingClientRect().width")
            tab.drag((box["x"] + 3, box["y"] + 200), (box["x"] - 117, box["y"] + 200))
            _wait(tab, f"document.querySelector('.panel').getBoundingClientRect().width > {before} + 100")
            prefs = json.loads(tab.js("localStorage.getItem('ld-prefs')"))
            assert 460 <= prefs.pop("panelWidth") <= 470, "la largeur glissée est rangée à la relâche"
            assert prefs == {"theme": "light", "grid": True, "snap": False, "minimap": True}
            tab.js(
                "document.querySelector('.panel .panel-resize')"
                ".dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))"
            )
            _wait(tab, "JSON.parse(localStorage.getItem('ld-prefs')).panelWidth === 348")
            assert "theme" not in tab.js("location.href") and "grid" not in tab.js("location.href")
            assert TOKEN not in tab.js("location.href")
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("type") == "error"]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)


FOCUSED = "document.activeElement"


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_keyboard_and_what_it_could_not_read(settings, bundle_dict):
    """Revue Impeccable du 2026-10-07 : le clavier parcourt l'interface avant la toile (aucun câble focalisable) ; la
    recherche est un `combobox` dont la liste ne contient que des options ; la bande garde le focus de run en run ;
    un dialogue prend le focus et se ferme sur Échap ; un jeton refusé garde l'infrastructure et le nom ; une intention
    illisible est dite dans la barre et coupe l'écriture."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.diff.conftest import LATER_RUN_ID, cable_down_later
    from tests.test_view import RUN, _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for bundle in (bundle_dict, cable_down_later(bundle_dict)):
            assert httpx.post(f"{base}/api/ingest/bundles", json=bundle, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            # un jeton refusé : l'infrastructure (adresse) et le nom (navigateur) restent, le focus revient au jeton
            tab.js("sessionStorage.setItem('ld-api-token', 'pas-le-bon')")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, "!!document.querySelector('.sheet [role=alert]')")
            assert tab.js("document.querySelector('.sheet input[name=infrastructure]').value") == "infra-lab"
            assert tab.js("document.querySelectorAll('.sheet input')[2].value") == "orhan"
            _wait(tab, f"{FOCUSED}.type === 'password'")
            # le bon jeton : la run s'ouvre ; aucun câble n'est focalisable, Tab commence par la barre
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, READY)
            # les câbles suivent la mesure des nœuds
            _wait(tab, "document.querySelectorAll('.react-flow__edge').length > 0")
            assert tab.js("document.querySelectorAll('.react-flow__edge[tabindex]').length") == 0
            _wait(
                tab, f"{FOCUSED}.classList.contains('app')"
            )  # l'accueil fermé rend le focus au début de l'application
            _press(tab, "Tab", 9)
            _wait(tab, f"!!{FOCUSED}.closest('.bar')")
            # la recherche : un combobox ; dans sa liste, des options groupées, les actions dehors
            _open_palette(tab, "fw-")
            assert tab.js("document.querySelector('.search-input').getAttribute('role')") == "combobox"
            assert tab.js("document.querySelectorAll('#search-results button:not([role=option])').length") == 0
            assert tab.js("!!document.querySelector('#search-results [role=group] [role=option]')")
            assert tab.js("!document.querySelector('.search-actions').closest('[role=listbox]')")
            _press(tab, "Escape", 27)
            _press(tab, "Escape", 27)
            # un compte de la barre se parcourt : la fiche du premier équipement touché s'ouvre, ↓ avance, Échap rend
            # la sélection d'avant (aucune) ; le compte reste enfoncé pendant le parcours
            tab.js("document.querySelector('.count.diff').click()")
            _wait(tab, "!!document.querySelector('.walk') && !!document.querySelector('.panel')")
            walk = tab.js("JSON.stringify(LDApp.debug.state().walk)")
            hosts = json.loads(walk)["hosts"]
            assert hosts and tab.js("LDApp.debug.state().selection.id") == hosts[0]
            assert tab.js("document.querySelector('.count.diff').getAttribute('aria-pressed')") == "true"
            if len(hosts) > 1:
                _press(tab, "ArrowDown", 40)
                shown = f"LDApp.debug.state().selection && LDApp.debug.state().selection.id === {json.dumps(hosts[1])}"
                _wait(tab, shown)
            _press(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.walk') && !LDApp.debug.state().selection")
            assert tab.js("document.querySelector('.count.diff').getAttribute('aria-pressed')") == "false"
            # la bande : ← change de run, le focus reste dans la bande, sur la run ouverte
            tab.js("document.querySelector('.band-run[aria-current=\"true\"]').focus()")
            _press(tab, "ArrowLeft", 37)
            _wait(tab, f"{READY} && LDApp.debug.state().address.runId === {json.dumps(RUN['run_id'])}")
            assert tab.js(f"{FOCUSED}.dataset.run") == RUN["run_id"], "le focus suit la run ouverte"
            # le menu prend le focus ; la palette des types aussi, et Échap la ferme sans vider la sélection
            tab.js("LDApp.debug.handle().toile.select({ kind: 'node', id: 'sw-core-01' })")
            _wait(tab, "!!document.querySelector('.panel')")
            _button(tab, "orhan", ".bar")
            _wait(tab, f"!!{FOCUSED}.closest('.menu')")
            _button(tab, "palette des types", ".menu")
            _wait(tab, f"!!{FOCUSED}.closest('.palette-types')")
            _press(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.palette-types')")
            assert tab.js("!!document.querySelector('.panel')"), "Échap ferme le volet, pas la fiche derrière"
            # une intention illisible : dite dans la barre, l'écriture coupée et dite dans la fiche
            broken = settings.archive_dir / "_intent" / "infra-lab" / "intent.json"
            broken.parent.mkdir(parents=True, exist_ok=True)
            broken.write_text("{ pas du json", encoding="utf-8")
            tab.navigate(f"{base}/?infrastructure=infra-lab&run_id={LATER_RUN_ID}#node=sw-core-01")
            _wait(tab, f"{READY} && !!document.querySelector('.panel')")
            assert "intention indisponible" in tab.js("document.querySelector('.bar-warn').textContent")
            assert tab.js("LDApp.debug.handle().writer.author") == ""
            assert "n'a pas pu être lue" in tab.js("document.querySelector('.panel .insp-hint').textContent")
            assert not tab.js("!!document.querySelector('.panel .hue-trigger')"), "pas de teinte : rien ne s'écrit"
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry)]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)


VIEW_ZOOM = (
    "Number((document.querySelector('.react-flow__viewport').style.transform.match(/scale\\(([0-9.]+)\\)/)"
    " || [0, 0])[1])"
)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_opens_a_large_infrastructure_where_names_read(settings):
    """Revue Impeccable du 2026-10-07, lot 2 : une grande infrastructure s'ouvre au zoom de lecture (les noms font au
    moins 10 px), sur ce qui compte ; « cadrer tout » montre tout, sans plancher ; la liste d'un stack garde sa taille
    d'écran quel que soit le zoom."""
    from dataclasses import replace
    from datetime import UTC, datetime

    import httpx
    from ld_contracts.synth import GenerationSpec, generate_series

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    series = generate_series(GenerationSpec(seed="lot2", devices=60, start=datetime(2026, 1, 5, 2, tzinfo=UTC)))
    infrastructure = series.bundles[0]["infrastructure"]
    server, thread, base = _serve(replace(settings, max_bundle_bytes=20_000_000))
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert (
            httpx.post(f"{base}/api/ingest/bundles", json=series.bundles[0], headers=auth, timeout=60).status_code
            == 201
        )
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/?infrastructure={infrastructure}")
            _wait(tab, f"{READY} && {VIEW_ZOOM} > 0")
            floor = tab.js("LDApp.opening.READ_ZOOM")
            opened = tab.js(VIEW_ZOOM)
            assert abs(opened - floor) < 1e-6, f"ouverte au zoom de lecture, pas en pelote : {opened}"
            # la liste d'un stack à taille d'écran : 280 px de large au moins, même à 0,67
            tab.js("document.querySelector('.chip-stack').dispatchEvent(new MouseEvent('click', { bubbles: true }))")
            _wait(tab, "!!document.querySelector('.stack-list')")
            assert tab.js("document.querySelector('.stack-list').getBoundingClientRect().width") >= 279
            _press(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.stack-list')")
            # « cadrer tout » : tout, quitte à passer sous le zoom de lecture
            tab.js("document.querySelector(\".toolbar button[aria-label='cadrer tout']\").click()")
            _wait(tab, f"{VIEW_ZOOM} < {floor} - 0.01")
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry)]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)


CENTER = (
    "(() => {{ const r = {0}.getBoundingClientRect();"
    " return {{ x: r.left + r.width / 2, y: r.top + r.height / 2 }}; }})()"
)
CORNER = "(() => {{ const r = {0}.getBoundingClientRect(); return [r.left, r.top]; }})()"
PICKED = "LDApp.debug.state().selection"
ANNOTATION = "LDApp.debug.handle().toile.model.annotationById.get('{0}')"
NOTES_LAYER = (
    "Array.from(document.querySelectorAll('.display .layer'))"
    ".find((b) => b.textContent.includes('annotations')).click()"
)


def _right_click(tab, x: float, y: float) -> None:
    for kind in ("mousePressed", "mouseReleased"):
        event = {"type": kind, "x": x, "y": y, "button": "right", "buttons": 2, "clickCount": 1}
        tab.call("Input.dispatchMouseEvent", event)


def _click_at(tab, x: float, y: float, modifiers: int = 0) -> None:
    for kind in ("mousePressed", "mouseReleased"):
        event = {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1, "modifiers": modifiers}
        tab.call("Input.dispatchMouseEvent", event)


def _cell(table: str, at: str) -> str:
    return f"{table}.querySelector('.table-cell[data-cell=\"{at}\"]')"


CONNECTOR = "LDApp.debug.handle().toile.model.connectorById.get('{0}')"
# Un collage simulé : un `ClipboardEvent` construit dans la page avec un fichier ou un texte (le pilote DevTools ne
# remplit pas le presse-papiers du système).
_PASTE_IMAGE = (
    "(() => {{ const bytes = Uint8Array.from(atob({0}), (c) => c.charCodeAt(0));"
    " const dt = new DataTransfer(); dt.items.add(new File([bytes], 'baie.png', {{ type: 'image/png' }}));"
    " window.dispatchEvent(new ClipboardEvent('paste', {{ clipboardData: dt, bubbles: true }}));"
    " return dt.files.length; }})()"
)
_PASTE_TEXT = (
    "(() => {{ const dt = new DataTransfer(); dt.setData('text/plain', {0});"
    " window.dispatchEvent(new ClipboardEvent('paste', {{ clipboardData: dt, bubbles: true }})); return true; }})()"
)


def _double_click(tab, x: float, y: float) -> None:
    clicks = (("mousePressed", 1, 1), ("mouseReleased", 0, 1), ("mousePressed", 1, 2), ("mouseReleased", 0, 2))
    for kind, buttons, count in clicks:
        event = {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": count}
        tab.call("Input.dispatchMouseEvent", event)


def _node(annotation_id: str) -> str:
    return f"document.querySelector('.react-flow__node[data-id=\"annotation:{annotation_id}\"]')"


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_annotations_in_a_browser(settings, bundle_dict, tmp_path):
    """docs/10 §6 : « insérer une note » la pose au centre de la vue par l'API sous le nom donné et ouvre sa fiche ;
    un glissé réel la déplace (une écriture) ; une poignée la redimensionne ; un double-clic édite son texte en place ;
    attachée à un équipement, elle suit sa carte ; la couche « annotations » la cache ; Ctrl+Z défait ; un tableau se
    dessine et s'édite ; une image envoyée depuis la barre se montre par une adresse `blob:` ; supprimer en deux clics.
    Rien que la CSP refuse."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_api_assets import png
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
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, READY)
            assert tab.js("document.querySelectorAll('.toolbar button').length") == 10, "quatre au repos, six outils"
            node = _node("a1-1")
            # insérer une note : créée par l'API, sélectionnée, sa fiche ouverte, au centre de la vue
            tab.js("document.querySelector(\".toolbar button[aria-label='insérer une note']\").click()")
            _wait(tab, f"/annotation créée \\(orhan\\)/.test({NOTE})")
            _wait(tab, f"!!{node} && {PICKED} && {PICKED}.kind === 'annotation'")
            a = _intent_doc(base, auth)["annotations"][0]
            expected = ("a1-1", {"kind": "note", "text": "Note"}, {"kind": "free", "ref": None}, 220, 80, "orhan")
            assert (a["id"], a["content"], a["anchor"], a["w"], a["h"], a["author"]) == expected
            assert tab.js("location.hash") == "#annotation=a1-1"
            assert "Note" in tab.js("document.querySelector('.panel .insp-kind').textContent")
            # un glissé réel : une écriture, la boîte suit, rien ne saute en arrière
            rect = tab.js(CENTER.format(node))
            tab.drag((rect["x"], rect["y"]), (rect["x"] + 80, rect["y"] + 40))
            _wait(tab, f"/annotation modifiée \\(orhan\\)/.test({NOTE})")
            moved = _intent_doc(base, auth)["annotations"][0]
            assert moved["x"] > a["x"] and moved["y"] > a["y"], (a, moved)
            # une poignée (sud-est) : plus large et plus haute, une écriture de plus
            handle = f"{node}.querySelector('.handle-se')"
            _wait(tab, f"!!{handle}")
            h = tab.js(CENTER.format(handle))
            tab.drag((h["x"], h["y"]), (h["x"] + 60, h["y"] + 30))
            _wait(tab, f"(() => {{ const r = {ANNOTATION.format('a1-1')}; return r.w > 220 && r.h > 80; }})()")
            sized = _intent_doc(base, auth)["annotations"][0]
            assert sized["w"] > 220 and sized["h"] > 80 and sized["x"] == moved["x"], sized
            # double-clic : le texte s'édite en place ; Ctrl+Entrée enregistre
            r2 = tab.js(CENTER.format(node))
            _double_click(tab, r2["x"], r2["y"])
            _wait(tab, "document.activeElement && document.activeElement.classList.contains('note-editor')")
            tab.js("document.activeElement.select()")
            tab.call("Input.insertText", {"text": "Baie 12, rangée B"})
            _press(tab, "Enter", 13, CTRL)
            _wait(tab, f"{ANNOTATION.format('a1-1')}.content.text === 'Baie 12, rangée B'")
            assert "Baie 12" in tab.js(f"{node}.textContent")
            # attachée à un équipement depuis la fiche : elle devient l'enfant de sa carte et suit son glissé
            _button(tab, "équipement", ".panel [role=radiogroup][aria-label=ancrage]")
            field = "document.querySelector('.panel input[aria-label=\"équipement d\\'ancrage\"]')"
            _wait(tab, f"!!{field}")
            tab.js(f"{field}.focus()")
            tab.call("Input.insertText", {"text": "sw-core-02"})
            tab.js(f"{field}.blur()")
            _wait(tab, f"{ANNOTATION.format('a1-1')}.anchor.ref === 'sw-core-02'")
            _wait(tab, f"!!{node}")
            before = tab.js(CORNER.format(node))
            core = _settled(tab, "sw-core-02")
            tab.drag((core["x"], core["y"]), (core["x"] + 70, core["y"] + 20))
            _wait(tab, f"/épingle de sw-core-02 enregistrée \\(orhan\\)/.test({NOTE})")
            after = tab.js(CORNER.format(node))
            assert after[0] - before[0] > 40 and after[1] - before[1] > 8, (before, after)
            assert _intent_doc(base, auth)["annotations"][0]["anchor"] == {"kind": "device", "ref": "sw-core-02"}
            # la couche « annotations » (panneau Affichage, `notes=0`) la cache ; l'adresse le porte
            tab.js("document.querySelector('.display-toggle').click()")
            _wait(tab, "!!document.querySelector('.display [role=switch]')")
            tab.js(NOTES_LAYER)
            _wait(tab, f"!{node}")
            assert "notes=0" in tab.js("location.hash")
            tab.js(NOTES_LAYER)
            _wait(tab, f"!!{node}")
            _press(tab, "Escape", 27)
            # Ctrl+Z deux fois : l'épingle du cœur glissé, puis l'ancrage (l'écriture inverse, sous le nom)
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"/annulé : déplacement de sw-core-02/.test({NOTE})")
            _press(tab, "z", 90, CTRL)
            _wait(tab, f"/annulé : modification d'une annotation/.test({NOTE})")
            _wait(tab, f"{ANNOTATION.format('a1-1')}.anchor.kind === 'free'")
            # un tableau : la grille se dessine ; double-clic sur une cellule = édition en place (Entrée enregistre)
            tab.js("document.querySelector(\".toolbar button[aria-label='insérer un tableau']\").click()")
            _wait(tab, f"{PICKED} && {PICKED}.kind === 'annotation' && {PICKED}.id !== 'a1-1'")
            tid = tab.js(f"{PICKED}.id")
            table = _node(tid)
            _wait(tab, f"!!{table} && {table}.querySelectorAll('.table-cell').length === 4")
            c0 = _still(tab, _cell(table, "0:0"))
            _double_click(tab, c0["x"], c0["y"])
            _wait(tab, "document.activeElement && document.activeElement.classList.contains('cell-editor')")
            tab.js("document.activeElement.select()")
            tab.call("Input.insertText", {"text": "VLAN"})
            _press(tab, "Enter", 13)
            _wait(tab, f"{ANNOTATION.format(tid)}.content.rows[0][0] === 'VLAN'")
            # clic droit sur une cellule : le menu contextuel ; « insérer une ligne en dessous » ajoute une ligne
            c1 = _still(tab, _cell(table, "1:0"))
            _right_click(tab, c1["x"], c1["y"])
            _wait(tab, "!!document.querySelector('.context-menu')")
            _button(tab, "insérer une ligne en dessous", ".context-menu")
            _wait(tab, f"{ANNOTATION.format(tid)}.content.rows.length === 3")
            _wait(tab, f"{table}.querySelectorAll('.table-cell').length === 6")
            assert tab.js(f"{ANNOTATION.format(tid)}.h") == 78, "la boîte grandit d'une ligne (26)"
            # Maj + clic étend la plage ; « fusionner les cellules » dans le menu ; la grille a une cellule de moins
            _wait(tab, f"!!{_cell(table, '2:1')}")
            a0 = _still(tab, _cell(table, "1:0"))
            b1 = _still(tab, _cell(table, "2:1"))
            _click_at(tab, a0["x"], a0["y"])
            _click_at(tab, b1["x"], b1["y"], SHIFT)
            _wait(tab, f"!!{table}.querySelector('.table-pick:not(.single)')")
            _right_click(tab, b1["x"], b1["y"])
            _wait(tab, "!!document.querySelector('.context-menu')")
            _button(tab, "fusionner les cellules", ".context-menu")
            _wait(tab, f"{ANNOTATION.format(tid)}.content.merges.length === 1")
            assert tab.js(f"{ANNOTATION.format(tid)}.content.merges[0]") == {"row": 1, "col": 0, "rows": 2, "cols": 2}
            _wait(tab, f"{table}.querySelectorAll('.table-cell').length === 3")
            # une frontière de colonne glissée : les largeurs deviennent des poids, la boîte ne change pas
            bar = f"{table}.querySelector('.table-bar.col')"
            _wait(tab, f"!!{bar}")
            bx = _still(tab, bar)
            tab.drag((bx["x"], bx["y"]), (bx["x"] + 30, bx["y"]))
            _wait(tab, f"Array.isArray({ANNOTATION.format(tid)}.content.widths)")
            widths = tab.js(f"{ANNOTATION.format(tid)}.content.widths")
            assert widths[0] > widths[1] and sum(widths) == tab.js(f"{ANNOTATION.format(tid)}.w"), widths
            # un connecteur : inséré libre, puis son bout d'arrivée glissé sur le cœur s'y attache ; le menu le courbe
            tab.js("document.querySelector(\".toolbar button[aria-label='insérer un connecteur']\").click()")
            _wait(tab, f"{PICKED} && {PICKED}.kind === 'connector'")
            cid = tab.js(f"{PICKED}.id")
            line = f"document.querySelector('.react-flow__node[data-id=\"connector:{cid}\"]')"
            _wait(tab, f"!!{line} && {line}.querySelectorAll('.connector-handle.end').length === 2")
            end = f"{line}.querySelectorAll('.connector-handle.end')[1]"
            e = _still(tab, end)
            core = _settled(tab, "sw-core-01")
            tab.drag((e["x"], e["y"]), (core["x"], core["y"]))
            _wait(
                tab,
                f"{CONNECTOR.format(cid)}.end.kind === 'device' && {CONNECTOR.format(cid)}.end.ref === 'sw-core-01'",
            )
            assert tab.js(f"{CONNECTOR.format(cid)}.start.kind") == "free"
            _wait(tab, f"!!{line}.querySelector('.connector-handle.end.attached')")
            mid = _still(tab, f"{line}.querySelector('.connector-line')")
            _right_click(tab, mid["x"], mid["y"])
            _wait(tab, "!!document.querySelector('.context-menu')")
            _button(tab, "tracé courbe", ".context-menu")
            _wait(tab, f"{CONNECTOR.format(cid)}.route === 'curve'")
            assert tab.js(f"{line}.querySelector('.connector-head') !== null"), "une flèche à l'arrivée"
            # les ancres (1.5.0) : le bout de départ glissé près du haut de l'autre cœur s'accroche à son ancre « n »
            assert tab.js(f"{CONNECTOR.format(cid)}.end.side") == "auto", "relâché au milieu : le contour"
            start = _still(tab, f"{line}.querySelectorAll('.connector-handle.end')[0]")
            core2 = _settled(tab, "sw-core-02")
            top = tab.js(f"{_box('sw-core-02')}.top")
            tab.drag((start["x"], start["y"]), (core2["x"], top + 2))
            _wait(tab, f"{CONNECTOR.format(cid)}.start.kind === 'device' && {CONNECTOR.format(cid)}.start.side === 'n'")
            assert tab.js(f"{CONNECTOR.format(cid)}.start.ref") == "sw-core-02"
            # tirer un connecteur depuis une ancre : la carte sélectionnée montre quatre points ; glisser depuis celui
            # de gauche (celui de droite est sous la fiche) jusqu'au premier cœur en crée un, ancré à gauche au départ,
            # au contour à l'arrivée ; Ctrl+Z le défait
            _click_at(tab, core2["x"], core2["y"])
            dot = _anchor("sw-core-02", "w")
            _wait(tab, f"!!{dot} && {_anchor('sw-core-02', '')}.length === 4")
            east = _still(tab, dot)
            core = _settled(tab, "sw-core-01")
            tab.drag((east["x"], east["y"]), (core["x"], core["y"]))
            _wait(tab, "LDApp.debug.handle().toile.model.connectorById.size === 2")
            drawn = tab.js(
                f"Array.from(LDApp.debug.handle().toile.model.connectorById.keys()).find((k) => k !== '{cid}')"
            )
            assert tab.js(f"{CONNECTOR.format(drawn)}.start") == {"kind": "device", "ref": "sw-core-02", "side": "w"}
            assert tab.js(f"{CONNECTOR.format(drawn)}.end") == {"kind": "device", "ref": "sw-core-01", "side": "auto"}
            _press(tab, "z", 90, CTRL)
            _wait(tab, "LDApp.debug.handle().toile.model.connectorById.size === 1")
            # coller : une image du presse-papiers devient une annotation image, un texte une note
            encoded = base64.b64encode(png(48, 32)).decode()
            tab.js(_PASTE_IMAGE.format(json.dumps(encoded)))
            picked_kind = ANNOTATION.format("X").replace("'X'", f"{PICKED}.id") + ".content.kind"
            _wait(tab, f"{PICKED} && {PICKED}.kind === 'annotation' && {picked_kind} === 'image'")
            pasted = tab.js(f"{PICKED}.id")
            assert tab.js(f"[{ANNOTATION.format(pasted)}.w, {ANNOTATION.format(pasted)}.h]") == [48, 32]
            tab.js(_PASTE_TEXT.format(json.dumps("Baie 7\r\nrangée C")))
            _wait(tab, f"{PICKED} && {PICKED}.kind === 'annotation' && {PICKED}.id !== '{pasted}'")
            note_id = tab.js(f"{PICKED}.id")
            assert tab.js(f"{ANNOTATION.format(note_id)}.content") == {"kind": "note", "text": "Baie 7\nrangée C"}
            # clic droit sur une carte : « attacher une note » en crée une, ancrée à l'équipement
            core = _settled(tab, "sw-core-02")
            _right_click(tab, core["x"], core["y"])
            _wait(tab, "!!document.querySelector('.context-menu')")
            _button(tab, "attacher une note", ".context-menu")
            _wait(tab, f"{PICKED} && {PICKED}.kind === 'annotation' && {PICKED}.id !== '{note_id}'")
            attached = tab.js(f"{ANNOTATION.format('X')}.anchor".replace("'X'", f"{PICKED}.id"))
            assert attached == {"kind": "device", "ref": "sw-core-02"}
            _press(tab, "Escape", 27)
            # une image : choisie dans la barre (fichier), envoyée au magasin, montrée par une adresse blob:
            picture = tmp_path / "baie.png"
            picture.write_bytes(png(40, 30))
            root = tab.call("DOM.getDocument", {"depth": 1})["root"]["nodeId"]
            chooser = tab.call("DOM.querySelector", {"nodeId": root, "selector": ".toolbar input[type=file]"})["nodeId"]
            tab.call("DOM.setFileInputFiles", {"files": [str(picture)], "nodeId": chooser})
            _wait(
                tab, f"{PICKED} && {PICKED}.kind === 'annotation' && {PICKED}.id !== '{tid}' && {PICKED}.id !== 'a1-1'"
            )
            iid = tab.js(f"{PICKED}.id")
            image = _node(iid)
            _wait(
                tab,
                f"!!{image} && !!{image}.querySelector('image')"
                f" && /^blob:/.test({image}.querySelector('image').getAttribute('href'))",
            )
            made = _intent_doc(base, auth)["annotations"]
            shown = next(x for x in made if x["id"] == iid)
            assert shown["content"]["kind"] == "image" and (shown["w"], shown["h"]) == (40, 30)
            assert (
                httpx.get(
                    f"{base}/api/intent/assets",
                    params={"infrastructure": "infra-lab", "asset": shown["content"]["asset"]},
                    headers=auth,
                    timeout=30,
                ).status_code
                == 200
            )
            tab.screenshot(tmp_path / "annotations.png")
            # supprimer en deux clics : la fiche se ferme, la ligne d'état dit comment revenir en arrière
            _delete_from_panel(tab)
            _wait(tab, f"!{image} && /annotation supprimée \\(orhan\\) · Ctrl\\+Z/.test({NOTE})")
            assert iid not in {x["id"] for x in _intent_doc(base, auth)["annotations"]}
            assert [c["id"] for c in _intent_doc(base, auth)["connectors"]] == [cid]
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("level") == "error"]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)


STROKE = (
    "(() => {{ const el = document.querySelector({0}); return el ? getComputedStyle(el).stroke"
    " + ' ' + getComputedStyle(el).strokeDasharray : null; }})()"
)
SECTIONS = (
    "Array.from(document.querySelectorAll('.panel .insp-section-title')).map((el) => el.textContent).join('|')"
)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_application_two_views_in_a_browser(settings, bundle_dict):
    """Les deux vues (Orhan, 2026-10-09). Diagramme, par défaut : les câbles ont tous la même encre, sans tiret, aucun
    point de gravité ; la barre n'a ni statut ni sévérité, la bascule « Contrôle » porte le nombre d'erreurs ; la fiche
    d'un équipement donne ses faits (identité, interfaces, voisins LLDP / CDP, apparence repliée), jamais un contrôle.
    Contrôle : `mode=control` dans l'adresse, la toile et la barre d'aujourd'hui, la fiche avec ses contrôles et sans
    apparence, la barre d'outils réduite à cadrer et centrer, rien ne se glisse ni ne s'annule. L'adresse modifiée à
    la main ramène la vue ; la couche « câbles down » se lit dans les deux."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.diff.conftest import LATER_RUN_ID, cable_down_later
    from tests.test_view import _serve, _wait

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for bundle in (bundle_dict, cable_down_later(bundle_dict)):
            assert httpx.post(f"{base}/api/ingest/bundles", json=bundle, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/?infrastructure=infra-lab&run_id={LATER_RUN_ID}")
            _wait(tab, READY)
            _wait(tab, "document.querySelectorAll('.react-flow__edge').length > 0")
            confirmed = STROKE.format("'.link.status-confirmed .link-line'")
            documented = STROKE.format("'.link.status-documented_only .link-line'")
            # Diagramme : la vue par défaut, absente de l'adresse ; câbles neutres, aucun verdict dans la barre
            assert tab.js("LDApp.debug.state().view.mode") == "diagram"
            assert "mode=" not in tab.js("location.hash")
            assert tab.js("!!document.querySelector('.flow.mode-diagram')")
            assert tab.js(confirmed) == tab.js(documented), "même encre, même trait pour tous les câbles"
            assert tab.js(documented).endswith(" none"), "aucun tiret en vue Diagramme"
            verdicts = (
                "document.querySelectorAll('.count.sev-error, .count.sev-warning, .count.status-confirmed').length"
            )
            assert tab.js(verdicts) == 0, "ni sévérité ni statut dans la barre"
            mark = "getComputedStyle(document.querySelector('.link-mark')).display"
            assert tab.js(mark) == "none", "aucun point de gravité"
            errors = tab.js("LDApp.debug.state().run.model.severityCounts.get('error') || 0")
            assert errors > 0, "la fixture « câble tombé » a des erreurs"
            pill = "document.querySelector('.mode-switch .mode-item:nth-child(2) .pill').textContent"
            assert tab.js(pill) == str(errors), "la bascule dit combien d'erreurs sont ouvertes"
            # la fiche d'un équipement : des faits, dans l'ordre où on les lit ; aucun contrôle ; l'apparence repliée
            at = _settled(tab, "sw-core-02")
            _click(tab, at["x"], at["y"])
            _wait(tab, "!!document.querySelector('.panel')")
            sections = tab.js(SECTIONS)
            assert sections.startswith("Identité|"), sections
            assert "Interfaces" in sections and "Voisins LLDP / CDP" in sections and "Apparence" in sections, sections
            assert "Contrôles" not in sections and "Vu par" not in sections, sections
            assert "série" in tab.js("document.querySelector('.panel .insp-facts').textContent")
            assert tab.js("document.querySelectorAll('.panel .facts-table tbody tr').length") > 0
            assert tab.js("!document.querySelector('.panel .hue-trigger')"), "apparence repliée : les faits d'abord"
            neighbours = tab.js("document.querySelectorAll('.panel [aria-label=\"voisins annoncés\"] li').length")
            assert neighbours > 0, "ce que sw-core-02 annonce en LLDP / CDP"
            # Contrôle : la bascule, l'adresse, la toile d'aujourd'hui, la fiche avec ses contrôles, rien ne s'édite
            _button(tab, "Contrôle", ".mode-switch")
            _wait(tab, "LDApp.debug.state().view.mode === 'control' && !!document.querySelector('.flow.mode-control')")
            assert "mode=control" in tab.js("location.hash") and "node=sw-core-02" in tab.js("location.hash")
            assert tab.js(confirmed) != tab.js(documented), "en Contrôle, le statut colore le câble"
            assert tab.js("document.querySelectorAll('.count.sev-error').length") == 1
            statuses = "document.querySelectorAll('.count.status-confirmed, .count.status-documented_only').length"
            assert tab.js(statuses) == 2
            assert tab.js("!document.querySelector('.mode-switch .pill')"), "le compte ne se répète pas quand on y est"
            _wait(tab, f"/Contrôles/.test({SECTIONS})")
            sections = tab.js(SECTIONS)
            assert "Apparence" not in sections and "Identité" in sections, sections
            assert tab.js("document.querySelectorAll('.toolbar button').length") == 2, "cadrer et centrer seulement"
            assert tab.js("document.querySelectorAll('.react-flow__node.draggable').length") == 0, "rien ne se glisse"
            assert tab.js("!document.querySelector('.panel .hue-trigger')")
            # un parcours commencé en Contrôle finit en repassant en Diagramme
            tab.js("document.querySelector('.count.sev-error').click()")
            _wait(tab, "!!document.querySelector('.walk')")
            _button(tab, "Diagramme", ".mode-switch")
            _wait(tab, "LDApp.debug.state().view.mode === 'diagram' && !document.querySelector('.walk')")
            # l'adresse modifiée à la main : la vue suit ; la couche « câbles down » se lit dans les deux vues
            tab.js("location.hash = '#mode=control&oper=1&node=sw-core-02'")
            _wait(tab, "LDApp.debug.state().view.mode === 'control' && !!document.querySelector('.flow.show-oper')")
            tab.js("location.hash = '#oper=1&node=sw-core-02'")
            back = (
                "LDApp.debug.state().view.mode === 'diagram'"
                " && !!document.querySelector('.flow.mode-diagram.show-oper')"
            )
            _wait(tab, back)
            down = STROKE.format("'.link.oper-down .link-line'")
            assert tab.js(down) is not None and not tab.js(down).endswith(" none"), "un câble down se tire en pointillé"
            layers = "document.querySelectorAll('.display-toggle .display-count').length"
            assert tab.js(layers) == 1, "une couche hors défaut"
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry)]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def _key(tab, key: str, code: int) -> None:
    for kind in ("keyDown", "keyUp"):
        tab.call("Input.dispatchKeyEvent", {"type": kind, "key": key, "code": key, "windowsVirtualKeyCode": code})


def test_the_application_journal_in_a_browser(settings, bundle_dict):
    """La vue Journal (2026-10-09) : la troisième bascule de la barre remplace la toile (inerte dessous, sans outils) ;
    chaque requête acceptée est une ligne (heure, auteur, phrase) ; une catégorie et la recherche filtrent, dans
    l'adresse ; une rafale se déplie en une phrase par opération ; un équipement cité ouvre le Diagramme sur lui ; un
    groupe d'une autre infrastructure, d'une identité inconnue ici, ouvre l'autre et le sélectionne là (revue, M1 : la
    toile d'ici le cherchait chez elle, l'oubliait, et l'autre s'ouvrait sur l'ancienne sélection)."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_review_e2e import _relabel
    from tests.test_view import _serve, _wait

    pins = [{"op": "pin", "hostname": host, "x": 0, "y": 0} for host in ("sw-core-01", "fw-edge-01")]
    requests = (
        ("alice", pins),
        ("bob", [{"op": "color", "hostname": "sw-core-02", "hue": "red"}]),
        ("bob", [{"op": "group_create", "label": "Cœur", "members": ["sw-core-01", "sw-core-02"]}]),
    )
    rows = "document.querySelectorAll('.j-row')"
    texts = (
        "Array.from(document.querySelectorAll('.j-row')).map(e => "
        "(e.querySelector('.j-who').textContent + e.querySelector('.j-text').textContent).replace(/\\s+/g, ' '))"
    )
    facet = "Array.from(document.querySelectorAll('.j-facet')).find(b => b.textContent.startsWith({}))"
    typed = (
        "(() => {{ const i = document.querySelector('.j-search input'); Object.getOwnPropertyDescriptor("
        "HTMLInputElement.prototype, 'value').set.call(i, {}); "
        "i.dispatchEvent(new Event('input', {{bubbles: true}})); }})()"
    )
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        patches = f"{base}/api/intent/patches?infrastructure=infra-lab"
        for author, ops in requests:
            assert httpx.post(patches, json={"author": author, "ops": ops}, headers=auth, timeout=30).status_code == 200
        other = _relabel(bundle_dict, "infra-b", "run-b")
        assert httpx.post(f"{base}/api/ingest/bundles", json=other, headers=auth, timeout=60).status_code == 201
        border = [{"op": "group_create", "label": "Bord", "members": ["fw-edge-01"]}]
        for ops in (border,):  # g1-1 : aucun groupe de ce nom dans infra-lab
            body = {"author": "carol", "ops": ops}
            assert httpx.post(patches.replace("infra-lab", "infra-b"), json=body, headers=auth).status_code == 200
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/?infrastructure=infra-lab")
            _wait(tab, READY)
            tab.js("document.querySelector('.mode-switch .mode-item:nth-child(3)').click()")
            _wait(tab, f"{rows}.length === 3")
            assert "mode=journal" in tab.js("location.hash")
            assert tab.js(texts) == [
                "bob a créé le groupe Cœur (2 membres)",
                "bob a coloré sw-core-02 en rouge",
                "alice a placé 2 équipements",
            ]
            assert tab.js("document.querySelector('.stage').inert") is True, "la toile reste montée, inerte"
            stage = "getComputedStyle(document.querySelector('.stage')).visibility"
            assert tab.js(stage) == "hidden", "jamais peinte sous le Journal (au rechargement, elle transparaissait)"
            assert tab.js("document.querySelectorAll('.search, .toolbar, .band, .panel').length") == 0, "ni outils"
            assert tab.js("document.querySelector('.j-title p').textContent").startswith("3 modifications")
            # l'export CSV : toutes les entrées des filtres, lues page après page, dites dans la zone live
            tab.js("document.querySelector('.j-export').click()")
            _wait(tab, "document.querySelector('.j-tools [aria-live]').textContent === '3 entrées exportées'")
            seen = "document.querySelector('.j-said').offsetWidth > 0"
            assert tab.js(seen), "le résultat se voit (revue : il n'était dit qu'au lecteur d'écran)"
            # l'aide : raccourcis et limites, Échap referme et rend le focus au bouton
            tab.js("document.querySelector('.j-help-open').click()")
            _wait(tab, "!!document.querySelector('.j-help')")
            assert "déclaré, pas authentifié" in tab.js("document.querySelector('.j-help').textContent")
            _key(tab, "Escape", 27)
            _wait(tab, "!document.querySelector('.j-help')")
            assert tab.js("document.activeElement === document.querySelector('.j-help-open')")
            # la plage de dates : deux jours, dans l'adresse ; « Tout » la retire (un choix exclusif, au clavier)
            day = (
                "(() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); "
                "return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()"
            )
            tab.js("document.querySelector('.j-range-open').click()")
            _wait(tab, "!!document.querySelector('.j-range')")
            for i in (0, 1):
                tab.js(
                    f"(() => {{ const i = document.querySelectorAll('.j-range input')[{i}]; "
                    f"Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, {day}); "
                    "i.dispatchEvent(new Event('input', {bubbles: true})); })()"
                )
            tab.js("document.querySelector('.j-range button[type=submit]').click()")
            _wait(tab, "location.hash.includes('jp=range&jfrom=') && !document.querySelector('.j-range')")
            _wait(tab, f"{rows}.length === 3")
            assert tab.js("document.querySelector('.j-range-open').getAttribute('aria-checked')") == "true"
            radios = "Array.from(document.querySelectorAll('.j-period [role=radio]'))"
            tab.js(f"{radios}[3].focus()")
            _key(tab, "ArrowRight", 39)
            _key(tab, "ArrowLeft", 37)
            _wait(tab, "!location.hash.includes('jp=')")
            assert tab.js(f"{radios}.map(b => b.tabIndex)") == [-1, -1, -1, 0, -1], "une seule étape de tabulation"
            # une catégorie : dans l'adresse ; les autres catégories gardent leur compte (facette sans son filtre)
            tab.js(facet.format("'Couleurs'") + ".click()")
            _wait(tab, f"{rows}.length === 1")
            assert "jcat=colors" in tab.js("location.hash")
            assert tab.js(facet.format("'Positions'") + ".textContent") == "Positions : 1", "un séparateur lu"
            tab.js(facet.format("'Couleurs'") + ".click()")
            _wait(tab, f"{rows}.length === 3")
            # la recherche : `/` lui donne le focus ; elle part quand on s'arrête d'écrire, sans la casse
            tab.js("document.body.dispatchEvent(new KeyboardEvent('keydown', {key: '/', bubbles: true}))")
            assert tab.js("document.activeElement === document.querySelector('.j-search input')")
            tab.js(typed.format(json.dumps("CŒUR")))
            _wait(tab, f"{rows}.length === 1")
            assert "jq=C%C5%92UR" in tab.js("location.hash")
            tab.js("document.querySelector('.j-clear').click()")
            _wait(tab, f"{rows}.length === 3")
            # le fil au clavier : une seule étape de tabulation, ↓ passe à la ligne suivante
            assert tab.js("document.querySelectorAll('.j-row-head[tabindex=\"0\"]').length") == 1
            tab.js(f"{rows}[0].querySelector('.j-row-head').focus()")
            _key(tab, "ArrowDown", 40)
            assert tab.js(f"document.activeElement === {rows}[1].querySelector('.j-row-head')")
            # une rafale se déplie : le verbe une fois, les équipements en puces, et les opérations reçues
            tab.js(f"{rows}[2].querySelector('.j-row-head').click()")
            _wait(tab, "!!document.querySelector('.j-row.open .j-ops')")
            first = "e => e.firstChild.textContent"
            ops = f"Array.from(document.querySelectorAll('.j-row.open .j-ops > li > div')).map({first})"
            assert tab.js(ops) == ["a placé 2 équipements"]
            hosts = f"Array.from(document.querySelectorAll('.j-row.open .j-hosts .j-ref')).map({first})"
            assert tab.js(hosts) == ["sw-core-01", "fw-edge-01"]
            assert tab.js("document.querySelector('.j-row.open .j-row-head').getAttribute('aria-expanded')") == "true"
            # un équipement cité : le Diagramme s'ouvre sur lui, une pastille propose le retour
            tab.js("document.querySelector('.j-row.open .j-hosts .j-ref').click()")
            _wait(tab, "LDApp.debug.state().view.mode === 'diagram' && !!LDApp.debug.state().selection")
            assert tab.js("LDApp.debug.state().selection.id") == "sw-core-01"
            assert "node=sw-core-01" in tab.js("location.hash") and "jq" not in tab.js("location.hash")
            assert tab.js("document.querySelector('.stage').inert") is False
            assert not tab.js("!!document.querySelector('.journal')")
            assert tab.js("!!document.querySelector('.journal-back')"), "retour au journal proposé"
            # Retour du navigateur : le Journal revient, la ligne dépliée l'est encore
            tab.js("history.back()")
            _wait(tab, f"LDApp.debug.state().view.mode === 'journal' && {rows}.length === 3")
            assert tab.js("document.querySelectorAll('.j-row.open').length") == 1, "le contexte survit à l'aller-retour"
            back = "document.activeElement.classList.contains('j-row-head') && document.activeElement.tabIndex === 0"
            assert tab.js(back), "le focus revient sur la ligne active, pas sur la page"
            reached = f"document.activeElement === {rows}[1].querySelector('.j-row-head')"
            assert tab.js(reached), "celle que ↓ avait atteinte"
            tab.js("document.querySelector('.mode-switch .mode-item:nth-child(1)').click()")
            _wait(tab, "LDApp.debug.state().view.mode === 'diagram'")
            # toutes les infrastructures : le groupe « Bord » d'infra-b s'ouvre là-bas, sélectionné
            tab.js("document.querySelector('.mode-switch .mode-item:nth-child(3)').click()")
            _wait(tab, f"{rows}.length === 3")
            assert not tab.js("!!document.querySelector('.journal-back')"), "revenu au Journal, la pastille s'en va"
            tab.js(facet.format("'Toutes'") + ".click()")
            _wait(tab, f"{rows}.length === 4")
            # l'historique d'un objet d'une autre infrastructure s'ouvre dans la sienne (revue, H1 : `g1-1` existe aussi
            # ici, celui d'infra-lab, « Cœur » ; c'est « Bord » d'infra-b qu'on veut) ; Retour ramène à « Toutes »
            bord = "Array.from(document.querySelectorAll('.j-row')).find(r => r.textContent.includes('Bord'))"
            tab.js(f"{bord}.querySelector('.j-row-head').click()")
            _wait(tab, f"!!{bord}.querySelector('.j-act + .j-act')")
            tab.js(f"{bord}.querySelector('.j-act + .j-act').click()")
            other = "location.hash.includes('jobj=g1-1') && location.hash.includes('jinfra=infra-b')"
            _wait(tab, f"{other} && {rows}.length === 1 && LDApp.debug.state().journal.kind === 'ready'")
            assert "Historique de Bord" in tab.js("document.querySelector('.j-chip').textContent")
            tab.js("history.back()")
            _wait(tab, f"location.hash.includes('jinfra=*') && !location.hash.includes('jobj') && {rows}.length === 4")
            tab.js("Array.from(document.querySelectorAll('.j-ref')).find(b => b.textContent === 'Bord').click()")
            wanted = (
                "LDApp.debug.state().run.kind === 'ready' && LDApp.debug.state().run.model.source.infrastructure"
                " === 'infra-b' && !!LDApp.debug.state().selection"
            )
            _wait(tab, wanted)
            assert tab.js("[LDApp.debug.state().selection.kind, LDApp.debug.state().selection.id]") == ["group", "g1-1"]
            assert tab.js("LDApp.debug.state().run.model.groupById.get('g1-1').label") == "Bord"
            assert "infrastructure=infra-b" in tab.js("location.search")
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_the_application_journal_keeps_its_place_in_a_browser(settings, bundle_dict):
    """Revue Impeccable du 2026-10-10 : au retour du Diagramme, le défilement était perdu (relu sur un nœud déjà
    détaché) et le focus tombait 2 800 px plus bas ; la recherche ne trouvait pas les mots affichés."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.test_view import _serve, _wait

    facet = "Array.from(document.querySelectorAll('.j-facet')).find(b => b.textContent.startsWith({}))"
    hosts, hues = ("sw-core-01", "sw-core-02", "fw-edge-01", "fw-edge-02", "rt-wan-01"), ("red", "teal", "amber")
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        patches = f"{base}/api/intent/patches?infrastructure=infra-lab"
        for i in range(80):  # un autre équipement à chaque fois : aucune répétition, une ligne par requête
            op = {"op": "color", "hostname": hosts[i % len(hosts)], "hue": hues[i % len(hues)]}
            reply = httpx.post(patches, json={"author": "alice", "ops": [op]}, headers=auth, timeout=30)
            assert reply.status_code == 200
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/?infrastructure=infra-lab#mode=journal")
            _wait(tab, "document.querySelectorAll('.j-row').length === 80")
            tab.js("document.querySelector('.j-main').scrollTop = 1600")
            row = (
                "(() => { const box = document.querySelector('.j-main').getBoundingClientRect(); "
                "return Array.from(document.querySelectorAll('.j-row-head'))"
                ".find(h => h.getBoundingClientRect().top > box.top + 200); })()"
            )
            tab.js(f"{row}.focus()")
            item = tab.js("document.activeElement.dataset.item")
            _key(tab, "o", 79)
            _wait(tab, "LDApp.debug.state().view.mode === 'diagram' && !!LDApp.debug.state().selection")
            tab.js("history.back()")
            back = "LDApp.debug.state().view.mode === 'journal' && document.querySelectorAll('.j-row').length === 80"
            _wait(tab, back)
            assert tab.js("document.querySelector('.j-main').scrollTop") > 1200, "le Journal revient à sa place"
            assert tab.js("document.activeElement.dataset.item") == item, "sur la ligne quittée"
            seen = (
                "(() => { const box = document.querySelector('.j-main').getBoundingClientRect(), "
                "at = document.activeElement.getBoundingClientRect(); "
                "return at.top >= box.top && at.bottom <= box.bottom; })()"
            )
            assert tab.js(seen), "et le focus se voit"
            # la recherche lit les mots de la page : « rouge » trouve les couleurs mises en rouge
            tab.js(
                "(() => { const i = document.querySelector('.j-search input'); Object.getOwnPropertyDescriptor("
                "HTMLInputElement.prototype, 'value').set.call(i, 'rouge'); "
                "i.dispatchEvent(new Event('input', {bubbles: true})); })()"
            )
            _wait(tab, "document.querySelectorAll('.j-row').length === 27 && location.hash.includes('jq=rouge')")
            # le lien vers une entrée : copié depuis le détail, rouvert, la page commence à elle, surlignée et focalisée
            tab.js("document.querySelectorAll('.j-row-head')[20].click()")
            _wait(tab, "!!document.querySelector('.j-row.open .j-act')")
            link = tab.js("document.querySelector('.j-row.open .j-act').dataset.link")
            revision = int(link.rsplit("jrev=", 1)[1])
            tab.navigate(link)
            focused = "!!document.querySelector('.j-row.target') && !!document.activeElement.closest('.j-row.target')"
            _wait(tab, focused)
            assert tab.js("document.querySelector('.j-row.target .j-rev').textContent").endswith(f"r{revision}")
            first = tab.js("document.querySelector('.j-row .j-rev').textContent")
            assert first.endswith(f"r{revision}"), "la page commence à elle"
            tab.js("document.querySelector('.j-link-btn').click()")
            _wait(tab, "!location.hash.includes('jrev') && document.querySelectorAll('.j-row').length === 80")
            # l'action : « Créé » ne garde rien ici (que des couleurs), et l'état vide le rappelle
            tab.js(facet.format("'Créé'") + ".click()")
            _wait(tab, "location.hash.includes('jact=created') && document.querySelector('.j-state-detail') !== null")
            assert "Créé" in tab.js("document.querySelector('.j-state-detail').textContent")
            # l'historique d'un objet, depuis sa fiche du Diagramme ; Retour ramène au Diagramme
            tab.navigate(f"{base}/?infrastructure=infra-lab#node=sw-core-01")
            _wait(tab, "!!document.querySelector('.ibtn[aria-label=\"historique au journal\"]')")
            tab.js("document.querySelector('.ibtn[aria-label=\"historique au journal\"]').click()")
            _wait(tab, "location.hash.includes('jobj=sw-core-01') && document.querySelectorAll('.j-row').length == 16")
            assert "Historique de sw-core-01" in tab.js("document.querySelector('.j-chip').textContent")
            tab.js("history.back()")
            _wait(tab, "LDApp.debug.state().view.mode === 'diagram'")
    finally:
        server.should_exit = True
        thread.join(timeout=5)
