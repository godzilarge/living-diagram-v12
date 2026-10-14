"use strict";
// Prototype du lot 4 (docs/11) : la barre contextuelle flottante, sur un morceau de toile factice. Tout est construit
// par le DOM (createElement, textContent) ; les seules chaînes HTML sont les icônes Lucide, des constantes. Les places
// passent par des variables CSS (--x, --fx…) posées par le CSSOM, jamais par un style écrit depuis une donnée.
// Le module se lit en quatre parties : la scène (données factices), le dessin, la barre (quoi, où), les gestes.

const NS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);

// ---------- petits outils ----------
function svg(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function html(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function lucide(name) {
  const s = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.75", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "lucide" })) s.setAttribute(k, v);
  s.innerHTML = LUCIDE[name]; // constante recopiée de lucide-react, jamais une donnée
  return s;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const setVars = (node, vars) => { for (const k in vars) node.style.setProperty(k, vars[k]); };

// ---------- les glyphes de type (recopiés de engine/src/canvas/icons.ts, mêmes formes) ----------
const FOOT = 4;
const n = (v) => String(Math.round(v * 100) / 100);
function rrect(x, y, w, h, r) { return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}Z`; }
function rrectFoot(x, y, w, h, r, foot) {
  const top = y + h - foot, bottom = y + h;
  if (foot >= r) return `M${n(x)} ${n(top)}H${n(x + w)}V${n(bottom - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(bottom)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(bottom - r)}Z`;
  const inset = r - Math.sqrt(r * r - (r - foot) * (r - foot));
  return `M${n(x + inset)} ${n(top)}H${n(x + w - inset)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(bottom)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x + inset)} ${n(top)}Z`;
}
const circle = (cx, cy, r) => `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx + r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
function circleFoot(cx, cy, r, foot) { const dy = r - foot, half = Math.sqrt(r * r - dy * dy); return `M${n(cx - half)} ${n(cy + dy)}A${r} ${r} 0 0 0 ${n(cx + half)} ${n(cy + dy)}Z`; }
const bar = (x, y, w, h) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
const poly = (pts) => "M" + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L") + "Z";
function arrow(x1, y1, x2, y2, s = 1.3, hl = 5, hw = 3.4) {
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux, bx = x2 - ux * hl, by = y2 - uy * hl;
  return poly([[x1 + px * s, y1 + py * s], [bx + px * s, by + py * s], [bx + px * hw, by + py * hw], [x2, y2], [bx - px * hw, by - py * hw], [bx - px * s, by - py * s], [x1 - px * s, y1 - py * s]]);
}
function twoWay(x1, y1, x2, y2, s = 1.3, hl = 5, hw = 3.4) {
  const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux;
  const ax = x1 + ux * hl, ay = y1 + uy * hl, bx = x2 - ux * hl, by = y2 - uy * hl;
  return poly([[x1, y1], [ax + px * hw, ay + py * hw], [ax + px * s, ay + py * s], [bx + px * s, by + py * s], [bx + px * hw, by + py * hw], [x2, y2], [bx - px * hw, by - py * hw], [bx - px * s, by - py * s], [ax - px * s, ay - py * s], [ax - px * hw, ay - py * hw]]);
}
function bricks(x, y, w, h, rows, mortar) {
  const rowH = (h - mortar * (rows - 1)) / rows; let d = "";
  for (let r = 1; r < rows; r++) d += bar(x, y + r * rowH + (r - 1) * mortar, w, mortar);
  for (let r = 0; r < rows; r++) { const top = y + r * (rowH + mortar), count = r % 2 === 0 ? 2 : 3; for (let k = 1; k <= count; k++) d += bar(x + (w * k) / (count + 1) - mortar / 2, top, mortar, rowH); }
  return d;
}
const box = (x, y, w, h, r) => ({ body: rrect(x, y, w, h, r), shade: rrectFoot(x, y, w, h, r, FOOT) });
const GLYPHS = {
  switch: { ...box(2, 6, 28, 20, 4), mark: twoWay(6, 10.5, 26, 21.5, 1.2, 4.6, 3.1) + twoWay(6, 21.5, 26, 10.5, 1.2, 4.6, 3.1) },
  router: { body: circle(16, 16, 14), shade: circleFoot(16, 16, 14, FOOT), mark: twoWay(4.5, 16, 27.5, 16, 1.3, 4.5, 3.2) + arrow(16, 4.5, 16, 11.5, 1.3, 4.5, 3.2) + arrow(16, 27.5, 16, 20.5, 1.3, 4.5, 3.2) },
  firewall: { ...box(2, 5, 28, 22, 3), mark: bricks(2, 5, 28, 22, 3, 1.8) },
};
const PIN = "M8 1.5a4 4 0 0 1 4 4c0 2.8-4 7.5-4 7.5S4 8.3 4 5.5a4 4 0 0 1 4-4z M8 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z";

// ---------- le vocabulaire (celui des catalogues de l'application, engine/src/i18n/locales/fr) ----------
const HUES = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"];
const HUE_FR = { blue: "bleu", sky: "ciel", indigo: "indigo", violet: "violet", pink: "rose", red: "rouge", orange: "orange", amber: "ambre", lime: "citron", green: "vert", teal: "turquoise", slate: "ardoise" };
const TYPE_HUE = { switch: "blue", router: "orange", firewall: "violet" };
const TYPE_FR = { switch: "switch", router: "routeur", firewall: "firewall" };

// ---------- la scène (données factices, positions entières, grille de 20) ----------
const CARD_W = 240, CARD_H = 80;
const dev = (id, name, type, x, y, extra = {}) => ({ id, kind: "device", name, type, x, y, w: CARD_W, h: CARD_H, hue: null, pinned: false, ...extra });
const INITIAL = [
  dev("rt1", "dc01-rt-01", "router", 400, 120),
  dev("core1", "dc01-core-01", "switch", 140, 300, { pinned: true }),
  dev("core2", "dc01-core-02", "switch", 560, 300, { pinned: true }),
  dev("fw1", "dc01-fw-01", "firewall", 140, 480, { role: "actif" }),
  dev("fw2", "dc01-fw-02", "firewall", 440, 480, { role: "passif" }),
  dev("acc1", "dc01-acc-01", "switch", 120, 680),
  dev("acc2", "dc01-acc-02", "switch", 400, 680),
  { id: "note1", kind: "note", x: 860, y: 140, w: 200, h: 92, hue: "amber", text: "Maintenance le 18/10\nremplacer l'optique Eth1/49\navant 6 h", size: "M", bold: false, align: "start", layer: "dessus", locked: false },
  { id: "shape1", kind: "shape", x: 880, y: 300, w: 160, h: 72, hue: "teal", label: "Baie 12", shape: "rect", fill: 25, border: "solid", corners: 6, layer: "dessous", locked: false },
  { id: "table1", kind: "table", x: 840, y: 440, w: 220, h: 120, hue: "sky", rows: [["VLAN", "rôle"], ["10", "gestion"], ["20", "serveurs"], ["30", "voix"]], header: true, layer: "dessus", locked: false },
  { id: "img1", kind: "image", x: 720, y: 640, w: 180, h: 140, hue: "slate", file: "baie-12.jpg", opacity: 100, layer: "dessus", locked: false },
  { id: "conn1", kind: "connector", hue: "amber", from: { id: "note1", side: "w" }, to: { id: "core2", side: "n" }, heads: "end", route: "elbow", width: 2, style: "solid", label: "optique Eth1/49", locked: false },
  { id: "grp1", kind: "group", hue: "teal", label: "Salle B — rangée 4", members: ["acc1", "acc2"], shape: "rect", labelPos: "nw", border: "dashed" },
];
const LINKS = [["core1", "core2"], ["core1", "rt1"], ["core2", "rt1"], ["core1", "fw1"], ["core2", "fw2"], ["core1", "fw2"], ["core2", "fw1"], ["core1", "acc1"], ["core1", "acc2"], ["core2", "acc1"], ["core2", "acc2"]];
const CLUSTER = { id: "ha1", label: "HA · DC01-EDGE · actif-passif", members: ["fw1", "fw2"] };

const S = {
  items: new Map(INITIAL.map((it) => [it.id, structuredClone(it)])),
  sel: [], special: null, view: { x: 0, y: 0, z: 1 },
  variant: "A", readonly: false,
  gesture: false, shift: false, editing: null, volet: null,
  past: [], future: [], seq: 1,
};
const item = (id) => S.items.get(id);
const isAnno = (it) => it && ["note", "shape", "table", "image"].includes(it.kind);

// ---------- l'historique (Ctrl+Z, une entrée par geste) ----------
function snapshot() { return JSON.stringify({ items: [...S.items.values()], sel: S.sel }); }
function remember() { S.past.push(snapshot()); if (S.past.length > 100) S.past.shift(); S.future = []; }
function restore(json) { const s = JSON.parse(json); S.items = new Map(s.items.map((it) => [it.id, it])); S.sel = s.sel.filter((id) => S.items.has(id)); }
function undo() { if (!S.past.length) return; S.future.push(snapshot()); restore(S.past.pop()); say("annulé"); refresh(); }
function redo() { if (!S.future.length) return; S.past.push(snapshot()); restore(S.future.pop()); say("rétabli"); refresh(); }

// ---------- la géométrie ----------
function groupBox(g) {
  const ms = g.members.map(item).filter(Boolean);
  if (!ms.length) return { x: 0, y: 0, w: 0, h: 0 };
  const pad = 28, top = 36;
  const x0 = Math.min(...ms.map((m) => m.x)) - pad, y0 = Math.min(...ms.map((m) => m.y)) - top;
  const x1 = Math.max(...ms.map((m) => m.x + m.w)) + pad, y1 = Math.max(...ms.map((m) => m.y + m.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function sidePoint(b, side) {
  return { n: { x: b.x + b.w / 2, y: b.y }, s: { x: b.x + b.w / 2, y: b.y + b.h }, w: { x: b.x, y: b.y + b.h / 2 }, e: { x: b.x + b.w, y: b.y + b.h / 2 } }[side];
}
function connPoints(c) {
  const a = boxOf(item(c.from.id)), b = boxOf(item(c.to.id));
  const p = sidePoint(a, c.from.side), q = sidePoint(b, c.to.side);
  if (c.route === "straight") return { d: `M${p.x} ${p.y}L${q.x} ${q.y}`, pts: [p, q], tail: [p, q], head: [p, q] };
  if (c.route === "curve") {
    const k = 0.5, h1 = ["w", "e"].includes(c.from.side), h2 = ["w", "e"].includes(c.to.side);
    const c1 = h1 ? { x: p.x + (q.x - p.x) * k, y: p.y } : { x: p.x, y: p.y + (q.y - p.y) * k };
    const c2 = h2 ? { x: q.x + (p.x - q.x) * k, y: q.y } : { x: q.x, y: q.y + (p.y - q.y) * k };
    return { d: `M${p.x} ${p.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${q.x} ${q.y}`, pts: [p, c1, c2, q], tail: [c1, p], head: [c2, q] };
  }
  const horizontalFirst = ["w", "e"].includes(c.from.side);
  const m = horizontalFirst ? { x: q.x, y: p.y } : { x: p.x, y: q.y };
  return { d: `M${p.x} ${p.y}L${m.x} ${m.y}L${q.x} ${q.y}`, pts: [p, m, q], tail: [m, p], head: [m, q] };
}
function boxOf(it) {
  if (!it) return { x: 0, y: 0, w: 0, h: 0 };
  if (it.kind === "group") return groupBox(it);
  if (it.kind === "connector") {
    const { pts } = connPoints(it);
    const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
    return { x: x0, y: y0, w: Math.max(...pts.map((p) => p.x)) - x0, h: Math.max(...pts.map((p) => p.y)) - y0 };
  }
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}
function union(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
}
const toScreen = (b) => ({ x: S.view.x + b.x * S.view.z, y: S.view.y + b.y * S.view.z, w: b.w * S.view.z, h: b.h * S.view.z });

// ---------- le dessin de la toile ----------
const L = { frames: $("#layer-frames"), links: $("#layer-links"), under: $("#layer-under"), nodes: $("#layer-nodes"), over: $("#layer-over"), handles: $("#layer-handles") };
const world = $("#world"), toile = $("#toile");

function itemGroup(layer, it, cls) {
  const sel = S.sel.includes(it.id);
  const g = svg("g", { class: `item ${cls} hue-${it.hue || TYPE_HUE[it.type] || "slate"}${sel ? " selected" : ""}${related().has(it.id) ? " related" : ""}`, "data-id": it.id }, layer);
  if (it.x !== undefined) setVars(g, { "--x": `${it.x}px`, "--y": `${it.y}px` });
  return g;
}
function related() {
  const r = new Set();
  for (const id of S.sel) {
    const it = item(id);
    if (it && it.kind === "group") it.members.forEach((m) => r.add(m));
    if (it && it.kind === "connector") { r.add(it.from.id); r.add(it.to.id); }
  }
  if (S.special && S.special.kind === "cluster") CLUSTER.members.forEach((m) => r.add(m));
  if (S.special && S.special.kind === "cable") S.special.ends.forEach((m) => r.add(m));
  return r;
}
function drawDevice(it) {
  const g = itemGroup(L.nodes, it, "node");
  const clip = `clip-${it.id}`;
  const defs = svg("defs", {}, g);
  svg("rect", { width: it.w, height: it.h, rx: 12 }, svg("clipPath", { id: clip }, defs));
  svg("rect", { class: "node-shape", width: it.w, height: it.h, rx: 12 }, g);
  svg("rect", { class: "node-rail", width: 6, height: it.h, "clip-path": `url(#${clip})` }, g);
  const gl = GLYPHS[it.type];
  const ic = svg("g", { transform: `translate(20 ${(it.h - 40) / 2}) scale(1.25)` }, g);
  svg("path", { class: "icon-body", d: gl.body }, ic); svg("path", { class: "icon-shade", d: gl.shade }, ic); svg("path", { class: "icon-mark", d: gl.mark }, ic);
  const t = svg("text", { class: "node-label", x: 74, y: it.h / 2 + 6 }, g); t.textContent = it.name.toUpperCase();
  if (it.role) {
    const w = it.role.length * 6.82 + 16, x = it.w - 14 - w;
    const p = svg("g", { class: `card-pill ${it.role === "actif" ? "ok" : "muted"}`, transform: `translate(${x} -10)` }, g);
    svg("rect", { width: w, height: 20, rx: 10 }, p);
    const tx = svg("text", { x: 8, y: 14 }, p); tx.textContent = it.role.toUpperCase();
  }
  if (it.pinned) svg("path", { class: "node-pin", d: PIN, transform: "translate(-4 -9)" }, g);
}
function drawLinks() {
  const rel = related();
  for (const [a, b] of LINKS) {
    const A = item(a), B = item(b); if (!A || !B) continue;
    const id = `${a}|${b}`, sel = S.special && S.special.kind === "cable" && S.special.id === id;
    const near = S.sel.includes(a) || S.sel.includes(b) || (rel.has(a) && rel.has(b));
    const g = svg("g", { class: `link${sel ? " selected" : ""}${near ? " related" : ""}`, "data-cable": id }, L.links);
    const d = `M${A.x + A.w / 2} ${A.y + A.h / 2}L${B.x + B.w / 2} ${B.y + B.h / 2}`;
    svg("path", { class: "link-line", d }, g); svg("path", { class: "link-hit", d }, g);
  }
}
function drawCluster() {
  const ms = CLUSTER.members.map(item);
  const b = union(ms.map(boxOf)), pad = 20;
  const sel = S.special && S.special.kind === "cluster";
  const g = svg("g", { class: `cluster${sel ? " selected" : ""}`, "data-cluster": CLUSTER.id }, L.frames);
  svg("rect", { class: "cluster-hull", x: b.x - pad, y: b.y - pad - 24, width: b.w + 2 * pad, height: b.h + 2 * pad + 24, rx: 16 }, g);
  const t = svg("text", { class: "cluster-label", x: b.x - pad + 14, y: b.y - pad - 2 }, g); t.textContent = CLUSTER.label;
}
function drawGroup(it) {
  const b = groupBox(it);
  const g = svg("g", { class: `item frame hue-${it.hue}${it.border === "dashed" ? " dashed" : ""}${S.sel.includes(it.id) ? " selected" : ""}`, "data-id": it.id }, L.frames);
  if (it.shape === "ellipse") {
    svg("ellipse", { class: "frame-shape", cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2 * 1.12, ry: b.h / 2 * 1.2 }, g);
    svg("ellipse", { class: "hover-ring", cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2 * 1.12 + 3, ry: b.h / 2 * 1.2 + 3 }, g);
  } else {
    svg("rect", { class: "frame-shape", x: b.x, y: b.y, width: b.w, height: b.h, rx: 14 }, g);
    svg("rect", { class: "hover-ring", x: b.x - 3, y: b.y - 3, width: b.w + 6, height: b.h + 6, rx: 16 }, g);
  }
  const [v, h] = [it.labelPos[0], it.labelPos.slice(-1)];
  const x = h === "w" ? b.x + 14 : h === "e" ? b.x + b.w - 14 : b.x + b.w / 2;
  const y = v === "n" ? b.y + 22 : v === "s" ? b.y + b.h - 12 : b.y + b.h / 2 + 5;
  const t = svg("text", { class: "frame-label", x, y, "text-anchor": h === "w" ? "start" : h === "e" ? "end" : "middle" }, g); t.textContent = it.label;
}
const FILL = { 0: 0, 25: 0.18, 50: 0.4, 100: 0.85 };
const DASH = { solid: "", dashed: "6 4", dotted: "1.5 4", none: "" };
function drawAnno(it) {
  const layer = it.layer === "dessous" ? L.under : L.over;
  const g = itemGroup(layer, it, `annotation kind-${it.kind}${it.locked ? " locked" : ""}`);
  svg("rect", { class: "hover-ring", x: -3, y: -3, width: it.w + 6, height: it.h + 6, rx: 6 }, g);
  if (it.kind === "note") {
    svg("rect", { class: "annotation-shape", width: it.w, height: it.h, rx: 4, "fill-opacity": 0.2, "stroke-opacity": 0.7 }, g);
    const fs = { S: 12, M: 13, L: 15 }[it.size], lh = fs + 6;
    const x = it.align === "start" ? 12 : it.align === "center" ? it.w / 2 : it.w - 12;
    it.text.split("\n").forEach((line, i) => {
      const t = svg("text", { class: `annotation-text${it.bold ? " bold" : ""}`, x, y: 12 + fs + i * lh, "font-size": fs, "text-anchor": { start: "start", center: "middle", end: "end" }[it.align] }, g); t.textContent = line;
    });
  } else if (it.kind === "shape") {
    const common = { class: "annotation-shape", "fill-opacity": FILL[it.fill], "stroke-opacity": it.border === "none" ? 0 : 0.9, "stroke-dasharray": DASH[it.border] };
    if (it.shape === "ellipse") svg("ellipse", { ...common, cx: it.w / 2, cy: it.h / 2, rx: it.w / 2, ry: it.h / 2 }, g);
    else svg("rect", { ...common, width: it.w, height: it.h, rx: it.corners }, g);
    const t = svg("text", { class: "annotation-text", x: it.w / 2, y: it.h / 2 + 5, "font-size": 13, "text-anchor": "middle", "font-weight": 500 }, g); t.textContent = it.label;
  } else if (it.kind === "table") {
    const rows = it.rows.length, cols = it.rows[0].length, rh = it.h / rows, cw = it.w / cols;
    svg("rect", { class: "annotation-shape", width: it.w, height: it.h, rx: 4, "fill-opacity": 0.08, "stroke-opacity": 0.7 }, g);
    if (it.header) svg("rect", { class: "table-head", x: 0.5, y: 0.5, width: it.w - 1, height: rh - 0.5 }, g);
    for (let r = 1; r < rows; r++) svg("line", { class: "table-line", x1: 0, x2: it.w, y1: r * rh, y2: r * rh }, g);
    for (let c = 1; c < cols; c++) svg("line", { class: "table-line", y1: 0, y2: it.h, x1: c * cw, x2: c * cw }, g);
    it.rows.forEach((row, r) => row.forEach((cell, c) => {
      const t = svg("text", { class: `annotation-text${r === 0 && it.header ? " bold" : ""}`, x: c * cw + 10, y: r * rh + rh / 2 + 4.5, "font-size": 12 }, g); t.textContent = cell;
    }));
  } else if (it.kind === "image") {
    const pic = svg("g", { opacity: it.opacity / 100 }, g);
    svg("rect", { class: "rack-body", width: it.w, height: it.h, rx: 3 }, pic);
    const units = 6, top = 10, uh = (it.h - 34) / units;
    for (let u = 0; u < units; u++) {
      const y = top + u * uh;
      svg("rect", { class: "rack-unit", x: 14, y: y + 1, width: it.w - 28, height: uh - 3, rx: 1.5 }, pic);
      for (let k = 0; k < 4; k++) svg("rect", { class: `rack-led${u === 2 && k === 1 ? " amber" : ""}`, x: 22 + k * 7, y: y + uh / 2 - 2.5, width: 3, height: 3, rx: 0.5 }, pic);
    }
    const t = svg("text", { class: "rack-caption", x: 14, y: it.h - 9 }, pic); t.textContent = it.file;
  }
}
function arrowHead(parent, from, to, w) {
  const a = Math.atan2(to.y - from.y, to.x - from.x), l = 7 + w * 1.6, hw = 3.6 + w * 0.9;
  const bx = to.x - Math.cos(a) * l, by = to.y - Math.sin(a) * l, px = -Math.sin(a), py = Math.cos(a);
  svg("path", { class: "connector-head", d: `M${to.x} ${to.y}L${bx + px * hw} ${by + py * hw}L${bx - px * hw} ${by - py * hw}Z` }, parent);
}
// le milieu d'un connecteur : le point de son étiquette (milieu du premier segment d'un coudé, milieu de la corde sinon)
function connMid(it) {
  const P = connPoints(it);
  return P.pts.length === 3 ? { x: (P.pts[0].x + P.pts[1].x) / 2, y: (P.pts[0].y + P.pts[1].y) / 2 } : { x: (P.pts[0].x + P.pts[P.pts.length - 1].x) / 2, y: (P.pts[0].y + P.pts[P.pts.length - 1].y) / 2 };
}
function drawConnector(it) {
  const g = svg("g", { class: `item connector hue-${it.hue}${S.sel.includes(it.id) ? " selected" : ""}`, "data-id": it.id }, L.over);
  const P = connPoints(it);
  const trim = (pair, w) => { // le trait s'arrête à la base de la pointe
    const [a, b] = pair, d = Math.hypot(b.x - a.x, b.y - a.y) || 1, l = 5 + w * 1.6;
    return { x: b.x - ((b.x - a.x) / d) * l, y: b.y - ((b.y - a.y) / d) * l };
  };
  let d = P.d;
  if (it.heads === "end" || it.heads === "both") { const e = trim(P.head, it.width); d = d.replace(/[LC][^LC]*$/, (seg) => seg.replace(/(-?[\d.]+) (-?[\d.]+)$/, `${e.x} ${e.y}`)); }
  if (it.heads === "start" || it.heads === "both") { const s = trim(P.tail, it.width); d = d.replace(/^M(-?[\d.]+) (-?[\d.]+)/, `M${s.x} ${s.y}`); }
  svg("path", { class: "connector-line", d, "stroke-width": it.width, "stroke-dasharray": it.style === "dashed" ? "7 5" : it.style === "dotted" ? "1 5" : "" }, g);
  if (it.heads === "end" || it.heads === "both") arrowHead(g, P.head[0], P.head[1], it.width);
  if (it.heads === "start" || it.heads === "both") arrowHead(g, P.tail[0], P.tail[1], it.width);
  svg("path", { class: "connector-hit", d: P.d }, g);
  if (it.label) {
    const m = connMid(it);
    const w = it.label.length * 6.6 + 12;
    svg("rect", { class: "connector-label-box", x: m.x - w / 2, y: m.y - 10, width: w, height: 20, rx: 4 }, g);
    const t = svg("text", { class: "connector-label", x: m.x, y: m.y + 4, "text-anchor": "middle" }, g); t.textContent = it.label;
  }
}
function drawHandles() {
  if (S.sel.length !== 1) return;
  const it = item(S.sel[0]);
  if (!isAnno(it) || S.gesture) return;
  const z = S.view.z, k = 1 / z, c = 8 * k, bw = 14 * k, bh = 5 * k;
  const pts = [[0, 0], [it.w, 0], [it.w, it.h], [0, it.h]];
  for (const [x, y] of pts) svg("rect", { class: "handle", x: it.x + x - c / 2, y: it.y + y - c / 2, width: c, height: c, rx: 1.5 * k }, L.handles);
  for (const [x, y, w, h] of [[it.w / 2, 0, bw, bh], [it.w / 2, it.h, bw, bh], [0, it.h / 2, bh, bw], [it.w, it.h / 2, bh, bw]])
    svg("rect", { class: "handle", x: it.x + x - w / 2, y: it.y + y - h / 2, width: w, height: h, rx: bh / 2 }, L.handles);
}
function drawWorld() {
  for (const k in L) L[k].replaceChildren();
  setVars(world, { "--px": `${S.view.x}px`, "--py": `${S.view.y}px`, "--z": String(S.view.z) });
  world.classList.toggle("has-selection", S.sel.length > 0 || !!S.special);
  drawCluster();
  for (const it of S.items.values()) if (it.kind === "group") drawGroup(it);
  drawLinks();
  for (const it of S.items.values()) if (isAnno(it)) drawAnno(it);
  for (const it of S.items.values()) if (it.kind === "device") drawDevice(it);
  for (const it of S.items.values()) if (it.kind === "connector") drawConnector(it);
  drawHandles();
}

// ---------- les glyphes de la barre (16 × 16, au trait, dessinés ici : ce que Lucide n'a pas) ----------
function glyph(build) { const s = svg("svg", { viewBox: "0 0 16 16", class: "glyph", "aria-hidden": "true" }); build(s); return s; }
const G = {
  // le remplissage se montre à la teinte de l'objet (g-tint) : on voit ce qu'on obtient, et il ne se confond pas avec la bordure
  fill: (lv) => glyph((s) => { if (lv) svg("rect", { class: "g-tint", x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "fill-opacity": { 25: 0.3, 50: 0.6, 100: 1 }[lv] }, s); svg("rect", { class: "g-line", x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "stroke-opacity": 0.55 }, s); if (!lv) svg("path", { class: "g-line", d: "M3.5 12.5L12.5 3.5", "stroke-opacity": 0.55 }, s); }),
  border: (st) => glyph((s) => { svg("rect", { class: "g-line", x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "stroke-dasharray": { solid: "", dashed: "3.2 2", dotted: "0.1 2.6", none: "0.1 2.6" }[st], "stroke-opacity": st === "none" ? 0.35 : 1 }, s); if (st === "none") svg("path", { class: "g-line", d: "M3 13L13 3" }, s); }),
  corners: (r) => glyph((s) => { const k = { 0: 0, 6: 3, 12: 6, 24: 9 }[r]; svg("path", { class: "g-line", d: k ? `M3 14V${3 + k}A${k} ${k} 0 0 1 ${3 + k} 3H14` : "M3 14V3H14" }, s); }),
  heads: (v) => glyph((s) => {
    svg("path", { class: "g-line", d: `M${v === "start" || v === "both" ? 5 : 2} 8H${v === "end" || v === "both" ? 11 : 14}` }, s);
    if (v === "end" || v === "both") svg("path", { class: "g-fill", d: "M14.5 8L10 5V11Z" }, s);
    if (v === "start" || v === "both") svg("path", { class: "g-fill", d: "M1.5 8L6 5V11Z" }, s);
  }),
  route: (v) => glyph((s) => svg("path", { class: "g-line", d: { straight: "M3 13L13 3", elbow: "M3 13H8V3H13", curve: "M3 13C9 13 7 3 13 3" }[v] }, s)),
  width: (w) => glyph((s) => svg("path", { class: "g-line", d: "M2.5 8H13.5", "stroke-width": 0.6 + w * 0.9 }, s)),
  stroke: (st) => glyph((s) => svg("path", { class: "g-line", d: "M2 8H14", "stroke-dasharray": { solid: "", dashed: "3.5 2.5", dotted: "0.1 3" }[st] }, s)),
  // les visages fixes des deux réglages de trait : l'icône d'usage (épaisseurs empilées, styles empilés), la valeur est dans le volet
  widths: () => glyph((s) => { svg("path", { class: "g-line", d: "M2.5 3.5H13.5", "stroke-width": 1 }, s); svg("path", { class: "g-line", d: "M2.5 7.5H13.5", "stroke-width": 1.8 }, s); svg("path", { class: "g-line", d: "M2.5 12H13.5", "stroke-width": 2.8 }, s); }),
  strokes: () => glyph((s) => { svg("path", { class: "g-line", d: "M2.5 3.5H13.5" }, s); svg("path", { class: "g-line", d: "M2.5 8H13.5", "stroke-dasharray": "3 2.2" }, s); svg("path", { class: "g-line", d: "M2.5 12.5H13.5", "stroke-dasharray": "0.1 2.6" }, s); }),
  shape: (v) => glyph((s) => v === "ellipse" ? svg("ellipse", { class: "g-line", cx: 8, cy: 8, rx: 6, ry: 4.8 }, s) : svg("rect", { class: "g-line", x: 2, y: 3.5, width: 12, height: 9, rx: 2 }, s)),
  opacity: (o) => glyph((s) => { svg("circle", { class: "g-line", cx: 8, cy: 8, r: 5.5 }, s); svg("path", { class: "g-soft", d: "M8 2.5A5.5 5.5 0 0 1 8 13.5Z", "fill-opacity": o / 100 }, s); }),
  pos: (p) => glyph((s) => { svg("rect", { class: "g-line", x: 2, y: 2.5, width: 12, height: 11, rx: 2, "stroke-opacity": 0.55 }, s); const cx = { w: 5, n: 8, s: 8, c: 8, e: 11 }[p.slice(-1)] ?? 8, cy = { n: 5.5, s: 10.5 }[p[0]] ?? 8; svg("circle", { class: "g-fill", cx, cy, r: 1.8 }, s); }),
};

// ---------- la barre : quoi (le futur app/state/floating.ts, pur) ----------
const OPTS = {
  size: [["S", "petit", "12"], ["M", "moyen", "13"], ["L", "grand", "15"]],
  fill: [[0, "aucun"], [25, "25 %"], [50, "50 %"], [100, "plein"]],
  border: [["solid", "plein"], ["dashed", "tirets"], ["dotted", "pointillés"], ["none", "sans bordure"]],
  corners: [[0, "droits"], [6, "6"], [12, "12"], [24, "24"]],
  route: [["straight", "droit"], ["elbow", "coudé"], ["curve", "courbe"]],
  width: [[1, "1"], [2, "2"], [3, "3"], [4, "4"]],
  shape: [["rect", "rectangle"], ["ellipse", "ellipse"]],
  opacity: [[25, "25 %"], [50, "50 %"], [75, "75 %"], [100, "100 %"]],
  layer: [["dessous", "dessous"], ["dessus", "dessus"]],
  style: [["solid", "plein"], ["dashed", "tirets"], ["dotted", "pointillés"]],
};
const HEADS = ["none", "end", "start", "both"], HEADS_FR = { none: "aucune pointe", end: "pointe à l'arrivée", start: "pointe au départ", both: "deux pointes" };
const ALIGN_CYCLE = ["start", "center", "end"], ALIGN_FR = { start: "à gauche", center: "centré", end: "à droite" };
const POS_FR = { nw: "haut gauche", n: "haut", ne: "haut droite", w: "gauche", c: "centre", e: "droite", sw: "bas gauche", s: "bas", se: "bas droite" };

const SIZE_FR = { S: "petit (12)", M: "moyen (13)", L: "grand (15)" };
const SEP = { kind: "sep" };
const btn = (id, label, face, act, more = {}) => ({ kind: "btn", id, label, face, act, ...more });
const seg = (id, label, faceOf, key, more = {}) => ({ kind: "btn", id, label, volet: { type: "seg", key, opts: OPTS[key], faceOf, title: more.title }, face: { glyph: faceOf }, ...more });
const hueBtn = (ids) => ({ kind: "btn", id: "hue", label: "teinte", face: { hue: true }, volet: { type: "hue", ids } });
const layerBtn = () => ({ kind: "btn", id: "layer", label: "plan", face: { icon: "layers" }, volet: { type: "seg", key: "layer", opts: OPTS.layer, faceOf: null, icons: { dessous: "send-to-back", dessus: "bring-to-front" } } });
const lockBtn = (it) => btn("lock", it.locked ? "déverrouiller" : "verrouiller", { icon: it.locked ? "lock" : "lock-open" }, () => edit((x) => { x.locked = !x.locked; }), { keys: "Ctrl+Maj+L", pressed: it.locked });
const dupBtn = () => btn("dup", "dupliquer", { icon: "copy-plus" }, duplicate, { keys: "Ctrl+D" });
const delBtn = (label = "supprimer") => btn("del", label, { icon: "trash-2" }, remove, { keys: "Suppr", danger: true });

const BOX_MODES = [["left", "align-start-vertical", "aligner à gauche", "Alt+A"], ["center", "align-center-vertical", "centrer horizontalement", "Alt+H"], ["right", "align-end-vertical", "aligner à droite", "Alt+D"],
  ["top", "align-start-horizontal", "aligner en haut", "Alt+W"], ["middle", "align-center-horizontal", "centrer verticalement", "Alt+V"], ["bottom", "align-end-horizontal", "aligner en bas", "Alt+S"]];
const DIST = [["dh", "align-horizontal-space-around", "répartir horizontalement", "Alt+Maj+H"], ["dv", "align-vertical-space-around", "répartir verticalement", "Alt+Maj+V"]];
const ALIGN_ROWS = [["left", "center", "right", "dh"], ["top", "middle", "bottom", "dv"]];
const ALIGN_MODE = Object.fromEntries([...BOX_MODES, ...DIST].map(([m, icon, label, keys]) => [m, { icon, label, keys }]));
// un seul bouton : le volet range les six alignements et les deux répartitions en deux rangées (horizontal, vertical)
const alignOpener = (id, count) => ({ kind: "btn", id, label: "aligner et répartir", face: { icon: "align-start-vertical" }, volet: { type: "align", count } });

function barSpec() {
  if (S.special || !S.sel.length) return null;
  const its = S.sel.map(item).filter(Boolean);
  if (its.length > 1) return multiSpec(its);
  const it = its[0];
  switch (it.kind) {
    case "note": return [hueBtn([it.id]), SEP,
      seg("size", `taille du texte : ${SIZE_FR[it.size]}`, null, "size", { face: { icon: "a-large-small" }, title: "taille du texte" }),
      btn("bold", "gras", { icon: "bold" }, () => edit((x) => { x.bold = !x.bold; }), { keys: "Ctrl+B", pressed: it.bold }),
      btn("halign", `alignement : ${ALIGN_FR[it.align]}`, { icon: `text-align-${it.align}` }, () => edit((x) => { x.align = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(x.align) + 1) % 3]; })),
      SEP, layerBtn(), lockBtn(it), SEP, dupBtn(), delBtn()];
    case "shape": return [hueBtn([it.id]), seg("fill", "remplissage", G.fill, "fill"), seg("border", "bordure", G.border, "border"), seg("corners", "coins", G.corners, "corners"),
      SEP, btn("label", "modifier l'étiquette", { icon: "text-cursor-input" }, editLabel, { keys: "Entrée" }), SEP, layerBtn(), lockBtn(it), SEP, dupBtn(), delBtn()];
    case "table": return [btn("row", "ajouter une ligne", { icon: "between-horizontal-end" }, () => edit((x) => { x.rows.push(x.rows[0].map(() => "")); x.h += 28; })),
      btn("col", "ajouter une colonne", { icon: "between-vertical-end" }, () => edit((x) => { x.rows.forEach((r) => r.push("")); x.w += 80; })),
      btn("head", "première ligne en en-tête", { icon: "panel-top" }, () => edit((x) => { x.header = !x.header; }), { pressed: it.header }),
      SEP, hueBtn([it.id]), SEP, layerBtn(), SEP, delBtn()];
    case "image": return [btn("replace", "remplacer l'image", { icon: "image-up" }, () => say("choisir une image : simulé dans le prototype")), seg("opacity", "opacité", G.opacity, "opacity"),
      SEP, layerBtn(), lockBtn(it), SEP, delBtn()];
    case "connector": return [btn("heads", HEADS_FR[it.heads], { glyph: G.heads(it.heads) }, () => edit((x) => { x.heads = HEADS[(HEADS.indexOf(x.heads) + 1) % 4]; })),
      seg("route", "tracé", G.route, "route"), SEP, hueBtn([it.id]), seg("width", "épaisseur", G.width, "width", { face: { glyph: G.widths() } }), seg("stroke", "style du trait", G.stroke, "style", { face: { glyph: G.strokes() } }),
      SEP, btn("reverse", "inverser le sens", { icon: "arrow-right-left" }, () => edit((x) => { [x.from, x.to] = [x.to, x.from]; })), lockBtn(it), SEP, delBtn()];
    case "group": return [hueBtn([it.id]), seg("gshape", "forme", G.shape, "shape"), { kind: "btn", id: "pos", label: "position de l'étiquette", face: { glyph: G.pos(it.labelPos) }, volet: { type: "pos9" } },
      SEP, btn("members", "sélectionner les membres", { icon: "square-dashed-mouse-pointer" }, () => { S.sel = [...it.members]; refresh(); }),
      btn("paint", "appliquer la teinte aux membres", { icon: "paintbrush" }, () => { remember(); it.members.forEach((m) => { item(m).hue = it.hue; }); say(`teinte ${HUE_FR[it.hue]} appliquée à ${it.members.length} équipements`); refresh(); }),
      SEP, delBtn("supprimer le groupe")];
    case "device": return [hueBtn([it.id]), SEP,
      btn("pin", it.pinned ? "retirer l'épingle" : "épingler", { icon: it.pinned ? "pin-off" : "pin" }, () => edit((x) => { x.pinned = !x.pinned; }), { pressed: it.pinned }),
      { kind: "btn", id: "group", label: "grouper", face: { icon: "group" }, volet: { type: "groups" }, keys: "Ctrl+G" },
      SEP, btn("note", "note attachée", { icon: "sticky-note-plus" }, () => attachNote(it)),
      btn("conn", "tirer un connecteur", { icon: "move-up-right" }, () => say("outil connecteur armé : tirez vers un élément (simulé)"), { keys: "C" }),
      SEP, btn("hide", "masquer cet équipement et ses câbles", { icon: "eye-off" }, () => say(`${it.name} masqué (simulé)`)),
      btn("isolate", "isoler avec ses voisins directs", { icon: "focus" }, () => say(`${it.name} isolé avec ses voisins (simulé)`))];
  }
  return null;
}
function multiSpec(its) {
  const movable = its.filter((x) => x.kind !== "connector" && x.kind !== "group");
  const annos = its.filter((x) => x.kind !== "device");
  const out = [];
  if (movable.length >= 2) out.push(alignOpener("align", movable.length), SEP);
  out.push({ kind: "btn", id: "group", label: "grouper", face: { icon: "group" }, volet: { type: "groups" }, keys: "Ctrl+G" }, hueBtn(its.map((x) => x.id)));
  if (annos.length) out.push(SEP, dupBtn(), delBtn(annos.length < its.length ? "supprimer les annotations (les équipements restent)" : "supprimer"),
    btn("lock", "verrouiller", { icon: "lock-open" }, () => { remember(); annos.forEach((a) => { a.locked = true; }); say(`${annos.length} annotations verrouillées`); refresh(); }, { keys: "Ctrl+Maj+L" }));
  else out.push(SEP, btn("hide", "masquer la sélection", { icon: "eye-off" }, () => say("sélection masquée (simulé)")), btn("isolate", "isoler avec leurs voisins", { icon: "focus" }, () => say("sélection isolée (simulé)")));
  return out;
}

// ---------- les actions ----------
function edit(fn) { remember(); for (const id of S.sel) fn(item(id)); refresh(); }
function setValue(key, v) {
  remember();
  for (const id of S.sel) item(id)[key] = v;
  refresh();
}
function setHue(ids, hue) { remember(); ids.forEach((id) => { item(id).hue = hue; }); refresh(); }
function duplicate() {
  remember();
  const copies = [];
  for (const id of S.sel) { const it = item(id); if (!isAnno(it)) continue; const c = structuredClone(it); c.id = `${it.kind}-c${S.seq++}`; c.x += 20; c.y += 20; S.items.set(c.id, c); copies.push(c.id); }
  if (copies.length) { S.sel = copies; say(`${copies.length === 1 ? "1 élément dupliqué" : `${copies.length} éléments dupliqués`} · Ctrl+Z pour annuler`); }
  refresh();
}
function remove() {
  const gone = S.sel.filter((id) => item(id).kind !== "device");
  if (!gone.length) return say("un équipement vient de la donnée : masquez-le plutôt");
  remember();
  gone.forEach((id) => S.items.delete(id));
  for (const it of [...S.items.values()]) if (it.kind === "connector" && (!S.items.has(it.from.id) || !S.items.has(it.to.id))) S.items.delete(it.id);
  S.sel = S.sel.filter((id) => S.items.has(id));
  say(`${gone.length === 1 ? "supprimé" : `${gone.length} éléments supprimés`} · Ctrl+Z pour annuler`);
  refresh();
}
function attachNote(it) {
  remember();
  const id = `note-c${S.seq++}`;
  S.items.set(id, { id, kind: "note", x: it.x + it.w + 40, y: it.y - 20, w: 180, h: 60, hue: "amber", text: `note sur ${it.name}`, size: "M", bold: false, align: "start", layer: "dessus", locked: false });
  S.sel = [id]; say("note attachée à " + it.name); refresh();
}
function align(mode) {
  const its = S.sel.map(item).filter((x) => x.kind !== "connector" && x.kind !== "group");
  const U = union(its.map(boxOf));
  const target = new Map();
  const sorted = (axis) => [...its].sort((a, b) => a[axis] - b[axis]);
  if (mode === "dh" || mode === "dv") {
    const h = mode === "dh", list = sorted(h ? "x" : "y"), size = list.reduce((s, b) => s + (h ? b.w : b.h), 0);
    const gap = ((h ? U.w : U.h) - size) / (list.length - 1); let at = h ? U.x : U.y;
    for (const b of list) { target.set(b.id, h ? { x: Math.round(at), y: b.y } : { x: b.x, y: Math.round(at) }); at += (h ? b.w : b.h) + gap; }
  } else {
    for (const b of its) {
      const t = { x: b.x, y: b.y };
      if (mode === "left") t.x = U.x; if (mode === "right") t.x = U.x + U.w - b.w; if (mode === "center") t.x = Math.round(U.x + U.w / 2 - b.w / 2);
      if (mode === "top") t.y = U.y; if (mode === "bottom") t.y = U.y + U.h - b.h; if (mode === "middle") t.y = Math.round(U.y + U.h / 2 - b.h / 2);
      target.set(b.id, t);
    }
  }
  remember();
  tween(target, 200);
  say(`${its.length} éléments alignés`);
}
// un mouvement court (200 ms, sortie exponentielle) ; la barre suit les éléments pendant qu'ils glissent
function tween(target, ms) {
  const start = new Map([...target.keys()].map((id) => [id, { x: item(id).x, y: item(id).y }]));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now();
  const ease = (t) => 1 - Math.pow(2, -10 * t);
  const step = (now) => {
    const t = reduced ? 1 : Math.min(1, (now - t0) / ms), k = t === 1 ? 1 : ease(t);
    for (const [id, to] of target) { const from = start.get(id), it = item(id); it.x = Math.round(from.x + (to.x - from.x) * k); it.y = Math.round(from.y + (to.y - from.y) * k); }
    drawWorld(); placeBar();
    if (t < 1) requestAnimationFrame(step); else refresh();
  };
  requestAnimationFrame(step);
}
function editLabel() {
  const it = item(S.sel[0]); if (!it) return;
  const input = $("#inplace"), b = toScreen(boxOf(it)), w = Math.max(120, b.w - 24);
  setVars(input, { "--ix": `${b.x + b.w / 2 - w / 2}px`, "--iy": `${b.y + b.h / 2 - 14}px`, "--iw": `${w}px` });
  input.value = it.label; input.hidden = false; S.editing = it.id; placeBar();
  input.focus(); input.select();
}
function endEdit(commit) {
  const input = $("#inplace"), id = S.editing; if (!id) return;
  S.editing = null; // avant de cacher le champ : le « blur » qui suit ne doit pas rejouer la fin
  if (commit && input.value.trim() && input.value.trim() !== item(id).label) { remember(); item(id).label = input.value.trim(); }
  input.hidden = true; refresh();
  later(() => { placeBar(true); }, 120);
  focusToile();
}

// ---------- la barre : où (le futur floating.ts, la place pour une boîte dans une zone) ----------
const fbar = $("#fbar"), body = $("#fbar-body"), volet = $("#fvolet"), tip = $("#ftip");
const GAP = 8, BAR_H = 36;
function zone() {
  const panel = $("#panel"), tb = $("#toolbar").getBoundingClientRect(), search = $(".search").getBoundingClientRect(), band = $(".band").getBoundingClientRect();
  const right = panel.hidden ? innerWidth : panel.getBoundingClientRect().left;
  return { left: GAP, top: Math.max(tb.bottom, search.bottom) + GAP, right: right - GAP, bottom: band.top - GAP };
}
function selScreenBox() { return toScreen(union(S.sel.map((id) => boxOf(item(id))))); }
// l'ancre : un connecteur seul s'ancre au milieu de son tracé (sa boîte englobante peut être immense et vide) ; le reste, à sa boîte
function anchorBox() {
  const one = S.sel.length === 1 && item(S.sel[0]);
  if (one && one.kind === "connector") { const m = connMid(one); return toScreen({ x: m.x - 1, y: m.y - 11, w: 2, h: 22 }); }
  return selScreenBox();
}
// ce que la barre évite de couvrir : les annotations visibles (poids 1), les cartes (poids 0,5) ; jamais ce qui est sélectionné
function obstacles() {
  const out = [];
  for (const it of S.items.values()) {
    if (S.sel.includes(it.id)) continue;
    if (isAnno(it)) out.push({ b: toScreen(boxOf(it)), w: 1 });
    else if (it.kind === "device") out.push({ b: toScreen(boxOf(it)), w: 0.5 });
  }
  return out;
}
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
// Dessus d'abord, dessous ensuite ; centrée, sinon décalée juste assez pour dégager un obstacle, sans jamais lâcher l'ancre
// (16 px de barre au moins de part et d'autre de son centre). Coût = surface couverte pondérée + 400 pour passer dessous
// + 1,5 par pixel de décalage. Le futur app/state/floating.ts, pur : (ancre, largeur, zone, obstacles) → place.
function bestPlace(a, w, z, obs) {
  const cx = a.x + a.w / 2, center = clamp(cx - w / 2, z.left, z.right - w);
  const lo = Math.max(z.left, cx + 16 - w), hi = Math.min(z.right - w, cx - 16);
  const sides = [{ below: false, y: a.y - GAP - BAR_H }, { below: true, y: a.y + a.h + GAP }].filter((s) => s.y >= z.top && s.y + BAR_H <= z.bottom);
  if (!sides.length) return { x: center, y: z.top, below: false, covers: 0 }; // ni dessus ni dessous : en haut de la zone
  let best = null;
  for (const s of sides) {
    const xs = [center];
    for (const o of obs) xs.push(o.b.x - 8 - w, o.b.x + o.b.w + 8);
    for (const x0 of xs) {
      const x = clamp(x0, lo, hi), bar = { x, y: s.y, w, h: BAR_H };
      const covers = obs.reduce((sum, o) => sum + overlap(bar, o.b) * o.w, 0);
      const cost = covers + (s.below ? 400 : 0) + Math.abs(x - center) * 1.5;
      if (!best || cost < best.cost) best = { x, y: s.y, below: s.below, cost, covers };
    }
  }
  return best;
}
let barShown = false;
function placeBar(entering = false) {
  const spec = barSpec();
  const suspended = S.gesture || S.shift || !!S.editing;
  if (!spec || S.readonly) { fbar.hidden = true; barShown = false; closeVolet(); hideTip(); return; }
  fbar.hidden = false;
  fbar.classList.toggle("suspended", suspended);
  if (suspended) { closeVolet(); hideTip(); return; }
  const z = zone(), b = anchorBox(), w = body.offsetWidth;
  const off = b.y + b.h < z.top || b.y > z.bottom || b.x + b.w < z.left || b.x > z.right;
  fbar.classList.toggle("suspended", off);
  const { x, y, below, covers } = bestPlace(b, w, z, obstacles());
  fbar.classList.toggle("below", below);
  fbar.dataset.covers = String(Math.round(covers)); // lu par les captures : 0 = rien de couvert
  // l'ergot pointe l'ancre, même quand la barre s'est décalée pour dégager un obstacle
  setVars(fbar, { "--fx": `${Math.round(x)}px`, "--fy": `${Math.round(y)}px`, "--cx": `${Math.round(clamp(b.x + b.w / 2 - x, 14, w - 14))}px` });
  if (!barShown || entering) { fbar.classList.remove("enter"); void fbar.offsetWidth; fbar.classList.add("enter"); }
  barShown = true;
  if (S.volet) placeVolet();
}

// ---------- la barre : le rendu ----------
let lastKey = "";
function renderBar() {
  const spec = barSpec();
  const key = JSON.stringify([S.sel, S.variant, spec && spec.map((b) => b.kind === "sep" ? "|" : [b.id, b.label, b.pressed, S.sel.map((id) => item(id) && JSON.stringify(item(id)))])]);
  if (key === lastKey) return;
  const focused = document.activeElement && body.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  lastKey = key;
  body.replaceChildren();
  fbar.setAttribute("aria-label", spec ? barLabel() : "");
  if (!spec) return;
  let first = true;
  for (const b of spec) {
    if (b.kind === "sep") { html("span", "fb-sep", body).setAttribute("aria-hidden", "true"); continue; }
    const tint = b.id === "fill" ? ` hue-${item(S.sel[0]).hue}` : "";
    const e = html("button", `fb${b.volet ? " opens" : ""}${b.danger ? " danger" : ""}${tint}`, body);
    e.type = "button"; e.dataset.id = b.id; e.tabIndex = first ? 0 : -1; first = false;
    e.setAttribute("aria-label", b.label);
    if (b.keys) e.setAttribute("aria-keyshortcuts", b.keys.replace("Maj", "Shift").replace("Suppr", "Delete").replace("Entrée", "Enter"));
    if (b.pressed !== undefined) e.setAttribute("aria-pressed", String(!!b.pressed));
    if (b.volet) { e.setAttribute("aria-haspopup", "dialog"); e.setAttribute("aria-expanded", String(!!(S.volet && S.volet.id === b.id))); }
    e.appendChild(face(b));
    e.addEventListener("click", () => { hideTip(); if (b.volet) toggleVolet(b, e); else b.act(); });
    e.addEventListener("pointerenter", () => tipLater(e, b));
    e.addEventListener("pointerleave", hideTip);
    e.addEventListener("focus", () => { if (e.matches(":focus-visible")) showTip(e, b); });
    e.addEventListener("blur", hideTip);
    e._spec = b;
  }
  html("span", "fbar-caret", body).setAttribute("aria-hidden", "true");
  if (focused) { const again = body.querySelector(`[data-id="${focused}"]`); if (again) { roving(again); again.focus(); } }
}
function face(b) {
  const f = b.face || {};
  if (f.hue) {
    const effs = [...new Set(b.volet.ids.map(item).map((x) => x.hue || TYPE_HUE[x.type] || "slate"))];
    if (effs.length === 1) return html("span", `fb-hue hue-${effs[0]}`);
    // teintes mêlées : un disque coupé, les deux premières teintes de la sélection côte à côte
    const m = svg("svg", { viewBox: "0 0 14 14", class: "fb-mix", "aria-hidden": "true" });
    svg("path", { class: `hue-${effs[0]}`, d: "M7 0.5A6.5 6.5 0 0 0 7 13.5Z" }, m); svg("path", { class: `hue-${effs[1]}`, d: "M7 0.5A6.5 6.5 0 0 1 7 13.5Z" }, m);
    svg("circle", { class: "fb-mix-ring", cx: 7, cy: 7, r: 6.5 }, m);
    return m;
  }
  if (f.text) return html("span", "fb-text", undefined, f.text);
  if (f.icon) return lucide(f.icon);
  if (f.glyph) { const it = item(S.sel[0]); const key = b.volet && b.volet.key; return typeof f.glyph === "function" ? f.glyph(key === "style" ? it.style : key === "shape" ? it.shape : it[key]) : f.glyph; }
  return html("span");
}
function barLabel() {
  const its = S.sel.map(item);
  if (its.length > 1) return `actions rapides : ${its.length} éléments`;
  const it = its[0];
  return `actions rapides : ${{ note: "note", shape: "forme", table: "tableau", image: "image", connector: "connecteur", group: "groupe", device: it.name }[it.kind]}`;
}
function roving(target) { body.querySelectorAll(".fb").forEach((b) => { b.tabIndex = b === target ? 0 : -1; }); }

// ---------- l'infobulle : libellé · raccourci, du côté opposé à la sélection ----------
let tipTimer = 0, lastTipAt = 0;
function tipLater(e, b) { clearTimeout(tipTimer); if (S.volet) return; const wait = performance.now() - lastTipAt < 400 ? 0 : 400; tipTimer = later(() => showTip(e, b), wait); }
function showTip(e, b) {
  if (S.volet || fbar.classList.contains("suspended")) return;
  tipNear(e, b.label, b.keys, body.getBoundingClientRect(), fbar.classList.contains("below"));
}
// l'infobulle se pose contre `ref` (la barre, ou le volet), du côté `below` si la place le permet
function tipNear(e, label, keys, ref, below) {
  tip.querySelector(".ftip-label").textContent = label;
  tip.querySelector(".ftip-keys").textContent = keys || "";
  tip.hidden = false;
  const r = e.getBoundingClientRect(), z = zone(), w = tip.offsetWidth, h = tip.offsetHeight;
  let y = below ? ref.bottom + 6 : ref.top - 6 - h;
  if (y < z.top || y + h > z.bottom) y = below ? ref.top - 6 - h : ref.bottom + 6;
  setVars(tip, { "--tx": `${Math.round(clamp(r.left + r.width / 2 - w / 2, z.left, z.right - w))}px`, "--ty": `${Math.round(y)}px` });
  e.setAttribute("aria-describedby", "ftip");
  lastTipAt = performance.now();
}
function hideTip() { clearTimeout(tipTimer); if (!tip.hidden) lastTipAt = performance.now(); tip.hidden = true; }

// ---------- les volets ----------
function toggleVolet(b, opener, host = "bar") {
  if (S.volet && S.volet.id === b.id) return closeVolet(true);
  closeVolet();
  hideTip();
  S.volet = { id: b.id, spec: b, opener, host };
  opener.setAttribute("aria-expanded", "true");
  buildVolet(b);
  volet.hidden = false;
  placeVolet();
  const first = volet.querySelector('[aria-checked="true"]') || volet.querySelector("button");
  if (first) first.focus({ preventScroll: true });
}
function closeVolet(refocus = false) {
  if (!S.volet) return;
  const opener = S.volet.opener; S.volet = null;
  volet.hidden = true; volet.replaceChildren();
  if (opener && opener.isConnected) { opener.setAttribute("aria-expanded", "false"); if (refocus) { if (body.contains(opener)) roving(opener); opener.focus(); } }
}
function placeVolet() {
  const v = S.volet; if (!v) return;
  const opener = document.querySelector(`.fb[data-id="${v.id}"], #toolbar [data-id="${v.id}"]`) || v.opener;
  v.opener = opener;
  const r = opener.getBoundingClientRect(), bar = body.getBoundingClientRect(), z = zone(), w = volet.offsetWidth, h = volet.offsetHeight;
  if (v.host === "toolbar") { // sous la barre du haut, comme tout menu
    volet.classList.remove("up");
    setVars(volet, { "--vx": `${Math.round(clamp(r.left - 8, z.left, z.right - w))}px`, "--vy": `${Math.round(r.bottom + 10)}px` });
    return;
  }
  // le volet s'ouvre du côté opposé à la sélection : l'objet reste visible pendant qu'on choisit
  const below = fbar.classList.contains("below");
  let y = below ? bar.bottom + 6 : bar.top - 6 - h, up = !below;
  if (y < z.top || y + h > z.bottom) { y = below ? bar.top - 6 - h : bar.bottom + 6; up = below; }
  volet.classList.toggle("up", up);
  setVars(volet, { "--vx": `${Math.round(clamp(r.left - 8, z.left, z.right - w))}px`, "--vy": `${Math.round(y)}px` });
}
function caption(parent, label, value) {
  const c = html("div", "volet-cap", parent);
  html("span", "", c, label);
  const b = html("b", "", c, value); return b;
}
function buildVolet(b) {
  volet.replaceChildren();
  volet.setAttribute("aria-label", b.label);
  volet.className = `fvolet${S.sel.length === 1 && item(S.sel[0]).hue ? ` hue-${item(S.sel[0]).hue}` : ""}`;
  const it = item(S.sel[0]);
  const v = b.volet;
  if (v.type === "hue") {
    // la teinte effective (posée, sinon celle du type) ; « mixte » quand la sélection en mêle plusieurs
    const its = v.ids.map(item), eff = its.map((x) => x.hue || TYPE_HUE[x.type] || "slate");
    const shown = eff.every((h) => h === eff[0]) ? eff[0] : null;
    const cur = shown && its.every((x) => x.hue === shown) ? shown : null;
    const posed = shown ? HUE_FR[shown] : "mixte";
    const val = caption(volet, "teinte", posed);
    const grid = html("div", "hue-grid", volet); grid.setAttribute("role", "radiogroup"); grid.setAttribute("aria-label", "teinte");
    for (const h of HUES) {
      const s = html("button", `swatch hue-${h}${!cur && shown === h ? " inherited" : ""}`, grid);
      s.type = "button"; s.setAttribute("role", "radio"); s.setAttribute("aria-checked", String(cur === h)); s.setAttribute("aria-label", HUE_FR[h]); s.tabIndex = (cur || shown || "blue") === h ? 0 : -1;
      if (cur === h) s.appendChild(lucide("check"));
      const preview = () => { val.textContent = h === shown ? posed : `${posed} → ${HUE_FR[h]}`; };
      s.addEventListener("pointerenter", preview); s.addEventListener("focus", preview);
      s.addEventListener("pointerleave", () => { val.textContent = posed; });
      s.addEventListener("click", () => { setHue(v.ids, h); rebuildVolet(); });
    }
    if (its.every((x) => x.kind === "device")) {
      const d = html("button", "volet-default", volet); d.type = "button"; d.setAttribute("role", "radio"); d.setAttribute("aria-checked", String(cur === null));
      html("span", `swatch hue-${TYPE_HUE[its[0].type]}`, d); html("span", "", d, "défaut du type");
      d.addEventListener("click", () => { setHue(v.ids, null); rebuildVolet(); });
    }
    return;
  }
  if (v.type === "seg") {
    const curOf = () => v.key === "style" ? it.style : it[v.key];
    const label = (o) => o[1];
    const val = caption(volet, v.title || b.label, label(v.opts.find((o) => o[0] === curOf())));
    const track = html("div", "vseg", volet); track.setAttribute("role", "radiogroup"); track.setAttribute("aria-label", b.label);
    for (const o of v.opts) {
      const s = html("button", "vseg-item", track); s.type = "button"; s.setAttribute("role", "radio"); s.setAttribute("aria-checked", String(o[0] === curOf())); s.setAttribute("aria-label", label(o));
      s.tabIndex = o[0] === curOf() ? 0 : -1;
      if (v.icons) { s.appendChild(lucide(v.icons[o[0]])); html("span", "", s, o[1]); }
      else if (v.faceOf) s.appendChild(v.faceOf(o[0]));
      else if (v.key === "size") { html("span", "", s, o[0]); html("span", "num", s, o[2]); }
      else html("span", "", s, o[1]);
      s.addEventListener("pointerenter", () => { val.textContent = label(o); });
      s.addEventListener("pointerleave", () => { val.textContent = label(v.opts.find((x) => x[0] === curOf())); });
      s.addEventListener("click", () => { setValue(v.key, o[0]); rebuildVolet(); });
    }
    return;
  }
  if (v.type === "align") {
    caption(volet, "aligner et répartir", `${v.count} éléments`);
    const grid = html("div", "align-grid", volet); grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "aligner et répartir");
    grid.dataset.cols = v.count >= 3 ? "4" : "3";
    for (const row of ALIGN_ROWS) for (const m of row) {
      if ((m === "dh" || m === "dv") && v.count < 3) continue; // répartir demande trois éléments
      const { icon, label, keys } = ALIGN_MODE[m];
      const c = html("button", `vgrid-item${m[0] === "d" ? " dist" : ""}`, grid); c.type = "button"; c.setAttribute("aria-label", label); c.setAttribute("aria-keyshortcuts", keys.replace("Maj", "Shift"));
      c.appendChild(lucide(icon));
      const show = () => tipNear(c, label, keys, volet.getBoundingClientRect(), !volet.classList.contains("up"));
      c.addEventListener("pointerenter", show); c.addEventListener("pointerleave", hideTip);
      c.addEventListener("focus", () => { if (c.matches(":focus-visible")) show(); }); c.addEventListener("blur", hideTip);
      c.addEventListener("click", () => { hideTip(); align(m); });
    }
    return;
  }
  if (v.type === "pos9") {
    const val = caption(volet, "position de l'étiquette", POS_FR[it.labelPos]);
    const grid = html("div", "pos-grid", volet); grid.setAttribute("role", "radiogroup"); grid.setAttribute("aria-label", "position de l'étiquette");
    for (const p of ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"]) {
      const c = html("button", "pos9", grid); c.type = "button"; c.setAttribute("role", "radio"); c.setAttribute("aria-checked", String(it.labelPos === p)); c.setAttribute("aria-label", POS_FR[p]); c.tabIndex = it.labelPos === p ? 0 : -1;
      html("span", "pos9-dot", c);
      c.addEventListener("pointerenter", () => { val.textContent = POS_FR[p]; });
      c.addEventListener("click", () => { setValue("labelPos", p); rebuildVolet(); });
    }
    return;
  }
  if (v.type === "groups") {
    const menu = html("div", "vmenu", volet); menu.setAttribute("role", "menu");
    const add = (icon, text, act) => { const m = html("button", "vmenu-item", menu); m.type = "button"; m.setAttribute("role", "menuitem"); m.appendChild(lucide(icon)); html("span", "", m, text); m.addEventListener("click", act); };
    const hosts = S.sel.filter((id) => item(id).kind === "device");
    add("group", hosts.length > 1 ? `nouveau groupe de ${hosts.length} équipements` : "nouveau groupe", () => {
      remember(); const id = `grp-c${S.seq++}`; S.items.set(id, { id, kind: "group", hue: "indigo", label: "Nouveau groupe", members: hosts.length ? hosts : S.sel, shape: "rect", labelPos: "nw", border: "dashed" });
      S.sel = [id]; closeVolet(); say("groupe créé : nommez-le dans la fiche"); refresh();
    });
    const groups = [...S.items.values()].filter((g) => g.kind === "group");
    if (groups.length) { html("div", "vmenu-sep", menu); html("div", "vmenu-label", menu, "ajouter à"); }
    for (const g of groups) add("square-dashed-mouse-pointer", g.label, () => {
      remember(); hosts.forEach((h) => { if (!g.members.includes(h)) g.members.push(h); }); closeVolet(); say(`ajouté à ${g.label}`); refresh();
    });
  }
}
function rebuildVolet() { if (!S.volet) return; const keep = document.activeElement && document.activeElement.getAttribute("aria-label"); buildVolet(S.volet.spec); placeVolet(); const again = keep && [...volet.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === keep); if (again) again.focus({ preventScroll: true }); }

// ---------- l'arrière-plan : barre d'outils (D10), panneau, statut ----------
function renderToolbar() {
  const tb = $("#toolbar"); tb.replaceChildren();
  const tool = (icon, label, act, disabled = false) => { const b = html("button", "tbtn", tb); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.disabled = disabled; b.appendChild(lucide(icon)); if (act) b.addEventListener("click", act); return b; };
  const sep = () => html("span", "toolbar-sep", tb);
  tool("undo-2", "annuler · Ctrl+Z", undo, !S.past.length); tool("redo-2", "rétablir · Ctrl+Y", redo, !S.future.length); sep();
  tool("maximize", "cadrer tout", fitAll); tool("crosshair", "centrer sur la sélection", centerSel, !S.sel.length); sep();
  tool("sticky-note", "insérer une note", () => insert("note")); tool("square", "insérer un rectangle", () => insert("rect")); tool("circle", "insérer une ellipse", () => insert("ellipse"));
  tool("table", "insérer un tableau", () => insert("table")); tool("move-up-right", "outil connecteur · C", () => say("outil connecteur : simulé")); tool("image", "insérer une image", () => say("insérer une image : simulé"));
  const count = S.sel.length;
  if (count >= 2) {
    const movable = S.sel.map(item).filter((x) => x.kind !== "connector" && x.kind !== "group").length;
    if (S.variant === "B" && movable >= 2) {
      sep();
      const spec = alignOpener("tb-align", movable), b = tool(spec.face.icon, spec.label, null);
      b.dataset.id = "tb-align"; b.title = ""; b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", String(!!(S.volet && S.volet.id === "tb-align")));
      b.addEventListener("click", () => toggleVolet(spec, b, "toolbar"));
    }
    sep();
    const p = html("span", "pill tone-accent toolbar-count", tb, String(count)); p.title = `${count} éléments sélectionnés`;
    tool("x", "vider la sélection · Échap", () => { S.sel = []; refresh(); });
  }
}
function renderPanel() {
  const panel = $("#panel"), app = $("#app");
  const its = S.sel.map(item).filter(Boolean);
  const show = its.length > 0 || !!S.special;
  panel.hidden = !show; app.classList.toggle("has-panel", show);
  if (!show) return;
  panel.replaceChildren();
  const head = html("div", "insp-head", panel), top = html("div", "insp-bar", head);
  const kind = html("span", "insp-kind", top);
  const close = html("button", "insp-close", top); close.setAttribute("aria-label", "fermer"); close.appendChild(lucide("x")); close.addEventListener("click", () => { S.sel = []; S.special = null; refresh(); });
  let title = "", meta = "", sections = [], mono = false, icon = "sticky-note";
  if (S.special) {
    icon = S.special.kind === "cluster" ? "group" : "workflow";
    title = S.special.kind === "cluster" ? "dc01-edge" : S.special.ends.map((id) => item(id).name).join(" — ");
    meta = S.special.kind === "cluster" ? "actif-passif · 2 membres" : "câble · Eth1/49 — Eth1/1";
    sections = ["Bouts", "Ports"]; mono = true;
    kind.append(lucide(icon), document.createTextNode(S.special.kind === "cluster" ? "Cluster HA" : "Câble"));
    const note = html("p", "insp-lead", panel, S.special.kind === "cluster" ? "Un cluster vient de la donnée : pas de barre rapide." : "Un câble vient de la donnée : pas de barre rapide.");
    note.classList.add("faint");
  } else if (its.length > 1) {
    kind.append(lucide("square-dashed-mouse-pointer"), document.createTextNode("Sélection"));
    title = `${its.length} éléments`;
    const counts = {}; its.forEach((x) => { const k = x.kind === "device" ? "équipements" : "annotations"; counts[k] = (counts[k] || 0) + 1; });
    meta = Object.entries(counts).map(([k, v]) => `${v} ${v > 1 ? k : k.slice(0, -1)}`).join(", ");
    sections = ["Apparence", "Groupe", "Éléments"];
  } else {
    const it = its[0];
    const K = { note: ["sticky-note", "Note"], shape: ["square", "Forme"], table: ["table", "Tableau"], image: ["image", "Image"], connector: ["move-up-right", "Flèche"], group: ["group", "Groupe"], device: ["workflow", `${TYPE_FR[it.type] || ""} · dc01`] }[it.kind];
    kind.append(lucide(K[0]), document.createTextNode(K[1].charAt(0).toUpperCase() + K[1].slice(1)));
    if (it.kind === "device") { title = it.name; mono = true; meta = it.type === "firewall" ? "fortinet FG-600F · FortiOS 7.4.3" : it.type === "router" ? "cisco C8300-1N1S · IOS-XE 17.9" : "cisco N9K-C93180YC-FX · NX-OS 10.4.2"; sections = ["Identité", "Câbles", "Interfaces", "Apparence"]; }
    else if (it.kind === "group") { title = it.label; meta = `${it.members.length} membres · orhan`; sections = ["Membres", "Apparence"]; }
    else { title = { note: "Note", shape: it.label, table: "Tableau", image: it.file, connector: it.label }[it.kind]; meta = "libre · orhan · 2026-10-13 23:12 UTC"; sections = ["Contenu", "Position", "Forme", "Texte"].slice(0, it.kind === "image" ? 3 : 4); }
  }
  const t = html("h2", `insp-title${mono ? " mono" : ""}`, head, title); t.setAttribute("aria-level", "2");
  html("p", "insp-meta", head, meta);
  for (const s of sections) { const r = html("div", "insp-section", panel, s); r.appendChild(lucide("chevron-down")); }
}
let statusTimer = 0;
function say(msg) { const s = $("#status"); s.textContent = msg; s.classList.add("on"); clearTimeout(statusTimer); statusTimer = later(() => s.classList.remove("on"), 2400); }
function later(fn, ms) { return setTimeout(fn, ms); }

function insert(kind) {
  remember();
  const c = { x: Math.round(((innerWidth - 360) / 2 - S.view.x) / S.view.z / 20) * 20, y: Math.round((innerHeight / 2 - S.view.y) / S.view.z / 20) * 20 };
  const id = `${kind}-c${S.seq++}`;
  const base = { id, x: c.x - 90, y: c.y - 40, layer: "dessus", locked: false };
  if (kind === "note") S.items.set(id, { ...base, kind: "note", w: 180, h: 60, hue: "amber", text: "Note", size: "M", bold: false, align: "start" });
  if (kind === "rect" || kind === "ellipse") S.items.set(id, { ...base, kind: "shape", w: 160, h: 72, hue: "indigo", label: "Forme", shape: kind === "rect" ? "rect" : "ellipse", fill: 25, border: "solid", corners: 6 });
  if (kind === "table") S.items.set(id, { ...base, kind: "table", w: 200, h: 84, hue: "sky", rows: [["", ""], ["", ""], ["", ""]], header: true });
  S.sel = [id]; refresh();
}
function fitAll() { S.view = { x: 0, y: 0, z: 1 }; refresh(); }
function centerSel() { if (!S.sel.length) return; const z = zone(), b = union(S.sel.map((id) => boxOf(item(id)))); S.view.x = Math.round((z.left + z.right) / 2 - (b.x + b.w / 2) * S.view.z); S.view.y = Math.round((z.top + z.bottom) / 2 - (b.y + b.h / 2) * S.view.z); refresh(); }

function refresh() {
  drawWorld(); renderToolbar(); renderPanel(); renderBar(); placeBar();
  if (S.volet) { if (!document.querySelector(`.fb[data-id="${S.volet.id}"], #toolbar [data-id="${S.volet.id}"]`)) closeVolet(); else placeVolet(); }
}

// ---------- les gestes ----------
let press = null;
function focusToile() { toile.focus({ preventScroll: true }); }
function pick(target) {
  const el = target.closest("[data-id], [data-cable], [data-cluster]");
  if (!el) return null;
  if (el.dataset.id) return { id: el.dataset.id };
  if (el.dataset.cable) return { special: { kind: "cable", id: el.dataset.cable, ends: el.dataset.cable.split("|") } };
  return { special: { kind: "cluster", id: el.dataset.cluster } };
}
toile.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (S.editing) endEdit(true);
  closeVolet(); hideTip();
  const hit = pick(e.target);
  toile.setPointerCapture(e.pointerId);
  if (hit && hit.special) { S.sel = []; S.special = hit.special; press = { kind: "none" }; refresh(); return; }
  if (hit) {
    S.special = null;
    if (e.shiftKey) S.sel = S.sel.includes(hit.id) ? S.sel.filter((x) => x !== hit.id) : [...S.sel, hit.id];
    else if (!S.sel.includes(hit.id)) S.sel = [hit.id];
    const moving = new Set();
    for (const id of S.sel) { const it = item(id); if (!it || it.locked || it.kind === "connector") continue; if (it.kind === "group") it.members.forEach((m) => moving.add(m)); else moving.add(id); }
    press = { kind: "drag", x0: e.clientX, y0: e.clientY, moved: false, from: new Map([...moving].map((id) => [id, { x: item(id).x, y: item(id).y }])) };
    refresh();
  } else {
    press = { kind: "pan", x0: e.clientX, y0: e.clientY, vx: S.view.x, vy: S.view.y, moved: false };
  }
  focusToile();
});
toile.addEventListener("pointermove", (e) => {
  if (!press || press.kind === "none") return;
  const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
  if (!press.moved && Math.hypot(dx, dy) < 3) return;
  if (!press.moved && press.kind === "drag") { remember(); S.gesture = true; placeBar(); drawWorld(); }
  press.moved = true;
  if (press.kind === "pan") { toile.classList.add("panning"); S.view.x = press.vx + dx; S.view.y = press.vy + dy; drawWorld(); placeBar(); return; }
  for (const [id, p] of press.from) { const it = item(id); it.x = Math.round((p.x + dx / S.view.z) / 4) * 4; it.y = Math.round((p.y + dy / S.view.z) / 4) * 4; }
  drawWorld();
});
toile.addEventListener("pointerup", () => {
  if (!press) return;
  const was = press; press = null; toile.classList.remove("panning");
  if (was.kind === "pan" && !was.moved) { S.sel = []; S.special = null; refresh(); return; }
  if (was.kind === "drag" && was.moved) { S.gesture = false; refresh(); fbar.classList.add("suspended"); later(() => placeBar(true), 120); return; }
  refresh();
});
toile.addEventListener("dblclick", () => { const it = S.sel.length === 1 && item(S.sel[0]); if (it && it.kind === "shape") editLabel(); });
toile.addEventListener("wheel", (e) => {
  e.preventDefault();
  const k = Math.exp(-e.deltaY * 0.0015), z = clamp(S.view.z * k, 0.4, 2.5), r = z / S.view.z;
  S.view.x = e.clientX - (e.clientX - S.view.x) * r; S.view.y = e.clientY - (e.clientY - S.view.y) * r; S.view.z = z;
  drawWorld(); placeBar();
}, { passive: false });

// le clavier : Alt+T donne la barre, ← → la parcourent, Échap rend la toile ; Maj tenue efface la barre
addEventListener("keydown", (e) => {
  const inField = e.target instanceof HTMLInputElement;
  if (inField && e.target.id === "inplace") { if (e.key === "Enter") endEdit(true); if (e.key === "Escape") endEdit(false); return; }
  if (e.altKey && e.code === "KeyT") { e.preventDefault(); const first = body.querySelector('.fb[tabindex="0"]') || body.querySelector(".fb"); if (first && !fbar.hidden) { hideTip(); first.focus(); showTip(first, first._spec); } return; }
  if (e.key === "Shift" && !e.repeat && !inField && !S.volet && !body.contains(e.target)) { S.shift = true; placeBar(); return; }
  if (volet.contains(e.target)) return voletKeys(e);
  if (body.contains(e.target)) return barKeys(e);
  if (inField) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); return redo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); return duplicate(); }
  if (e.key === "Delete" || e.key === "Backspace") { if (S.sel.length) remove(); return; }
  if (e.key === "Enter" && S.sel.length === 1 && item(S.sel[0]).kind === "shape") { e.preventDefault(); return editLabel(); }
  if (e.key === "Escape") { if (S.sel.length || S.special) { S.sel = []; S.special = null; refresh(); } }
});
addEventListener("keyup", (e) => { if (e.key === "Shift" && S.shift) { S.shift = false; later(() => placeBar(true), 120); } });
addEventListener("blur", () => { if (S.shift) { S.shift = false; placeBar(); } });
function barKeys(e) {
  const btns = [...body.querySelectorAll(".fb")], i = btns.indexOf(document.activeElement);
  const go = (j) => { const t = btns[(j + btns.length) % btns.length]; roving(t); t.focus(); showTip(t, t._spec); };
  if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  else if (e.key === "Home") { e.preventDefault(); go(0); }
  else if (e.key === "End") { e.preventDefault(); go(btns.length - 1); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { const b = btns[i]; if (b && b._spec.volet) { e.preventDefault(); toggleVolet(b._spec, b); } }
  else if (e.key === "Escape") { e.preventDefault(); hideTip(); focusToile(); }
}
function voletKeys(e) {
  const opts = [...volet.querySelectorAll("button")], i = opts.indexOf(document.activeElement);
  const grid = volet.querySelector(".align-grid");
  const cols = volet.querySelector(".hue-grid") ? 6 : volet.querySelector(".pos-grid") ? 3 : grid ? Number(grid.dataset.cols) : 1;
  const go = (j) => { const t = opts[clamp(j, 0, opts.length - 1)]; t.focus(); };
  if (e.key === "Escape") { e.preventDefault(); closeVolet(true); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); go(i + cols); }
  else if (e.key === "ArrowUp") { e.preventDefault(); go(i - cols); }
  else if (e.key === "Tab") { e.preventDefault(); closeVolet(true); }
}
addEventListener("pointerdown", (e) => { if (S.volet && !volet.contains(e.target) && !(e.target.closest && e.target.closest(`[data-id="${S.volet.id}"]`))) closeVolet(); }, { capture: true });
$("#inplace").addEventListener("blur", () => endEdit(true));
addEventListener("resize", () => refresh());

