"""Passe de finition du 2026-10-15, copie adaptée de la critique (lot 8). Lot 8 (docs/11) : les repères d'alignement, l'aimant aux objets, « mettre en grille ». Captures sur demo-dc, gestes réels,
bouton tenu pendant les glissés : 1-guide-centre, 2-espacement-egal, 3-guide-bord, 4-redimension (1440 × 900 sombre),
5-volet-grille (aperçu au survol), 6-grille-resultat, 7-affichage-couleur-reperes, 8-clair-1280 (1280 × 800 clair,
espacement égal). Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie>"""
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
SHOWN = "!!document.querySelector('.fbar:not(.suspended):not(.offscreen)')"
PRIME = 6  # React Flow prend son départ au pas qui passe son seuil : un premier pas, puis le chemin décalé d'autant
wait = lambda s: threading.Event().wait(s)  # noqa: E731
H = "LDApp.debug.handle().toile"


def mouse(tab, kind: str, x: float, y: float, buttons: int, modifiers: int = 0) -> None:
    tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1, "modifiers": modifiers})


def key(tab, k: str, code: str, vk: int, modifiers: int = 0) -> None:
    event = {"key": k, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def rect(tab, selector: str) -> dict:
    return tab.js(f"JSON.parse(JSON.stringify(document.querySelector({json.dumps(selector)}).getBoundingClientRect()))")


def center_of(tab, selector: str) -> tuple[float, float]:
    r = rect(tab, selector)
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2


def node(ident: str) -> str:
    return f".react-flow__node[data-id={json.dumps(ident)}]"


def screen(tab, x: float, y: float) -> tuple[float, float]:
    return tuple(tab.js(f"(() => {{ const v = {H}.viewport(), r = document.querySelector('.flow-host .react-flow').getBoundingClientRect();"
                        f" return [r.left + v.x + {x} * v.zoom, r.top + v.y + {y} * v.zoom]; }})()"))


def press_and_move(tab, start, end, *, prime: int = PRIME, steps: int = 10) -> tuple[float, float]:
    """Appui, glissé jusqu'à `end` ; le bouton reste tenu (la capture se prend pendant le geste). Rend le point final."""
    tab.mouse_move(*start)
    mouse(tab, "mousePressed", start[0], start[1], 1)
    first = (start[0] + prime, start[1])
    mouse(tab, "mouseMoved", first[0], first[1], 1)
    end = (end[0] + prime, end[1])
    for i in range(1, steps + 1):
        mouse(tab, "mouseMoved", first[0] + (end[0] - first[0]) * i / steps, first[1] + (end[1] - first[1]) * i / steps, 1)
        wait(0.02)
    wait(0.35)
    return end


def release(tab, at) -> None:
    mouse(tab, "mouseReleased", at[0], at[1], 0)
    wait(0.6)


def undo(tab) -> None:
    key(tab, "z", "KeyZ", 90, 2)
    wait(0.8)


def positions(tab) -> dict:
    return json.loads(tab.js(f"JSON.stringify(Object.fromEntries({H}.state.positions))"))


def look(tab, host: str, zoom: float = 1.0, dx: float = 0, dy: float = 0, keep: bool = False) -> None:
    """La vue centrée sur un équipement (décalé de dx, dy dans le plan), à ce zoom ; la sélection vidée sauf `keep`."""
    c = positions(tab)[host]
    if not keep:
        tab.js(f"{H}.select(null)")
    x, y = c["x"] + dx, c["y"] + dy
    tab.js(f"(() => {{ const t = {H}, r = document.querySelector('.flow-host .react-flow').getBoundingClientRect();"
           f" t.restoreView({{ zoom: {zoom}, x: (r.width - 348) / 2 - {x} * {zoom}, y: r.height / 2 - {y} * {zoom} }}); }})()")
    wait(0.8)


def scene(base: str, auth: dict, tab) -> dict:
    """La scène du prototype, posée par épingles à droite du parc (une zone vide) : une rangée de trois accès espacés de
    60 (« Salle B »), un quatrième dessous, une note ambre ; douze accès de dc02 en désordre plus bas, pour la grille."""
    pos = positions(tab)
    w = tab.js(f"{H}.boxes.get('dc01-acc-01').w")
    x0 = round(max(p["x"] for p in pos.values()) + 800 + w / 2) // 20 * 20
    y0 = round(min(p["y"] for p in pos.values())) // 20 * 20
    step = w + 60
    row = ["dc01-acc-01", "dc01-acc-02", "dc01-acc-03"]
    pins = [{"op": "pin", "hostname": h, "x": x0 + i * step, "y": y0} for i, h in enumerate(row)]
    pins.append({"op": "pin", "hostname": "dc01-acc-04", "x": x0 + step + 37, "y": y0 + 300})
    pins.append({"op": "pin", "hostname": "dc01-core-01", "x": x0 + step, "y": y0 - 260})
    messy = [(4, 60, 590), (5, 340, 560), (6, 620, 610), (7, 930, 575), (8, 1200, 640), (9, 140, 720), (10, 470, 740), (1, 790, 705), (2, 1080, 790), (3, 40, 870), (11, 360, 900), (12, 700, 860)]
    many = [f"dc02-acc-{k:02d}" if k <= 10 else f"dc02-fw-{k - 10:02d}" for k, _, _ in messy]
    pins += [{"op": "pin", "hostname": h, "x": x0 - 200 + dx, "y": y0 + 400 + dy} for h, (_, dx, dy) in zip(many, messy)]
    params = {"infrastructure": "demo-dc"}
    note = {"op": "annotation_create", "content": {"kind": "note", "text": "Maintenance le 18/10\nremplacer l'optique Eth1/49\navant 6 h"},
            "x": x0 + 2 * step - w // 2 + 120, "y": y0 + 160, "w": 160, "h": 90, "style": {"hue": "amber", "fill_opacity": 20}}
    r = httpx.post(f"{base}/api/intent/patches", params=params, headers=auth, json={"author": "orhan", "ops": pins + [note]}, timeout=30)
    assert r.status_code == 200, r.text
    return {"row": row, "note": r.json()["annotations"][-1]["id"], "many": many, "w": w, "step": step, "x0": x0, "y0": y0}


def open_app(tab, base: str) -> None:
    tab.navigate(f"{base}/?infrastructure=demo-dc")
    _wait(tab, READY); wait(1.5)


settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot8-")), max_bundle_bytes=30_000_000)
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
        ids = scene(base, auth, tab)
        open_app(tab, base)
        w, step, x0, y0 = ids["w"], ids["step"], ids["x0"], ids["y0"]
        row = ids["row"]

        # 1. repère de centre : l'accès 04 glissé sous l'accès 02, son centre à 6 px du sien
        look(tab, row[1], 1.0, dy=120)
        start = center_of(tab, node("dc01-acc-04"))
        sx, sy = screen(tab, x0 + step, y0 + 170)
        end = press_and_move(tab, start, (sx + 6, sy))
        print("1", tab.js("Array.from(document.querySelectorAll('.guide-layer [data-guide]')).map((g) => g.dataset.guide).join(',')"))
        tab.screenshot(OUT / "1-guide-centre.png")
        release(tab, end); undo(tab)

        # 2. espacement égal : l'accès 04 posé au bout de la rangée, à 4 unités de l'écart de 60
        look(tab, row[1], 0.9, dx=150, dy=80)
        start = center_of(tab, node("dc01-acc-04"))
        end = press_and_move(tab, start, screen(tab, x0 + 3 * step + 4, y0 + 5))
        print("2", tab.js("Array.from(document.querySelectorAll('.guide-layer .guide-num text')).map((t) => t.textContent).join(',')"))
        tab.screenshot(OUT / "2-espacement-egal.png")
        release(tab, end); undo(tab)

        # 3. repère de bord : la note glissée, son bord gauche à 5 unités de celui de l'accès 03
        look(tab, row[2], 1.0, dy=120)
        frame = tab.js(f"{H}.frames.get({json.dumps(ids['note'])})")
        start = center_of(tab, node("annotation:" + ids["note"]))
        left = x0 + 2 * step - w / 2 + 5
        end = press_and_move(tab, start, screen(tab, left + frame["w"] / 2, frame["y"] + frame["h"] / 2 + 40))
        print("3", tab.js("Array.from(document.querySelectorAll('.guide-layer [data-guide]')).map((g) => g.dataset.guide).join(',')"))
        tab.screenshot(OUT / "3-guide-bord.png")
        release(tab, end); undo(tab)

        # 4. redimensionnement : le bord droit de la note tiré jusqu'au bord droit de l'accès 03 (à 5 unités près)
        open_app(tab, base)
        look(tab, row[2], 1.0, dy=120)
        tab.js(f"{H}.select({{ kind: 'annotation', id: {json.dumps(ids['note'])} }})"); wait(0.6)
        frame = tab.js(f"{H}.frames.get({json.dumps(ids['note'])})")
        hx, hy = center_of(tab, node("annotation:" + ids["note"]) + " .annotation-handle-slot.handle-e .annotation-handle-hit")
        k = tab.js(f"{H}.viewport().zoom")
        right = x0 + 2 * step + w / 2
        end = press_and_move(tab, (hx, hy), (hx + (right - (frame["x"] + frame["w"])) * k - 5, hy), prime=0)
        print("4", tab.js("Array.from(document.querySelectorAll('.guide-layer [data-guide]')).map((g) => g.dataset.guide).join(',')"))
        tab.screenshot(OUT / "4-redimension.png")
        release(tab, end); undo(tab)

        # 5. le volet « aligner et répartir » avec la grille, l'aperçu au survol de « mettre en grille »
        wait(3.0)  # la ligne d'état de l'annulation s'efface (elle se poserait sur le volet)
        tab.mouse_move(5, 300)
        tab.js(f"{H}.selectHosts({json.dumps(ids['many'])})"); wait(0.3)
        look(tab, ids["many"][6], 0.62, dx=-60, dy=-260, keep=True)
        _wait(tab, SHOWN); wait(0.3)
        x, y = center_of(tab, ".fbar .fb[data-id='align']")
        tab.mouse_move(x, y); mouse(tab, "mousePressed", x, y, 1); mouse(tab, "mouseReleased", x, y, 0)
        _wait(tab, "!!document.querySelector('.fvolet .grid-go')"); wait(0.3)
        gx, gy = center_of(tab, ".fvolet .grid-go")
        tab.mouse_move(gx - 30, gy); tab.mouse_move(gx, gy); wait(0.6)
        print("5", tab.js("document.querySelector('.fvolet .volet-cap').textContent"), tab.js("document.querySelectorAll('.grid-place').length"))
        tab.screenshot(OUT / "5-volet-grille.png")

        # 6. le résultat
        mouse(tab, "mousePressed", gx, gy, 1); mouse(tab, "mouseReleased", gx, gy, 0)
        wait(1.2)
        tab.mouse_move(5, 300)
        print("6", tab.js("(LDApp.debug.state().note || {}).text"))
        tab.screenshot(OUT / "6-grille-resultat.png")
        undo(tab)

        # 7. le panneau Affichage : la couleur des repères (turquoise choisie)
        tab.js(f"{H}.select(null)")
        tab.js("document.querySelector('.display-toggle').click()")
        _wait(tab, "!!document.querySelector('.guide-swatches')")
        tab.js("document.querySelector('.guide-swatch.guide-teal').click()"); wait(0.4)
        tab.screenshot(OUT / "7-affichage-couleur-reperes.png")
        tab.js("document.querySelector('.guide-reset').click()"); wait(0.2)
        tab.js("document.querySelector('.display-toggle').click()"); wait(0.3)

    # 8. clair, 1280 × 800 : l'espacement égal
    with Chrome(CHROMIUM, window=(1280, 800)) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ theme: 'light', grid: true, minimap: false, guideHue: 'sky' }))")
        open_app(tab, base)
        look(tab, ids["row"][1], 0.85, dx=150, dy=80)
        start = center_of(tab, node("dc01-acc-04"))
        end = press_and_move(tab, start, screen(tab, x0 + 3 * step - 4, y0 - 5))
        print("8", tab.js("Array.from(document.querySelectorAll('.guide-layer .guide-num text')).map((t) => t.textContent).join(',')"))
        tab.screenshot(OUT / "8-clair-1280.png")
        release(tab, end)
finally:
    server.should_exit = True
