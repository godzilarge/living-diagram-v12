"""Le délai avant la première apparition, l'enchaînement sans délai d'un élément à l'autre, Échap qui cache."""
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
vis = lambda tab: tab.js(f"{TIP}.getAttribute('visibility')")
server, thread, base = _serve(Settings(api_token=TOKEN, archive_dir=OUT / "archive", max_bundle_bytes=50_000_000))
try:
    httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / "run-03.json").read_bytes(), headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}, timeout=120)
    with Chrome(CHROMIUM) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.navigate(f"{base}/?infrastructure=demo-dc"); _wait(tab, READY); _wait(tab, "document.querySelectorAll('.react-flow__node-card').length > 1"); threading.Event().wait(3.0)
        cards = tab.js("Array.from(document.querySelectorAll('.react-flow__node-card')).map(e => { const r = e.getBoundingClientRect(); return {x: r.left + r.width * 0.35, y: r.top + r.height / 2}; }).filter(c => c.y > 120 && c.y < 700 && c.x > 420 && c.x < 1000).slice(0, 2)")
        a, b = cards
        tab.mouse_move(a["x"] - 3, a["y"] - 3); tab.mouse_move(a["x"], a["y"])
        print("juste après le survol (délai en cours) :", vis(tab))
        threading.Event().wait(0.4); print("après 400 ms :", vis(tab), "transform", tab.js(f"{TIP}.getAttribute('transform')"))
        tab.mouse_move(a["x"] + 6, a["y"] + 4); threading.Event().wait(0.05)
        print("le pointeur bouge sur le même élément : transform", tab.js(f"{TIP}.getAttribute('transform')"), "(posée : inchangé)")
        tab.mouse_move(b["x"], b["y"]); print("vers un autre équipement, tout de suite :", vis(tab))
        threading.Event().wait(0.3)
        tab.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27}); tab.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27})
        threading.Event().wait(0.05); print("après Échap :", vis(tab))
        tab.mouse_move(5, 400); threading.Event().wait(0.4)
        tab.mouse_move(b["x"] - 3, b["y"] - 3); tab.mouse_move(b["x"], b["y"]); print("nouveau survol après une pause : tout de suite", vis(tab)); threading.Event().wait(0.4); print("après 400 ms :", vis(tab))
        print("console :", [c for c in chrome.console if c.get("type") == "error"][:3])
finally:
    server.should_exit = True; thread.join(timeout=10)
