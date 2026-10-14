"""Captures de la passe de correction de l'audit (barre en Contrôle, plage de dates ISO, palette) en anglais et en français, sur demo-dc.
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
        ops = {"author": "orhan", "ops": [{"op": "color_type", "type": "router", "hue": "amber"}]}
        httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, json=ops, headers=auth, timeout=60)
        for lang, theme, width in (("fr", "light", 1280), ("en", "light", 1280), ("fr", "dark", 1024)):
            with Chrome(CHROMIUM, window=(width, 800), lang="en-US") as chrome:
                tab = chrome.open(f"{base}/?infrastructure=demo-dc")
                _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
                tab.js(f"localStorage.setItem('ld-prefs', JSON.stringify({{language: '{lang}', theme: '{theme}'}}))")
                tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
                tab.js("localStorage.setItem('ld-author', 'orhan')")
                tab.navigate("about:blank")
                tab.navigate(f"{base}/?infrastructure=demo-dc#mode=control")
                _wait(tab, READY)
                settle(1.5)
                tab.screenshot(OUT / f"audit-{lang}-{theme}-{width}-controle.png")
        with Chrome(CHROMIUM, window=(1440, 900), lang="en-US") as chrome:
            tab = chrome.open(f"{base}/?infrastructure=demo-dc")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js("localStorage.setItem('ld-prefs', JSON.stringify({language: 'en'}))")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate("about:blank")
            tab.navigate(f"{base}/?infrastructure=demo-dc#mode=journal")
            _wait(tab, "!!document.querySelector('.j-range-open')")
            settle(1.0)
            tab.js("document.querySelector('.j-range-open').click()")
            _wait(tab, "!!document.querySelector('.j-range')")
            settle(0.5)
            tab.screenshot(OUT / "audit-en-journal-plage.png")
            tab.navigate("about:blank")
            tab.navigate(f"{base}/?infrastructure=demo-dc")
            _wait(tab, READY)
            settle(1.0)
            tab.js("document.querySelector('.writer-name').closest('button').click()")
            _wait(tab, "!!document.querySelector('.menu')")
            tab.js("Array.from(document.querySelectorAll('.menu button')).find((b) => /palette/i.test(b.textContent)).click()")
            _wait(tab, "!!document.querySelector('.palette-types')")
            settle(0.6)
            tab.screenshot(OUT / "audit-en-palette.png")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
