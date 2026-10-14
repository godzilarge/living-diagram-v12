"""Captures du prototype du lot 8 (repères d'alignement, grille), par Chromium sans écran et le pilote du dépôt
(backend/tests/browser.py, en lecture seule ; bibliothèque standard seulement). Les gestes sont réels (souris, clavier) ;
les captures de glissé sont prises bouton tenu.

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
ALT, CTRL, SHIFT = 1, 2, 8


def wait(seconds: float) -> None:
    threading.Event().wait(seconds)


def mouse(tab, kind: str, x: float, y: float, modifiers: int = 0, pressed: bool = False, button: str = "left") -> None:
    b = button if kind != "mouseMoved" or pressed else "none"
    tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": b, "buttons": (1 if button == "left" else 2) if pressed else 0, "clickCount": 1, "modifiers": modifiers})


def click(tab, x: float, y: float, modifiers: int = 0) -> None:
    mouse(tab, "mouseMoved", x, y, modifiers)
    mouse(tab, "mousePressed", x, y, modifiers, True)
    mouse(tab, "mouseReleased", x, y, modifiers)
    wait(0.25)


def right_click(tab, x: float, y: float) -> None:
    mouse(tab, "mouseMoved", x, y)
    mouse(tab, "mousePressed", x, y, 0, True, "right")
    mouse(tab, "mouseReleased", x, y, 0, False, "right")
    wait(0.3)


def center(tab, item_id: str) -> tuple[float, float]:
    b = tab.js(f"proto.box('{item_id}')")
    return b["x"] + b["w"] / 2, b["y"] + b["h"] / 2


def hold_drag(tab, start: tuple[float, float], end: tuple[float, float], modifiers: int = 0, steps: int = 10) -> None:
    """Appuie, glisse jusqu'à `end` et garde le bouton : la capture se prend pendant le geste."""
    mouse(tab, "mouseMoved", *start, modifiers)
    mouse(tab, "mousePressed", *start, modifiers, True)
    for k in range(1, steps + 1):
        f = k / steps
        mouse(tab, "mouseMoved", start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f, modifiers, True)
    wait(0.25)


def drag_item_to(tab, item_id: str, x: float, y: float, modifiers: int = 0) -> tuple[float, float]:
    """Glisse l'élément pour que son coin haut gauche vise (x, y) du plan ; renvoie le point où le pointeur est tenu."""
    z = tab.js("proto.state.view.z")
    it = tab.js(f"(() => {{ const i = proto.state.items.get('{item_id}'); return [i.x, i.y]; }})()")
    start = center(tab, item_id)
    end = (start[0] + (x - it[0]) * z, start[1] + (y - it[1]) * z)
    hold_drag(tab, start, end, modifiers)
    return end


def release(tab, at: tuple[float, float]) -> None:
    mouse(tab, "mouseReleased", *at)
    wait(0.4)


def shot(tab, name: str) -> None:
    tab.screenshot(HERE / name)
    print(name, tab.js("JSON.stringify(proto.guides())"))


def size(tab, width: int, height: int) -> None:
    tab.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
    wait(0.3)


