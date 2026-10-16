"""The diagram screen: neutral canvas + floating shell."""

from __future__ import annotations

import build as b
import edit
import panel
from build import DATA, esc, ibtn, ic, tip

TYPE_ICON = {"switch": "arrow-left-right", "router": "route", "firewall": "brick-wall"}
# Visible canvas zone (left of the panel, between the top row and the bottom row).
ZONE = (56, 104, 940, 812)


def layout() -> dict[str, tuple[float, float, float]]:
    nodes = DATA["nodes"]
    xs = [n["x"] for n in nodes]
    ys = [n["y"] for n in nodes]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    zx0, zy0, zx1, zy1 = ZONE
    sx = (zx1 - zx0 - 110) / (x1 - x0)
    sy = (zy1 - zy0 - 26) / (y1 - y0)
    pos = {}
    for n in nodes:
        w = 6.4 * len(n["hostname"]) + 34
        pos[n["hostname"]] = [zx0 + 55 + (n["x"] - x0) * sx, zy0 + 13 + (n["y"] - y0) * sy, w]
    # deterministic separation: push overlapping cards apart vertically
    names = sorted(pos)
    for _ in range(40):
        moved = False
        for i, a in enumerate(names):
            for c in names[i + 1:]:
                pa, pc = pos[a], pos[c]
                ox = (pa[2] + pc[2]) / 2 + 8 - abs(pa[0] - pc[0])
                oy = 26 + 8 - abs(pa[1] - pc[1])
                if ox > 0 and oy > 0:
                    d = oy / 2 + 0.5
                    if pa[1] <= pc[1]:
                        pa[1] -= d
                        pc[1] += d
                    else:
                        pa[1] += d
                        pc[1] -= d
                    moved = True
        if not moved:
            break
    return {k: (round(v[0], 1), round(v[1], 1), v[2]) for k, v in pos.items()}


def canvas() -> str:
    pos = layout()
    sel = DATA["selected"]["hostname"]
    lines = []
    for link in DATA["links"]:
        a, c = link["a"]["hostname"], link["b"]["hostname"]
        if a in pos and c in pos:
            cls = ' class="sel"' if sel in (a, c) else ""
            lines.append(f'<line{cls} x1="{pos[a][0]}" y1="{pos[a][1]}" x2="{pos[c][0]}" y2="{pos[c][1]}"/>')
    cards = []
    for n in DATA["nodes"]:
        x, y, _ = pos[n["hostname"]]
        cls = "node sel" if n["hostname"] == sel else "node"
        cards.append(f'<div class="{cls}" style="left:{x}px;top:{y}px">{ic(TYPE_ICON.get(n["type"], "arrow-left-right"))}{esc(n["hostname"])}</div>')
    return (f'<div class="canvas" aria-label="Diagramme, couche physique">'
            f'<svg class="cables" viewBox="0 0 1440 900" aria-hidden="true">{"".join(lines)}</svg>{"".join(cards)}</div>')


