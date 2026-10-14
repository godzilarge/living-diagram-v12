"""Parcours complet de l'application. Usage : walk.py LANG THEME W H [sections]"""
from __future__ import annotations

import json
import sys
import traceback

from lib import BASE, center, chrome, click, key, open_app, prefs, right_click, select, settle, shot, type_text, wait

LANG, THEME, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
ONLY = set(sys.argv[5].split(",")) if len(sys.argv) > 5 else None
import os
TAG = os.environ.get("LD_PREFIX", "") + f"{LANG}-{THEME}-{W}"
M = "LDApp.debug.handle().toile.model"


def name(s: str) -> str:
    return f"{TAG}-{s}"


def section(label):
    def deco(fn):
        def run(tab):
            if ONLY and label not in ONLY:
                return
            try:
                fn(tab)
                print("ok", label, flush=True)
            except Exception:
                print("FAIL", label, traceback.format_exc()[-600:], flush=True)
        run.label = label
        return run
    return deco


def ids(tab):
    return json.loads(tab.js(f"""JSON.stringify({{
      link: {M}.links.find((l) => !l.ghost && l.a && l.b && !String(l.id).includes('stub'))?.id ?? {M}.links[0].id,
      beam: ({M}.beams.find((b) => b.links.length > 1) || {M}.beams[0])?.id,
      cluster: {M}.clusters[0]?.id,
      aggregate: {M}.aggregates[0]?.key,
      groups: [...{M}.groupById.keys()],
      annotations: [...{M}.annotationById.values()].map((a) => [a.id, a.content.kind]),
      connectors: [...{M}.connectorById.keys()],
    }})"""))


@section("welcome")
def welcome(tab):
    prefs(tab, LANG, THEME, token=False, author=None)
    open_app(tab, ready=False)
    wait(tab, "!!document.querySelector('.sheet input[type=password]')")
    settle(0.8)
    shot(tab, name("welcome"))
    # mauvais jeton
    tab.js("(() => { const i = document.querySelector('.sheet input[type=password]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'wrong-token'); i.dispatchEvent(new Event('input', { bubbles: true })); })()")
    tab.js("(() => { const f = document.querySelector('.sheet form'); if (f) f.requestSubmit(); })()")
    wait(tab, "!!document.querySelector('.sheet [role=alert]')", 100)
    settle(0.6)
    shot(tab, name("welcome-badtoken"))


@section("diagram")
def diagram(tab):
    prefs(tab, LANG, THEME)
    open_app(tab)
    shot(tab, name("diagram"))


@section("control")
def control(tab):
    prefs(tab, LANG, THEME)
    open_app(tab, "#mode=control")
    shot(tab, name("control"))
    for sev in ("error", "warning"):
        if click(tab, f".count.sev-{sev}"):
            wait(tab, "!!document.querySelector('.walk')", 60)
            settle(0.8)
            shot(tab, name(f"walk-{sev}"))
            key(tab, "ArrowDown")
            settle(0.6)
            shot(tab, name(f"walk-{sev}-next"))
            key(tab, "Escape")
            settle(0.4)
    if click(tab, ".count.diff"):
        wait(tab, "!!document.querySelector('.walk')", 60)
        settle(0.8)
        shot(tab, name("walk-diff"))
        key(tab, "Escape")


@section("search")
def search(tab):
    prefs(tab, LANG, THEME)
    open_app(tab)
    for i, q in enumerate(("core", "dc01-core-01 eth1/1", "ty", "zzzz", "type:firewall")):
        tab.js("(() => { const i = document.querySelector('.search-input'); i.focus(); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()")
        type_text(tab, q)
        settle(0.7)
        shot(tab, name(f"search-{i}"))
    key(tab, "Escape")
    key(tab, "Escape")


@section("panels")
def panels(tab):
    prefs(tab, LANG, THEME)
    open_app(tab)
    click(tab, ".display-toggle")
    settle(0.6)
    shot(tab, name("display"))
    click(tab, ".display-toggle")
    settle(0.3)
    # menu
    click(tab, ".bar-right .writer, .bar-right button:last-child")
    settle(0.6)
    shot(tab, name("menu"))
    # palette des types
    opened = tab.js("(() => { const b = [...document.querySelectorAll('.menu button')].find((b) => /type|palette/i.test(b.textContent)); if (!b) return false; b.click(); return true; })()")
    settle(0.6)
    if opened:
        shot(tab, name("palette"))
    key(tab, "Escape")
    settle(0.3)
    # bande des runs et barre d'outils survolées : titres
    shot(tab, name("bar-tools"))


