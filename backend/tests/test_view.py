"""`GET /view` : la coquille du visualiseur, servie sans jeton, sans donnée, qui lit la run par l'API."""

import base64
import hashlib
import json
import re
import socket
import subprocess
import threading

import pytest
from fastapi.testclient import TestClient

from ld_backend.api import create_app
from ld_backend.render import render_shell
from tests.test_render import CHROMIUM, SVG_NAMESPACE, _block

RUN = {"infrastructure": "infra-lab", "run_id": "66db3f0e9a1c2b0012f4a7d1"}


def test_view_serves_the_shell_without_token_and_without_data(client: TestClient):
    res = client.get("/view")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/html")
    page = res.text
    assert '"snapshot":null' in page and 'id="view-shell"' in page
    assert "connect-src 'self'" in page, "la coquille doit pouvoir appeler l'API de sa propre origine"
    assert set(re.findall(r"https?://[^\s\"'<>)]+", page)) <= {SVG_NAMESPACE}
    data = json.loads(_block(page, "script", ' type="application/json" id="ld-data"'))
    assert data["snapshot"] is None and data["ingest"] is None and "self_observation" in data["catalogue"]


def test_view_is_stable_and_its_csp_hashes_match(client: TestClient):
    first, second = client.get("/view").content, client.get("/view").content
    assert first == second == render_shell().encode("utf-8")
    page = first.decode("utf-8")
    csp = re.search(r'Content-Security-Policy" content="([^"]+)"', page).group(1)
    for tag, marker in (("script", ' id="ld-viewer"'), ("style", "")):
        digest = base64.b64encode(hashlib.sha256(_block(page, tag, marker).encode("utf-8")).digest()).decode("ascii")
        assert f"'sha256-{digest}'" in csp
    # La toile est un seul fichier : la coquille (jeton, liste des runs, lecture par l'API) y est, et ne démarre que
    # dans une page sans snapshot embarqué (ce que les tests sous Node de `tests/js/` vérifient sur cette même page,
    # `LD_SHELL`) ; le seul réseau que la CSP ouvre est `connect-src 'self'`.
    assert "connect-src 'self'" in csp and "'none'" in csp


def test_the_standalone_page_does_not_open_the_network(client: TestClient, bundle_dict):
    from ld_backend.render import page_from_bundle

    page = page_from_bundle(bundle_dict, origin="x").page
    assert "connect-src" not in page  # la CSP est la garantie : aucun `fetch` ne peut aboutir, coquille comprise


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_served_shell_renders_its_form_in_a_browser_under_its_csp(settings):
    """Servie par uvicorn, lue par Chromium : le formulaire s'affiche, aucune règle CSP n'est violée."""
    import uvicorn

    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(settings), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(200):
            if server.started:
                break
            threading.Event().wait(0.05)
        assert server.started
        url = f"http://127.0.0.1:{port}/view?infrastructure=infra-lab&run_id={RUN['run_id']}#view=graph"
        flags = ["--no-sandbox", "--disable-gpu", "--virtual-time-budget=3000", "--enable-logging=stderr", "--v=0"]
        done = subprocess.run(
            [str(CHROMIUM), *flags, "--dump-dom", url], capture_output=True, text=True, timeout=120, check=False
        )
    finally:
        server.should_exit = True
        thread.join(timeout=10)
    dom = done.stdout
    assert 'type="password"' in dom and "Lire une run archivée" in dom, done.stderr[-2000:]
    assert 'class="fatal"' not in dom.split("<noscript>")[0]
    assert not [line for line in done.stderr.splitlines() if "CONSOLE" in line or "Refused" in line]


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_a_drag_in_the_served_page_pins_for_everyone_through_the_api(settings, bundle_dict):
    """De bout en bout (B4) : uvicorn sert `/view`, Chromium ouvre la run avec un jeton et un nom, un glissé réel
    envoie `pin` à l'API, et `GET /api/intent` rend l'épingle sous ce nom. Rien n'entre dans l'adresse."""
    import httpx
    import uvicorn

    from tests.browser import Chrome
    from tests.conftest import TOKEN

    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(settings), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        for _ in range(200):
            if server.started:
                break
            threading.Event().wait(0.05)
        assert server.started
        base = f"http://127.0.0.1:{port}"
        auth = {"Authorization": f"Bearer {TOKEN}"}
        assert httpx.post(f"{base}/api/ingest/bundles", json=bundle_dict, headers=auth, timeout=60).status_code == 201
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/view")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/view?infrastructure=infra-lab&run_id={RUN['run_id']}#view=graph")
            for _ in range(100):
                if tab.js("!!(globalThis.LD && LD.app)"):
                    break
                threading.Event().wait(0.05)
            assert tab.js("LD.app.writer.author") == "orhan"
            where = (
                "(() => { const st = LD.app.graph.state, p = st.positions.get('sw-core-02');"
                " const r = document.getElementById('canvas').getBoundingClientRect();"
                " return { x: r.left + p.x * st.view.k + st.view.tx, y: r.top + p.y * st.view.k + st.view.ty }; })()"
            )
            start = tab.js(where)
            tab.drag((start["x"], start["y"]), (start["x"] + 100, start["y"] + 50))
            for _ in range(100):
                if "enregistrée (orhan)" in tab.js("document.getElementById('graph-status').textContent"):
                    break
                threading.Event().wait(0.05)
            status = tab.js("document.getElementById('graph-status').textContent")
            assert "épingle de sw-core-02 enregistrée (orhan)" in status, status
            assert tab.js("LD.app.model.pinByHost.get('sw-core-02').author") == "orhan"
            assert tab.js("location.href").endswith(f"/view?infrastructure=infra-lab&run_id={RUN['run_id']}#view=graph")
            assert TOKEN not in tab.js("location.href")
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("type") == "error"]
        assert not noise, noise
        stored = httpx.get(f"{base}/api/intent", params={"infrastructure": "infra-lab"}, headers=auth, timeout=30)
        stored = stored.json()
        assert stored["revision"] == 1 and [p["hostname"] for p in stored["pins"]] == ["sw-core-02"]
        assert stored["pins"][0]["author"] == "orhan"
    finally:
        server.should_exit = True
        thread.join(timeout=10)


