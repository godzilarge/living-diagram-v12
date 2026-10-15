# Copie adaptée de planche-lot-16 (critique du 2026-10-15).
"""Lot 16 (docs/11) : une session de démonstration (serveur, demo-dc ingérée, page ouverte sous le nom d'orhan), partagée
par l'exploration et les captures. Lancer depuis backend/ avec PYTHONPATH=. (les aides de `tests/` s'importent)."""
from __future__ import annotations

import json
import tempfile
from contextlib import contextmanager
from pathlib import Path

import httpx

from ld_backend.config import Settings
from tests.browser import Chrome
from tests.conftest import TOKEN
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

from scene import READY, wait

ROOT = Path(__file__).resolve().parents[4]
AUTH = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


@contextmanager
def session(window=(1440, 900)):
    settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot16-")), max_bundle_bytes=30_000_000)
    server, thread, base = _serve(settings)
    try:
        for path in sorted((ROOT / "samples" / "demo-dc").glob("run-*.json")):
            r = httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=AUTH, timeout=180)
            assert r.status_code in (200, 201), r.text
        with Chrome(CHROMIUM, window=window) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            tab.navigate(f"{base}/?infrastructure=demo-dc")
            _wait(tab, READY)
            wait(1.2)
            yield base, tab, chrome
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def reopen(tab, base: str) -> None:
    tab.navigate(f"{base}/?infrastructure=demo-dc")
    _wait(tab, READY)
    wait(1.2)
