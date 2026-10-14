"""Lot 5 (docs/11) : lisibilité des cartes. Mesure la taille rendue du nom (taille de police calculée × échelle de la
toile, sur le texte du nom effectivement affiché) à l'ouverture, à « cadrer tout » et sous 0,4, sur demo-dc et sur une
série du générateur à 60 équipements ; prend les captures. Lancer depuis backend/ :
PYTHONPATH=. uv run python <ce fichier> <dossier de sortie> <bundle à 60 équipements> [--no-shots] [--light]"""
from __future__ import annotations
import json, sys, tempfile, threading
from pathlib import Path
import httpx
from ld_backend.config import Settings
from tests.browser import Chrome
from tests.conftest import TOKEN
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
S60 = Path(sys.argv[2])
SHOTS = "--no-shots" not in sys.argv
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
ZOOM = "LDApp.debug.handle().toile.view().zoom"
# la taille rendue des noms de carte affichés : police calculée × échelle écran, min / max sur les cartes
MEASURE = """(() => {
  const sizes = [];
  document.querySelectorAll('.react-flow__node-card svg.node').forEach((svg) => {
    const shown = Array.from(svg.querySelectorAll('text')).filter((t) => /node-label/.test(t.getAttribute('class') || '') && getComputedStyle(t).display !== 'none');
    shown.forEach((t) => sizes.push(parseFloat(getComputedStyle(t).fontSize) * t.getScreenCTM().a));
  });
  const flow = document.querySelector('.react-flow');
  return { min: Math.min(...sizes), max: Math.max(...sizes), n: sizes.length, lod: ['zoom-far', 'zoom-tiny'].filter((c) => flow.classList.contains(c)).join(' ') || 'normal' };
})()"""

def zoom_of(tab):
    return tab.js("(() => { const t = document.querySelector('.react-flow__viewport').style.transform; const m = /scale\\(([^)]+)\\)/.exec(t); return m ? parseFloat(m[1]) : null; })()")

settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot5-")), max_bundle_bytes=30_000_000)
server, thread, base = _serve(settings)
results = []
try:
    auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    for path in [PROJECT / "samples/demo-dc" / f"run-0{i}.json" for i in (1, 2, 3)] + [S60]:
        r = httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=auth, timeout=120)
        print(path.name, r.status_code)
    s60 = json.loads(S60.read_text())["infrastructure"]
    light = "--light" in sys.argv
    with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        for infra, tag in (("demo-dc", "demo-dc"), (s60, "s60")):
            tab.navigate(f"{base}/?infrastructure={infra}")
            _wait(tab, READY); threading.Event().wait(1.5)
            results.append((tag, "ouverture", zoom_of(tab), tab.js(MEASURE)))
            if SHOTS: tab.screenshot(OUT / f"1-ouverture-{tag}.png")
            tab.js("document.querySelector(\".toolbar button[aria-label='cadrer tout']\").click()"); threading.Event().wait(1.2)
            results.append((tag, "cadrer tout", zoom_of(tab), tab.js(MEASURE)))
            if SHOTS: tab.screenshot(OUT / f"2-cadrer-tout-{tag}.png")
            if tag == "demo-dc":
                # sous 0,4 et près du plancher de lecture (1/3) : la molette vers l'arrière au milieu de la toile
                for _ in range(30):
                    if zoom_of(tab) < 0.36: break
                    tab.call("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": 720, "y": 470, "deltaX": 0, "deltaY": 120})
                    threading.Event().wait(0.15)
                threading.Event().wait(0.8)
                results.append((tag, "molette", zoom_of(tab), tab.js(MEASURE)))
                if SHOTS: tab.screenshot(OUT / "3-zoom-tiny.png")
        if light:
            tab.navigate(f"{base}/?infrastructure=demo-dc")
            _wait(tab, READY)
            chrome_w = (1280, 800)
            tab.call("Emulation.setDeviceMetricsOverride", {"width": chrome_w[0], "height": chrome_w[1], "deviceScaleFactor": 1, "mobile": False})
            tab.js("localStorage.setItem('ld-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('ld-prefs') || '{}'), theme: 'light' }))")
            tab.navigate(f"{base}/?infrastructure=demo-dc")
            _wait(tab, READY); threading.Event().wait(1.2)
            tab.js("document.querySelector(\".toolbar button[aria-label='cadrer tout']\").click()"); threading.Event().wait(1.2)
            results.append(("demo-dc 1280 clair", "cadrer tout", zoom_of(tab), tab.js(MEASURE)))
            if SHOTS: tab.screenshot(OUT / "2-cadrer-tout-demo-dc-clair-1280.png")
        print("console:", [c for c in chrome.console if "Refused" in json.dumps(c)][:3])
finally:
    server.should_exit = True; thread.join(timeout=5)
for tag, moment, z, m in results:
    print(f"{tag:22} {moment:12} zoom {z:.3f}  nom rendu {m['min']:.1f} à {m['max']:.1f} px ({m['n']} cartes, niveau {m['lod']})")