def _serve(settings):
    """uvicorn dans un fil ; l'appelant arrête le serveur dans son `finally`."""
    import uvicorn

    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(settings), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:
            break
        threading.Event().wait(0.05)
    assert server.started
    return server, thread, f"http://127.0.0.1:{port}"


def _wait(tab, expression: str) -> None:
    for _ in range(200):
        if tab.js(expression):
            return
        threading.Event().wait(0.05)
    raise AssertionError(f"jamais vrai : {expression}")


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_first_page_memorizes_the_placement_and_the_next_run_keeps_it(settings, bundle_dict):
    """De bout en bout (docs/09) : la première page ouverte sur une run mémorise son placement par l'API ; la run
    suivante, ouverte dans un autre onglet, dessine chaque équipement au même endroit ; « replacer » demande
    confirmation puis remplace le document pour tout le monde."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.diff.conftest import LATER_RUN_ID, later

    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for bundle in (bundle_dict, later(bundle_dict)):
            assert httpx.post(f"{base}/api/ingest/bundles", json=bundle, headers=auth, timeout=60).status_code == 201

        def placement() -> dict:
            params = {"infrastructure": "infra-lab"}
            return httpx.get(f"{base}/api/placement", params=params, headers=auth, timeout=30).json()

        assert placement()["revision"] == 0
        positions = (
            "JSON.stringify(Object.fromEntries(Array.from(LD.app.graph.state.positions)"
            ".filter(([h]) => LD.app.model.nodeByHost.get(h).kind !== 'stub')))"
        )
        status = "document.getElementById('graph-status').textContent"
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/view")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/view?infrastructure=infra-lab&run_id={RUN['run_id']}#view=graph")
            _wait(tab, "!!(globalThis.LD && LD.app)")
            _wait(tab, f"/placés et mémorisés/.test({status})")
            first = json.loads(tab.js(positions))
            stored = placement()
            assert stored["revision"] == 1
            assert {p["hostname"]: {"x": p["x"], "y": p["y"]} for p in stored["places"]} == first, (
                "mémorisé tel que dessiné"
            )
            tab.navigate(f"{base}/view?infrastructure=infra-lab&run_id={LATER_RUN_ID}#view=graph")
            _wait(tab, "!!(globalThis.LD && LD.app)")
            assert json.loads(tab.js(positions)) == first, "la run suivante dessine chaque équipement au même endroit"
            assert "mémoris" not in tab.js(status), "rien de nouveau à mémoriser"
            assert placement()["revision"] == 1
            button = "Array.from(document.querySelectorAll('#graph-toolbar button')).find((b) => b.textContent === {})"
            tab.js(button.format(json.dumps("replacer")) + ".click()")
            assert tab.js("!!" + button.format(json.dumps("confirmer : replacer")))
            assert placement()["revision"] == 1, "rien ne part avant la confirmation"
            tab.js(button.format(json.dumps("confirmer : replacer")) + ".click()")
            _wait(tab, f"/mémorisé pour tout le monde/.test({status})")
            replaced = placement()
            assert replaced["revision"] == 2 and len(replaced["places"]) == len(first)
            assert TOKEN not in tab.js("location.href")
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("type") == "error"]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)


@pytest.mark.skipif(CHROMIUM is None, reason="Chromium headless absent : pas de test dans un vrai navigateur")
def test_the_timeline_steps_from_run_to_run_in_the_served_page(settings, bundle_dict):
    """De bout en bout : trois runs archivées ; la bande des runs de `/view` passe de l'une à l'autre par l'API, le
    diff suit (comparée à la run qu'on quitte), la sélection par identité traverse les runs, une seule toile, et le
    clavier (→ sur la bande) fait de même en gardant le focus."""
    import httpx

    from tests.browser import Chrome
    from tests.conftest import TOKEN
    from tests.diff.conftest import LATER_RUN_ID, cable_down_later, later

    third_id = "66ee0b1c9a1c2b0012f4a9f3"
    third = later(bundle_dict, weeks=2)
    third["run"]["collector_run_id"] = third_id
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for bundle in (bundle_dict, cable_down_later(bundle_dict), third):
            assert httpx.post(f"{base}/api/ingest/bundles", json=bundle, headers=auth, timeout=60).status_code == 201
        current = "LD.app && LD.app.model.source.collector_run_id === {}"
        buttons = (
            "JSON.stringify(Array.from(document.querySelectorAll('#timeline .timeline-run'),"
            " (b) => [b.textContent, b.getAttribute('aria-current')]))"
        )
        expected = [["2026-09-10 02:00", "true"], ["2026-09-17 02:00", None], ["2026-09-24 02:00", None]]
        key = {"key": "ArrowRight", "code": "ArrowRight", "windowsVirtualKeyCode": 39}
        with Chrome(CHROMIUM) as chrome:
            tab = chrome.open(f"{base}/view")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.navigate(f"{base}/view?infrastructure=infra-lab&run_id={RUN['run_id']}#view=graph&node=sw-core-02")
            _wait(tab, current.format(json.dumps(RUN["run_id"])))
            assert json.loads(tab.js(buttons)) == expected
            assert tab.js("LD.app.model.diff === null"), "une adresse sans from : pas de diff"
            tab.js("document.querySelectorAll('#timeline .timeline-step')[1].click()")
            _wait(tab, current.format(json.dumps(LATER_RUN_ID)))
            assert tab.js("location.search") == f"?infrastructure=infra-lab&run_id={LATER_RUN_ID}&from={RUN['run_id']}"
            changed = tab.js("LD.app.model.diff.summary.links.changed")
            assert changed >= 1, "comparée à la run quittée : le câble tombé est un changement"
            assert "comparée à la run" in tab.js("document.getElementById('run-meta').textContent")
            assert tab.js("LD.app.graph.state.selection.id") == "sw-core-02", "la sélection traverse les runs"
            assert tab.js("document.querySelectorAll('#canvas .viewport').length") == 1, "une seule toile"
            assert json.loads(tab.js(buttons))[1] == ["2026-09-17 02:00", "true"]
            tab.js("document.querySelector('#timeline .timeline-run[aria-current=\"true\"]').focus()")
            for kind in ("keyDown", "keyUp"):
                tab.call("Input.dispatchKeyEvent", {"type": kind, **key})
            _wait(tab, current.format(json.dumps(third_id)))
            assert tab.js("location.search") == f"?infrastructure=infra-lab&run_id={third_id}&from={LATER_RUN_ID}"
            focused = tab.js("document.activeElement.getAttribute('data-run')")
            assert focused == third_id, "le clavier garde sa place sur la bande"
            forward = tab.js("document.querySelectorAll('#timeline .timeline-step')[1].disabled")
            assert forward, "pas de run après la dernière"
            assert TOKEN not in tab.js("location.href")
        noise = [entry for entry in chrome.console if "Refused" in json.dumps(entry) or entry.get("type") == "error"]
        assert not noise, noise
    finally:
        server.should_exit = True
        thread.join(timeout=10)
