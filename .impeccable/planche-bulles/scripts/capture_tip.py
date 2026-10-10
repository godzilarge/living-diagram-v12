"""Captures de la bulle au survol dans l'application, sur demo-dc : câble, équipement, faisceau, cluster, deux vues.
Usage : cd backend && uv run python <ce fichier> OUT_DIR [light]"""
from __future__ import annotations

import base64
import json
import sys
import threading
from pathlib import Path

import httpx

from ld_backend.config import Settings
from tests.browser import Chrome
from tests.test_render import CHROMIUM
from tests.test_view import _serve, _wait

ROOT = Path(__file__).resolve()
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
SAMPLES = PROJECT / "samples" / "demo-dc"
OUT = Path(sys.argv[1])
LIGHT = len(sys.argv) > 2 and sys.argv[2] == "light"
OUT.mkdir(parents=True, exist_ok=True)
TOKEN = "tok-capture"
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"

MID = """(() => { const want = {id}; const g = Array.from(document.querySelectorAll('.react-flow__edge')).find(e => e.getAttribute('data-id') === want);
  const el = g && g.querySelector({inner}); if (!el) return null;
  const p = el.getPointAtLength(el.getTotalLength() * {t}); const q = p.matrixTransform(el.getScreenCTM());
  return { x: q.x, y: q.y }; })()"""
TIP = "document.getElementById('ld-tip')"


def settle(ms: float = 0.25) -> None:
    threading.Event().wait(ms)


def clip_shot(tab, path: Path, pad: int = 24) -> None:
    r = tab.js(f"(() => {{ const r = {TIP}.getBoundingClientRect(); return {{x: r.left, y: r.top, w: r.width, h: r.height}}; }})()")
    clip = {"x": max(0, r["x"] - pad), "y": max(0, r["y"] - pad), "width": r["w"] + 2 * pad, "height": r["h"] + 2 * pad, "scale": 2}
    data = tab.call("Page.captureScreenshot", {"format": "png", "clip": clip})["data"]
    path.write_bytes(base64.b64decode(data))


def hover_and_shoot(tab, name: str, x: float, y: float) -> None:
    tab.mouse_move(x - 2, y - 2)
    tab.mouse_move(x, y)
    settle()
    vis = tab.js(f"{TIP}.getAttribute('visibility')")
    if vis != "visible":
        settle(0.5); tab.mouse_move(x + 1, y + 1); tab.mouse_move(x, y); settle()
        vis = tab.js(f"{TIP}.getAttribute('visibility')")
    text = tab.js(f"{TIP}.textContent")
    print(f"--- {name}: visibility={vis}\n{text}\n")
    if vis == "visible":
        clip_shot(tab, OUT / f"{name}.png")
        tab.screenshot(OUT / f"{name}-full.png")
    tab.mouse_move(5, 400)  # loin de tout
    settle(0.1)


def link_mid(tab, link_id: str, t: float = 0.5) -> dict | None:
    return tab.js(MID.replace("{id}", json.dumps("link:" + link_id)).replace("{inner}", json.dumps(".link-line")).replace("{t}", str(t)))


