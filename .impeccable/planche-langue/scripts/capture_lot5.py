"""Captures du lot 5 (le Journal) en anglais et en français, sur demo-dc.
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
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for f in ("run-01.json", "run-02.json", "run-03.json"):
            httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / f).read_bytes(), headers={**auth, "Content-Type": "application/json"}, timeout=120)
        url = f"{base}/api/intent/patches?infrastructure=demo-dc"
        batches = [
            ("orhan", [{"op": "pin", "hostname": "dc01-core-01", "x": 100, "y": 40}]),
            ("orhan", [{"op": "pin", "hostname": h, "x": 300 + i * 40, "y": 80} for i, h in enumerate(("dc01-acc-01", "dc01-acc-02", "dc01-acc-03"))]),
            ("claire", [{"op": "color", "hostname": "dc01-fw-01", "hue": "red"}]),
            ("claire", [{"op": "group_create", "label": "Cœur DC01", "members": ["dc01-core-01", "dc01-core-02"]}]),
            ("orhan", [{"op": "annotation_create", "content": {"kind": "note", "text": "Salle B, baie 4"}, "x": 0, "y": 0}]),
            ("claire", [{"op": "connector_create", "start": {"kind": "free", "x": 0, "y": 0}, "end": {"kind": "free", "x": 90, "y": 40}}]),
            ("orhan", [{"op": "color_type", "type": "router", "hue": "amber"}]),
        ]
        for author, ops in batches:
            r = httpx.post(url, json={"author": author, "ops": ops}, headers=auth, timeout=30)
            assert r.status_code == 200, r.text
        groups = httpx.get(f"{base}/api/intent?infrastructure=demo-dc", headers=auth).json()["groups"]
        httpx.post(url, json={"author": "claire", "ops": [{"op": "group_delete", "id": groups[0]["id"]}]}, headers=auth, timeout=30)
        with Chrome(CHROMIUM, window=(1440, 900), lang="en-US") as chrome:
            tab = chrome.open(f"{base}/?infrastructure=demo-dc")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            for lang in ("en", "fr"):
                tab.js(f"localStorage.setItem('ld-prefs', JSON.stringify({{language: {json.dumps(lang)}}}))")
                tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
                tab.js("localStorage.setItem('ld-author', 'orhan')")
                tab.navigate("about:blank")
                tab.navigate(f"{base}/?infrastructure=demo-dc#mode=journal")
                _wait(tab, "!!document.querySelector('.j-row-head')")
                settle(1.0)
                tab.js("document.querySelectorAll('.j-row-head')[0].click()")
                settle(0.6)
                tab.screenshot(OUT / f"{lang}-journal.png")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
