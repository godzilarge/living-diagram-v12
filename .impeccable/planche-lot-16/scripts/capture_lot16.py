"""Lot 16 (docs/11) : le bloc de code. Captures sur demo-dc, 1440 × 900 sombre et 1280 clair, gestes réels :
1-python (bloc attaché au routeur, sélectionné, barre, infobulle de « coloration »), 2-bash (Bash coloré), 3-cisco-defile
(120 lignes dans une boîte de 25, défilées à la molette au milieu, la vue n'a pas bougé), 4-secrets (collage d'une
configuration Cisco qui porte des valeurs : l'avertissement avant tout enregistrement), 5-barre-volet-police (le volet
des polices, Source Code Pro survolée), 6-fiche (panneau élargi, « Affichage » ouverte, code défilé dans la fiche),
7-clair-1280 (FortiOS attaché au firewall, thème clair, volet du langage).
Lancer depuis backend/ : PYTHONPATH=. uv run python ../.impeccable/planche-lot-16/scripts/capture_lot16.py <sortie>"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scene import BASH, FORTIOS, NOTE, PASTE_CISCO, PYTHON, block, cisco_120, code, key, paste_text, rect, wait, wheel  # noqa: E402
from session import AUTH, reopen, session  # noqa: E402

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1])
OUT.mkdir(parents=True, exist_ok=True)


def seed(base: str) -> dict:
    """Quatre blocs posés hors du parc de demo-dc (aucune carte dessous), deux attachés (ligne de rappel)."""
    ops = [
        {"op": "annotation_create", "content": code(PYTHON, "python", "optiques_faibles.py"), "anchor": {"kind": "device", "ref": "dc01-rt-01"},
         "x": -804, "y": -292, "w": 540, "h": 360, "leader": True},
        {"op": "annotation_create", "content": code(BASH, "bash", "sauvegarde-configs.sh"), "x": 280, "y": -800, "w": 600, "h": 260},
        {"op": "annotation_create", "content": code(cisco_120(), "cisco_ios", "running-config"), "anchor": {"kind": "device", "ref": "dc01-acc-01"},
         "x": -1195, "y": 207, "w": 580, "h": 560, "leader": True},
        {"op": "annotation_create", "content": code(FORTIOS, "fortios", "ha et agg-core"), "anchor": {"kind": "device", "ref": "dc02-fw-01"},
         "x": 380, "y": 262, "w": 440, "h": 380, "leader": True},
    ]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=AUTH, json={"author": "orhan", "ops": ops}, timeout=30)
    r.raise_for_status()
    python, bash, cisco, forti = [a["id"] for a in r.json()["annotations"]][-4:]
    return {"python": python, "bash": bash, "cisco": cisco, "fortios": forti}


def look(tab, ident: str, zoom: float, dx: float = 0, dy: float = 0) -> None:
    """La vue posée sur un bloc (son centre au milieu de la zone utile, décalé de dx, dy), puis le bloc sélectionné."""
    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    wait(0.5)
    f = tab.js(f"JSON.parse(JSON.stringify(LDApp.debug.handle().toile.frames.get({json.dumps(ident)})))")
    w, h = tab.js("[innerWidth, innerHeight]")
    cx, cy = f["x"] + f["w"] / 2, f["y"] + f["h"] / 2
    tab.js(f"LDApp.debug.handle().toile.restoreView({{ x: {w / 2 - 170 + dx - cx * zoom}, y: {h / 2 + 10 + dy - cy * zoom}, zoom: {zoom} }})")
    wait(0.9)


def hover(tab, selector: str) -> None:
    r = rect(tab, selector)
    x, y = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
    tab.mouse_move(x - 30, y + 30)
    tab.mouse_move(x, y)
    wait(0.9)


def fb(ident: str) -> str:
    return f".fbar .fb[data-id={json.dumps(ident)}]"


def open_volet(tab, ident: str) -> None:
    tab.js(f"document.querySelector({json.dumps(fb(ident))}).click()")
    wait(0.5)


with session() as (base, tab, chrome):
    ids = seed(base)
    reopen(tab, base)
    # 1. Python, attaché au routeur : sélectionné, la barre, l'infobulle de « coloration »
    look(tab, ids["python"], 1.0, -40, 40)
    hover(tab, fb("code_highlight"))
    tab.screenshot(OUT / "1-python.png")
    # 2. Bash : coloré (la variable de la boucle n'est plus un mot-clé)
    look(tab, ids["bash"], 1.0, -40, 30)
    tab.mouse_move(5, 450)
    wait(0.4)
    tab.screenshot(OUT / "2-bash.png")
    # 3. Cisco, 120 lignes dans une boîte de 25 : défilées à la molette, la vue ne bouge pas
    look(tab, ids["cisco"], 0.92, -40, 20)
    r = rect(tab, block(ids["cisco"]))
    zoom = tab.js("LDApp.debug.handle().toile.viewport().zoom")
    for _ in range(6):
        wheel(tab, r["x"] + r["width"] / 2, r["y"] + r["height"] / 2, 100)
        wait(0.05)
    wait(0.4)
    thumb = rect(tab, f"{block(ids['cisco'])} .code-thumb")
    tab.mouse_move(thumb["x"] + 2, thumb["y"] + thumb["height"] / 2)
    wait(0.4)
    print("3 vue inchangée :", zoom == tab.js("LDApp.debug.handle().toile.viewport().zoom"), tab.js(f"document.querySelector({json.dumps(block(ids['cisco']) + ' .code-foot-hint')}).textContent"))
    tab.screenshot(OUT / "3-cisco-defile.png")
    # 5. le volet des polices, Source Code Pro survolée (le bloc plus bas : le volet tient au-dessus de la barre)
    look(tab, ids["cisco"], 0.7, -40, 190)
    open_volet(tab, "code_font")
    hover(tab, ".fvolet .font-item.cf-source_code_pro")
    tab.screenshot(OUT / "5-barre-volet-police.png")
    key(tab, "Escape", "Escape", 27)
    wait(0.3)
    # 6. la fiche : panneau élargi, « Affichage » ouverte, le code défilé dans la fiche
    tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), panelWidth: 560 }))")
    reopen(tab, base)
    look(tab, ids["cisco"], 0.75, -150, 20)
    tab.js("Array.from(document.querySelectorAll('.panel .insp-section-toggle')).find((b) => /Affichage/.test(b.textContent) && b.getAttribute('aria-expanded') === 'false').click()")
    wait(0.4)
    tab.js("document.querySelector('.panel .insp-code pre').scrollTop = 560")
    # la fiche défile jusqu'à « Affichage » (son conteneur qui défile, lu dans le DOM)
    tab.js("(() => { let e = document.querySelector('.panel .insp-code'); while (e && !(e.scrollHeight > e.clientHeight + 4"
           " && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop = 270; })()")
    tab.mouse_move(5, 450)
    wait(0.5)
    tab.screenshot(OUT / "6-fiche.png")
    tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), panelWidth: 348 }))")
    # 4. coller une configuration qui porte des valeurs sensibles : l'avertissement, avant tout enregistrement
    reopen(tab, base)
    tab.js("LDApp.debug.handle().toile.restoreView({ x: 360, y: 900, zoom: 1 })")
    wait(0.6)
    tab.mouse_move(5, 5)
    paste_text(tab, PASTE_CISCO)
    wait(1.0)
    print("4 avertissement :", tab.js("document.querySelectorAll('.code-warn-row').length"), "valeurs")
    tab.screenshot(OUT / "4-secrets.png")
    key(tab, "Escape", "Escape", 27)
    wait(0.2)
    tab.js("document.querySelector('.code-edit') && document.querySelector('.code-edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    wait(0.4)
    tab.js("LDApp.debug.handle() && document.querySelector('.app').focus()")
    for _ in range(80):  # la ligne d'état de l'abandon s'efface
        if not tab.js("!!document.querySelector('.toast')"):
            break
        wait(0.1)
    # 7. clair, 1280 × 800 : FortiOS attaché au firewall, le volet du langage
    tab.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False})
    tab.js("document.querySelector('.controls [aria-label=\"passer au thème clair\"]').click()")
    wait(0.6)
    look(tab, ids["fortios"], 1.0, -80, 40)
    open_volet(tab, "code_language")
    hover(tab, ".fvolet .lang-item:nth-of-type(3)")
    tab.screenshot(OUT / "7-clair-1280.png")
    tab.js("document.querySelector('.controls [aria-label=\"passer au thème sombre\"]').click()")
    print("note :", tab.js(NOTE))
    print("console :", [c for c in chrome.console if c.get("level") == "error"][:3])
