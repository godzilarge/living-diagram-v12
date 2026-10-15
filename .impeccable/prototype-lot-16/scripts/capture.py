"""Captures du prototype du lot 16 (bloc de code), par Chromium sans écran et le pilote du dépôt (backend/tests/browser.py,
bibliothèque standard seulement). Les gestes sont réels (souris, clavier), pas des appels, sauf le collage (Ctrl+V : le
presse-papiers d'un Chromium sans écran est vide, le bouton « coller » du prototype passe le même texte au même code).

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
    tab.js("proto.select([]); document.getElementById('status').classList.remove('on')")
    wait(0.3)


def shot(tab, name: str) -> None:
    tab.screenshot(HERE / name)
    print(name)


def size(tab, width: int, height: int) -> None:
    tab.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
    wait(0.3)


def bar_button(tab, bid: str) -> tuple[float, float]:
    return at(tab, f"proto.button('{bid}')")


with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open(PAGE)
    size(tab, 1440, 900)
    tab.js("document.fonts.ready.then(() => true)")
    wait(0.4)
    tab.js("proto.chrome(false)")

    # 1. Un bloc Python attaché au routeur, coloré ; la barre du bloc ; le bouton « coloration » survolé
    tab.js("proto.view(-310, 173, 0.85)")
    click(tab, *center(tab, "py1"))
    hover(tab, bar_button(tab, "hl"))
    shot(tab, "1-python-colore.png")

    # 2. Un bloc Bash coloré (retour d'Orhan : le Bash de démonstration était posé sans coloration)
    reset(tab)
    tab.js("proto.view(-310, -167, 0.85)")
    click(tab, *center(tab, "sh1"))
    hover(tab, bar_button(tab, "hl"))
    shot(tab, "2-bash-colore.png")

    # 3. YAML et JSON côte à côte, attachés à un cœur et au firewall (lignes de rappel), sans sélection
    reset(tab)
    tab.js("proto.view(-640, -560, 0.95)")
    wait(0.3)
    shot(tab, "3-yaml-json.png")

    # 4. La configuration Cisco de 120 lignes dans une boîte de 25 lignes, sous son switch : sélectionnée, la molette (de
    # vrais événements) fait défiler le code, pas la toile ; au milieu du défilement, barre visible, « lignes 34-58 sur 120 »
    tab.js("proto.view(330, -640, 1)")
    click(tab, *center(tab, "cisco1"))
    cx, cy = center(tab, "cisco1")
    for _ in range(6):
        tab.call("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": cx, "y": cy, "deltaX": 0, "deltaY": 110})
        wait(0.05)
    hover(tab, at(tab, "proto.thumb('cisco1')"), 0.3)
    print("vue après la molette :", tab.js("JSON.stringify(proto.state.view)"), "première ligne :", tab.js("proto.state.items.get('cisco1').scroll"))
    shot(tab, "4-cisco-defile.png")

    # 6. La fiche : le code en entier, coloré, défilable ; le panneau élargi (sa poignée dans l'application)
    tab.js("proto.scroll('cisco1', 0); proto.wide(true); proto.openFiche('Affichage'); proto.view(150, -580, 1); document.getElementById('status').classList.remove('on')")
    wait(0.2)
    tab.js("document.querySelector('.insp-code pre').scrollTop = 1500")
    wait(0.2)
    shot(tab, "6-fiche.png")
    tab.js("proto.wide(false)")

    # 7. La barre et le volet du langage : le bloc YAML déclaré « texte brut », la détection propose YAML
    reset(tab)
    tab.js("proto.set('yaml1', { lang: 'plain' }); proto.view(-474, -157, 0.9)")
    click(tab, *center(tab, "yaml1"))
    click(tab, *bar_button(tab, "lang"))
    hover(tab, at(tab, "proto.inVolet('Cisco IOS / NX-OS')"), 0.3)
    shot(tab, "7-volet-langage.png")
    key(tab, "Escape")
    tab.js("proto.set('yaml1', { lang: 'yaml' })")

    # 8. Coller une configuration Cisco qui porte cinq valeurs sensibles : l'avertissement avant tout enregistrement
    reset(tab)
    tab.js("proto.view(-1300, -60, 1)")
    tab.js("proto.paste('cisco')")
    wait(0.4)
    shot(tab, "8-secrets.png")

    # 8 bis. Une ligne de la liste mène à la valeur : sélectionnée dans le texte, la gouttière marque les lignes signalées
    click(tab, *at(tab, "(() => { const r = document.querySelectorAll('.fwarn-row')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()"))
    shot(tab, "8b-secrets-aller-a-la-valeur.png")

    # 9. « Retirer ces valeurs » : le bloc enregistré, les valeurs remplacées par <masqué> ; puis FortiOS de même
    click(tab, *at(tab, "proto.inWarn('Retirer')"))
    wait(0.3)
    tab.js("proto.select([]); proto.view(-1400, -1150, 1)")
    tab.js("proto.paste('fortios')")
    wait(0.3)
    click(tab, *at(tab, "proto.inWarn('Retirer')"))
    wait(0.3)
    mouse(tab, "mouseMoved", 700, 860)
    shot(tab, "9-secrets-retires.png")

    # 11. « Garder tel quel » : la valeur gardée se voit (rouge soulignée), l'alerte reste sur le bloc et dans la fiche
    reset(tab)
    tab.js("proto.view(-1400, -2000, 1)")
    tab.js("proto.paste('cisco')")
    wait(0.3)
    click(tab, *at(tab, "proto.inWarn('Garder')"))
    wait(0.3)
    tab.js("document.getElementById('status').classList.remove('on')")
    mouse(tab, "mouseMoved", 700, 860)
    shot(tab, "11-secrets-gardes.png")

    # 12. La police d'un bloc : le volet de la barre, chaque police dans son propre rendu ; IBM Plex Mono choisie,
    # Source Code Pro survolée (le bloc Cisco replié, sous son switch)
    reset(tab)
    tab.js("proto.view(330, -470, 1)")
    click(tab, *center(tab, "cisco1"))
    click(tab, *bar_button(tab, "cfont"))
    click(tab, *at(tab, "proto.inVoletStart('IBM Plex Mono')"))
    hover(tab, at(tab, "proto.inVoletStart('Source Code Pro')"), 0.3)
    shot(tab, "12-volet-police.png")
    key(tab, "Escape")
    tab.js("proto.set('cisco1', { cfont: 'jetbrains' })")

    # 10. Thème clair, 1280 : le bloc FortiOS attaché au firewall, la barre, le volet des tailles
    reset(tab)
    size(tab, 1280, 800)
    tab.js("proto.theme('light'); proto.view(640, -170, 1)")
    wait(0.2)
    click(tab, *center(tab, "forti1"))
    click(tab, *at(tab, "proto.open('size')"))
    shot(tab, "10-clair-1280.png")

    errors = [c for c in chrome.console if c.get("type") in ("error",) or "exceptionDetails" in c or c.get("entry", {}).get("level") == "error"]
    print("erreurs console :", errors or "aucune")
