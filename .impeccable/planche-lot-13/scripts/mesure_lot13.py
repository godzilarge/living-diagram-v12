"""Lot 13 (docs/11) : la performance de la toile React Flow à la jauge. Mesures dans Chromium sans écran, sur demo-dc et
sur une série du générateur à 500 équipements (`ld-contracts generate --seed 7 --devices 500 --runs 1`), gestes réels
(souris et clavier par le protocole DevTools), temps lus par la page (`performance.now`, images comptées par
`requestAnimationFrame`) et `Performance.getMetrics` (mémoire, temps de script).

Ce qui est mesuré, trois passages par geste (médiane, min, max) :
- premier dessin : de la navigation à toutes les cartes peintes (aucune cachée), à la première ouverture (placement
  calculé) puis à la suivante (placement mémorisé) ; avec le moment où la toile existe (données, modèle, placement) ;
- sélection : du clic (pointerdown) à la fiche ouverte peinte, et à la barre contextuelle peinte ;
- flèche : de la touche à la sélection déplacée et peinte, pour 1 équipement et pour 20 ;
- collage : de Ctrl+V à 20 notes et 10 connecteurs collés, sélectionnés et peints (deux requêtes) ;
- glissé : 60 mouvements à ~16 ms d'une carte seule, d'un bloc de 20, d'un cadre de groupe de 10 membres : images
  comptées pendant le geste (images/s, intervalle moyen, maximum, images > 100 ms) ;
- cadrer tout : du clic sur « cadrer tout » à la vue peinte ;
- mémoire : tas JS après ramasse-miettes, nœuds DOM.

Lancer depuis backend/ : PYTHONPATH=. uv run python <ce fichier> <dossier de sortie> <bundle à 500 équipements> <étiquette>
Écrit <dossier>/mesures-<étiquette>.json et imprime le tableau."""
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

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
S500 = Path(sys.argv[2])
LABEL = sys.argv[3] if len(sys.argv) > 3 else "mesure"
PASSES = 3
PROJECT = Path("/home/otosun/development/applications/demo/living-diagram-v12-biturbo")
READY = "!!(globalThis.LDApp && LDApp.debug.state() && LDApp.debug.state().run.kind === 'ready' && LDApp.debug.handle())"
NOTE = "(LDApp.debug.state().note || {text: ''}).text"
SHOWN = "!!document.querySelector('.fbar:not(.suspended):not(.offscreen)')"
CTRL = 2
wait = lambda s: threading.Event().wait(s)  # noqa: E731

# Posé avant la page : une boucle d'images note le moment où la toile existe et celui où toutes ses cartes sont peintes.
WATCH = """(() => {
  window.__lt = { handle: 0, drawn: 0 };
  const step = (now) => {
    const lt = window.__lt;
    if (!lt.handle && globalThis.LDApp && LDApp.debug.handle()) lt.handle = now;
    if (lt.handle && !lt.drawn) {
      const all = document.querySelectorAll('.react-flow__node-card');
      if (all.length && !document.querySelector('.react-flow__node[style*="visibility: hidden"]')) lt.drawn = now;
    }
    if (!lt.drawn) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})()"""
TWO = "new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"
# Attend une condition (sondée chaque milliseconde), note quand elle devient vraie, puis deux images (peinte).
UNTIL = """(async () => {
  const t0 = window.__t0;
  for (let i = 0; i < 5000 && !(%s); i++) await new Promise((r) => setTimeout(r, 1));
  const seen = performance.now();
  await %s;
  return { seen: seen - t0, painted: performance.now() - t0, ok: !!(%s) };
})()"""
ARM = "window.__t0 = 0; window.addEventListener(%s, () => { window.__t0 = performance.now(); }, { capture: true, once: true })"
FRAMES = """window.__frames = (async () => {
  const t = []; let go = true; window.__stopFrames = () => { go = false; };
  await new Promise((done) => { const step = (now) => { t.push(now); if (go) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  const gaps = t.slice(1).map((x, i) => x - t[i]);
  const span = t[t.length - 1] - t[0];
  return { frames: gaps.length, fps: gaps.length / (span / 1000), mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, max: Math.max(...gaps), over100: gaps.filter((g) => g > 100).length, long: gaps.map((g, i) => [i, Math.round(g)]).filter((x) => x[1] > 60) };
})(); 0"""