// ---------- les réglages du prototype ----------
function setVariant(v) {
  S.variant = v; $("#app").dataset.variant = v;
  document.querySelectorAll("[data-variant]").forEach((b) => { if (b.tagName === "BUTTON") b.setAttribute("aria-checked", String(b.dataset.variant === v)); });
  $("#variant-note").textContent = v === "A" ? "alignements dans la barre flottante seulement (recommandé)" : "alignements dans la barre flottante et dans la barre du haut";
  lastKey = ""; refresh();
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll("[data-theme-pick]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themePick === t)));
  const tb = $("#theme-btn"); tb.replaceChildren(lucide(t === "dark" ? "sun" : "moon")); tb.setAttribute("aria-label", t === "dark" ? "thème clair" : "thème sombre");
}
document.querySelectorAll("button[data-variant]").forEach((b) => b.addEventListener("click", () => setVariant(b.dataset.variant)));
document.querySelectorAll("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themePick)));
$("#theme-btn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#readonly").addEventListener("change", (e) => { S.readonly = e.target.checked; say(S.readonly ? "sans nom : lecture seule, pas de barre" : "écriture rétablie"); refresh(); });
$("#proto-help-btn").addEventListener("click", (e) => { const h = $("#proto-help"); h.hidden = !h.hidden; e.currentTarget.setAttribute("aria-expanded", String(!h.hidden)); });
document.querySelectorAll("[data-icon]").forEach((el) => el.prepend(lucide(el.dataset.icon)));

// une petite porte pour les captures (scripts/capture.py)
window.proto = {
  tipFor(label) { const b = [...volet.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === label); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  tb(id) { const b = document.querySelector(`#toolbar [data-id="${id}"]`); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  state: S, select(ids) { S.special = null; S.sel = ids; refresh(); }, center(id) { const b = boxOf(item(id)); return toScreen(b); },
  button(id) { const b = body.querySelector(`[data-id="${id}"]`); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  view(x, y, z) { S.view = { x, y, z }; refresh(); }, variant: setVariant, theme: setTheme,
};
setTheme("dark"); setVariant("A");