@section("cards")
def cards(tab):
    for mode in ("", "#mode=control"):
        m = "ctl" if mode else "dia"
        prefs(tab, LANG, THEME)
        open_app(tab, mode)
        i = ids(tab)
        select(tab, "node", "dc01-core-01"); shot(tab, name(f"{m}-card-node"))
        select(tab, "node", "dc01-fw-01"); shot(tab, name(f"{m}-card-node-fw"))
        select(tab, "link", i["link"]); shot(tab, name(f"{m}-card-link"))
        if i["beam"]:
            select(tab, "beam", i["beam"]); shot(tab, name(f"{m}-card-beam"))
        if i["cluster"]:
            select(tab, "cluster", i["cluster"]); shot(tab, name(f"{m}-card-cluster"))
        if i["aggregate"]:
            select(tab, "aggregate", i["aggregate"]); shot(tab, name(f"{m}-card-aggregate"))
        for g in i["groups"][:1]:
            select(tab, "group", g); shot(tab, name(f"{m}-card-group"))
        for a, kind in i["annotations"]:
            select(tab, "annotation", a); shot(tab, name(f"{m}-card-ann-{kind}"))
        for c in i["connectors"][:1]:
            select(tab, "connector", c); shot(tab, name(f"{m}-card-connector"))
        tab.js("LDApp.debug.handle().toile.selectHosts(['dc01-acc-01','dc01-acc-02','dc01-acc-03'])")
        settle(0.8)
        shot(tab, name(f"{m}-card-multi"))
        tab.js("LDApp.debug.handle().toile.select(null)")


def ctx(tab, sel, label, dx=0, dy=0):
    p = center(tab, sel)
    if not p:
        print("no element", sel, flush=True)
        return
    right_click(tab, p[0] + dx, p[1] + dy)
    if wait(tab, "!!document.querySelector('.context-menu')", 40):
        settle(0.4)
        shot(tab, name(f"ctx-{label}"))
    key(tab, "Escape")
    settle(0.3)


@section("context")
def context(tab):
    prefs(tab, LANG, THEME)
    open_app(tab)
    i = ids(tab)
    # fond : un point du pane libre
    pt = json.loads(tab.js("""(() => { for (let y = 200; y < innerHeight - 150; y += 37) for (let x = 400; x < innerWidth - 400; x += 41) {
      const e = document.elementFromPoint(x, y); if (e && e.classList.contains('react-flow__pane')) return JSON.stringify([x, y]); } return 'null'; })()"""))
    if pt:
        right_click(tab, *pt)
        if wait(tab, "!!document.querySelector('.context-menu')", 40):
            settle(0.4); shot(tab, name("ctx-background"))
        key(tab, "Escape"); settle(0.3)
    ctx(tab, '.react-flow__node[data-id="dc01-core-01"] .node', "device")
    if i["groups"]:
        g = i["groups"][0]
        # le bord du cadre
        tab.js(f"LDApp.debug.handle().toile.reveal({{kind:'group', id:{json.dumps(g)}}})"); settle(0.8)
        p = json.loads(tab.js(f"(() => {{ const r = document.querySelector('.react-flow__node[data-id=\"group:{g}\"]').getBoundingClientRect(); return JSON.stringify([r.x + 6, r.y + r.height / 2]); }})()"))
        right_click(tab, *p)
        if wait(tab, "!!document.querySelector('.context-menu')", 40):
            settle(0.4); shot(tab, name("ctx-group"))
        key(tab, "Escape"); settle(0.3)
    for a, kind in i["annotations"]:
        tab.js(f"LDApp.debug.handle().toile.reveal({{kind:'annotation', id:{json.dumps(a)}}})"); settle(0.8)
        if kind == "table":
            ctx(tab, f'.react-flow__node[data-id="annotation:{a}"] .table-cell', "table-cell")
        else:
            ctx(tab, f'.react-flow__node[data-id="annotation:{a}"]', f"ann-{kind}")
    for c in i["connectors"][:1]:
        tab.js(f"LDApp.debug.handle().toile.reveal({{kind:'connector', id:{json.dumps(c)}}})"); settle(0.8)
        p = json.loads(tab.js(f"""(() => {{ const p = document.querySelector('.react-flow__node[data-id="connector:{c}"] .connector-line');
          if (!p) return 'null'; const m = p.getPointAtLength(p.getTotalLength() / 2); const q = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM()); return JSON.stringify([q.x, q.y]); }})()"""))
        if p:
            right_click(tab, *p)
            if wait(tab, "!!document.querySelector('.context-menu')", 40):
                settle(0.4); shot(tab, name("ctx-connector"))
            key(tab, "Escape")