def main() -> None:
    archive = OUT / "archive"
    settings = Settings(api_token=TOKEN, archive_dir=archive, max_bundle_bytes=50_000_000)
    server, thread, base = _serve(settings)
    try:
        auth = {"Authorization": f"Bearer {TOKEN}"}
        for f in ("run-01.json", "run-02.json", "run-03.json"):
            r = httpx.post(f"{base}/api/ingest/bundles", content=(SAMPLES / f).read_bytes(), headers={**auth, "Content-Type": "application/json"}, timeout=120)
            assert r.status_code in (200, 201), r.text[:300]
        with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
            tab = chrome.open(f"{base}/")
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            if LIGHT:
                tab.js("localStorage.setItem('ld-prefs', JSON.stringify({theme: 'light'}))")
            for mode in ("diagram", "control"):
                frag = "#beams=1&stubs=1&mode=control" if mode == "control" else "#beams=1&stubs=1"
                tab.navigate(f"{base}/?infrastructure=demo-dc{frag}")
                _wait(tab, READY)
                _wait(tab, "document.querySelectorAll('.react-flow__edge').length > 0")
                settle(1.0)
                tab.js("LDApp.debug.handle().toile.fit()")
                settle(0.6)
                links = tab.js("""(() => { const m = LDApp.debug.state().run.model; return m.links.filter(l => !l.ghost).map(l => ({id: l.id, a: l.a, b: l.b, status: l.status, checks: l.checks.length, beam: !!l.beam, change: !!m.changeOf('link', l.id)})); })()""")
                nodes = tab.js("""(() => { const m = LDApp.debug.state().run.model; return m.nodes.map(n => ({h: n.hostname, kind: n.kind, type: n.type, ha: (m.haMembershipsByHost.get(n.hostname)||[]).length, stack: !!n.stack, checks: (m.checksByNode.get(n.hostname)||[]).length, change: !!m.changeOf('node', n.hostname)})); })()""")
                # un câble confirmé entre deux équipements collectés, hors faisceau ; un avec contrôles ; un vers un stub ; un changé
                def pick(pred):
                    for l in links:
                        if pred(l):
                            return l
                    return None
                stubs = {n["h"] for n in nodes if n["kind"] == "stub"}
                plain = pick(lambda l: l["status"] == "confirmed" and not l["beam"] and l["checks"] == 0 and l["a"]["hostname"] not in stubs and l["b"]["hostname"] not in stubs)
                checked = pick(lambda l: l["checks"] > 0 and l["a"]["hostname"] not in stubs and l["b"]["hostname"] not in stubs)
                to_stub = pick(lambda l: l["a"]["hostname"] in stubs or l["b"]["hostname"] in stubs)
                changed = pick(lambda l: l["change"])
                documented = pick(lambda l: l["status"] == "documented_only")
                for name, l in (("link-plain", plain), ("link-checked", checked), ("link-stub", to_stub), ("link-changed", changed), ("link-documented", documented)):
                    if not l:
                        print(f"--- {name}: aucun candidat"); continue
                    tab.js(f"LDApp.debug.handle().toile.open({json.dumps({'kind': 'link', 'id': l['id']})}); LDApp.debug.handle().toile.select(null)")
                    settle(0.5)
                    at = link_mid(tab, l["id"], 0.5) or link_mid(tab, l["id"], 0.35)
                    if not at:
                        print(f"--- {name}: câble introuvable à l'écran"); continue
                    hover_and_shoot(tab, f"{mode}-{name}", at["x"], at["y"])
                # équipements : un firewall en cluster HA, un switch en stack, un avec contrôles, un stub
                fw = next((n for n in nodes if n["ha"] > 0), None)
                stack = next((n for n in nodes if n["stack"]), None)
                bad = next((n for n in nodes if n["checks"] > 0 and n["kind"] == "device"), None)
                stub = next((n for n in nodes if n["kind"] == "stub"), None)
                for name, n in (("node-ha", fw), ("node-stack", stack), ("node-checked", bad), ("node-stub", stub)):
                    if not n:
                        print(f"--- {name}: aucun candidat"); continue
                    tab.js(f"LDApp.debug.handle().toile.open({json.dumps({'kind': 'node', 'id': n['h']})}); LDApp.debug.handle().toile.select(null)")
                    settle(0.5)
                    c = tab.js(f"(() => {{ const el = Array.from(document.querySelectorAll('.react-flow__node')).find(e => e.getAttribute('data-id') === {json.dumps(n['h'])}); if (!el) return null; const r = el.getBoundingClientRect(); return {{x: r.left + r.width/2, y: r.top + r.height/2}}; }})()")
                    if not c:
                        print(f"--- {name}: nœud introuvable"); continue
                    hover_and_shoot(tab, f"{mode}-{name}", c["x"], c["y"])
                # faisceau : le peer-link ; cluster : le premier
                beam = tab.js("(() => { const m = LDApp.debug.state().run.model; const b = m.beams.find(b => b.peerLink) || m.beams[0]; return b ? {id: b.id} : null; })()")
                if beam:
                    tab.js(f"LDApp.debug.handle().toile.open({json.dumps({'kind': 'beam', 'id': beam['id']})}); LDApp.debug.handle().toile.select(null)")
                    settle(0.5)
                    at = tab.js(f"""(() => {{ const g = Array.from(document.querySelectorAll('.react-flow__edge')).find(e => e.getAttribute('data-id') === {json.dumps("beamlabel:" + beam["id"])});
                      const el = g && g.querySelector('.beam-label-hit'); if (!el) return null; const r = el.getBoundingClientRect(); return {{x: r.left + r.width / 2, y: r.top + r.height / 2}}; }})()""")
                    print("beam label at", at)
                    if at:
                        hover_and_shoot(tab, f"{mode}-beam", at["x"], at["y"])
                cluster = tab.js("(() => { const m = LDApp.debug.state().run.model; const c = m.clusters[0]; return c ? {id: c.id} : null; })()")
                print("cluster:", cluster, "stub:", stub, "stub nodes:", tab.js("document.querySelectorAll('.react-flow__node-stub').length"))
                if cluster:
                    tab.js(f"LDApp.debug.handle().toile.open({json.dumps({'kind': 'cluster', 'id': cluster['id']})}); LDApp.debug.handle().toile.select(null)")
                    settle(0.5)
                    r = tab.js(f"(() => {{ const el = Array.from(document.querySelectorAll('.react-flow__node')).find(e => e.getAttribute('data-id') === {json.dumps('cluster:' + cluster['id'])}); if (!el) return null; const r = el.getBoundingClientRect(); return {{x: r.left + 40, y: r.top + 12}}; }})()")
                    print("cluster at", r)
                    if r:
                        hover_and_shoot(tab, f"{mode}-cluster", r["x"], r["y"])
            print("console:", [c for c in chrome.console if c.get("type") in ("error",) or "exception" in json.dumps(c)][:5])
    finally:
        server.should_exit = True
        thread.join(timeout=10)


main()
