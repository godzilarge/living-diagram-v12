import json, sys, threading
from pathlib import Path
import httpx
from ld_backend.config import Settings
from tests.browser import Chrome
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait
SAMPLES = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo/samples/demo-dc")
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
TOKEN = "tok"
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
TIP = "document.getElementById('ld-tip')"
def st(tab, label):
    print(label, tab.js("performance.now().toFixed(0)"), "same:", tab.js(f"window.__tip === {TIP}"), "class:", tab.js(f"{TIP}.getAttribute('class')"), "vis:", tab.js(f"{TIP}.getAttribute('visibility')"),
          "anim:", tab.js("getComputedStyle(document.querySelector('#ld-tip .tip-body')).animationName"), "opacity:", tab.js("getComputedStyle(document.querySelector('#ld-tip .tip-body')).opacity"))
server, thread, base = _serve(Settings(api_token=TOKEN, archive_dir=OUT / "archive", max_bundle_bytes=50_000_000))
try:
    httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / "run-03.json").read_bytes(), headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, timeout=120)
    with Chrome(CHROMIUM) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.navigate(f"{base}/?infrastructure=demo-dc")
        _wait(tab, READY); _wait(tab, "document.querySelectorAll('.react-flow__node-card').length > 1")
        tab.js(f"window.__tip = {TIP}")
        for i in range(6):
            threading.Event().wait(1.0); print("t+", i + 1, "s same element:", tab.js(f"window.__tip === {TIP}"), "connected:", tab.js("window.__tip.isConnected"))
        tab.js(f"window.__tip = {TIP}")
        centers = tab.js("Array.from(document.querySelectorAll('.react-flow__node-card')).slice(0, 2).map(e => { const r = e.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })")
        tab.js("""window.__log = []; new MutationObserver((muts) => muts.forEach((m) => window.__log.push([performance.now().toFixed(0), m.attributeName, m.target.getAttribute(m.attributeName)]))).observe(document.getElementById('ld-tip'), { attributes: true, attributeFilter: ['visibility'] })""")
        c0, c1 = centers
        tab.mouse_move(c0["x"] - 2, c0["y"] - 2); tab.mouse_move(c0["x"], c0["y"]); threading.Event().wait(0.3); st(tab, "A: survol 1 (2 moves), +300 ms")
        tab.mouse_move(c0["x"] + 1, c0["y"] + 1); threading.Event().wait(0.3); st(tab, "B: +1 px dans le même nœud, +300 ms")
        tab.mouse_move(5, 500); threading.Event().wait(0.2)
        tab.mouse_move(c0["x"] - 2, c0["y"] - 2); tab.mouse_move(c0["x"], c0["y"]); threading.Event().wait(0.3); st(tab, "C: re-survol du nœud 0, +300 ms")
        tab.mouse_move(5, 500); threading.Event().wait(0.2)
        tab.mouse_move(c1["x"] - 2, c1["y"] - 2); tab.mouse_move(c1["x"], c1["y"]); threading.Event().wait(0.3); st(tab, "D: survol du nœud 1, +300 ms")
        tab.mouse_move(5, 500); threading.Event().wait(0.2)
        tab.mouse_move(c1["x"] - 2, c1["y"] - 2); tab.mouse_move(c1["x"], c1["y"]); threading.Event().wait(0.3); st(tab, "E: re-survol du nœud 1, +300 ms")
        print("journal :", tab.js("JSON.stringify(window.__log)"))
        print("console :", chrome.console[:3])
finally:
    server.should_exit = True; thread.join(timeout=10)