def mouse(tab, kind: str, x: float, y: float, buttons: int, modifiers: int = 0) -> None:
    tab.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": buttons, "clickCount": 1, "modifiers": modifiers})


def click(tab, x: float, y: float) -> None:
    tab.mouse_move(x, y)
    mouse(tab, "mousePressed", x, y, 1)
    mouse(tab, "mouseReleased", x, y, 0)


def key(tab, k: str, code: str, vk: int, modifiers: int = 0) -> None:
    event = {"key": k, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers}
    tab.call("Input.dispatchKeyEvent", {"type": "rawKeyDown", **event})
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", **event})


def center_of(tab, selector: str) -> tuple[float, float]:
    r = tab.js(f"JSON.parse(JSON.stringify(document.querySelector({json.dumps(selector)}).getBoundingClientRect()))")
    return r["x"] + r["width"] / 2, r["y"] + r["height"] / 2


def node_sel(ident: str) -> str:
    return f".react-flow__node[data-id={json.dumps(ident)}]"


def metrics(tab) -> dict:
    tab.call("HeapProfiler.collectGarbage")
    got = {m["name"]: m["value"] for m in tab.call("Performance.getMetrics")["metrics"]}
    return {"heap_mb": round(got["JSHeapUsedSize"] / 1e6, 1), "dom_nodes": int(got["Nodes"]), "script_s": round(got["ScriptDuration"], 2)}


def open_run(tab, base: str, infra: str) -> dict:
    """Navigue sur une run et rend les temps de la page (toile créée, cartes peintes) depuis le début de la navigation."""
    tab.navigate(f"{base}/?infrastructure={infra}")
    _wait(tab, READY)
    for _ in range(400):
        if tab.js("window.__lt && window.__lt.drawn > 0"):
            break
        wait(0.05)
    got = tab.js("({ handle: window.__lt.handle, drawn: window.__lt.drawn, cards: document.querySelectorAll('.react-flow__node-card').length, nodes: document.querySelectorAll('.react-flow__node').length, edges: document.querySelectorAll('.react-flow__edge').length })")
    wait(1.5)
    return got


def center_on(tab, host: str, zoom: float = 0.8) -> None:
    tab.js(f"LDApp.debug.handle().toile.select(null)"); wait(0.3)
    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'node', id: {json.dumps(host)} }})"); wait(0.9)
    tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.6)
    tab.mouse_move(5, 450)


def neighbours(tab, host: str, n: int) -> list[str]:
    """Les `n` équipements de la run les plus proches de `host` (lui compris), visibles, sans fantôme."""
    return tab.js(f"""(() => {{ const t = LDApp.debug.handle().toile, c = t.state.positions.get({json.dumps(host)});
      return Array.from(t.state.positions.entries()).filter(([h]) => {{ const n = t.model.nodeByHost.get(h); return n && n.kind !== 'stub' && !n.ghost; }})
        .sort((a, b) => Math.hypot(a[1].x - c.x, a[1].y - c.y) - Math.hypot(b[1].x - c.x, b[1].y - c.y) || (a[0] < b[0] ? -1 : 1)).slice(0, {n}).map(([h]) => h); }})()""")


def measure_selection_bar(tab, host: str) -> dict:
    """Du clic à la fiche peinte, puis du clic (même instant) à la barre contextuelle peinte."""
    center_on(tab, host)
    x, y = center_of(tab, node_sel(host))
    tab.js("window.__t0 = 0; window.addEventListener('pointerdown', () => { window.__t0 = performance.now(); window.__tdown = window.__t0; }, { capture: true, once: true })")
    click(tab, x, y)
    panel = tab.js(UNTIL % (f"document.querySelector('.panel .panel-scroll') && document.querySelector({json.dumps(node_sel(host))}).classList.contains('selected')", TWO, "true"))
    tab.js("window.__t0 = window.__tdown")
    bar = tab.js(UNTIL % (SHOWN.replace("!!", ""), TWO, SHOWN))
    return {"panel": panel["painted"], "panel_seen": panel["seen"], "bar": bar["painted"]}


