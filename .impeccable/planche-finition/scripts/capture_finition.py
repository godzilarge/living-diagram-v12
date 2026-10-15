"""Passe de finition du 2026-10-15 (critique et audit Impeccable des lots 8, 16 et 4) : les captures « après », sur
demo-dc, gestes réels. Sombre 1440 × 900 : 1-collage-focus (l'avertissement d'un collage a le focus, Tab y tourne ; la
gouttière laisse la place du point rouge), 2-barre-AA13 (la taille du code dans la barre), 3-bulle-valeur et
3b-bulle-bouclier (le rappel d'une valeur gardée), 4-volet-aligner-clavier (Tab jusqu'à « mettre en grille », l'aperçu),
5-fiche-2000 (un bloc de 2 000 lignes dans la fiche, fenêtré). 1024 × 768 sombre : 6-avertissement-fiche. Clair
1280 × 800 : 7-avertissement-fiche, 8-volet-langage (aligné sur son bouton, avec sa flèche ; pastille ambre lisible),
9-bulle-valeur. Les textes sont factices (secrets inventés).
Lancer depuis backend/ : PYTHONPATH=. uv run python ../.impeccable/planche-finition/scripts/capture_finition.py <sortie>"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scene import FORTIOS, NOTE, PASTE_CISCO, PYTHON, block, cisco_120, code, key, paste_text, rect, wait  # noqa: E402
from session import AUTH, reopen, session  # noqa: E402

from tests.test_view import _wait  # noqa: E402

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "apres")
OUT.mkdir(parents=True, exist_ok=True)
H = "LDApp.debug.handle().toile"
BIG = "\n".join(f"vlan {1000 + i}" for i in range(2000))


def seed(base: str) -> dict:
    ops = [
        {"op": "annotation_create", "content": code(PYTHON, "python", "optiques_faibles.py"), "anchor": {"kind": "device", "ref": "dc01-rt-01"},
         "x": -804, "y": -292, "w": 540, "h": 360, "leader": True},
        {"op": "annotation_create", "content": code(cisco_120(), "cisco_ios", "running-config"), "anchor": {"kind": "device", "ref": "dc01-acc-01"},
         "x": -1195, "y": 207, "w": 580, "h": 560, "leader": True},
        {"op": "annotation_create", "content": code(FORTIOS, "fortios", "ha et agg-core"), "anchor": {"kind": "device", "ref": "dc02-fw-01"},
         "x": 380, "y": 262, "w": 440, "h": 380, "leader": True, "style": {"hue": "amber"}},
        {"op": "annotation_create", "content": code(BIG, "cisco_ios", "vlans"), "x": 1400, "y": -900, "w": 520, "h": 420},
        # gardé tel quel : l'API n'avertit pas (la page le fait avant d'écrire) ; ce bloc porte ses valeurs
        {"op": "annotation_create", "content": code(PASTE_CISCO, "cisco_ios", "dc01-acc-03 (valeurs gardées)"), "x": 1400, "y": -300, "w": 560, "h": 360},
    ]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=AUTH, json={"author": "orhan", "ops": ops}, timeout=30)
    r.raise_for_status()
    python, cisco, forti, big, kept = [a["id"] for a in r.json()["annotations"]][-5:]
    return {"python": python, "cisco": cisco, "fortios": forti, "big": big, "kept": kept}


def look(tab, ident: str, zoom: float, dx: float = 0, dy: float = 0, select: bool = True) -> None:
    tab.js(f"{H}.reveal({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    wait(0.5)
    if not select:
        tab.js(f"{H}.select(null)")
    f = tab.js(f"JSON.parse(JSON.stringify({H}.frames.get({json.dumps(ident)})))")
    w, h = tab.js("[innerWidth, innerHeight]")
    cx, cy = f["x"] + f["w"] / 2, f["y"] + f["h"] / 2
    tab.js(f"{H}.restoreView({{ x: {w / 2 - (170 if select else 0) + dx - cx * zoom}, y: {h / 2 + 10 + dy - cy * zoom}, zoom: {zoom} }})")
    wait(0.9)


def hover(tab, selector: str, index: int = 0) -> None:
    r = tab.js(f"JSON.parse(JSON.stringify(document.querySelectorAll({json.dumps(selector)})[{index}].getBoundingClientRect()))")
    x, y = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
    tab.mouse_move(x - 20, y + 20)
    tab.mouse_move(x, y)
    wait(0.8)


def quiet(tab) -> None:
    """La ligne d'état s'efface (elle se poserait sur la capture)."""
    for _ in range(80):
        if not tab.js("!!document.querySelector('.toast')"):
            return
        wait(0.1)


def edit_with_secret(tab, ident: str) -> dict:
    """La fiche ouverte sur le bloc, l'écriture ouverte, une valeur sensible ajoutée, Ctrl+Entrée : l'avertissement."""
    look(tab, ident, 0.9, 0, 0)
    r = rect(tab, block(ident))
    x, y = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
    tab.mouse_move(x, y)
    for count in (1, 2):
        for kind, buttons in (("mousePressed", 1), ("mouseReleased", 0)):
            tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": count})
    _wait(tab, "document.activeElement && document.activeElement.classList.contains('code-edit')")
    tab.call("Input.insertText", {"text": "enable password 0 Fini-S3cret\n"})
    key(tab, "Enter", "Enter", 13, 2)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    wait(0.5)
    tab.mouse_move(5, 450)
    return tab.js("(() => { const w = document.querySelector('.code-warn-panel').getBoundingClientRect(), p = document.querySelector('.panel');"
                  " return { side: document.querySelector('.code-warn-panel').dataset.side, left: Math.round(w.left), right: Math.round(w.right), top: Math.round(w.top),"
                  " bottom: Math.round(w.bottom), panel: p ? Math.round(p.getBoundingClientRect().left) : null, innerWidth, innerHeight }; })()")


def leave_edit(tab) -> None:
    key(tab, "Escape", "Escape", 27)
    wait(0.2)
    key(tab, "Escape", "Escape", 27)
    wait(0.4)


with session() as (base, tab, chrome):
    ids = seed(base)
    reopen(tab, base)
    # 1. collage : le focus sur « Retirer », Tab tourne dans l'avertissement (anneau visible)
    tab.js(f"{H}.restoreView({{ x: 360, y: 900, zoom: 1 }})")
    wait(0.6)
    tab.mouse_move(5, 5)
    paste_text(tab, PASTE_CISCO)
    _wait(tab, "!!document.querySelector('.code-warn-panel')")
    wait(0.6)
    key(tab, "Tab", "Tab", 9)
    key(tab, "Tab", "Tab", 9, 8)
    wait(0.3)
    print("1 focus :", tab.js("document.activeElement.textContent"), "· texte inchangé :", tab.js("!document.querySelector('.code-edit').value.startsWith(' ')"))
    tab.screenshot(OUT / "1-sombre-1440-collage-focus.png")
    leave_edit(tab)
    quiet(tab)
    # 2. la barre d'un bloc : « AA 13 »
    look(tab, ids["python"], 1.0, -40, 40)
    tab.mouse_move(5, 450)
    wait(0.4)
    print("2 taille :", tab.js("document.querySelector('.fbar .fb[data-id=text_size]').textContent"))
    tab.screenshot(OUT / "2-sombre-1440-barre-AA13.png")
    # 3. la bulle d'une valeur gardée, puis du bouclier
    look(tab, ids["kept"], 1.0, 0, 0, select=False)
    hover(tab, f"{block(ids['kept'])} [data-secret]", 2)
    print("3 bulle :", tab.js("document.querySelector('.tip-layer .tip').textContent"))
    tab.screenshot(OUT / "3-sombre-1440-bulle-valeur.png")
    hover(tab, f"{block(ids['kept'])} [data-shield]")
    tab.screenshot(OUT / "3b-sombre-1440-bulle-bouclier.png")
    tab.mouse_move(5, 450)
    # 4. le volet « aligner et répartir » au clavier : Tab jusqu'à « mettre en grille », l'aperçu
    hosts = ["dc01-acc-01", "dc01-acc-02", "dc01-acc-03", "dc01-acc-04", "dc01-acc-05"]
    tab.js(f"{H}.selectHosts({json.dumps(hosts)})")
    tab.js(f"(() => {{ const t = {H}; const ps = {json.dumps(hosts)}.map((h) => t.state.positions.get(h)); const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;"
           f" t.restoreView({{ zoom: 0.8, x: (innerWidth - 348) / 2 - x * 0.8, y: innerHeight / 2 + 120 - y * 0.8 }}); }})()")
    wait(0.9)
    _wait(tab, "!!document.querySelector('.fbar:not(.suspended):not(.offscreen) .fb[data-id=align]')")
    tab.js("document.querySelector('.fbar .fb[data-id=align]').focus()")
    key(tab, "ArrowDown", "ArrowDown", 40)
    wait(0.4)
    for _ in range(3):
        key(tab, "Tab", "Tab", 9)
    wait(0.6)
    print("4 focus :", tab.js("document.activeElement.className"), tab.js("document.querySelectorAll('.grid-place').length"), "places")
    tab.screenshot(OUT / "4-sombre-1440-volet-aligner-clavier.png")
    key(tab, "Escape", "Escape", 27)
    tab.js(f"{H}.select(null)")
    wait(0.3)
    # 5. la fiche d'un bloc de 2 000 lignes, fenêtrée, défilée au milieu
    look(tab, ids["big"], 0.8, -40, 0)
    tab.js("document.querySelector('.panel .insp-code pre').scrollTop = 19 * 1000")
    wait(0.5)
    tab.mouse_move(5, 450)
    print("5 lignes rendues :", tab.js("document.querySelectorAll('.panel .insp-code .ln').length"), "· première :", tab.js("document.querySelector('.panel .insp-code .ln').dataset.n"))
    tab.screenshot(OUT / "5-sombre-1440-fiche-2000.png")
    tab.js(f"{H}.select(null)")
    wait(0.3)
    # 6. 1024 × 768, la fiche ouverte : l'avertissement d'une écriture ne passe pas sous elle
    tab.call("Emulation.setDeviceMetricsOverride", {"width": 1024, "height": 768, "deviceScaleFactor": 1, "mobile": False})
    wait(0.6)
    print("6 place :", edit_with_secret(tab, ids["cisco"]))
    tab.screenshot(OUT / "6-sombre-1024-avertissement-fiche.png")
    leave_edit(tab)
    quiet(tab)
    # 7 à 9. clair, 1280 × 800
    tab.call("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False})
    tab.js("document.querySelector('.controls [aria-label=\"passer au thème clair\"]').click()")
    wait(0.6)
    print("7 place :", edit_with_secret(tab, ids["fortios"]))
    tab.screenshot(OUT / "7-clair-1280-avertissement-fiche.png")
    leave_edit(tab)
    quiet(tab)
    look(tab, ids["fortios"], 1.0, -80, 40)
    tab.js("document.querySelector('.fbar .fb[data-id=code_language]').click()")
    wait(0.6)
    hover(tab, ".fvolet .lang-item", 2)
    print("8 volet :", tab.js("(() => { const v = document.querySelector('.fvolet'), b = document.querySelector('.fbar .fb[data-id=code_language]').getBoundingClientRect(), r = v.getBoundingClientRect();"
                              " return { volet: [Math.round(r.left), Math.round(r.top), Math.round(r.bottom)], bouton: [Math.round(b.left), Math.round(b.top)], classes: v.className }; })()"))
    tab.screenshot(OUT / "8-clair-1280-volet-langage.png")
    key(tab, "Escape", "Escape", 27)
    tab.js(f"{H}.select(null)")
    look(tab, ids["kept"], 1.0, 0, 0, select=False)
    hover(tab, f"{block(ids['kept'])} [data-secret]", 4)
    tab.screenshot(OUT / "9-clair-1280-bulle-valeur.png")
    tab.js("document.querySelector('.controls [aria-label=\"passer au thème sombre\"]').click()")
    print("note :", tab.js(NOTE))
    print("console :", [c for c in chrome.console if c.get("level") == "error"][:3])
