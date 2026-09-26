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
    assert "shell.js" not in page or "LD.shell" in page  # la coquille embarque bien son script de chargement
    assert "LD.shell = { create" in page


def test_the_standalone_page_does_not_open_the_network(client: TestClient, bundle_dict):
    from ld_backend.render import page_from_bundle

    page = page_from_bundle(bundle_dict, origin="x").page
    assert "connect-src" not in page and "LD.shell" not in page


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
