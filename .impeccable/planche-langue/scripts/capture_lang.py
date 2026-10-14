"""Captures de la langue (lot 1) : accueil et barre + menu, en anglais (navigateur en-US) puis en français, sur demo-dc.
Usage : cd backend && PYTHONPATH=. uv run python <ce fichier> OUT_DIR [ARCHIVE_DIR]"""
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
OUT.mkdir(parents=True, exist_ok=True)
TOKEN = "tok-capture"
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"


def settle(s: float = 0.6) -> None:
    threading.Event().wait(s)


def main() -> None:
    settings = Settings(api_token=TOKEN, archive_dir=Path(sys.argv[2]) if len(sys.argv) > 2 else OUT / "archive", max_bundle_bytes=50_000_000)
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        for f in ("run-01.json", "run-02.json", "run-03.json"):
            r = httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / f).read_bytes(), headers=auth, timeout=120)
            assert r.status_code in (200, 201), r.text[:300]
        with Chrome(CHROMIUM, window=(1440, 900), lang="en-US") as chrome:
            tab = chrome.open(f"{base}/?infrastructure=demo-dc")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            settle()
            tab.screenshot(OUT / "en-accueil.png")
            tab.js("document.querySelector('.sheet .language-switch [role=radio][lang=fr]').click()")
            settle()
            tab.screenshot(OUT / "fr-accueil.png")
            for lang in ("fr", "en"):
                tab.js(f"localStorage.setItem('ld-prefs', JSON.stringify({{language: {json.dumps(lang)}}}))")
                tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
                tab.js("localStorage.setItem('ld-author', 'orhan')")
                tab.navigate(f"{base}/?infrastructure=demo-dc")
                _wait(tab, READY)
                settle(1.5)
                tab.js("document.querySelector('.writer-name').closest('button').click()")
                settle()
                tab.screenshot(OUT / f"{lang}-barre-menu.png")
                tab.js("document.querySelector('.writer-name').closest('button').click()")
                settle(0.3)
                # lot 2 : recherche ouverte, panneau Affichage, parcours des erreurs en vue Contrôle
                tab.js("document.querySelector('.search-input').focus()")
                tab.call("Input.insertText", {"text": "core"})
                settle()
                tab.screenshot(OUT / f"{lang}-recherche.png")
                tab.js("document.querySelector('.search-input').blur()")
                tab.js("document.querySelector('.display-toggle').click()")
                settle()
                tab.screenshot(OUT / f"{lang}-affichage.png")
                tab.js("document.querySelector('.display-toggle').click()")
                tab.js("document.querySelector('.mode-item:nth-child(2)').click()")
                settle(1)
                tab.js("const b = document.querySelector('.count.sev-error, .count.sev-warning'); if (b) b.click();")
                settle(1)
                tab.screenshot(OUT / f"{lang}-controle.png")
                tab.js("document.querySelector('.mode-item:nth-child(1)').click()")
                settle(0.5)
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
