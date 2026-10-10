"""Après les correctifs : couleur calculée des rôles, marge droite réelle, place au bord bas-droit (au-dessus de la bande)."""
import base64, json, sys, threading
from pathlib import Path
import httpx
from ld_backend.config import Settings
from tests.browser import Chrome
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait
SAMPLES = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo/samples/demo-dc")
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
TOKEN = "tok"; TIP = "document.getElementById('ld-tip')"
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
MID = """(() => { const g = Array.from(document.querySelectorAll('.react-flow__edge')).find(e => e.getAttribute('data-id') === {id});
  const el = g && g.querySelector('.link-line'); if (!el) return null; const p = el.getPointAtLength(el.getTotalLength() * 0.5); const q = p.matrixTransform(el.getScreenCTM()); return { x: q.x, y: q.y }; })()"""
GEOM = """(() => { const tip = document.getElementById('ld-tip'); const box = tip.querySelector('.tip-box'); const w = +box.getAttribute('width'), h = +box.getAttribute('height');
  const texts = Array.from(tip.querySelectorAll('text')); const right = Math.max(...texts.map(t => t.getBBox().x + t.getBBox().width));
  const fills = {}; for (const c of ['tip-label','tip-port','tip-sub','tip-subtitle','tip-note','tip-value','tip-title','tip-code']) { const e = tip.querySelector('.' + c); fills[c] = e ? getComputedStyle(e).fill : null; }
  const pill = tip.querySelector('.pill-svg'); let pillGap = null; if (pill) { const r = pill.querySelector('.pill-box').getBBox(), t = pill.querySelector('text').getBBox(); pillGap = +(r.x + r.width - (t.x + t.width)).toFixed(1); }
  const tr = getComputedStyle(texts[0]).textRendering; return { w, h, rightMargin: +(w - right).toFixed(1), fills, pillGap, tr, transform: tip.getAttribute('transform') }; })()"""
def shot(tab, path, pad=24):
    r = tab.js(f"(() => {{ const r = {TIP}.getBoundingClientRect(); return {{x: r.left, y: r.top, w: r.width, h: r.height}}; }})()")
    clip = {"x": max(0, r["x"] - pad), "y": max(0, r["y"] - pad), "width": r["w"] + 2 * pad, "height": r["h"] + 2 * pad, "scale": 2}
    path.write_bytes(base64.b64decode(tab.call("Page.captureScreenshot", {"format": "png", "clip": clip})["data"]))