with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open(PAGE)
    size(tab, 1440, 900)
    tab.js("document.fonts.ready.then(() => true)")
    tab.js("proto.reset()")
    wait(0.4)

    # 1. Au repos : la colonne des réglages porte « guides » allumé
    mouse(tab, "mouseMoved", 700, 470)
    shot(tab, "1-repos.png")

    # 2. Un repère de centre : un accès glissé sous dc01-core-01, 4 unités à côté ; il s'y colle
    p = drag_item_to(tab, "acc07", 404, 452)
    shot(tab, "2-guide-centre.png")
    release(tab, p)

    # 11. Le même glissé, Ctrl tenu : ni repère ni aimant, la pastille dit « libre »
    tab.js("proto.reset()")
    p = drag_item_to(tab, "acc07", 404, 452, CTRL)
    shot(tab, "11-libre.png")
    release(tab, p)

    # 3. Un repère de bord, zoom 1 : la forme « Baie 12 » glissée vers le bord gauche des firewalls
    tab.js("proto.reset(); proto.view(-560, 60, 1)")
    p = drag_item_to(tab, "shape1", 1184, 484)
    shot(tab, "3-guide-bord.png")
    release(tab, p)

    # 4. L'espacement égal : un accès posé au bout de la rangée « Salle B » ; trois écarts de 60, le centre de la rangée
    tab.js("proto.reset()")
    p = drag_item_to(tab, "acc04", 985, 306)
    shot(tab, "4-espacement-egal.png")
    release(tab, p)

    # 5. Une sélection de trois accès, glissée d'un bloc : sa boîte englobante s'aligne sur le bord gauche de la rangée
    tab.js("proto.reset()")
    click(tab, *center(tab, "acc05"))
    click(tab, *center(tab, "acc06"), SHIFT)
    click(tab, *center(tab, "acc09"), SHIFT)
    z = tab.js("proto.state.view.z")
    s = center(tab, "acc05")
    p = (s[0] - 57 * z, s[1] - 2 * z)
    hold_drag(tab, s, p)
    shot(tab, "5-multi-glisse.png")
    release(tab, p)

    # 6. Redimensionner, zoom 1 : le bord droit de la forme tiré jusqu'au bord droit de la note
    tab.js("proto.reset(); proto.view(-560, 60, 1)")
    click(tab, *center(tab, "shape1"))
    h = tab.js("proto.handle('e')")
    p = (h["x"] + 57, h["y"] + 3)
    hold_drag(tab, (h["x"], h["y"]), p)
    shot(tab, "6-redimension.png")
    release(tab, p)

    # 7. Mettre en grille : les douze accès en désordre pris au rectangle (Maj + glisser le fond), le volet « aligner et
    # répartir » ouvert, « mettre en grille » survolé : la place de chacun, numérotée dans l'ordre de lecture
    tab.js("proto.reset()")
    a = tab.js("proto.toScreen(30, 548)")
    b = tab.js("proto.toScreen(1452, 992)")
    hold_drag(tab, (a["x"], a["y"]), (b["x"], b["y"]), SHIFT)
    release(tab, (b["x"], b["y"]))
    print("  sélection :", tab.js("proto.state.sel.length"))
    btn = tab.js("proto.button('align')")
    click(tab, btn["x"], btn["y"])
    go = tab.js("proto.el('.grid-go')")
    mouse(tab, "mouseMoved", go["x"], go["y"])
    wait(0.5)
    shot(tab, "7-volet-grille.png")

    # 8. Le résultat : quatre colonnes, trois rangées, au coin haut gauche de la sélection
    click(tab, go["x"], go["y"])
    wait(0.6)
    mouse(tab, "mouseMoved", 700, 200)
    wait(0.3)
    shot(tab, "8-grille-resultat.png")

    # 9. Le menu contextuel d'une sélection : « mettre en grille » survolé
    tab.js("proto.reset()")
    hold_drag(tab, (a["x"], a["y"]), (b["x"], b["y"]), SHIFT)
    release(tab, (b["x"], b["y"]))
    c = center(tab, "acc10")
    right_click(tab, *c)
    entry = tab.js("(() => { const e = [...document.querySelectorAll('.context-item')].find((x) => x.textContent.startsWith('mettre en grille')); const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; })()")
    mouse(tab, "mouseMoved", entry["x"], entry["y"])
    wait(0.3)
    shot(tab, "9-menu-contextuel.png")
    mouse(tab, "mousePressed", 5, 5, 0, True)
    mouse(tab, "mouseReleased", 5, 5)

    # 10. Thème clair, 1280 × 800 : l'espacement égal
    size(tab, 1280, 800)
    tab.js("proto.reset(); proto.theme('light'); proto.view(90, 110, 0.65)")
    wait(0.2)
    p = drag_item_to(tab, "acc04", 985, 306)
    shot(tab, "10-clair-1280.png")
    release(tab, p)

    # 12. Sombre, 1280 × 800 : le repère de centre
    tab.js("proto.reset(); proto.theme('dark'); proto.view(90, 110, 0.65)")
    p = drag_item_to(tab, "acc07", 404, 452)
    shot(tab, "12-sombre-1280.png")
    release(tab, p)

    errors = [c for c in chrome.console if c.get("type") in ("error",) or "exceptionDetails" in c or c.get("entry", {}).get("level") == "error"]
    print("erreurs console :", errors or "aucune")