EDGE = """(() => { const ps = Array.from(document.querySelectorAll('.react-flow__edge path')).filter((e) => e.getTotalLength && e.getTotalLength() > 120);
  const p = ps[%d]; if (!p) return 'null'; const m = p.getPointAtLength(p.getTotalLength() / 2); const q = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM()); return JSON.stringify([q.x, q.y]); })()"""


@section("hover")
def hover(tab):
    for mode in ("", "#mode=control"):
        m = "ctl" if mode else "dia"
        prefs(tab, LANG, THEME)
        open_app(tab, mode)
        for host in ("dc01-fw-01", "dc01-core-01"):
            p = center(tab, f'.react-flow__node[data-id="{host}"] .node')
            if p:
                tab.mouse_move(10, 10); settle(0.3)
                tab.mouse_move(*p); settle(0.8)
                shot(tab, name(f"{m}-tip-{host}"))
        for k in range(2):
            p = json.loads(tab.js(EDGE % k))
            if p:
                tab.mouse_move(10, 10); settle(0.3)
                tab.mouse_move(*p); settle(0.8)
                shot(tab, name(f"{m}-tip-edge{k}"))
        # le cadre d'un cluster
        p = json.loads(tab.js("(() => { const e = document.querySelector('.react-flow__node[data-id^=\"cluster:\"]'); if (!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify([r.x + 4, r.y + r.height / 2]); })()"))
        if p:
            tab.mouse_move(10, 10); settle(0.3)
            tab.mouse_move(*p); settle(0.8)
            shot(tab, name(f"{m}-tip-cluster"))
        # couche des faisceaux : étiquette
        tab.navigate("about:blank")
        open_app(tab, (mode or "#") + "&beams=1&speeds=1" if mode else "#beams=1&speeds=1")
        shot(tab, name(f"{m}-layers"))
        p = center(tab, ".beam-tag, .beam-label, .tag-beam")
        if p:
            tab.mouse_move(*p); settle(0.8)
            shot(tab, name(f"{m}-tip-beam"))


@section("journal")
def journal(tab):
    prefs(tab, LANG, THEME)
    open_app(tab, "#mode=journal", ready=False)
    wait(tab, "!!document.querySelector('.j-row-head')")
    settle(1.2)
    shot(tab, name("journal"))
    tab.js("document.querySelectorAll('.j-row-head')[0].click()")
    settle(0.6)
    shot(tab, name("journal-detail"))
    for word in ("deleted", "colour", "placed", "supprimé", "couleur"):
        tab.js("(() => { const i = document.querySelector('.journal input[type=search], .j-search input, .journal input'); i.focus(); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()")
        type_text(tab, word)
        settle(1.2)
        shot(tab, name(f"journal-q-{word}"))
        rows = tab.js("document.querySelectorAll('.j-row-head').length")
        print("journal search", word, rows, flush=True)
    tab.js("(() => { const i = document.querySelector('.journal input[type=search], .j-search input, .journal input'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()")
    settle(1.0)


def main():
    with chrome(W, H, "en-US" if LANG == "en" else "fr-FR") as c:
        tab = c.open(f"{BASE}/")
        for fn in (welcome, diagram, control, search, panels, cards, context, hover, journal):
            fn(tab)
        errs = [e for e in c.console if "error" in json.dumps(e).lower()]
        print("console errors:", json.dumps(errs)[:2000], flush=True)


main()
