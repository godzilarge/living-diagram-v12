"""Correction de la revue de session (2026-10-15) : captures avant / après sur demo-dc (1440 × 900, sombre, grille).
1-ouverture, 2-carte-et-note (sélection mixte, barre contextuelle), 3-volet-aligner, 4-fleche (carte + note
attachée poussées d'un carreau : H1), 5-aligner-haut, 6-grille (trois cartes et la note : H1).
Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie>"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
from pathlib import Path

import httpx

from ld_backend.config import Settings
from tests.browser import Chrome
from tests.conftest import TOKEN
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
H = "LDApp.debug.handle().toile"
wait = lambda s: threading.Event().wait(s)  # noqa: E731


def key(tab, k: str, code: str, vk: int, modifiers: int = 0) -> None:
    event = {"key": k, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def positions(tab) -> dict:
    return json.loads(tab.js(f"JSON.stringify(Object.fromEntries({H}.state.positions))"))


def look(tab, host: str, zoom: float = 1.0) -> None:
    c = positions(tab)[host]
    tab.js(f"(() => {{ const t = {H}, r = document.querySelector('.flow-host .react-flow').getBoundingClientRect();"
           f" t.restoreView({{ zoom: {zoom}, x: (r.width - 348) / 2 - {c['x']} * {zoom}, y: r.height / 2 - {c['y']} * {zoom} }}); }})()")
    wait(0.8)


def open_app(tab, base: str) -> None:
    tab.navigate(f"{base}/?infrastructure=demo-dc")
    _wait(tab, READY); wait(1.5)


settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-corr-")), max_bundle_bytes=30_000_000)
server, thread, base = _serve(settings)
try:
    auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    for path in [PROJECT / "samples/demo-dc" / f"run-0{i}.json" for i in (1, 2, 3)]:
        print(path.name, httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=auth, timeout=180).status_code)
    with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ grid: true, minimap: false }))")
        open_app(tab, base)
        pos = positions(tab)
        x0 = round(max(p["x"] for p in pos.values()) + 800) // 20 * 20
        y0 = round(min(p["y"] for p in pos.values())) // 20 * 20
        row = ["dc01-acc-01", "dc01-acc-02", "dc01-acc-03"]
        pins = [{"op": "pin", "hostname": h, "x": x0 + i * 380, "y": y0 + (i * 70)} for i, h in enumerate(row)]
        note = {"op": "annotation_create", "content": {"kind": "note", "text": "Baie 12\nnote attachée"}, "anchor": {"kind": "device", "ref": row[1]},
                "x": 60, "y": -140, "w": 180, "h": 70, "leader": True, "style": {"hue": "amber", "fill_opacity": 20}}
        r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=auth, json={"author": "orhan", "ops": pins + [note]}, timeout=30)
        assert r.status_code == 200, r.text
        ident = r.json()["annotations"][-1]["id"]
        open_app(tab, base)
        tab.screenshot(OUT / "1-ouverture.png")
        look(tab, row[1], 0.9)
        tab.js(f"{H}.selectItems([{{kind:'node', id:'{row[1]}'}}, {{kind:'annotation', id:'{ident}'}}])")
        tab.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        wait(0.8)
        tab.screenshot(OUT / "2-carte-et-note.png")
        frame0 = json.loads(tab.js(f"JSON.stringify({H}.frames.get('{ident}'))"))
        key(tab, "ArrowRight", "ArrowRight", 39)
        wait(1.4)
        frame1 = json.loads(tab.js(f"JSON.stringify({H}.frames.get('{ident}'))"))
        doc = httpx.get(f"{base}/api/intent", params={"infrastructure": "demo-dc"}, headers=auth).json()
        a = [x for x in doc["annotations"] if x["id"] == ident][0]
        print("4 flèche : note dx", frame1["x"] - frame0["x"], "écart écrit", a["x"], "(était 60)")
        tab.screenshot(OUT / "4-fleche.png")
        look(tab, row[1], 0.6)
        tab.js(f"{H}.selectItems([{{kind:'node', id:'{row[0]}'}}, {{kind:'node', id:'{row[1]}'}}, {{kind:'node', id:'{row[2]}'}}, {{kind:'annotation', id:'{ident}'}}])")
        tab.js("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        wait(0.8)
        tab.js("document.querySelector('.fbar [data-id=align]').click()")
        wait(0.8)
        tab.screenshot(OUT / "3-volet-aligner.png")
        key(tab, "Escape", "Escape", 27)
        wait(0.4)
        tab.js(f"{H}.selectItems([{{kind:'node', id:'{row[0]}'}}, {{kind:'node', id:'{row[1]}'}}, {{kind:'node', id:'{row[2]}'}}, {{kind:'annotation', id:'{ident}'}}])")
        wait(0.4)
        frame2 = json.loads(tab.js(f"JSON.stringify({H}.frames.get('{ident}'))"))
        tab.js(f"{H}.alignSelected('top')")
        wait(1.4)
        frame3 = json.loads(tab.js(f"JSON.stringify({H}.frames.get('{ident}'))"))
        tops = [positions(tab)[h]["y"] - 40 for h in row]
        print("5 aligner en haut : haut des cartes", tops, "note avant", frame2, "après", frame3)
        tab.screenshot(OUT / "5-aligner-haut.png")
        tab.js(f"{H}.gridSelected({{ cols: 2, order: 'name', snap: null }})")
        wait(1.4)
        frame4 = json.loads(tab.js(f"JSON.stringify({H}.frames.get('{ident}'))"))
        print("6 grille : note", frame4, "cartes", {h: positions(tab)[h] for h in row})
        tab.screenshot(OUT / "6-grille.png")
finally:
    server.should_exit = True
    thread.join(timeout=5)