server, thread, base = _serve(Settings(api_token=TOKEN, archive_dir=OUT / "archive", max_bundle_bytes=50_000_000))
try:
    for f in ("run-02.json", "run-03.json"):
        httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / f).read_bytes(), headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, timeout=120)
    with Chrome(CHROMIUM) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        for theme in ("dark", "light"):
            tab.js(f"localStorage.setItem('ld-prefs', JSON.stringify({{theme: '{theme}'}}))")
            tab.navigate(f"{base}/?infrastructure=demo-dc#mode=control"); _wait(tab, READY); _wait(tab, "document.querySelectorAll('.react-flow__edge').length > 0"); threading.Event().wait(2.5)
            links = tab.js("(() => { const m = LDApp.debug.state().run.model; return m.links.filter(l => !l.ghost && l.checks.length && m.nodeByHost.get(l.a.hostname).kind === 'device' && m.nodeByHost.get(l.b.hostname).kind === 'device').map(l => l.id); })()")
            lid = links[0]
            tab.js(f"LDApp.debug.handle().toile.open({json.dumps({'kind': 'link', 'id': lid})}); LDApp.debug.handle().toile.select(null)"); threading.Event().wait(0.6)
            at = tab.js(MID.replace("{id}", json.dumps("link:" + lid)))
            tab.mouse_move(at["x"] - 2, at["y"] - 2); tab.mouse_move(at["x"], at["y"]); threading.Event().wait(0.35)
            print(theme, "câble :", json.dumps(tab.js(GEOM)))
            shot(tab, OUT / f"{theme}-link.png")
            tab.mouse_move(5, 400); threading.Event().wait(0.2)
            # un équipement (pastille de type) : marge entre le titre et la pastille
            node = tab.js("(() => { const m = LDApp.debug.state().run.model; const n = m.nodes.find(n => n.kind === 'device' && n.type === 'switch'); return n.hostname; })()")
            tab.js(f"LDApp.debug.handle().toile.open({json.dumps({'kind': 'node', 'id': node})}); LDApp.debug.handle().toile.select(null)"); threading.Event().wait(0.6)
            c = tab.js(f"(() => {{ const el = Array.from(document.querySelectorAll('.react-flow__node')).find(e => e.getAttribute('data-id') === {json.dumps(node)}); const r = el.getBoundingClientRect(); return {{x: r.left + r.width * 0.3, y: r.top + r.height / 2}}; }})()")
            tab.mouse_move(c["x"] - 2, c["y"] - 2); tab.mouse_move(c["x"], c["y"]); threading.Event().wait(0.35)
            g = tab.js(GEOM); g["titleToPill"] = tab.js("(() => { const tip = document.getElementById('ld-tip'); const t = tip.querySelector('.tip-title').getBBox(); const p = tip.querySelector('.pill-box').getBBox(); return +(p.x - (t.x + t.width)).toFixed(1); })()")
            print(theme, "équipement :", json.dumps(g))
            shot(tab, OUT / f"{theme}-node.png")
            tab.mouse_move(5, 400); threading.Event().wait(0.2)
            # bord bas-droit : la bulle doit rester au-dessus de la bande (insets bottom 84) et sous la barre (top 56)
            tab.js("LDApp.debug.handle().toile.select({kind: 'link', id: " + json.dumps(lid) + "})"); threading.Event().wait(0.4)  # panneau ouvert : inset droit
            host = tab.js("(() => { const r = document.querySelector('.flow-host').getBoundingClientRect(); return {w: r.width, h: r.height}; })()")
            tab.js("(() => { const h = LDApp.debug.handle(); const v = h.toile; const l = LDApp.debug.state().run.model.linkById.get(" + json.dumps(lid) + "); return 1; })()")
            # amener le câble près du coin bas-droit par un décalage de la vue
            view = tab.js("LDApp.debug.handle().toile.view ? null : null")
            at = tab.js(MID.replace("{id}", json.dumps("link:" + lid)))
            dx, dy = host["w"] - 60 - at["x"], host["h"] - 100 - at["y"]
            tab.js(f"(() => {{ const rf = document.querySelector('.react-flow'); return 1; }})()")
            tab.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": 700, "y": 450, "button": "left", "clickCount": 1}); tab.mouse_move(700 + dx / 2, 450 + dy / 2, pressed=True); tab.mouse_move(700 + dx, 450 + dy, pressed=True)
            tab.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": 700 + dx, "y": 450 + dy, "button": "left", "clickCount": 1}); threading.Event().wait(0.5)
            at = tab.js(MID.replace("{id}", json.dumps("link:" + lid)))
            if at:
                tab.mouse_move(at["x"] - 2, at["y"] - 2); tab.mouse_move(at["x"], at["y"]); threading.Event().wait(0.35)
                g = tab.js(GEOM); band = tab.js("(() => { const b = document.querySelector('.band'); const r = b ? b.getBoundingClientRect() : null; const p = document.querySelector('.panel'); const q = p ? p.getBoundingClientRect() : null; return {bandTop: r ? r.top : null, panelLeft: q ? q.left : null}; })()")
                tr = [float(v) for v in g["transform"][10:-1].split(",")]
                print(theme, "coin bas-droit : pointeur", {k: round(v) for k, v in at.items()}, "bulle", tr, "taille", g["w"], g["h"], "bas de bulle", tr[1] + g["h"], "haut de la bande", band["bandTop"], "droite de bulle", tr[0] + g["w"], "gauche du panneau", band["panelLeft"])
                tab.screenshot(OUT / f"{theme}-corner.png")
        print("console :", [c for c in chrome.console if c.get("type") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=10)
