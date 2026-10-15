"""Audit technique du 2026-10-15 (lots 8, 16, 4) : contrastes mesurés dans les deux thèmes, parcours clavier des volets et
de l'avertissement des secrets, rôles ARIA, mise en page à 1024 / 1280 / 1440 / 1920. Lecture seule : rien n'est écrit
dans le projet, seulement l'archive temporaire du serveur de test. Lancer depuis backend/ :
PYTHONPATH=. uv run python ../.impeccable/critique-2026-10-15/audit/scripts/audit_a11y.py"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / ".impeccable" / "planche-lot-16" / "scripts"))
from scene import BASH, FORTIOS, PASTE_CISCO, PYTHON, cisco_120, code, key, paste_text, rect, wait  # noqa: E402
from session import AUTH, reopen, session  # noqa: E402

OUT = HERE.parent
CAP = OUT / "captures"
CAP.mkdir(exist_ok=True)
H = "LDApp.debug.handle().toile"

CT = r"""
window.__ct = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (v) => { g.clearRect(0, 0, 1, 1); g.fillStyle = 'rgba(0,0,0,0)'; g.fillStyle = v; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = (c) => { const [r, gg, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
  const ratio = (fg, bg) => { const base = rgba(bg); const b = base[3] < 1 ? over(base, rgba(getComputedStyle(document.body).backgroundColor)) : base; const f = over(rgba(fg), b); const a = lum(f), c = lum(b); return Math.round(((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)) * 100) / 100; };
  const cs = (sel, prop) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; return el ? getComputedStyle(el)[prop] : null; };
  const v = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return { rgba, ratio, cs, v };
})(); 0
"""


def seed(base: str) -> dict:
    ops = [
        {"op": "annotation_create", "content": code(PYTHON, "python", "optiques_faibles.py"), "anchor": {"kind": "device", "ref": "dc01-rt-01"},
         "x": -804, "y": -292, "w": 540, "h": 360, "leader": True},
        {"op": "annotation_create", "content": code(BASH, "bash", "sauvegarde-configs.sh"), "x": 280, "y": -800, "w": 600, "h": 260},
        {"op": "annotation_create", "content": code(cisco_120(), "cisco_ios", "running-config"), "anchor": {"kind": "device", "ref": "dc01-acc-01"},
         "x": -1195, "y": 207, "w": 580, "h": 560, "leader": True},
        # langage volontairement faux (yaml) : la suggestion « ressemble à FortiOS » apparaît dans le volet du langage
        {"op": "annotation_create", "content": code(FORTIOS, "yaml", ""), "anchor": {"kind": "device", "ref": "dc02-fw-01"},
         "x": 380, "y": 262, "w": 440, "h": 380, "leader": True},
    ]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": "demo-dc"}, headers=AUTH, json={"author": "orhan", "ops": ops}, timeout=30)
    r.raise_for_status()
    python, bash, cisco, forti = [a["id"] for a in r.json()["annotations"]][-4:]
    return {"python": python, "bash": bash, "cisco": cisco, "fortios": forti}


def look(tab, ident: str, zoom: float = 1.0) -> None:
    tab.js(f"{H}.reveal({{ kind: 'annotation', id: {json.dumps(ident)} }})")
    wait(0.5)
    f = tab.js(f"JSON.parse(JSON.stringify({H}.frames.get({json.dumps(ident)})))")
    w, h = tab.js("[innerWidth, innerHeight]")
    cx, cy = f["x"] + f["w"] / 2, f["y"] + f["h"] / 2
    tab.js(f"{H}.restoreView({{ x: {w / 2 - 170 - cx * zoom}, y: {h / 2 + 60 - cy * zoom}, zoom: {zoom} }})")
    wait(0.9)


def active(tab) -> str:
    return tab.js("(() => { const e = document.activeElement; if (!e) return null; return e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '') + (e.getAttribute('aria-label') ? ' [' + e.getAttribute('aria-label') + ']' : '') + (e.textContent ? ' «' + e.textContent.trim().slice(0, 40) + '»' : ''); })()")


def tab_key(tab, shift: bool = False) -> None:
    key(tab, "Tab", "Tab", 9, 8 if shift else 0)
    wait(0.25)


def contrasts(tab, ids: dict, theme: str) -> dict:
    tab.js(CT)
    out: dict = {}
    look(tab, ids["cisco"], 0.92)
    b = f".react-flow__node[data-id='annotation:{ids['cisco']}'] svg.annotation"
    ratio = lambda fg, bg: tab.js(f"__ct.ratio({fg}, {bg})")  # noqa: E731
    sel = lambda s, p: f"__ct.cs({json.dumps(s)}, {json.dumps(p)})"  # noqa: E731
    out["code-title / code-head"] = ratio(sel(b + " .code-title", "fill"), sel(b + " .code-head", "fill"))
    out["code-nums / code-gutter"] = ratio(sel(b + " .code-nums text", "fill"), sel(b + " .code-gutter", "fill"))
    out["code-foot-hint / code-bg"] = ratio(sel(b + " .code-foot-hint", "fill"), sel(b + " .code-body", "fill"))
    out["code-copy icône / code-head (3:1)"] = ratio(sel(b + " .code-copy", "color"), sel(b + " .code-head", "fill"))
    out["code-thumb / code-bg (3:1)"] = ratio(sel(b + " .code-thumb", "fill"), sel(b + " .code-body", "fill"))
    out["tk-clip › / code-bg"] = ratio("__ct.v('--code-num')", "__ct.v('--code-bg')")
    out["ink-3 (code-count, pastille off) / code-head"] = ratio("__ct.v('--ink-3')", "__ct.v('--code-head')")
    # la pastille du langage, pour chaque teinte (classe hue-* changée sur le bloc le temps de la mesure)
    pills = tab.js(f"""(() => {{ const svg = document.querySelector({json.dumps(b)}); const keep = svg.getAttribute('class'); const out = {{}};
      for (const h of ['blue','sky','indigo','violet','pink','red','orange','amber','lime','green','teal','slate']) {{
        svg.setAttribute('class', keep.replace(/hue-[a-z]+/, 'hue-' + h));
        out[h] = __ct.ratio(__ct.cs(svg.querySelector('.code-pill text'), 'fill'), __ct.cs(svg.querySelector('.code-pill rect'), 'fill'));
      }} svg.setAttribute('class', keep); return out; }})()""")
    out["code-pill texte / pastille, par teinte"] = pills
    # la cote d'un écart égal : --guide-ink sur chaque teinte proposée
    out["guide-num (--guide-ink) / --guide, par teinte proposée"] = tab.js("""(() => { const o = { defaut: __ct.ratio(__ct.v('--guide-ink'), __ct.v('--guide-default')) };
      for (const h of ['blue','sky','indigo','violet','pink','red','amber','lime','teal','slate']) o[h] = __ct.ratio(__ct.v('--guide-ink'), __ct.v('--hue-' + h)); return o; })()""")
    out["guide-line / --bg (3:1), par teinte"] = tab.js("""(() => { const o = { defaut: __ct.ratio(__ct.v('--guide-default'), __ct.v('--bg')) };
      for (const h of ['blue','sky','indigo','violet','pink','red','amber','lime','teal','slate']) o[h] = __ct.ratio(__ct.v('--hue-' + h), __ct.v('--bg')); return o; })()""")
    out["guide-pill « libre » ink-3 / bg-elev-2"] = ratio("__ct.v('--ink-3')", "__ct.v('--bg-elev-2')")
    out["grid-ghost-name / grid-ghost"] = ratio("__ct.v('--ink')", "'color-mix(in srgb, ' + __ct.v('--accent') + ' 10%, ' + __ct.v('--bg-elev') + ')'")
    # la barre et un volet
    tab.js(f"document.querySelector({json.dumps(b)}).dispatchEvent(new MouseEvent('click', {{bubbles: true}}))")
    wait(0.6)
    if tab.js("!!document.querySelector('.fbar .fb')"):
        out["fb icône ink-2 / fbar-bg"] = ratio(sel(".fbar .fb", "color"), sel(".fbar-body", "backgroundColor"))
        out["focus accent / fbar-bg (3:1)"] = ratio("__ct.v('--accent')", sel(".fbar-body", "backgroundColor"))
        tab.js("document.querySelector('.fbar .fb[data-id=\"code_language\"]').click()")
        wait(0.5)
        out["volet-cap ink-3 / volet"] = ratio(sel(".fvolet .volet-cap span", "color"), sel(".fvolet", "backgroundColor"))
        out["vgroup-label / volet"] = ratio(sel(".fvolet .vgroup-label", "color"), sel(".fvolet", "backgroundColor"))
        if tab.js("!!document.querySelector('.fvolet .vsuggest')"):
            out["vsuggest ink-2 / ctl-bg"] = ratio(sel(".fvolet .vsuggest", "color"), sel(".fvolet .vsuggest", "backgroundColor"))
        key(tab, "Escape", "Escape", 27)
        wait(0.3)
    # l'infobulle de la barre et son raccourci
    out["ftip-keys / ftip (fond clair codé en dur en clair)"] = tab.js("""(() => { const t = document.createElement('div'); t.className = 'ftip'; t.innerHTML = '<span class="ftip-keys">Alt+G</span>';
      document.querySelector('.fbar') ? document.querySelector('.fbar').parentElement.appendChild(t) : document.body.appendChild(t);
      const r = __ct.ratio(__ct.cs(t.querySelector('.ftip-keys'), 'color'), __ct.cs(t, 'backgroundColor')); t.remove(); return r; })()""")
    out["code-edit-hint / warn panel ink-3 / bg-elev-2"] = ratio("__ct.v('--ink-3')", "__ct.v('--bg-elev-2')")
    out["code-warn-nature (warning) / mélange 12 % sur ctl-bg"] = ratio("__ct.v('--warning')", "'color-mix(in srgb, ' + __ct.v('--warning') + ' 12%, ' + __ct.v('--bg-elev-2') + ')'")
    out["insp-warn texte ink / mélange warning 10 %"] = ratio("__ct.v('--ink')", "'color-mix(in srgb, ' + __ct.v('--warning') + ' 10%, ' + __ct.v('--bg-elev') + ')'")
    tab.screenshot(CAP / f"contraste-{theme}.png")
    return out


def keyboard(tab, ids: dict) -> dict:
    out: dict = {}
    # 1. le volet « aligner et répartir » d'une sélection de cinq équipements : Tab depuis la grille d'alignement
    reopen(tab, ids["base"])
    tab.js(f"(() => {{ const hs = ['dc01-acc-01','dc01-acc-02','dc01-acc-03','dc01-acc-04','dc01-acc-05'].filter((h) => {H}.state.positions.has(h)); LDApp.debug.handle(); window.__hs = hs; }})()")
    hosts = tab.js("window.__hs")
    tab.js(f"{H}.selectHosts({json.dumps(hosts)})")
    wait(0.8)
    if not tab.js("!!document.querySelector('.fbar .fb[data-id=\"align\"]')"):
        # sélection par Maj + clic, à défaut d'une commande exposée
        for h in hosts:
            r = rect(tab, f".react-flow__node[data-id={json.dumps(h)}]")
            if r:
                tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": r["x"] + 20, "y": r["y"] + 20, "button": "left", "buttons": 1, "clickCount": 1, "modifiers": 8})
                tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": r["x"] + 20, "y": r["y"] + 20, "button": "left", "buttons": 0, "clickCount": 1, "modifiers": 8})
                wait(0.2)
        wait(0.8)
    out["sélection"] = tab.js("document.querySelectorAll('.react-flow__node.selected').length")
    key(tab, "t", "KeyT", 84, 1)
    wait(0.4)
    out["Alt+T focus"] = active(tab)
    for _ in range(12):
        if tab.js("document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id === 'align'"):
            break
        key(tab, "ArrowRight", "ArrowRight", 39)
        wait(0.1)
    key(tab, "ArrowDown", "ArrowDown", 40)
    wait(0.4)
    out["volet aligner ouvert"] = tab.js("!!document.querySelector('.fvolet .align-grid')")
    out["focus dans le volet"] = active(tab)
    out["contrôles du volet atteignables (tabindex)"] = tab.js("Array.from(document.querySelectorAll('.fvolet button')).map((b) => (b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 24) + ':' + b.tabIndex)")
    tab_key(tab)
    out["après Tab : volet encore ouvert ?"] = tab.js("!!document.querySelector('.fvolet')")
    out["après Tab : focus"] = active(tab)
    tab.screenshot(CAP / "clavier-volet-aligner-apres-tab.png")
    # 2. le volet du langage d'un bloc mal étiqueté (yaml) : la suggestion « appliquer » au clavier
    key(tab, "Escape", "Escape", 27)
    wait(0.3)
    look(tab, ids["fortios"], 1.0)
    tab.js(f"document.querySelector(\".react-flow__node[data-id='annotation:{ids['fortios']}'] svg.annotation\").dispatchEvent(new MouseEvent('click', {{bubbles: true}}))")
    wait(0.6)
    key(tab, "t", "KeyT", 84, 1)
    wait(0.4)
    for _ in range(12):
        if tab.js("document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id === 'code_language'"):
            break
        key(tab, "ArrowRight", "ArrowRight", 39)
        wait(0.1)
    key(tab, "ArrowDown", "ArrowDown", 40)
    wait(0.4)
    out["volet langage : suggestion affichée"] = tab.js("!!document.querySelector('.fvolet .vsuggest')")
    out["volet langage : focus à l'ouverture"] = active(tab)
    seen = []
    for _ in range(14):
        key(tab, "ArrowUp", "ArrowUp", 38)
        wait(0.08)
        seen.append(active(tab))
    out["volet langage : ↑ répétées, dernier focus"] = seen[-1]
    out["volet langage : la suggestion a-t-elle eu le focus ?"] = any("appliquer" in (s or "").lower() or "vbtn" in (s or "") for s in seen)
    tab_key(tab, shift=True)
    out["volet langage : Maj+Tab → volet ouvert ?"] = tab.js("!!document.querySelector('.fvolet')")
    out["volet langage : Maj+Tab → focus"] = active(tab)
    key(tab, "Escape", "Escape", 27)
    wait(0.3)
    # 3. le bouton « copier » du bloc sur la toile
    out["copier (g role=button) : tabIndex, focusable"] = tab.js("(() => { const g = document.querySelector('.code-copy'); if (!g) return null; g.focus(); return { tabIndex: g.tabIndex, focused: document.activeElement === g, role: g.getAttribute('role'), label: g.getAttribute('aria-label'), hiddenAncestor: !!g.closest('[aria-hidden=true]') }; })()")
    out["nœud du bloc : role / aria-label / tabindex"] = tab.js(f"(() => {{ const n = document.querySelector(\".react-flow__node[data-id='annotation:{ids['fortios']}']\"); return {{ role: n.getAttribute('role'), label: n.getAttribute('aria-label'), roledesc: n.getAttribute('aria-roledescription'), tab: n.tabIndex }}; }})()")
    # 4. l'avertissement des secrets (un collage) : rôles, focus, Tab au bout
    reopen(tab, ids["base"])
    tab.js(f"{H}.restoreView({{ x: 360, y: 900, zoom: 1 }})")
    wait(0.6)
    tab.mouse_move(5, 5)
    paste_text(tab, PASTE_CISCO)
    wait(1.2)
    out["avertissement : présent"] = tab.js("!!document.querySelector('.code-warn-panel')")
    out["avertissement : role / aria-modal"] = tab.js("(() => { const p = document.querySelector('.code-warn-panel'); return p ? { role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), labelledby: p.getAttribute('aria-labelledby') } : null; })()")
    out["avertissement : rôle des lignes (button → ?)"] = tab.js("(() => { const r = document.querySelector('.code-warn-row'); return r ? { tag: r.tagName, role: r.getAttribute('role') } : null; })()")
    out["avertissement : focus initial"] = active(tab)
    trail = []
    for _ in range(4):
        tab_key(tab)
        trail.append(active(tab))
    out["avertissement : Tab ×4"] = trail
    out["avertissement : encore ouvert après Tab ×4"] = tab.js("!!document.querySelector('.code-warn-panel')")
    tab.screenshot(CAP / "clavier-avertissement-tab.png")
    ax = tab.call("Accessibility.getFullAXTree", {})
    rows = [n for n in ax.get("nodes", []) if (n.get("name", {}) or {}).get("value", "").lower().startswith(("aller", "go to", "ligne", "line"))]
    out["avertissement : rôle exposé d'une ligne (arbre a11y)"] = [((n.get("role") or {}).get("value"), (n.get("name") or {}).get("value", "")[:60]) for n in rows[:3]]
    return out


def layouts(tab, ids: dict) -> dict:
    out: dict = {}
    for w, h in ((1024, 768), (1280, 800), (1440, 900), (1920, 1080)):
        tab.call("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})
        reopen(tab, ids["base"])
        look(tab, ids["cisco"], 0.8)
        tab.js(f"document.querySelector(\".react-flow__node[data-id='annotation:{ids['cisco']}'] svg.annotation\").dispatchEvent(new MouseEvent('click', {{bubbles: true}}))")
        wait(0.6)
        tab.js("document.querySelector('.fbar .fb[data-id=\"code_font\"]') && document.querySelector('.fbar .fb[data-id=\"code_font\"]').click()")
        wait(0.5)
        geo = tab.js("""(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width) }; };
          return { vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, bar: r('.fbar-body'), volet: r('.fvolet'), panel: r('.panel'), suspended: !!document.querySelector('.fbar.suspended, .fbar.offscreen') }; })()""")
        out[f"{w}"] = geo
        tab.screenshot(CAP / f"barre-volet-police-{w}.png")
        key(tab, "Escape", "Escape", 27)
        wait(0.2)
    # l'avertissement à 1024, le panneau ouvert : déborde-t-il sous le panneau ou hors écran ?
    tab.call("Emulation.setDeviceMetricsOverride", {"width": 1024, "height": 768, "deviceScaleFactor": 1, "mobile": False})
    reopen(tab, ids["base"])
    look(tab, ids["python"], 1.0)
    tab.js(f"document.querySelector(\".react-flow__node[data-id='annotation:{ids['python']}'] svg.annotation\").dispatchEvent(new MouseEvent('dblclick', {{bubbles: true}}))")
    wait(0.6)
    if tab.js("!!document.querySelector('.code-edit')"):
        tab.js("(() => { const t = document.querySelector('.code-edit'); t.focus(); t.setRangeText('\\npassword = \"Sup3rS3cret!\"', t.value.length, t.value.length, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); })()")
        key(tab, "Enter", "Enter", 13, 2)
        wait(0.8)
    out["1024 avertissement"] = tab.js("""(() => { const e = document.querySelector('.code-warn-panel'); if (!e) return null; const b = e.getBoundingClientRect(); const p = document.querySelector('.panel'); const pb = p ? p.getBoundingClientRect() : null;
      return { x: Math.round(b.x), r: Math.round(b.right), y: Math.round(b.y), b: Math.round(b.bottom), vw: innerWidth, vh: innerHeight, panelLeft: pb ? Math.round(pb.left) : null }; })()""")
    tab.screenshot(CAP / "avertissement-1024.png")
    tab.call("Emulation.clearDeviceMetricsOverride", {})
    return out


def main() -> None:
    report: dict = {}
    with session() as (base, tab, chrome):
        ids = seed(base)
        ids["base"] = base
        reopen(tab, base)
        report["contrastes sombre"] = contrasts(tab, ids, "sombre")
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), theme: 'light' }))")
        reopen(tab, base)
        report["contrastes clair"] = contrasts(tab, ids, "clair")
        tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), theme: 'dark' }))")
        report["clavier"] = keyboard(tab, ids)
        report["mise en page"] = layouts(tab, ids)
    (OUT / "mesures-a11y.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