def top_row() -> str:
    diff_tid, diff_tip = b.tip("4 équipements et 10 câbles changés depuis le 12 janv.", None, "")
    brand = f'<div class="surf bar" data-float="marque" data-bar="marque">{b.logo("home.html")}</div>'
    ctx = f"""<div class="surf bar ctx" data-float="contexte" data-bar="contexte">
  <button class="btn choice" aria-haspopup="listbox">demo-dc{ic("chevron-down", "ico chev")}</button>
  <button class="btn choice" aria-haspopup="listbox">19 janv. 2026, 02:00{ic("chevron-down", "ico chev")}</button>
  <span class="sep"></span>
  <button class="btn diff has-tip" aria-describedby="{diff_tid}">{ic("git-compare")}14 changements{diff_tip}</button>
</div>"""
    l2_tid, l2_tip = b.tip("Couche 2, VLAN et trunks : en cours", None, "")
    l3_tid, l3_tip = b.tip("Couche 3, routage : en cours", None, "")
    views = f"""<div class="surf views" data-float="vues">
  <nav class="tabs" role="tablist" aria-label="Vue" data-bar="vue">
    <button class="tab rail" role="tab" aria-selected="true">Diagramme</button>
    <button class="tab rail" role="tab" aria-selected="false">Contrôle <span class="n">6</span></button>
    <button class="tab rail" role="tab" aria-selected="false">Journal</button>
  </nav>
  <span class="sep"></span>
  <div class="layers" role="group" aria-label="Couche" data-bar="couches">
    <button class="btn rail" aria-pressed="true">L1</button>
    <button class="btn rail has-tip" aria-pressed="false" aria-disabled="true" aria-describedby="{l2_tid}">L2{l2_tip}</button>
    <button class="btn rail has-tip" aria-pressed="false" aria-disabled="true" aria-describedby="{l3_tid}">L3{l3_tip}</button>
  </div>
</div>"""
    tools = f"""<div class="surf bar tools" data-float="outils" data-bar="outils">
  {b.search_trigger()}
  {ibtn("download", "Exporter en PNG ou SVG", "E", "", "tip-demo")}
  {ibtn("settings", "Réglages", None, "end", "rail settings-toggle")}
  <span class="sep"></span>
  {b.user_btn()}
</div>"""
    return f'<div class="toprow">{brand}{ctx}{views}</div>' + tools


def bottom_row() -> str:
    ctl = f"""<div class="surf bar ctl" data-float="commandes" data-bar="commandes">
  {ibtn("zoom-out", "Dézoomer", "−", "up start")}
  <button class="btn pct has-tip" aria-describedby="{(t := tip("Revenir à 100 %", "0", "up"))[0]}">62 %{t[1]}</button>
  {ibtn("zoom-in", "Zoomer", "+", "up")}
  <span class="sep"></span>
  {ibtn("scan", "Tout afficher", "F", "up")}
  {ibtn("grid-3x3", "Grille", "G", "up", "rail", 'aria-pressed="true"')}
  {ibtn("map", "Vue d'ensemble", "N", "up", "rail", 'aria-pressed="false"')}
  <span class="sep"></span>
  {ibtn("pencil", "Modifier : outils d'édition", "M", "up", "rail edit-toggle")}
</div>"""
    runs = []
    for r, (label, extra, cur, cmp_) in zip(DATA["runs"], [("5 janv.", "", False, False), ("12 janv.", "comparée", False, True), ("19 janv.", "", True, False)]):
        t = tip(f"Collecte du {label} 2026 à 02:00, terminée", None, "up")
        small = f"<small>{extra}</small>" if extra else ""
        cls = "btn run rail has-tip" + (" compared" if cmp_ else "")
        runs.append(f'<button class="{cls}" aria-current="{str(cur).lower()}" aria-describedby="{t[0]}">{label}{small}{t[1]}</button>')
    band = f"""<div class="surf bar runs" data-float="collectes" data-bar="collectes">
  <span class="lbl">Collectes</span>
  {'<span class="wire"></span>'.join(runs)}
  <span class="sep"></span>
  <button class="btn choice">Comparer avec…{ic("chevron-down", "ico chev")}</button>
</div>"""
    return ctl + band


def build() -> str:
    x, y, _ = layout()[DATA["selected"]["hostname"]]
    body = (canvas().removesuffix("</div>") + edit.note() + "</div>" + top_row() + panel.panel() + bottom_row() + edit.layer(x, y - 13) + b.settings() + b.bench("on-diagram", [("none", "Repos"), ("search", "Recherche"), ("panel-wide", "Fiche élargie"),
                                ("panel-focus", "Fiche en focus"), ("edit", "Édition"), ("edit-note", "Édition, note"), ("settings", "Réglages")]))
    css = (b.HERE / "diagram.css").read_text(encoding="utf-8") + "\n" + panel.col_css()
    return b.page("Living Diagram, demo-dc", css, "diagram", body)
