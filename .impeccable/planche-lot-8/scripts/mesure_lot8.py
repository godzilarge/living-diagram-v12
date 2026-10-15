"""Lot 8 (docs/11) : ce que coûtent les repères à la jauge. Sur la série du générateur (500 équipements, `generate --seed 7
--devices 500 --runs 1`), au zoom de travail (1) autour d'un cœur : le glissé réel d'une carte (60 mouvements à ~16 ms,
le compteur d'images du lot 13), repères allumés puis éteints, trois passages chacun ; et dans la page, le temps d'un pas
de calcul des repères (`placeMove`) avec 400 candidates, et celui de la photographie des candidates au début d'un geste
(toutes les cartes, la vue élargie, les 400 plus proches). La version de la toile pendant le glissé est relevée : les
repères ne la reconstruisent pas. Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <sortie.json> <bundle>"""
from __future__ import annotations

import json
import statistics
import sys
import tempfile
import threading
from pathlib import Path

import httpx

from ld_backend.config import Settings
from tests.browser import Chrome
from tests.conftest import TOKEN
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

OUT = Path(sys.argv[1])
BUNDLE = Path(sys.argv[2])
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
H = "LDApp.debug.handle().toile"
wait = lambda s: threading.Event().wait(s)  # noqa: E731
FRAMES = """window.__frames = (async () => {
  const t = []; let go = true; window.__stopFrames = () => { go = false; };
  await new Promise((done) => { const step = (now) => { t.push(now); if (go) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  const span = t[t.length - 1] - t[0];
  return { frames: gaps.length, fps: gaps.length / (span / 1000), max: Math.max(...gaps), over100: gaps.filter((g) => g > 100).length };
})(); 0"""
# Dans la page : les candidates d'un geste (toutes les cartes, vue élargie, 400 plus proches), puis un pas de calcul.
COMPUTE = """(() => {
  const g = LDApp.guides, t = %s, host = %s, c = t.state.positions.get(host), b = t.boxes.get(host);
  const box = { x: c.x - b.w / 2, y: c.y - b.h / 2, w: b.w, h: b.h };
  const all = []; t.state.positions.forEach((p, id) => { const q = t.boxes.get(id); if (q && id !== host) all.push({ id, box: { x: p.x - q.w / 2, y: p.y - q.h / 2, w: q.w, h: q.h }, spaced: true }); });
  const v = t.viewport(), r = document.querySelector('.flow-host .react-flow').getBoundingClientRect();
  let t0 = performance.now(), cands = null;
  for (let i = 0; i < 50; i++) cands = g.pickCandidates(all, g.viewZone(v, r), box);
  const pick = (performance.now() - t0) / 50;
  const wide = g.pickCandidates(all, { x: -1e6, y: -1e6, w: 2e6, h: 2e6 }, box);
  t0 = performance.now();
  for (let i = 0; i < 500; i++) g.placeMove({ ...box, x: box.x + (i %% 9), y: box.y + (i %% 5) }, wide, { guides: true, free: false, grid: 20, tol: 8 });
  const step400 = (performance.now() - t0) / 500;
  return { cards: all.length, zone: cands.length, pick_ms: pick, step_ms_400: step400, n400: wide.length };
})()"""


def mouse(tab, kind: str, x: float, y: float, buttons: int) -> None:
    tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1})


def drag_frames(tab, start: tuple[float, float]) -> dict:
    x, y = start
    tab.mouse_move(x, y)
    mouse(tab, "mousePressed", x, y, 1)
    v0 = tab.js(f"{H}.version()")
    tab.js(FRAMES)
    guides = 0
    for i in range(1, 61):
        mouse(tab, "mouseMoved", x + 3 * i, y + 1.5 * i, 1)
        wait(0.016)
        if i == 40:
            guides = tab.js("document.querySelector('.guide-layer').dataset.guides === 'on'")
    tab.js("window.__stopFrames()")
    v1 = tab.js(f"{H}.version()")
    mouse(tab, "mouseReleased", x + 180, y + 90, 0)
    got = tab.js("window.__frames")
    got["toile_versions_during"] = v1 - v0
    got["layer_on"] = guides
    wait(1.5)
    key = {"key": "z", "code": "KeyZ", "windowsVirtualKeyCode": 90, "modifiers": 2}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **key})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **key})
    wait(1.0)
    return got


settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot8m-")), max_bundle_bytes=30_000_000)
server, thread, base = _serve(settings)
out: dict = {}
try:
    auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    print(httpx.post(f"{base}/api/ingest/bundles", content=BUNDLE.read_bytes(), headers=auth, timeout=180).status_code)
    infra = json.loads(BUNDLE.read_text())["devices"][0]["infrastructure"]
    with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
        tab = chrome.open(f"{base}/")
        _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
        tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
        tab.js("localStorage.setItem('ld-author', 'orhan')")
        tab.navigate(f"{base}/?infrastructure={infra}")
        _wait(tab, READY); wait(3.0)
        host = tab.js(f"Array.from({H}.state.positions.keys()).filter((h) => /core-01$/.test(h)).sort()[0]")
        near = tab.js(f"(() => {{ const t = {H}, c = t.state.positions.get({json.dumps(host)}); return Array.from(t.state.positions.entries()).filter(([h]) => t.boxes.get(h) && t.boxes.get(h).w > 60).sort((a, b) => Math.hypot(a[1].x - c.x, a[1].y - c.y) - Math.hypot(b[1].x - c.x, b[1].y - c.y)).slice(0, 6).map(([h]) => h); }})()")
        card = near[2]
        out["compute"] = tab.js(COMPUTE % (H, json.dumps(card)))
        print("calcul", out["compute"])

        def centre_on(h: str) -> tuple[float, float]:
            tab.js(f"{H}.select(null)")
            tab.js(f"(() => {{ const t = {H}, c = t.state.positions.get({json.dumps(h)}), r = document.querySelector('.flow-host .react-flow').getBoundingClientRect(); t.restoreView({{ zoom: 1, x: r.width / 2 - 200 - c.x, y: r.height / 2 - 100 - c.y }}); }})()")
            wait(1.0)
            r = tab.js(f"JSON.parse(JSON.stringify(document.querySelector('.react-flow__node[data-id={json.dumps(h)}]').getBoundingClientRect()))")
            return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2

        for label, on in (("guides_on", True), ("guides_off", False), ("guides_on_again", True)):
            tab.js(f"LDApp.debug.state() && document.querySelector('.controls') && (() => {{ const b = Array.from(document.querySelectorAll('.controls button')).find((x) => x.ariaLabel === \"repères d'alignement\"); if ((b.getAttribute('aria-pressed') === 'true') !== {json.dumps(on)}) b.click(); }})()")
            wait(0.5)
            runs = [drag_frames(tab, centre_on(card)) for _ in range(3)]
            out[label] = runs
            print(label, [(round(r["fps"], 1), round(r["max"]), r["over100"], r["toile_versions_during"], r["layer_on"]) for r in runs])
        out["summary"] = {k: {"fps_median": round(statistics.median(r["fps"] for r in out[k]), 1), "max_ms": round(max(r["max"] for r in out[k]))} for k in ("guides_on", "guides_off", "guides_on_again")}
        print(out["summary"])
finally:
    server.should_exit = True
OUT.write_text(json.dumps(out, indent=2))
