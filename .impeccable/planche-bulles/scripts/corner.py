"""Le calage de la bulle dans la zone visible : au-dessus de la bande (inset bas 84), sous la barre (inset haut 56),
à gauche du panneau ouvert (inset droit 348)."""
import json, sys, threading
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
server, thread, base = _serve(Settings(api_token=TOKEN, archive_dir=OUT / "archive", max_bundle_bytes=50_000_000))
try:
    httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / "run-03.json").read_bytes(), headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, timeout=120)
    with Chrome(CHROMIUM) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.navigate(f"{base}/?infrastructure=demo-dc#mode=control"); _wait(tab, READY); _wait(tab, "document.querySelectorAll('.react-flow__edge').length > 0"); threading.Event().wait(2.5)
        lid = tab.js("(() => { const m = LDApp.debug.state().run.model; return m.links.filter(l => !l.ghost && l.checks.length && m.nodeByHost.get(l.a.hostname).kind === 'device' && m.nodeByHost.get(l.b.hostname).kind === 'device').map(l => l.id)[0]; })()")
        host = tab.js("(() => { const r = document.querySelector('.flow-host').getBoundingClientRect(); return {w: r.width, h: r.height, left: r.left, top: r.top}; })()")
        def put(target_x, target_y, with_panel):
            tab.js("LDApp.debug.handle().toile.select(" + (json.dumps({'kind': 'link', 'id': lid}) if with_panel else "null") + ")"); threading.Event().wait(0.4)
            tab.js(f"""(() => {{ const t = LDApp.debug.handle().toile; const m = LDApp.debug.state().run.model; const l = m.linkById.get({json.dumps(lid)});
              const a = t.state.positions.get(l.a.hostname), b = t.state.positions.get(l.b.hostname); const mid = {{x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}};
              const v = t.viewport() || {{x: 0, y: 0, zoom: 1}}; t.restoreView({{zoom: v.zoom, x: {target_x} - mid.x * v.zoom, y: {target_y} - mid.y * v.zoom}}); }})()""")
            threading.Event().wait(0.6)
            at = tab.js(MID.replace("{id}", json.dumps("link:" + lid)))
            tab.mouse_move(at["x"] - 2, at["y"] - 2); tab.mouse_move(at["x"], at["y"]); threading.Event().wait(0.3)
            tr = tab.js(f"{TIP}.getAttribute('transform')"); vis = tab.js(f"{TIP}.getAttribute('visibility')")
            w, h = tab.js(f"+{TIP}.querySelector('.tip-box').getAttribute('width')"), tab.js(f"+{TIP}.querySelector('.tip-box').getAttribute('height')")
            x, y = [float(v) for v in tr[10:-1].split(",")]
            band = tab.js("(() => { const b = document.querySelector('.band'); return b ? b.getBoundingClientRect().top : null; })()")
            panel = tab.js("(() => { const p = document.querySelector('.panel'); return p ? p.getBoundingClientRect().left : null; })()")
            bar = tab.js("(() => { const b = document.querySelector('.bar'); return b ? b.getBoundingClientRect().bottom : null; })()")
            print(f"cible ({target_x},{target_y}) panneau={with_panel} : visible={vis} bulle x={x} y={y} w={w} h={h} | bas={y+h} vs bande={band} | droite={x+w} vs panneau={panel} | haut={y} vs barre={bar}")
            tab.mouse_move(5, 400); threading.Event().wait(0.2)
        put(host["w"] - 40, host["h"] - 50, False)
        put(host["w"] - 40, host["h"] - 50, True)
        put(60, 70, False)
        put(host["w"] - 40, 70, True)
        tab.screenshot(OUT / "corner.png")
        print("console :", [c for c in chrome.console if c.get("type") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=10)
