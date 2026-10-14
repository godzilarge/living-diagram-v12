"""Captures du lot 4 (la toile : pastilles, bulle) en anglais et en français, sur demo-dc.
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


NODE_POINT = ("(() => {{ const r = document.querySelector('.react-flow__node[data-id={}]').getBoundingClientRect();"
              " return JSON.stringify([r.x + r.width / 2, r.y + r.height / 2]); }})()")
# le milieu du tracé visible d'un câble entre deux cœurs, en coordonnées d'écran
EDGE_POINT = ("(() => { const p = Array.from(document.querySelectorAll('.react-flow__edge path.cable, .react-flow__edge path'))"
              ".find((e) => e.getTotalLength && e.getTotalLength() > 120); const m = p.getPointAtLength(p.getTotalLength() / 2);"
              " const q = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM()); return JSON.stringify([q.x, q.y]); })()")


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
                for mode, name in (("", "toile-bulle-equipement"), ("#mode=control", "toile-bulle-cable")):
                    tab.navigate("about:blank")
                    tab.navigate(f"{base}/?infrastructure=demo-dc{mode}")
                    _wait(tab, READY)
                    settle(1.5)
                    if not mode:
                        point = tab.js(NODE_POINT.format("dc01-fw-01"))
                    else:
                        point = tab.js(EDGE_POINT)
                    x, y = json.loads(point)
                    tab.mouse_move(x, y)
                    settle(0.8)
                    tab.screenshot(OUT / f"{lang}-{name}.png")
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
