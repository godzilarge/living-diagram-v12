"""Captures du lot 6 (sens des contrôles, mode HA en mots) en anglais et en français, sur demo-dc.
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


BUSIEST = ("(() => { const m = LDApp.debug.handle().toile.model; let best = null, n = -1;"
           " m.checksByNode.forEach((v, k) => { if (v.length > n) { n = v.length; best = k; } }); return best; })()")
CLUSTER = "LDApp.debug.handle().toile.model.clusters[0].id"


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
            for lang in ("en", "fr"):
                tab.js(f"localStorage.setItem('ld-prefs', JSON.stringify({{language: {json.dumps(lang)}}}))")
                tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
                for name, pick in (("controles-equipement", BUSIEST), ("controles-cluster", CLUSTER)):
                    tab.navigate("about:blank")
                    tab.navigate(f"{base}/?infrastructure=demo-dc#mode=control")
                    _wait(tab, READY)
                    settle(1.2)
                    target = tab.js(pick)
                    kind = "node" if name.endswith("equipement") else "cluster"
                    tab.js(f"LDApp.debug.handle().toile.select({{ kind: '{kind}', id: {json.dumps(target)} }})")
                    _wait(tab, "!!document.querySelector('.panel .insp-section-title')")
                    settle(0.8)
                    tab.screenshot(OUT / f"{lang}-{name}.png")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
