"""Captures du prototype du lot 4 bis (barre de mise en forme), par Chromium sans écran et le pilote du dépôt
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
SHIFT, CTRL = 8, 2
KEYS = {"Escape": 27, "ArrowRight": 39, "ArrowLeft": 37, "ArrowDown": 40, "ArrowUp": 38, "Enter": 13, "t": 84, "i": 73, "u": 85, "b": 66}


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


def key(tab, name: str, modifiers: int = 0, text: str | None = None) -> None:
    code = "Key" + name.upper() if len(name) == 1 else name
    event = {"key": name, "code": code, "windowsVirtualKeyCode": KEYS.get(name, 0), "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    if text:
        tab.call("Input.dispatchKeyEvent", {"type": "char", "text": text, **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})
    wait(0.15)


def type_text(tab, text: str) -> None:
    tab.call("Input.insertText", {"text": text})
    wait(0.1)


def center(tab, item_id: str) -> tuple[float, float]:
    b = tab.js(f"proto.center('{item_id}')")
    return b["x"] + b["w"] / 2, b["y"] + b["h"] / 2


def at(tab, expr: str) -> tuple[float, float]:
    p = tab.js(expr)
    assert p, f"absent : {expr}"
    return p["x"], p["y"]


def hover(tab, point: tuple[float, float], settle: float = 0.6) -> None:
    mouse(tab, "mouseMoved", point[0] - 20, point[1] + 30)
    mouse(tab, "mouseMoved", *point)
    wait(settle)


def drag(tab, start: tuple[float, float], dx: float, steps: int = 8) -> None:
    x, y = start
    mouse(tab, "mouseMoved", x, y)
    mouse(tab, "mousePressed", x, y, 0, True)
    for k in range(1, steps + 1):
        mouse(tab, "mouseMoved", x + dx * k / steps, y, 0, True)
        wait(0.02)
    mouse(tab, "mouseReleased", x + dx, y)
    wait(0.2)


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
    tab.js("proto.view(-40, 30, 1)")

    # 1. Une note : la barre de texte complète ; taille tapée au clavier (18), italique et souligné au raccourci,
    # couleur violette par le volet ; le gras survolé pour l'infobulle
    click(tab, *center(tab, "note1"))
    click(tab, *at(tab, "proto.button('size')"))
    type_text(tab, "16")
    key(tab, "Enter")
    key(tab, "Escape")
    key(tab, "i", CTRL)
    key(tab, "u", CTRL)
    hover(tab, at(tab, "proto.button('bold')"))
    shot(tab, "1-note-barre-texte.png")

    # 2. Le volet des tailles ouvert (le chevron du champ), une valeur survolée (« 16 → 20 px »)
    mouse(tab, "mouseMoved", 700, 820)
    click(tab, *at(tab, "proto.open('size')"))
    hover(tab, at(tab, "proto.inVolet('20 pixels')"), 0.3)
    shot(tab, "2-volet-taille.png")
    key(tab, "Escape")

    # 3. Le volet position : neuf cases, marge et interligne ; la marge réglée à la poignée (le pointillé la montre)
    click(tab, *at(tab, "proto.button('pos')"))
    click(tab, *at(tab, "proto.inVolet('milieu gauche') || proto.inVolet('gauche')"))
    g = at(tab, "proto.grip('pad')")
    mouse(tab, "mouseMoved", *g)
    mouse(tab, "mousePressed", *g, 0, True)
    for k in range(1, 9):
        mouse(tab, "mouseMoved", g[0] + 4 * k, g[1], 0, True)
        wait(0.02)
    wait(0.2)
    shot(tab, "3-volet-position.png")
    mouse(tab, "mouseReleased", g[0] + 32, g[1])
    wait(0.2)
    key(tab, "Escape")

    # 4. Une forme : la même grammaire (objet | texte | arrangement | actions), le volet de la police ouvert
    reset(tab)
    click(tab, *center(tab, "shape1"))
    click(tab, *at(tab, "proto.button('font')"))
    hover(tab, at(tab, "proto.inVolet('gras')"), 0.3)
    shot(tab, "4-forme-volet-police.png")
    key(tab, "Escape")

    # 5. Un connecteur : l'étiquette déplacée sur le tracé (arrivée, au-dessus) par le volet « place de l'étiquette »
    reset(tab)
    lab = tab.js("proto.labelOf('conn1')")
    click(tab, *at(tab, "(() => { const b = proto.labelOf('conn1'); const v = proto.state.view; return { x: v.x + b.x * v.z, y: v.y + (b.y + b.h / 2 + 6) * v.z }; })()"))
    if not tab.js("proto.state.sel.includes('conn1')"):
        tab.js("proto.select(['conn1'])")
        wait(0.2)
    click(tab, *at(tab, "proto.button('pos')"))
    click(tab, *at(tab, "proto.inVolet('au-dessus')"))
    hover(tab, at(tab, "proto.inVolet('arrivée')"), 0.3)
    shot(tab, "5-connecteur-etiquette.png")
    key(tab, "Escape")

    # 6. Une sélection mixte (note, forme, connecteur) : tailles et graisses différentes, « mixte »
    reset(tab)
    tab.js("proto.select(['note1', 'shape1', 'conn1'])")
    wait(0.3)
    click(tab, *at(tab, "proto.button('tcolor')"))
    shot(tab, "6-selection-mixte.png")
    key(tab, "Escape")

    # 7. Un groupe : neuf positions dedans ou dehors (le contrat les a déjà)
    reset(tab)
    tab.js("proto.select(['grp1'])")
    wait(0.3)
    click(tab, *at(tab, "proto.button('pos')"))
    click(tab, *at(tab, "proto.inVolet('dehors')"))
    shot(tab, "7-groupe-etiquette.png")
    key(tab, "Escape")

    # 8. Comparaison : le même volet dessiné comme au lot 4 (réglage « volets : lot 4 »)
    reset(tab)
    click(tab, *center(tab, "shape1"))
    tab.js("proto.volets('avant')")
    click(tab, *at(tab, "proto.button('border')"))
    shot(tab, "8-comparaison-volet-lot4.png")
    key(tab, "Escape")
    tab.js("proto.volets('bis')")
    click(tab, *at(tab, "proto.button('border')"))
    shot(tab, "8-comparaison-volet-bis.png")
    key(tab, "Escape")

    # 9. Le clavier : Alt+T, → jusqu'au champ de taille, ↑ deux fois
    reset(tab)
    click(tab, *center(tab, "note1"))
    mouse(tab, "mouseMoved", 700, 820)
    key(tab, "t", 1)
    key(tab, "ArrowRight")
    key(tab, "ArrowRight")
    key(tab, "ArrowUp")
    key(tab, "ArrowUp")
    shot(tab, "9-clavier.png")
    key(tab, "Escape")

    # 10. Thème clair, 1280 : une note, le volet position ouvert
    reset(tab)
    size(tab, 1280, 800)
    tab.js("proto.theme('light'); proto.view(-200, 20, 1)")
    wait(0.2)
    click(tab, *center(tab, "note1"))
    click(tab, *at(tab, "proto.button('pos')"))
    shot(tab, "10-clair-1280.png")

    errors = [c for c in chrome.console if c.get("type") in ("error",) or "exceptionDetails" in c or c.get("entry", {}).get("level") == "error"]
    print("erreurs console :", errors or "aucune")
