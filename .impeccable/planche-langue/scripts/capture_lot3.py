"""Captures du lot 3 (fiches, menu contextuel) en anglais et en français, sur demo-dc.
Usage : cd backend && PYTHONPATH=. uv run python <ce fichier> OUT_DIR ARCHIVE_DIR"""
from __future__ import annotations

import json
import sys
import threading
from pathlib import Path

import httpx

from ld_backend.config import Settings
from tests.browser import Chrome
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

SAMPLES = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo/samples/demo-dc")
OUT = Path(sys.argv[1])
TOKEN = "tok-capture"
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"


def settle(s: float = 0.7) -> None:
    threading.Event().wait(s)


def main() -> None:
    settings = Settings(api_token=TOKEN, archive_dir=Path(sys.argv[2]), max_bundle_bytes=50_000_000)
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        for f in ("run-01.json", "run-02.json", "run-03.json"):
            httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / f).read_bytes(), headers=auth, timeout=120)
        with Chrome(CHROMIUM, window=(1440, 900), lang="en-US") as chrome:
            tab = chrome.open(f"{base}/?infrastructure=demo-dc")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            for lang in ("en", "fr"):
                tab.js(f"localStorage.setItem('ld-prefs', JSON.stringify({{language: {json.dumps(lang)}}}))")
                tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
                tab.js("localStorage.setItem('ld-author', 'orhan')")
                tab.navigate("about:blank")
                tab.navigate(f"{base}/?infrastructure=demo-dc#node=dc01-core-01")
                _wait(tab, READY)
                settle(1.5)
                tab.screenshot(OUT / f"{lang}-fiche-faits.png")
                tab.navigate("about:blank")
                tab.navigate(f"{base}/?infrastructure=demo-dc#mode=control&node=dc01-fw-01")
                _wait(tab, READY)
                settle(1.5)
                tab.screenshot(OUT / f"{lang}-fiche-controle.png")
                tab.navigate("about:blank")
                tab.navigate(f"{base}/?infrastructure=demo-dc")
                _wait(tab, READY)
                settle(1.5)
                tab.js("(() => { const el = document.querySelector('.react-flow__node[data-id=dc01-core-02]'); const r = el.getBoundingClientRect();"
                       " el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 2 })); })()")
                settle()
                tab.screenshot(OUT / f"{lang}-menu-contextuel.png")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