def measure_arrow(tab, hosts: list[str]) -> dict:
    """La sélection (1 ou n équipements) déplacée d'un pas par → : de la touche à la dernière carte déplacée peinte."""
    tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps([{'kind': 'node', 'id': h} for h in hosts])})"); wait(0.8)
    last = hosts[-1]
    tab.js(f"window.__x0 = document.querySelector({json.dumps(node_sel(last))}).style.transform")
    tab.js("document.querySelector('.react-flow__pane').focus ? document.querySelector('.app').focus() : 0")
    tab.js(ARM % "'keydown'")
    key(tab, "ArrowRight", "ArrowRight", 39)
    got = tab.js(UNTIL % (f"document.querySelector({json.dumps(node_sel(last))}).style.transform !== window.__x0", TWO, "true"))
    wait(1.4)  # la rafale s'enregistre 400 ms après, la réponse de l'API redessine
    return got


def drag_frames(tab, start: tuple[float, float], modifiers: int = 0) -> dict:
    """Un glissé réel de 60 mouvements (~16 ms), pendant qu'une boucle d'images compte les intervalles."""
    x, y = start
    tab.mouse_move(x, y)
    mouse(tab, "mousePressed", x, y, 1, modifiers)
    tab.js(FRAMES)
    for i in range(1, 61):
        mouse(tab, "mouseMoved", x + 3 * i, y + 1.5 * i, 1, modifiers)
        wait(0.016)
    mouse(tab, "mouseReleased", x + 180, y + 90, 0, modifiers)
    tab.js("window.__stopFrames()")
    got = tab.js("window.__frames")
    wait(1.5)
    return got


PANE = """(() => { for (let r = 40; r < 600; r += 20) for (let a = 0; a < 6.28; a += 0.4) {
  const x = 720 + r * Math.cos(a), y = 450 + r * Math.sin(a), el = document.elementFromPoint(x, y);
  if (el && el.classList.contains('react-flow__pane')) return [x, y]; } return [720, 450]; })()"""


def pan_frames(tab) -> dict:
    """Un panoramique réel (glissé nu sur le fond, D1) de 60 mouvements, pendant qu'une boucle d'images les compte."""
    tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.5)
    x, y = tab.js(PANE)
    tab.mouse_move(x, y)
    mouse(tab, "mousePressed", x, y, 1)
    tab.js(FRAMES)
    for i in range(1, 61):
        mouse(tab, "mouseMoved", x - 8 * i, y - 3 * i, 1)
        wait(0.016)
    mouse(tab, "mouseReleased", x - 480, y - 180, 0)
    tab.js("window.__stopFrames()")
    got = tab.js("window.__frames")
    wait(1.0)
    return got


