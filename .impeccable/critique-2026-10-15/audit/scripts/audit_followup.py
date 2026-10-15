"""Audit du 2026-10-15, vérifications ciblées : Tab dans le champ quand l'avertissement des secrets est ouvert par un
collage (le texte change-t-il ?), ↓ depuis « appliquer » dans le volet du langage, l'avertissement à 1280 / 1440 avec la
fiche ouverte, la pastille de nature dans l'avertissement en clair (élément réel), le mouvement réduit, la taille des
pastilles de couleur des repères. Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier>"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.argv = sys.argv[:1]
import audit_a11y as A  # noqa: E402  (réutilise seed, look, active, CT ; main() tourne à l'import : évité ci-dessous)
from scene import PASTE_CISCO, key, paste_text, rect, wait  # noqa: E402
from session import reopen, session  # noqa: E402

H, CAP = A.H, A.CAP


def click_block(tab, ident: str, kind: str = "click") -> None:
    tab.js(f"document.querySelector(\".react-flow__node[data-id='annotation:{ident}'] svg.annotation\").dispatchEvent(new MouseEvent({json.dumps(kind)}, {{bubbles: true}}))")
    wait(0.6)


def main() -> None:
    out: dict = {}
    with session() as (base, tab, chrome):
        ids = A.seed(base)
        reopen(tab, base)
        # 1. collage avec valeurs sensibles : Tab ×2 dans le champ, le texte change-t-il ?
        tab.js(f"{H}.restoreView({{ x: 360, y: 900, zoom: 1 }})")
        wait(0.6)
        tab.mouse_move(5, 5)
        paste_text(tab, PASTE_CISCO)
        wait(1.2)
        before = tab.js("document.querySelector('.code-edit').value")
        out["collage : focus"] = A.active(tab)[:60]
        A.tab_key(tab)
        A.tab_key(tab)
        after = tab.js("document.querySelector('.code-edit').value")
        out["collage : Tab ×2 a modifié le texte"] = before != after
        out["collage : début du texte après Tab ×2"] = after[:24]
        out["collage : avertissement encore ouvert"] = tab.js("!!document.querySelector('.code-warn-panel')")
        out["collage : bouton « retirer » a-t-il jamais le focus (Tab ×6)"] = False
        for _ in range(6):
            A.tab_key(tab)
            if "Retirer" in (A.active(tab) or "") or "retirer" in (A.active(tab) or ""):
                out["collage : bouton « retirer » a-t-il jamais le focus (Tab ×6)"] = True
        key(tab, "Escape", "Escape", 27)
        wait(0.2)
        key(tab, "Escape", "Escape", 27)
        wait(0.4)
        # 2. écriture puis Ctrl+Entrée : le focus initial de l'avertissement (chemin « commit »)
        reopen(tab, base)
        A.look(tab, ids["bash"], 1.0)
        click_block(tab, ids["bash"], "dblclick")
        tab.js("(() => { const t = document.querySelector('.code-edit'); t.focus(); t.setRangeText('\\nexport DB_PASSWORD=Sup3rS3cret', t.value.length, t.value.length, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); })()")
        key(tab, "Enter", "Enter", 13, 2)
        wait(0.8)
        out["Ctrl+Entrée : focus initial de l'avertissement"] = A.active(tab)
        key(tab, "Escape", "Escape", 27)
        wait(0.2)
        key(tab, "Escape", "Escape", 27)
        wait(0.4)
        # 3. volet du langage avec suggestion : ↓ depuis « appliquer »
        reopen(tab, base)
        A.look(tab, ids["fortios"], 1.0)
        click_block(tab, ids["fortios"])
        key(tab, "t", "KeyT", 84, 1)
        wait(0.4)
        for _ in range(12):
            if tab.js("document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id === 'code_language'"):
                break
            key(tab, "ArrowRight", "ArrowRight", 39)
            wait(0.1)
        key(tab, "ArrowDown", "ArrowDown", 40)
        wait(0.4)
        trail = []
        for _ in range(3):
            key(tab, "ArrowDown", "ArrowDown", 40)
            wait(0.1)
            trail.append(A.active(tab))
        out["volet langage : ↓ ×3 depuis « appliquer »"] = trail
        key(tab, "Escape", "Escape", 27)
        wait(0.3)
        # 4. l'avertissement à 1280 et 1440, la fiche ouverte (le bloc sélectionné)
        for w, h in ((1280, 800), (1440, 900)):
            tab.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})
            reopen(tab, base)
            A.look(tab, ids["python"], 1.0)
            click_block(tab, ids["python"], "dblclick")
            tab.js("(() => { const t = document.querySelector('.code-edit'); if (!t) return; t.focus(); t.setRangeText('\\npassword = \"Sup3rS3cret!\"', t.value.length, t.value.length, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); })()")
            key(tab, "Enter", "Enter", 13, 2)
            wait(0.8)
            out[f"{w} avertissement"] = tab.js("""(() => { const e = document.querySelector('.code-warn-panel'); if (!e) return null; const b = e.getBoundingClientRect(); const p = document.querySelector('.panel'); const pb = p ? p.getBoundingClientRect() : null;
              return { x: Math.round(b.x), r: Math.round(b.right), vw: innerWidth, panelLeft: pb ? Math.round(pb.left) : null, hiddenUnderPanel: pb ? Math.max(0, Math.round(b.right - pb.left)) : 0 }; })()""")
            tab.screenshot(CAP / f"avertissement-{w}.png")
            key(tab, "Escape", "Escape", 27)
            wait(0.2)
            key(tab, "Escape", "Escape", 27)
            wait(0.3)
        tab.call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        # 5. clair : la pastille de nature d'une valeur, élément réel
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), theme: 'light' }))")
        reopen(tab, base)
        tab.js(A.CT)
        tab.js(f"{H}.restoreView({{ x: 360, y: 900, zoom: 1 }})")
        wait(0.6)
        tab.mouse_move(5, 5)
        paste_text(tab, PASTE_CISCO)
        wait(1.2)
        out["clair : nature (avertissement) / son fond, éléments réels"] = tab.js("""(() => { const out = {}; document.querySelectorAll('.code-warn-nature').forEach((n) => {
            const bg = getComputedStyle(n).backgroundColor; const list = getComputedStyle(document.querySelector('.code-warn-list')).backgroundColor; const panel = getComputedStyle(document.querySelector('.code-warn-panel')).backgroundColor;
            const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = panel; g.fillRect(0,0,1,1); g.fillStyle = list; g.fillRect(0,0,1,1); g.fillStyle = bg; g.fillRect(0,0,1,1); const d = g.getImageData(0,0,1,1).data;
            out[n.textContent + (n.classList.contains('hash') ? ' (hash)' : '')] = __ct.ratio(getComputedStyle(n).color, 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')'); }); return out; })()""")
        out["clair : ligne d'aperçu (ink-2) / liste"] = tab.js("__ct.ratio(getComputedStyle(document.querySelector('.code-warn-line')).color, getComputedStyle(document.querySelector('.code-warn-panel')).backgroundColor)")
        tab.screenshot(CAP / "avertissement-clair.png")
        key(tab, "Escape", "Escape", 27)
        wait(0.2)
        key(tab, "Escape", "Escape", 27)
        wait(0.3)
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), theme: 'dark' }))")
        # 6. la rangée des couleurs des repères (panneau Affichage) : taille des cibles
        reopen(tab, base)
        tab.js("(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => /affichage/i.test(x.getAttribute('aria-label') || x.textContent)); if (b) b.click(); })()")
        wait(0.5)
        out["pastilles couleur des repères : cibles"] = tab.js("""(() => { const s = Array.from(document.querySelectorAll('.guide-swatch')).map((e) => e.getBoundingClientRect());
          if (!s.length) return null; const centres = s.slice(1).map((b, i) => Math.round(b.x + b.width / 2 - (s[i].x + s[i].width / 2)));
          return { n: s.length, w: Math.round(s[0].width), h: Math.round(s[0].height), pasEntreCentres: Math.min(...centres.filter((d) => d > 0)) }; })()""")
        tab.screenshot(CAP / "affichage-couleur-reperes.png")
        # 7. mouvement réduit : ce qui reste animé
        tab.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
        reopen(tab, base)
        A.look(tab, ids["python"], 1.0)
        click_block(tab, ids["python"])
        out["mouvement réduit : barre"] = tab.js("(() => { const b = document.querySelector('.fbar-body'); return b ? getComputedStyle(b).animationName + ' ' + getComputedStyle(b).animationDuration : null; })()")
        out["mouvement réduit : défilement du bloc"] = tab.js("(() => { const s = document.querySelector('.code-scroll'); return s ? getComputedStyle(s).transitionDuration : null; })()")
    (A.OUT / "mesures-suivi.json").write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(json.dumps(out, indent=2, ensure_ascii=False))


main()
