"""Captures du prototype du lot 4 (barre contextuelle), par Chromium sans écran et le pilote du dépôt
(backend/tests/browser.py, bibliothèque standard seulement). Les gestes sont réels (souris, clavier), pas des appels.

Lancer depuis le dossier du prototype : python3 scripts/capture.py
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "backend"))
from tests.browser import Chrome  # noqa: E402

CHROMIUM = next(Path.home().glob(".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell"))
PAGE = f"file://{HERE / 'index.html'}"
SHIFT, ALT = 8, 1
KEYS = {"Escape": 27, "ArrowRight": 39, "ArrowLeft": 37, "ArrowDown": 40, "t": 84, "Shift": 16}


def wait(seconds: float) -> None:
    threading.Event().wait(seconds)


def mouse(tab, kind: str, x: float, y: float, modifiers: int = 0, pressed: bool = False) -> None:
    button = "left" if kind != "mouseMoved" or pressed else "none"
    tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": button, "buttons": 1 if pressed else 0, "clickCount": 1, "modifiers": modifiers})


def click(tab, x: float, y: float, modifiers: int = 0) -> None:
    mouse(tab, "mouseMoved", x, y, modifiers)
    mouse(tab, "mousePressed", x, y, modifiers, True)
    mouse(tab, "mouseReleased", x, y, modifiers)
    wait(0.25)


def key(tab, name: str, modifiers: int = 0) -> None:
    code = "Key" + name.upper() if len(name) == 1 else name
    event = {"key": name, "code": code, "windowsVirtualKeyCode": KEYS[name], "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})
    wait(0.2)


def center(tab, item_id: str) -> tuple[float, float]:
    b = tab.js(f"proto.center('{item_id}')")
    return b["x"] + b["w"] / 2, b["y"] + b["h"] / 2


def button(tab, button_id: str) -> tuple[float, float]:
    p = tab.js(f"proto.button('{button_id}')")
    assert p, f"bouton absent : {button_id}"
    return p["x"], p["y"]


def hover(tab, point: tuple[float, float], settle: float = 0.7) -> None:
    mouse(tab, "mouseMoved", point[0] - 20, point[1] + 30)
    mouse(tab, "mouseMoved", *point)
    wait(settle)


def reset(tab) -> None:
    mouse(tab, "mouseMoved", 5, 5)
    tab.js("proto.select([])")
    wait(0.3)


def shot(tab, name: str) -> None:
    tab.screenshot(HERE / name)
    print(name)


def size(tab, width: int, height: int) -> None:
    tab.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
    wait(0.3)


with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open(PAGE)
    size(tab, 1440, 900)
    tab.js("document.fonts.ready.then(() => true)")
    wait(0.4)

    # 1. Une note : la barre au-dessus, le volet des teintes ouvert (côté opposé à la note), une teinte survolée.
    # La vue descend de 160 : au repos, la note touche le haut de la zone et la barre passerait dessous (capture 4).
    tab.js("proto.view(0, 160, 1)")
    click(tab, *center(tab, "note1"))
    click(tab, *button(tab, "hue"))
    swatch = tab.js("(() => { const r = document.querySelector('.swatch.hue-violet').getBoundingClientRect(); return [r.left + 12, r.top + 12]; })()")
    mouse(tab, "mouseMoved", *swatch)
    wait(0.3)
    shot(tab, "1-note.png")

    # 2. Un connecteur : l'infobulle « libellé · raccourci » sur le tracé
    reset(tab)
    tab.js("proto.view(0, 0, 1)")
    click(tab, 720, 186)
    hover(tab, button(tab, "route"))
    print("  surface couverte par la barre du connecteur :", tab.js("document.querySelector('#fbar').dataset.covers"))
    shot(tab, "2-connecteur.png")

    # 3. Une sélection mixte (deux équipements, une note) par Maj + clic ; le volet « aligner et répartir » ouvert,
    # l'infobulle d'un alignement avec son raccourci
    reset(tab)
    click(tab, *center(tab, "core1"))
    click(tab, *center(tab, "core2"), SHIFT)
    click(tab, *center(tab, "note1"), SHIFT)
    click(tab, *button(tab, "align"))
    p = tab.js("proto.tipFor('aligner en haut')")
    hover(tab, (p["x"], p["y"]), 0.4)
    shot(tab, "3-multi.png")

    # 4. Un équipement contre le haut : la barre passe dessous
    reset(tab)
    click(tab, *center(tab, "rt1"))
    hover(tab, button(tab, "pin"))
    shot(tab, "4-equipement.png")

    # 6. Un groupe : la position de l'étiquette en grille 3 × 3
    reset(tab)
    click(tab, 104, 720)
    click(tab, *button(tab, "pos"))
    shot(tab, "6-groupe.png")

    # 7. Variante B : une sélection d'équipements, les alignements aux deux endroits
    reset(tab)
    tab.js("proto.variant('B')")
    click(tab, *center(tab, "core1"))
    click(tab, *center(tab, "core2"), SHIFT)
    click(tab, *center(tab, "fw1"), SHIFT)
    t = tab.js("proto.tb('tb-align')")
    click(tab, t["x"], t["y"])
    p = tab.js("proto.tipFor('répartir horizontalement')")
    hover(tab, (p["x"], p["y"]), 0.4)
    shot(tab, "7-variante-b.png")
    tab.js("proto.variant('A')")

    # 8. Pendant un glissé, la barre est absente ; elle revient 120 ms après la relâche
    reset(tab)
    x, y = center(tab, "shape1")
    click(tab, x, y)
    mouse(tab, "mouseMoved", x, y)
    mouse(tab, "mousePressed", x, y, 0, True)
    for k in range(1, 6):
        mouse(tab, "mouseMoved", x - 12 * k, y + 8 * k, 0, True)
    wait(0.2)
    shot(tab, "8-glisse.png")
    mouse(tab, "mouseReleased", x - 60, y + 40)
    wait(0.4)
    tab.js("(() => { const it = proto.state.items.get('shape1'); it.x = 880; it.y = 300; proto.select([]); })()")

    # 9. Le clavier : Alt+T donne la barre, → deux fois, l'anneau de focus et l'infobulle suivent
    reset(tab)
    click(tab, *center(tab, "note1"))
    mouse(tab, "mouseMoved", 700, 820)
    key(tab, "t", ALT)
    key(tab, "ArrowRight")
    key(tab, "ArrowRight")
    wait(0.2)
    shot(tab, "9-clavier.png")
    key(tab, "Escape")

    # 10. Un tableau, 11. une image : leurs barres, l'infobulle d'une commande
    reset(tab)
    click(tab, *center(tab, "table1"))
    hover(tab, button(tab, "row"))
    shot(tab, "10-tableau.png")
    reset(tab)
    click(tab, *center(tab, "img1"))
    click(tab, *button(tab, "opacity"))
    shot(tab, "11-image.png")

    # 5. Thème clair, 1280 : une forme, le volet de la bordure ouvert
    reset(tab)
    size(tab, 1280, 800)
    tab.js("proto.theme('light'); proto.view(-220, -40, 1)")
    wait(0.2)
    click(tab, *center(tab, "shape1"))
    click(tab, *button(tab, "border"))
    shot(tab, "5-clair.png")

    errors = [c for c in chrome.console if c.get("type") in ("error",) or "exceptionDetails" in c or c.get("entry", {}).get("level") == "error"]
    print("erreurs console :", errors or "aucune")
