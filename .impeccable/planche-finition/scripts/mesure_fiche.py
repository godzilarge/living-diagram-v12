"""Passe de finition du 2026-10-15 : la mesure de l'audit (`critique-2026-10-15/audit/scripts/audit_perf.py`) rejouée
après le fenêtrage de la fiche ; seule l'attente change (la fiche ne rend plus que sa fenêtre : on attend sa première
ligne et le compte rendu, plus 2 000 lignes). Le reste est la mesure d'origine.

Audit du 2026-10-15, performance (Chromium sans écran, sans GPU) : un bloc de code de 2 000 lignes (défilement à la
molette, ouverture de sa fiche) et le panoramique avec la barre contextuelle montrée, sur demo-dc puis sur la jauge
(500 équipements, `ld-contracts generate --seed 7`). Les repères pendant un glissé se mesurent avec le script du lot 8
(`.impeccable/planche-lot-8/scripts/mesure_lot8.py`), relancé tel quel. Lancer depuis backend/ :
PYTHONPATH=. uv run python <ce fichier> <bundle 500>"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / ".impeccable" / "planche-lot-16" / "scripts"))
from scene import PYTHON, READY, code, wait, wheel  # noqa: E402

from ld_backend.config import Settings  # noqa: E402
from tests.browser import Chrome  # noqa: E402
from tests.conftest import TOKEN  # noqa: E402
from tests.test_render import CHROMIUM  # noqa: E402
from tests.test_view import _serve, _wait  # noqa: E402

AUTH = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
H = "LDApp.debug.handle().toile"
BIG = "\n".join(f"vlan {1000 + i}" for i in range(2000))  # 2 000 lignes, 19 999 caractères (borne du contrat : 20 000)
FRAMES = """window.__frames = (async () => {
  const t = []; let go = true; window.__stopFrames = () => { go = false; };
  const longs = []; const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration))); try { po.observe({ type: 'longtask', buffered: false }); } catch (e) {}
  await new Promise((done) => { const step = (now) => { t.push(now); if (go) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  po.disconnect();
  const gaps = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  const span = t[t.length - 1] - t[0];
  return { frames: gaps.length, fps: Math.round(gaps.length / (span / 1000) * 10) / 10, p50: Math.round(gaps[Math.floor(gaps.length / 2)]), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]), max: Math.round(gaps[gaps.length - 1]), longtasks: longs.length, longest: Math.round(Math.max(0, ...longs)) };
})(); 0"""
OPEN = """(async () => {
  const el = document.querySelector(%s); const want = %d;
  const longs = []; const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration))); try { po.observe({ type: 'longtask' }); } catch (e) {}
  const t0 = performance.now(); el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  let tBar = null;
  await new Promise((r) => { const step = () => { if (tBar === null && document.querySelector('.fbar .fb')) tBar = performance.now() - t0; if (document.querySelectorAll('.panel .insp-code .ln').length >= Math.min(want, 30)) requestAnimationFrame(() => r()); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  const t = performance.now() - t0; po.disconnect();
  return { fiche_ms: Math.round(t), barre_ms: Math.round(tBar), lignes_dom: document.querySelectorAll('.panel .insp-code .ln').length, spans_dom: document.querySelectorAll('.panel .insp-code span').length, longest_task: Math.round(Math.max(0, ...longs)) };
})()"""
PAN = """(async () => {
  const t = %s, v0 = t.viewport(); const gaps = []; let last = performance.now();
  for (let i = 0; i < 90; i++) { await new Promise((r) => requestAnimationFrame(r)); const now = performance.now(); gaps.push(now - last); last = now; t.restoreView({ x: v0.x + Math.sin(i / 8) * 120, y: v0.y + i, zoom: v0.zoom }); }
  t.restoreView(v0); gaps.sort((a, b) => a - b);
  return { p50: Math.round(gaps[45]), p95: Math.round(gaps[85]), max: Math.round(gaps[89]) };
})()"""


def ingest(base: str, paths: list[Path]) -> str:
    for p in paths:
        r = httpx.post(f"{base}/api/ingest/bundles", content=p.read_bytes(), headers=AUTH, timeout=180)
        assert r.status_code in (200, 201), r.text
    return json.loads(paths[-1].read_text())["devices"][0]["infrastructure"]


def seed(base: str, infra: str, at: dict) -> tuple[str, str]:
    x, y = round(at["x"]) + 300, round(at["y"]) - 200
    ops = [{"op": "annotation_create", "content": code(BIG, "cisco_ios", "vlans"), "x": x, "y": y, "w": 520, "h": 420},
           {"op": "annotation_create", "content": code(PYTHON, "python", "petit"), "x": x + 600, "y": y, "w": 520, "h": 360}]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infra}, headers=AUTH, json={"author": "orhan", "ops": ops}, timeout=30)
    r.raise_for_status()
    big, small = [a["id"] for a in r.json()["annotations"]][-2:]
    return big, small


def measure(tab, base: str, infra: str) -> dict:
    out: dict = {}
    tab.navigate(f"{base}/?infrastructure={infra}")
    _wait(tab, READY)
    wait(3.0)
    core = tab.js(f"(() => {{ const t = {H}; const h = Array.from(t.state.positions.keys()).filter((k) => /core-01$/.test(k)).sort()[0]; return JSON.parse(JSON.stringify(t.state.positions.get(h))); }})()")
    big, small = seed(base, infra, core)
    tab.navigate(f"{base}/?infrastructure={infra}")
    _wait(tab, READY)
    wait(3.0)
    out["cartes montées"] = tab.js("document.querySelectorAll('.react-flow__node').length")
    w, h = tab.js("[innerWidth, innerHeight]")
    for name, ident, n in (("petit (15 lignes)", small, 15), ("grand (2 000 lignes)", big, 2000)):
        tab.js(f"{H}.select(null)")
        f = tab.js(f"JSON.parse(JSON.stringify({H}.frames.get({json.dumps(ident)})))")
        tab.js(f"{H}.restoreView({{ x: {w / 2 - 170 - (f['x'] + f['w'] / 2)}, y: {h / 2 + 40 - (f['y'] + f['h'] / 2)}, zoom: 1 }})")
        wait(1.2)
        sel = f".react-flow__node[data-id='annotation:{ident}'] svg.annotation"
        runs = []
        for _ in range(3):
            tab.js(f"{H}.select(null)")
            wait(0.8)
            runs.append(tab.js(OPEN % (json.dumps(sel), n)))
        out[f"ouvrir la fiche, {name}"] = runs
    # défilement à la molette du grand bloc, sélectionné seul : 60 crans de 100 à ~16 ms
    r = tab.js(f"JSON.parse(JSON.stringify(document.querySelector(\".react-flow__node[data-id='annotation:{big}'] svg.annotation\").getBoundingClientRect()))")
    cx, cy = r["x"] + r["width"] / 2, r["y"] + r["height"] / 2
    tab.mouse_move(cx, cy)
    for label in ("molette, grand bloc, passage 1", "molette, grand bloc, passage 2"):
        tab.js(FRAMES)
        for _ in range(60):
            wheel(tab, cx, cy, 100)
            wait(0.016)
        tab.js("window.__stopFrames()")
        got = tab.js("window.__frames")
        got["première ligne"] = tab.js(f"LDApp.code && LDApp.code.view ? LDApp.code.view.first({json.dumps(big)}) : document.querySelector(\".react-flow__node[data-id='annotation:{big}'] .code-foot-hint\").textContent")
        out[label] = got
    # le panoramique, barre contextuelle montrée (le grand bloc sélectionné) puis rien de sélectionné
    out["panoramique, barre montrée"] = tab.js(PAN % H)
    tab.js(f"{H}.select(null)")
    wait(0.8)
    out["panoramique, rien de sélectionné"] = tab.js(PAN % H)
    return out


def main() -> None:
    s500 = Path(sys.argv[1])
    report: dict = {}
    for label, paths in (("demo-dc", sorted((ROOT / "samples" / "demo-dc").glob("run-*.json"))), ("jauge 500", [s500])):
        settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-audit-perf-")), max_bundle_bytes=30_000_000)
        server, thread, base = _serve(settings)
        try:
            infra = ingest(base, paths)
            with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
                tab = chrome.open(f"{base}/")
                _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
                tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
                tab.js("localStorage.setItem('ld-author', 'orhan')")
                report[label] = measure(tab, base, infra)
                print(label, json.dumps(report[label], ensure_ascii=False))
        finally:
            server.should_exit = True
            thread.join(timeout=5)
    (HERE.parent / "mesures-perf-apres.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
