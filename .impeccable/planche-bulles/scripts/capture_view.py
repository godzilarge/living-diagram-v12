"""La bulle dans la page `/view` autonome (ld render), sur demo-dc run-03 : un câble et un équipement, clair et sombre."""
from __future__ import annotations
import base64, json, subprocess, sys, threading
from pathlib import Path
from tests.browser import Chrome
from tests.test_render import CHROMIUM
from tests.test_view import _wait

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
page = OUT / "page.html"
subprocess.run(["uv", "run", "ld", "render", str(PROJECT / "samples/demo-dc/run-03.json"), "--out", str(page)], check=True, cwd=PROJECT / "backend")
TIP = "document.getElementById('ld-tip')"

def shot(tab, path, pad=24):
    r = tab.js(f"(() => {{ const r = {TIP}.getBoundingClientRect(); return {{x: r.left, y: r.top, w: r.width, h: r.height}}; }})()")
    clip = {"x": max(0, r["x"] - pad), "y": max(0, r["y"] - pad), "width": r["w"] + 2 * pad, "height": r["h"] + 2 * pad, "scale": 2}
    path.write_bytes(base64.b64decode(tab.call("Page.captureScreenshot", {"format": "png", "clip": clip})["data"]))

with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
    tab = chrome.open(page.as_uri())
    _wait(tab, "!!document.querySelector('#canvas .link')")
    threading.Event().wait(1.0)
    for name, expr in (("view-link", """(() => { const st = LD.app.graph.state, m = LD.app.model;
            const link = m.links.find((l) => l.status === 'confirmed' && m.nodeByHost.get(l.a.hostname).kind === 'device' && m.nodeByHost.get(l.b.hostname).kind === 'device' && st.positions.has(l.a.hostname) && st.positions.has(l.b.hostname));
            const p = st.positions.get(link.a.hostname), q = st.positions.get(link.b.hostname); const mid = LD.geometry.curve(p, q, link).mid;
            const r = document.getElementById('canvas').getBoundingClientRect();
            return { x: r.left + mid.x * st.view.k + st.view.tx, y: r.top + mid.y * st.view.k + st.view.ty }; })()"""),
        ("view-node", """(() => { const st = LD.app.graph.state, m = LD.app.model; const n = m.nodes.find((n) => (m.haMembershipsByHost.get(n.hostname) || []).length);
            const p = st.positions.get(n.hostname); const r = document.getElementById('canvas').getBoundingClientRect();
            return { x: r.left + p.x * st.view.k + st.view.tx, y: r.top + p.y * st.view.k + st.view.ty }; })()""")):
        at = tab.js(expr)
        print(name, at)
        if not at: continue
        tab.mouse_move(at["x"] - 2, at["y"] - 2); tab.mouse_move(at["x"], at["y"]); threading.Event().wait(0.3)
        print(name, tab.js(f"{TIP}.getAttribute('visibility')"), tab.js(f"{TIP}.textContent")[:160])
        if tab.js(f"{TIP}.getAttribute('visibility')") == "visible": shot(tab, OUT / f"{name}.png")
        tab.mouse_move(5, 500); threading.Event().wait(0.2)
    print("console:", chrome.console[:3])