def seed(base: str, auth: dict, infra: str, at: dict, hosts: list[str]) -> str:
    """20 notes en grille et 10 connecteurs qui les relient deux à deux (pour le collage) ; un groupe de 10 équipements."""
    notes = [{"op": "annotation_create", "content": {"kind": "note", "text": f"N{i:02d}"}, "x": at["x"] + 220 * (i % 5), "y": at["y"] + 120 * (i // 5), "w": 160, "h": 60} for i in range(20)]
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infra}, headers=auth, json={"author": "orhan", "ops": notes}, timeout=30)
    ids = [a["id"] for a in r.json()["annotations"]][-20:]
    lines = [{"op": "connector_create", "start": {"kind": "annotation", "ref": ids[2 * i], "side": "auto"}, "end": {"kind": "annotation", "ref": ids[2 * i + 1], "side": "auto"}} for i in range(10)]
    group = {"op": "group_create", "label": "mesure", "members": sorted(hosts)}
    r = httpx.post(f"{base}/api/intent/patches", params={"infrastructure": infra}, headers=auth, json={"author": "orhan", "ops": lines + [group]}, timeout=30)
    return r.json()["groups"][-1]["id"]


PASTE_DONE = """(async () => {
  for (let i = 0; i < 6000; i++) { const m = LDApp.debug.handle().toile.state.multi; if (m.annotations.length === 20 && m.connectors.length === 10 && m.annotations.join() !== window.__before) break; await new Promise((r) => setTimeout(r, 2)); }
  await %s;
  return performance.now() - window.__t0;
})()""" % TWO


def measure_paste(tab) -> list[float]:
    sel = "(() => { const t = LDApp.debug.handle().toile, m = t.model.intent; t.selectItems(m.annotations.map((a) => ({ kind: 'annotation', id: a.id })).concat(m.connectors.map((c) => ({ kind: 'connector', id: c.id })))); })()"
    tab.js(sel); wait(0.8)
    tab.mouse_move(720, 20)
    tab.js("document.querySelector('.app').focus()")
    key(tab, "c", "KeyC", 67, CTRL)
    _wait(tab, f"/éléments copiés/.test({NOTE})")
    out = []
    for _ in range(PASSES):
        tab.js("window.__before = LDApp.debug.handle().toile.state.multi.annotations.join(); " + ARM % "'keydown'")
        key(tab, "v", "KeyV", 86, CTRL)
        out.append(tab.js(PASTE_DONE))
        wait(0.8)
        key(tab, "z", "KeyZ", 90, CTRL)
        _wait(tab, f"/annulé : ajout de 30 éléments/.test({NOTE})")
        wait(1.0)
        tab.js(sel); wait(0.8)
    return out


def measure_fit(tab, host: str) -> float:
    center_on(tab, host)  # la vue part de près : « cadrer tout » la change à coup sûr
    x, y = center_of(tab, ".toolbar [aria-label='cadrer tout']")
    tab.js(ARM % "'pointerdown'")
    tab.js("window.__v0 = document.querySelector('.react-flow__viewport').style.transform")
    click(tab, x, y)
    got = tab.js(UNTIL % ("document.querySelector('.react-flow__viewport').style.transform !== window.__v0", TWO, "true"))
    wait(1.0)
    return got["painted"]


def stats(values: list[float]) -> dict:
    return {"median": round(statistics.median(values), 1), "min": round(min(values), 1), "max": round(max(values), 1), "n": len(values)}


def measure_infra(tab, base: str, auth: dict, infra: str, out: dict) -> None:
    first = open_run(tab, base, infra)  # la première ouverture calcule et mémorise le placement
    out["first_open"] = first
    wait(2.0)
    reopen = [open_run(tab, base, infra) for _ in range(PASSES)]
    out["reopen"] = reopen
    out["metrics_open"] = metrics(tab)
    host = tab.js("Array.from(LDApp.debug.handle().toile.state.positions.keys()).filter((h) => /core-01$/.test(h)).sort()[0]")
    near = neighbours(tab, host, 30)
    # le collage et le cadre de groupe : posés une fois, relus par une ouverture
    c = tab.js(f"LDApp.debug.handle().toile.state.positions.get({json.dumps(host)})")
    group = seed(base, auth, infra, {"x": round(c["x"]) + 600, "y": round(c["y"]) - 300}, near[10:20])
    open_run(tab, base, infra)
    sel = [measure_selection_bar(tab, near[1 + i]) for i in range(PASSES)]
    out["select_panel"] = stats([s["panel"] for s in sel])
    out["select_panel_seen"] = stats([s["panel_seen"] for s in sel])
    out["select_bar"] = stats([s["bar"] for s in sel])
    center_on(tab, host)
    a1 = [measure_arrow(tab, [near[1]]) for _ in range(PASSES)]
    a20 = [measure_arrow(tab, near[:20]) for _ in range(PASSES)]
    out["arrow_1"] = stats([a["painted"] for a in a1]); out["arrow_1_seen"] = stats([a["seen"] for a in a1])
    out["arrow_20"] = stats([a["painted"] for a in a20]); out["arrow_20_seen"] = stats([a["seen"] for a in a20])
    tab.js("LDApp.debug.handle().toile.select(null)"); wait(0.5)
    out["paste_30"] = stats(measure_paste(tab))
    # les glissés : une carte seule, un bloc de 20, un cadre de groupe
    center_on(tab, near[2])
    out["drag_card"] = [drag_frames(tab, center_of(tab, node_sel(near[2]))) for _ in range(2)]
    center_on(tab, host)
    tab.js(f"LDApp.debug.handle().toile.selectItems({json.dumps([{'kind': 'node', 'id': h} for h in near[:20]])})"); wait(0.8)
    out["drag_block20"] = [drag_frames(tab, center_of(tab, node_sel(near[3])))]
    tab.js(f"LDApp.debug.handle().toile.select(null)"); wait(0.3)
    tab.js(f"LDApp.debug.handle().toile.reveal({{ kind: 'group', id: {json.dumps(group)} }})"); wait(0.9)
    tab.js(f"LDApp.debug.handle().toile.select(null)"); wait(0.5)
    fx, fy = tab.js(f"(() => {{ const r = document.querySelector({json.dumps(node_sel('group:' + group))}).getBoundingClientRect(); return [r.x + 6, r.y + r.height / 2]; }})()")
    out["drag_frame"] = [drag_frames(tab, (fx, fy))]
    out["fit"] = stats([measure_fit(tab, host) for _ in range(PASSES)])
    tab.js("LDApp.debug.handle().toile.fit()"); wait(1.0)
    out["pan_fit"] = [pan_frames(tab)]
    center_on(tab, host)
    out["pan_near"] = [pan_frames(tab), pan_frames(tab)]
    out["metrics_end"] = metrics(tab)
    print(infra, "console:", [c for c in tab.chrome.console if c.get("level") == "error" or c.get("type") == "error"][:3])


def main() -> None:
    settings = Settings(api_token=TOKEN, archive_dir=Path(tempfile.mkdtemp(prefix="ld-lot13-")), max_bundle_bytes=30_000_000)
    server, thread, base = _serve(settings)
    results: dict = {}
    try:
        auth = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
        for path in [PROJECT / "samples/demo-dc" / f"run-0{i}.json" for i in (1, 2, 3)] + [S500]:
            r = httpx.post(f"{base}/api/ingest/bundles", content=path.read_bytes(), headers=auth, timeout=180)
            print(path.name, r.status_code)
        with Chrome(CHROMIUM, window=(1440, 900)) as chrome:
            tab = chrome.open(f"{base}/")
            tab.call("Performance.enable")
            tab.call("Page.addScriptToEvaluateOnNewDocument", {"source": WATCH})
            _wait(tab, "!!document.querySelector('.sheet input[type=password]')")
            tab.js(f"sessionStorage.setItem('ld-api-token', {json.dumps(TOKEN)})")
            tab.js("localStorage.setItem('ld-author', 'orhan')")
            for infra in ("demo-dc", "infra-synth"):
                results[infra] = {}
                measure_infra(tab, base, auth, infra, results[infra])
    finally:
        server.should_exit = True
        thread.join(timeout=5)
    (OUT / f"mesures-{LABEL}.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))
    for infra, r in results.items():
        print(f"== {infra} ({LABEL})")
        print("  premier dessin (placement calculé) : toile", round(r["first_open"]["handle"]), "ms, peint", round(r["first_open"]["drawn"]), "ms,", r["first_open"]["nodes"], "nœuds,", r["first_open"]["edges"], "arêtes")
        drawn = [o["drawn"] for o in r["reopen"]]; handle = [o["handle"] for o in r["reopen"]]
        print("  premier dessin (mémorisé) : toile", stats(handle), "peint", stats(drawn))
        for k in ("select_panel_seen", "select_panel", "select_bar", "arrow_1_seen", "arrow_1", "arrow_20_seen", "arrow_20", "paste_30", "fit"):
            print(f"  {k}: {r[k]}")
        for k in ("drag_card", "drag_block20", "drag_frame", "pan_near", "pan_fit"):
            print(f"  {k}: " + " | ".join(f"{d['fps']:.0f} i/s, moy {d['mean']:.1f}, max {d['max']:.0f}, >100 ms {d['over100']}" for d in r[k]))
        print("  mémoire ouverte", r["metrics_open"], "fin", r["metrics_end"])


main()
