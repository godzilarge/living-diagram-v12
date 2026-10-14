"use strict";
// Prototype du lot 8 (docs/11) : les repères d'alignement, l'aimant aux objets et « mettre la sélection en grille », sur un
// morceau de toile factice qui reprend le rendu du prototype validé du lot 4. Tout est construit par le DOM (createElement,
// textContent) ; les seules chaînes HTML sont les icônes Lucide, des constantes. Les places passent par des variables CSS
// posées par le CSSOM ou par des attributs SVG, jamais par un style écrit depuis une donnée.
// Le module se lit en six parties : outils, scène, repères (le futur canvas/guides.ts, pur), grille (le futur ajout à
// canvas/align.ts, pur), dessin, interface (barre, volet, menu, panneau), gestes.

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
const later = (fn, ms) => setTimeout(fn, ms);

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

// ---------- le vocabulaire (celui des catalogues de l'application) ----------
const HUES = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"];
const HUE_FR = { blue: "bleu", sky: "ciel", indigo: "indigo", violet: "violet", pink: "rose", red: "rouge", orange: "orange", amber: "ambre", lime: "citron", green: "vert", teal: "turquoise", slate: "ardoise" };
const TYPE_HUE = { switch: "blue", router: "orange", firewall: "violet" };

// ---------- la scène (données factices, positions entières, grille de 20, cartes de 240 × 80) ----------
const GRID = 20, CARD_W = 240, CARD_H = 80;
const dev = (id, type, x, y, extra = {}) => ({ id, kind: "device", name: `dc01-${id.replace(/(\D+)(\d+)/, "$1-$2")}`, type, x, y, w: CARD_W, h: CARD_H, hue: null, pinned: false, ...extra });
const MESSY = [[4, 60, 590], [5, 340, 560], [6, 620, 610], [7, 930, 575], [8, 1200, 640], [9, 140, 720], [10, 470, 740], [11, 790, 705], [12, 1080, 790], [13, 40, 870], [14, 360, 900], [15, 700, 860]];
const pad2 = (k) => String(k).padStart(2, "0");
const INITIAL = [
  dev("core01", "switch", 400, 80, { pinned: true }),
  dev("core02", "switch", 760, 80, { pinned: true }),
  dev("fw01", "firewall", 1180, 40, { role: "actif" }),
  dev("fw02", "firewall", 1180, 180, { role: "passif" }),
  dev("acc01", "switch", 80, 300), dev("acc02", "switch", 380, 300), dev("acc03", "switch", 680, 300),
  ...MESSY.map(([k, x, y]) => dev(`acc${pad2(k)}`, "switch", x, y)),
  { id: "note1", kind: "note", x: 1240, y: 330, w: 200, h: 92, hue: "amber", text: "Maintenance le 18/10\nremplacer l'optique Eth1/49\navant 6 h", layer: "dessus" },
  { id: "shape1", kind: "shape", x: 1260, y: 480, w: 120, h: 64, hue: "teal", label: "Baie 12", layer: "dessous" },
  { id: "grp1", kind: "group", hue: "teal", label: "Salle B — rangée 4", members: ["acc01", "acc02", "acc03"] },
];
const LINKS = [["core01", "core02"], ["core01", "fw01"], ["core02", "fw02"], ["core02", "fw01"],
  ...["acc01", "acc02", "acc03", ...MESSY.map(([k]) => `acc${pad2(k)}`)].flatMap((a, i) => [["core01", a], ["core02", a]].filter((_, j) => i % 3 !== 2 || j === 0))];
const CLUSTER = { id: "ha1", label: "HA · DC01-EDGE · actif-passif", members: ["fw01", "fw02"] };

const S = {
  items: new Map(INITIAL.map((it) => [it.id, structuredClone(it)])),
  sel: [], special: null, view: { x: 0, y: 0, z: 1 },
  prefs: { grid: true, snap: false, guides: true }, freeKey: "ctrl",
  gesture: null,        // le geste en cours : { kind, ... } ; la barre se cache, les repères se dessinent
  guides: null,         // ce que la couche des repères dessine pendant le geste
  preview: null,        // la grille survolée : les places à venir
  volet: null, menu: null, shift: false,
  past: [], future: [],
};
const item = (id) => S.items.get(id);
const isAnno = (it) => it && (it.kind === "note" || it.kind === "shape");
const movable = (it) => it && (it.kind === "device" || isAnno(it));

// ---------- l'historique (Ctrl+Z, une entrée par geste) ----------
function snapshot() { return JSON.stringify({ items: [...S.items.values()], sel: S.sel }); }
function remember() { S.past.push(snapshot()); if (S.past.length > 100) S.past.shift(); S.future = []; }
function restore(json) { const s = JSON.parse(json); S.items = new Map(s.items.map((it) => [it.id, it])); S.sel = s.sel.filter((id) => S.items.has(id)); }
function undo() { if (!S.past.length) return; S.future.push(snapshot()); restore(S.past.pop()); say("annulé"); refresh(); }
function redo() { if (!S.future.length) return; S.past.push(snapshot()); restore(S.future.pop()); say("rétabli"); refresh(); }

// ---------- la géométrie ----------
const FRAME_PAD = 28, FRAME_TOP = 36;
function groupBox(g) {
  const ms = g.members.map(item).filter(Boolean);
  const x0 = Math.min(...ms.map((m) => m.x)) - FRAME_PAD, y0 = Math.min(...ms.map((m) => m.y)) - FRAME_TOP;
  const x1 = Math.max(...ms.map((m) => m.x + m.w)) + FRAME_PAD, y1 = Math.max(...ms.map((m) => m.y + m.h)) + FRAME_PAD;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function clusterBox() {
  const b = union(CLUSTER.members.map(item)), pad = 20;
  return { x: b.x - pad, y: b.y - pad - 24, w: b.w + 2 * pad, h: b.h + 2 * pad + 24 };
}
function boxOf(it) { return it.kind === "group" ? groupBox(it) : { x: it.x, y: it.y, w: it.w, h: it.h }; }
function union(boxes) {
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
}
const toScreen = (b) => ({ x: S.view.x + b.x * S.view.z, y: S.view.y + b.y * S.view.z, w: b.w * S.view.z, h: b.h * S.view.z });
const sx = (x) => S.view.x + x * S.view.z, sy = (y) => S.view.y + y * S.view.z;
// les éléments qu'un geste déplace : un cadre de groupe entraîne ses membres, un équipement de la sélection entraîne la sélection
function movingSet(ids) {
  const out = new Set();
  for (const id of ids) { const it = item(id); if (!it) continue; if (it.kind === "group") it.members.forEach((m) => out.add(m)); else if (movable(it)) out.add(id); }
  return [...out];
}

// ======================================================================================================================
// Les repères (le futur engine/src/canvas/guides.ts) : pur, en unités du plan. Entrées : la boîte qui bouge (une seule,
// englobante pour une sélection), les boîtes candidates, la tolérance (8 px d'écran / zoom). Sorties : la correction à
// appliquer par axe et ce qu'il faut dessiner. Règles : centre ↔ centre et bord ↔ bord ; le centre passe avant un bord ;
// un écart égal compte comme un bord ; le plus proche gagne ; un repère par axe.
// ======================================================================================================================
const AX = { x: { lo: "x", size: "w", other: "y" }, y: { lo: "y", size: "h", other: "x" } };
const at = (b, axis, k) => b[AX[axis].lo] + (b[AX[axis].size] * k) / 2;         // k = 0 début, 1 centre, 2 fin
const ext = (b, axis) => [b[AX[axis].lo], b[AX[axis].lo] + b[AX[axis].size]];
const overlap = (a, b, axis) => { const [a0, a1] = ext(a, axis), [b0, b1] = ext(b, axis); return Math.min(a1, b1) - Math.max(a0, b0); };
const RANK = { center: 0, edge: 1, space: 1 };

function alignOptions(m, cands, axis, tol, ks) {
  const out = [];
  for (const k of ks) {
    const mv = at(m, axis, k);
    for (const c of cands) for (const ck of [0, 1, 2]) {
      if ((k === 1) !== (ck === 1)) continue;          // centre ↔ centre, bord ↔ bord
      const d = at(c.box, axis, ck) - mv;
      if (Math.abs(d) <= tol) out.push({ kind: k === 1 ? "center" : "edge", d, k, line: at(c.box, axis, ck) });
    }
  }
  return out;
}
// le voisin le plus proche d'une boîte, d'un côté, parmi ceux qui la chevauchent sur l'autre axe
function neighbor(b, cands, axis, dir, slack = 0) {
  const o = AX[axis].other, [b0, b1] = ext(b, axis);
  let best = null;
  for (const c of cands) {
    if (!c.spaced || c.box === b || overlap(c.box, b, o) <= 0) continue;
    const [c0, c1] = ext(c.box, axis), gap = dir < 0 ? b0 - c1 : c0 - b1;
    if (gap >= -slack && (!best || gap < best.gap)) best = { box: c.box, id: c.id, gap };
  }
  return best;
}
function spaceOptions(m, cands, axis, tol) {
  const out = [], size = m[AX[axis].size], [m0] = ext(m, axis);
  const L = neighbor(m, cands, axis, -1, tol), R = neighbor(m, cands, axis, 1, tol);
  const push = (target, gap) => { const d = target - m0; if (gap > 0 && Math.abs(d) <= tol) out.push({ kind: "space", d, gap }); };
  if (L && R) { const g = (ext(R.box, axis)[0] - ext(L.box, axis)[1] - size) / 2; push(ext(L.box, axis)[1] + g, g); }       // entre deux
  if (L) { const LL = neighbor(L.box, cands, axis, -1); if (LL) push(ext(L.box, axis)[1] + LL.gap, LL.gap); }               // après une paire
  if (R) { const RR = neighbor(R.box, cands, axis, 1); if (RR) push(ext(R.box, axis)[0] - RR.gap - size, RR.gap); }          // avant une paire
  return out;
}
// la chaîne des écarts égaux autour de la boîte posée, des deux côtés : ce que la couche dessine
function spaceChain(m, cands, axis, gap) {
  const segs = [];
  for (const dir of [-1, 1]) {
    let cur = m;
    for (let i = 0; i < 12; i++) {
      const nb = neighbor(cur, cands, axis, dir);
      if (!nb || Math.abs(nb.gap - gap) > 0.5) break;
      segs.push(dir < 0 ? [nb.box, cur] : [cur, nb.box]);
      cur = nb.box;
    }
  }
  return segs;
}
function bestOf(options) {
  return options.sort((a, b) => RANK[a.kind] - RANK[b.kind] || Math.abs(a.d) - Math.abs(b.d))[0] || null;
}
// ce qui se dessine pour un repère d'alignement : la ligne, de l'objet le plus loin à l'autre, et les objets touchés
function alignLine(m, cands, axis, opt) {
  const o = AX[axis].other, ks = opt.kind === "center" ? [1] : [0, 2];
  const hits = cands.filter((c) => ks.some((k) => Math.abs(at(c.box, axis, k) - opt.line) < 0.5));
  const boxes = [m, ...hits.map((c) => c.box)];
  return { axis, kind: opt.kind, at: opt.line, from: Math.min(...boxes.map((b) => ext(b, o)[0])), to: Math.max(...boxes.map((b) => ext(b, o)[1])), boxes, hits: hits.map((c) => c.id) };
}
function snapMove(m, cands, tol) {
  const out = { dx: 0, dy: 0, lines: [], gaps: [], snapped: { x: false, y: false } };
  for (const axis of ["x", "y"]) {
    const opt = bestOf([...alignOptions(m, cands, axis, tol, [0, 1, 2]), ...spaceOptions(m, cands, axis, tol)]);
    if (!opt) continue;
    out[axis === "x" ? "dx" : "dy"] = opt.d;
    out.snapped[axis] = true;
    out[axis] = opt;
  }
  const placed = { ...m, x: m.x + out.dx, y: m.y + out.dy };
  for (const axis of ["x", "y"]) {
    const opt = out[axis]; if (!opt) continue;
    if (opt.kind === "space") out.gaps.push({ axis, gap: opt.gap, segs: spaceChain(placed, cands, axis, opt.gap) });
    else out.lines.push(alignLine(placed, cands, axis, opt));
  }
  return out;
}
// redimensionner : seul le bord tiré s'aligne, sur les bords des autres
function snapResize(m, edges, cands, tol) {
  const out = { d: { x: 0, y: 0 }, lines: [], gaps: [], snapped: { x: false, y: false } };
  for (const [axis, k] of edges) {
    const opt = bestOf(alignOptions(m, cands, axis, tol, [k]));
    if (!opt) continue;
    out.d[axis] = opt.d; out.snapped[axis] = true; out[axis] = { ...opt, k };
  }
  return out;
}
// les candidates : cartes, annotations, cadres visibles dans la vue élargie de moitié, 400 au plus, les plus proches d'abord.
// Ni ce qui bouge, ni un cadre dont un membre bouge (il bouge avec). Les cadres ne comptent pas pour l'espacement.
function candidates(moving, near) {
  const zone = viewBox(0.5), out = [];
  const add = (id, b, spaced) => { b.id = id; if (b.x + b.w >= zone.x && b.x <= zone.x + zone.w && b.y + b.h >= zone.y && b.y <= zone.y + zone.h) out.push({ id, box: b, spaced }); };
  for (const it of S.items.values()) {
    if (moving.includes(it.id)) continue;
    if (it.kind === "group") { if (!it.members.some((m) => moving.includes(m))) add(it.id, groupBox(it), false); continue; }
    add(it.id, boxOf(it), true);
  }
  if (!CLUSTER.members.some((m) => moving.includes(m))) add("ha1", clusterBox(), false);
  const cx = near.x + near.w / 2, cy = near.y + near.h / 2;
  return out.sort((a, b) => Math.hypot(a.box.x + a.box.w / 2 - cx, a.box.y + a.box.h / 2 - cy) - Math.hypot(b.box.x + b.box.w / 2 - cx, b.box.y + b.box.h / 2 - cy)).slice(0, 400);
}
function viewBox(grow) {
  const z = S.view.z, w = innerWidth / z, h = innerHeight / z, x = -S.view.x / z, y = -S.view.y / z;
  return { x: x - (w * grow) / 2, y: y - (h * grow) / 2, w: w * (1 + grow), h: h * (1 + grow) };
}
const snapGrid = (v) => Math.round(v / GRID) * GRID;

// ======================================================================================================================
// La grille (le futur ajout à engine/src/canvas/align.ts, pur) : l'ordre de lecture actuel (rangées par y puis x), une
// cellule = la plus grande boîte + 60, départ au coin haut gauche de la sélection, positions entières.
// ======================================================================================================================
const GRID_GAP = 60;
function readingOrder(boxes) {
  const byY = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const rows = [];
  for (const b of byY) {
    const row = rows[rows.length - 1], cy = b.y + b.h / 2;
    if (row && cy - row.cy <= Math.max(row.h, b.h) / 2) row.items.push(b); else rows.push({ cy, h: b.h, items: [b] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}
// les colonnes par défaut : entre √n et la formule de la spécification ⌈√(1,6 n)⌉, le moins de cases vides ; à égalité, la plus large
function defaultCols(count) {
  const lo = Math.ceil(Math.sqrt(count)), hi = Math.ceil(Math.sqrt(count * 1.6));
  let best = hi, empty = Infinity;
  for (let c = hi; c >= lo; c--) { const e = Math.ceil(count / c) * c - count; if (e < empty) { best = c; empty = e; } }
  return best;
}
const byName = (boxes) => [...boxes].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
function gridLayout(boxes, cols, snap, order = "screen") {
  const list = order === "name" ? byName(boxes) : readingOrder(boxes), u = union(boxes);
  const cw = Math.max(...boxes.map((b) => b.w)) + GRID_GAP, ch = Math.max(...boxes.map((b) => b.h)) + GRID_GAP;
  const ox = snap ? snapGrid(u.x) : u.x, oy = snap ? snapGrid(u.y) : u.y;
  const target = new Map();
  list.forEach((b, i) => {
    let x = ox + (i % cols) * cw + Math.round((cw - GRID_GAP - b.w) / 2), y = oy + Math.floor(i / cols) * ch + Math.round((ch - GRID_GAP - b.h) / 2);
    if (snap) { x = snapGrid(x); y = snapGrid(y); }
    target.set(b.id, { x, y, w: b.w, h: b.h, rank: i + 1 });
  });
  return { target, cols, rows: Math.ceil(list.length / cols) };
}

// ---------- le dessin de la toile ----------
const L = { frames: $("#layer-frames"), links: $("#layer-links"), under: $("#layer-under"), nodes: $("#layer-nodes"), over: $("#layer-over"), handles: $("#layer-handles") };
const world = $("#world"), toile = $("#toile"), overlay = $("#overlay");

function related() {
  const r = new Set();
  for (const id of S.sel) { const it = item(id); if (it && it.kind === "group") it.members.forEach((m) => r.add(m)); }
  if (S.special) CLUSTER.members.forEach((m) => r.add(m));
  return r;
}
function itemGroup(layer, it, cls) {
  const hit = S.guides && S.guides.hits.has(it.id);
  const g = svg("g", { class: `item ${cls} hue-${it.hue || TYPE_HUE[it.type] || "slate"}${S.sel.includes(it.id) ? " selected" : ""}${related().has(it.id) ? " related" : ""}${hit ? " guide-hit" : ""}`, "data-id": it.id }, layer);
  setVars(g, { "--x": `${it.x}px`, "--y": `${it.y}px` });
  return g;
}
function drawDevice(it) {
  const g = itemGroup(L.nodes, it, "node");
  const clip = `clip-${it.id}`;
  svg("rect", { width: it.w, height: it.h, rx: 12 }, svg("clipPath", { id: clip }, svg("defs", {}, g)));
  svg("rect", { class: "node-shape", width: it.w, height: it.h, rx: 12 }, g);
  svg("rect", { class: "node-rail", width: 6, height: it.h, "clip-path": `url(#${clip})` }, g);
  const gl = GLYPHS[it.type], ic = svg("g", { transform: `translate(20 ${(it.h - 40) / 2}) scale(1.25)` }, g);
  svg("path", { class: "icon-body", d: gl.body }, ic); svg("path", { class: "icon-shade", d: gl.shade }, ic); svg("path", { class: "icon-mark", d: gl.mark }, ic);
  svg("text", { class: "node-label", x: 74, y: it.h / 2 + 6 }, g).textContent = it.name.toUpperCase();
  if (it.role) {
    const w = it.role.length * 6.82 + 16, p = svg("g", { class: `card-pill ${it.role === "actif" ? "ok" : "muted"}`, transform: `translate(${it.w - 14 - w} -10)` }, g);
    svg("rect", { width: w, height: 20, rx: 10 }, p);
    svg("text", { x: 8, y: 14 }, p).textContent = it.role.toUpperCase();
  }
  if (it.pinned) svg("path", { class: "node-pin", d: PIN, transform: "translate(-4 -9)" }, g);
}
function drawLinks() {
  for (const [a, b] of LINKS) {
    const A = item(a), B = item(b);
    const near = S.sel.includes(a) || S.sel.includes(b);
    const g = svg("g", { class: `link${near ? " related" : ""}` }, L.links);
    svg("path", { class: "link-line", d: `M${A.x + A.w / 2} ${A.y + A.h / 2}L${B.x + B.w / 2} ${B.y + B.h / 2}` }, g);
  }
}
function drawCluster() {
  const b = clusterBox(), hit = S.guides && S.guides.hits.has("ha1");
  const g = svg("g", { class: `cluster${S.special ? " selected" : ""}${hit ? " guide-hit" : ""}`, "data-cluster": "ha1" }, L.frames);
  svg("rect", { class: "cluster-hull", x: b.x, y: b.y, width: b.w, height: b.h, rx: 16 }, g);
  svg("text", { class: "cluster-label", x: b.x + 14, y: b.y + 22 }, g).textContent = CLUSTER.label;
}
function drawGroup(it) {
  const b = groupBox(it), hit = S.guides && S.guides.hits.has(it.id);
  const g = svg("g", { class: `item frame dashed hue-${it.hue}${S.sel.includes(it.id) ? " selected" : ""}${hit ? " guide-hit" : ""}`, "data-id": it.id }, L.frames);
  svg("rect", { class: "frame-shape", x: b.x, y: b.y, width: b.w, height: b.h, rx: 14 }, g);
  svg("rect", { class: "hover-ring", x: b.x - 3, y: b.y - 3, width: b.w + 6, height: b.h + 6, rx: 16 }, g);
  svg("text", { class: "frame-label", x: b.x + 14, y: b.y + 22 }, g).textContent = it.label;
}
function drawAnno(it) {
  const g = itemGroup(it.layer === "dessous" ? L.under : L.over, it, `annotation kind-${it.kind}`);
  svg("rect", { class: "hover-ring", x: -3, y: -3, width: it.w + 6, height: it.h + 6, rx: 6 }, g);
  if (it.kind === "note") {
    svg("rect", { class: "annotation-shape", width: it.w, height: it.h, rx: 4, "fill-opacity": 0.2, "stroke-opacity": 0.7 }, g);
    it.text.split("\n").forEach((line, i) => { svg("text", { class: "annotation-text", x: 12, y: 25 + i * 19, "font-size": 13 }, g).textContent = line; });
  } else {
    svg("rect", { class: "annotation-shape", width: it.w, height: it.h, rx: 6, "fill-opacity": 0.18, "stroke-opacity": 0.9 }, g);
    svg("text", { class: "annotation-text", x: it.w / 2, y: it.h / 2 + 5, "font-size": 13, "text-anchor": "middle", "font-weight": 500 }, g).textContent = it.label;
  }
}
// les poignées (lot 1) : à taille d'écran, coins 8 px, barres 14 × 5 sur les côtés ; seulement sur une annotation seule
const HANDLES = { nw: [0, 0], n: [1, 0], ne: [2, 0], e: [2, 1], se: [2, 2], s: [1, 2], sw: [0, 2], w: [0, 1] };
function drawHandles() {
  if (S.sel.length !== 1 || (S.gesture && S.gesture.kind !== "resize")) return;
  const it = item(S.sel[0]); if (!isAnno(it)) return;
  const k = 1 / S.view.z, c = 8 * k, bw = 14 * k, bh = 5 * k;
  for (const [name, [i, j]] of Object.entries(HANDLES)) {
    const x = it.x + (it.w * i) / 2, y = it.y + (it.h * j) / 2, side = name.length === 1;
    const [w, h] = !side ? [c, c] : (name === "n" || name === "s") ? [bw, bh] : [bh, bw];
    svg("rect", { class: `handle h-${name}`, "data-handle": name, x: x - w / 2, y: y - h / 2, width: w, height: h, rx: side ? bh / 2 : 1.5 * k }, L.handles);
  }
}
function drawWorld() {
  for (const k in L) L[k].replaceChildren();
  setVars(world, { "--px": `${S.view.x}px`, "--py": `${S.view.y}px`, "--z": String(S.view.z) });
  world.classList.toggle("has-selection", S.sel.length > 0 || !!S.special);
  world.classList.toggle("gesturing", !!(S.gesture && S.gesture.moved));
  $("#grid-fill").setAttribute("visibility", S.prefs.grid ? "visible" : "hidden");
  drawCluster();
  for (const it of S.items.values()) if (it.kind === "group") drawGroup(it);
  drawLinks();
  for (const it of S.items.values()) if (isAnno(it)) drawAnno(it);
  for (const it of S.items.values()) if (it.kind === "device") drawDevice(it);
  drawHandles();
  if (S.gesture && S.gesture.kind === "marquee" && S.gesture.moved) {
    const r = S.gesture.rect;
    svg("rect", { class: "marquee", x: r.x, y: r.y, width: r.w, height: r.h, "vector-effect": "non-scaling-stroke" }, L.handles);
  }
}

// ---------- la couche des repères (le futur app/canvas/GuideLayer.tsx) : en pixels d'écran, nette au demi-pixel ----------
const crisp = (v) => Math.round(v) + 0.5;
const MARK = 3.5, OVER = 14;
function drawOverlay() {
  overlay.replaceChildren();
  if (S.preview) drawPreview(S.preview);
  const G = S.guides;
  if (!G) return;
  if (G.union) { // quatre équerres de coin : la boîte qui s'aligne, sans enfermer ce qui n'est pas sélectionné
    const b = toScreen(G.union), x0 = crisp(b.x - 4), y0 = crisp(b.y - 4), x1 = crisp(b.x + b.w + 3), y1 = crisp(b.y + b.h + 3), k = 12;
    svg("path", { class: "union-box", d: `M${x0} ${y0 + k}V${y0}H${x0 + k}M${x1 - k} ${y0}H${x1}V${y0 + k}M${x1} ${y1 - k}V${y1}H${x1 - k}M${x0 + k} ${y1}H${x0}V${y1 - k}` }, overlay);
  }
  for (const l of G.lines) drawLine(l);
  for (const g of G.gaps) drawGaps(g);
  if (G.pill) drawGesturePill(G.pill);
}
// le repère ne traverse jamais une carte ni une annotation : il s'interrompt sur elles (un nom n'est jamais barré) ; un
// repère de bord longe le bord des objets qu'il aligne, il n'est donc coupé que par les autres
function openRuns(l) {
  const axis = l.axis, o = AX[axis].other, cuts = [];
  for (const it of S.items.values()) {
    if (!movable(it)) continue;
    const [a0, a1] = ext(it, axis);
    if (a0 < l.at - 0.5 && l.at + 0.5 < a1) cuts.push(ext(it, o));
  }
  cuts.sort((p, q) => p[0] - q[0]);
  const runs = []; let from = l.from - OVER / S.view.z;
  for (const [c0, c1] of cuts) { if (c1 <= from) continue; if (c0 > from) runs.push([from, Math.min(c0, l.to + OVER / S.view.z)]); from = Math.max(from, c1); }
  if (from < l.to + OVER / S.view.z) runs.push([from, l.to + OVER / S.view.z]);
  return runs.filter(([p, q]) => q - p > 0.5);
}
function drawLine(l) {
  const vertical = l.axis === "x", c = crisp(vertical ? sx(l.at) : sy(l.at));
  for (const [p, q] of openRuns(l)) {
    const a = Math.round(vertical ? sy(p) : sx(p)), b = Math.round(vertical ? sy(q) : sx(q));
    svg("line", vertical ? { class: "guide-line", x1: c, x2: c, y1: a, y2: b } : { class: "guide-line", y1: c, y2: c, x1: a, x2: b }, overlay);
  }
  // un repère de bord porte une croix à chaque coin qu'il aligne ; un repère de centre s'arrête au bord des objets, ça suffit
  if (l.kind === "edge") for (const bx of l.boxes) for (const t of ext(bx, vertical ? "y" : "x")) {
    const p = vertical ? sy(t) : sx(t), [x, y] = vertical ? [c, p] : [p, c];
    svg("path", { class: "guide-mark", d: `M${x - MARK} ${y - MARK}L${x + MARK} ${y + MARK}M${x - MARK} ${y + MARK}L${x + MARK} ${y - MARK}` }, overlay);
  }
}
function drawGaps(g) {
  const horizontal = g.axis === "x";
  for (const [a, b] of g.segs) {
    // le segment court à mi-hauteur de ce que les deux objets ont en commun
    const o = horizontal ? "y" : "x", [a0, a1] = ext(a, o), [b0, b1] = ext(b, o), mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
    const p0 = ext(a, g.axis)[1], p1 = ext(b, g.axis)[0];
    const c = crisp(horizontal ? sy(mid) : sx(mid)), s0 = Math.round(horizontal ? sx(p0) : sy(p0)), s1 = Math.round(horizontal ? sx(p1) : sy(p1));
    const seg = horizontal ? `M${s0} ${c}H${s1}M${s0 + 0.5} ${c - 5}V${c + 5}M${s1 - 0.5} ${c - 5}V${c + 5}` : `M${c} ${s0}V${s1}M${c - 5} ${s0 + 0.5}H${c + 5}M${c - 5} ${s1 - 0.5}H${c + 5}`;
    svg("path", { class: "guide-gap", d: seg }, overlay);
    const text = String(Math.round(g.gap)), pw = text.length * 6.82 + 10, fits = Math.abs(s1 - s0) >= (horizontal ? pw : 16) + 8;
    // un écart trop étroit pour sa cote : la cote sort, au-dessus du segment (à gauche s'il est vertical)
    if (horizontal) numberPill(text, (s0 + s1) / 2, fits ? c : c - 18); else numberPill(text, fits ? c : c - pw / 2 - 10, (s0 + s1) / 2);
  }
}
function numberPill(text, cx, cy) {
  const w = text.length * 6.82 + 10, p = svg("g", { class: "guide-num", transform: `translate(${Math.round(cx - w / 2)} ${Math.round(cy - 8)})` }, overlay);
  svg("rect", { width: w, height: 16, rx: 8 }, p);
  svg("text", { x: 5, y: 12 }, p).textContent = text;
}
function drawGesturePill(p) {
  const b = toScreen(p.box), text = p.text, free = p.free;
  const w = text.length * 6.82 + (free ? 40 : 0) + 16, z = zone();
  // dessous, dessus, à droite, à gauche : la première place qui ne couvre ni une carte ni un repère, sinon dessous
  const cards = [...S.items.values()].filter(movable).map((it) => toScreen(it)).filter((r) => !(Math.abs(r.x - b.x) < 1 && Math.abs(r.y - b.y) < 1));
  const guides = S.guides ? S.guides.lines.map((l) => (l.axis === "x" ? { x: sx(l.at) - 2, y: -1e5, w: 4, h: 2e5 } : { x: -1e5, y: sy(l.at) - 2, w: 2e5, h: 4 })) : [];
  const spots = [[b.x + b.w / 2 - w / 2, b.y + b.h + 8], [b.x + b.w / 2 - w / 2, b.y - 28], [b.x + b.w + 10, b.y + b.h / 2 - 10], [b.x - w - 10, b.y + b.h / 2 - 10]]
    .map(([x, y]) => ({ x: clamp(x, z.left, z.right - w), y: clamp(y, z.top, z.bottom - 20), w, h: 20 }));
  const free0 = spots.find((r) => ![...cards, ...guides].some((o) => area(r, o) > 0)) || spots[0];
  const g = svg("g", { class: "gesture-pill", transform: `translate(${Math.round(free0.x)} ${Math.round(free0.y)})` }, overlay);
  svg("rect", { width: w, height: 20, rx: 10, x: 0.5, y: 0.5 }, g);
  const t = svg("text", { x: 8, y: 14 }, g); t.textContent = text;
  if (free) { const f = svg("tspan", { class: "free", dx: 8 }, t); f.textContent = "libre"; }
}
function drawPreview(pv) {
  // chaque place à venir porte le nom de l'équipement qui va y aller ; les éléments s'effacent dessous (feuille de style)
  for (const [id, t] of pv.target) {
    const b = toScreen(t), it = item(id), name = nameOf(it).toUpperCase(), fs = 11;
    svg("rect", { class: "ghost", x: crisp(b.x), y: crisp(b.y), width: Math.round(b.w) - 1, height: Math.round(b.h) - 1, rx: Math.max(3, 12 * S.view.z) }, overlay);
    const room = Math.floor((b.w - 20) / (fs * 0.62));
    const label = name.length > room ? name.slice(0, Math.max(1, room - 1)) + "…" : name;
    svg("text", { class: "ghost-name", x: Math.round(b.x + 12), y: Math.round(b.y + b.h / 2 + 4) }, overlay).textContent = label;
  }
}

// ---------- les actions ----------
function setPositions(target) { for (const [id, p] of target) { const it = item(id); it.x = p.x; it.y = p.y; if (it.kind === "device") it.pinned = true; } }
// un mouvement court (220 ms, sortie exponentielle) ; la barre suit les éléments pendant qu'ils glissent
function tween(target, ms, done) {
  const start = new Map([...target.keys()].map((id) => [id, { x: item(id).x, y: item(id).y }]));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now();
  const ease = (t) => 1 - Math.pow(2, -10 * t);
  const step = (now) => {
    const t = reduced ? 1 : Math.min(1, (now - t0) / ms), k = t === 1 ? 1 : ease(t);
    for (const [id, to] of target) { const from = start.get(id), it = item(id); it.x = Math.round(from.x + (to.x - from.x) * k); it.y = Math.round(from.y + (to.y - from.y) * k); }
    drawWorld(); placeBar();
    if (t < 1) requestAnimationFrame(step); else { setPositions(target); refresh(); if (done) done(); }
  };
  requestAnimationFrame(step);
}
const BOX_MODES = [["left", "align-start-vertical", "aligner à gauche", "Alt+A"], ["center", "align-center-vertical", "centrer horizontalement", "Alt+H"], ["right", "align-end-vertical", "aligner à droite", "Alt+D"],
  ["top", "align-start-horizontal", "aligner en haut", "Alt+W"], ["middle", "align-center-horizontal", "centrer verticalement", "Alt+V"], ["bottom", "align-end-horizontal", "aligner en bas", "Alt+S"]];
const DIST = [["dh", "align-horizontal-space-around", "répartir horizontalement", "Alt+Maj+H"], ["dv", "align-vertical-space-around", "répartir verticalement", "Alt+Maj+V"]];
const ALIGN_ROWS = [["left", "center", "right", "dh"], ["top", "middle", "bottom", "dv"]];
const ALIGN_MODE = Object.fromEntries([...BOX_MODES, ...DIST].map(([m, icon, label, keys]) => [m, { icon, label, keys }]));
function selMovable() { return movingSet(S.sel).map(item); }
function align(mode) {
  const its = selMovable(); if (its.length < 2) return;
  const U = union(its), target = new Map();
  if (mode === "dh" || mode === "dv") {
    if (its.length < 3) return;
    const h = mode === "dh", list = [...its].sort((a, b) => (h ? a.x - b.x : a.y - b.y)), size = list.reduce((s, b) => s + (h ? b.w : b.h), 0);
    const gap = ((h ? U.w : U.h) - size) / (list.length - 1); let p = h ? U.x : U.y;
    for (const b of list) { target.set(b.id, h ? { x: Math.round(p), y: b.y } : { x: b.x, y: Math.round(p) }); p += (h ? b.w : b.h) + gap; }
  } else for (const b of its) {
    const t = { x: b.x, y: b.y };
    if (mode === "left") t.x = U.x; if (mode === "right") t.x = U.x + U.w - b.w; if (mode === "center") t.x = Math.round(U.x + U.w / 2 - b.w / 2);
    if (mode === "top") t.y = U.y; if (mode === "bottom") t.y = U.y + U.h - b.h; if (mode === "middle") t.y = Math.round(U.y + U.h / 2 - b.h / 2);
    target.set(b.id, t);
  }
  remember(); tween(target, 200);
  say(`${its.length} éléments alignés (orhan) · Ctrl+Z pour annuler`);
}
// mettre en grille : au moins trois éléments ; les cadres et les connecteurs ne bougent pas ; une entrée d'historique
S.gridCols = null; S.gridOrder = "name";
const nameOf = (it) => it.kind === "device" ? it.name : it.kind === "note" ? it.text.split("\n")[0] : it.label;
function gridPlan(cols) {
  const its = selMovable(); if (its.length < 3) return null;
  const c = clamp(cols || S.gridCols || defaultCols(its.length), 1, its.length);
  return gridLayout(its.map((it) => ({ id: it.id, name: nameOf(it), x: it.x, y: it.y, w: it.w, h: it.h })), c, S.prefs.snap, S.gridOrder);
}
function toGrid() {
  const plan = gridPlan(); if (!plan) return say("mettre en grille : trois éléments au moins");
  S.preview = null; closeVolet(); closeMenu();
  remember();
  tween(plan.target, 240, () => say(`${plan.target.size} éléments mis en grille, ${plan.cols} colonnes (orhan) · Ctrl+Z pour annuler`));
  announce(`${plan.target.size} éléments mis en grille`);
}
function preview(on) { S.preview = on ? gridPlan() : null; world.classList.toggle("previewing", !!S.preview); drawOverlay(); return S.preview; }

// ---------- la barre contextuelle (lot 4, telle que livrée) : réduite ici à ce qui sert au lot 8 ----------
const fbar = $("#fbar"), body = $("#fbar-body"), volet = $("#fvolet"), tip = $("#ftip");
const GAP = 8, BAR_H = 36;
function zone() {
  const panel = $("#panel"), tb = $("#toolbar").getBoundingClientRect(), search = $(".search").getBoundingClientRect(), band = $(".band").getBoundingClientRect();
  const right = panel.hidden ? innerWidth : panel.getBoundingClientRect().left;
  return { left: GAP, top: Math.max(tb.bottom, search.bottom) + GAP, right: right - GAP, bottom: band.top - GAP };
}
const SEP = { kind: "sep" };
const btn = (id, label, icon, act, more = {}) => ({ kind: "btn", id, label, icon, act, ...more });
function barSpec() {
  if (S.special || !S.sel.length) return null;
  const its = S.sel.map(item).filter(Boolean);
  if (its.length > 1) {
    const count = selMovable().length;
    return [count >= 2 ? { kind: "btn", id: "align", label: "aligner et répartir", icon: "align-start-vertical", volet: true } : null, SEP,
      btn("group", "grouper", "group", () => say("grouper : simulé"), { keys: "Ctrl+G" }), { kind: "btn", id: "hue", label: "teinte", hue: true },
      SEP, btn("hide", "masquer la sélection", "eye-off", () => say("sélection masquée (simulé)")), btn("isolate", "isoler avec leurs voisins", "focus", () => say("sélection isolée (simulé)"))].filter(Boolean);
  }
  const it = its[0];
  if (it.kind === "device") return [{ kind: "btn", id: "hue", label: "teinte", hue: true }, SEP, btn("pin", it.pinned ? "retirer l'épingle" : "épingler", it.pinned ? "pin-off" : "pin", () => { remember(); it.pinned = !it.pinned; refresh(); }, { pressed: it.pinned }),
    btn("group", "grouper", "group", () => say("grouper : simulé"), { keys: "Ctrl+G" }), SEP, btn("note", "note attachée", "sticky-note-plus", () => say("note attachée : simulé")),
    btn("conn", "tirer un connecteur", "move-up-right", () => say("outil connecteur : simulé"), { keys: "C" }), SEP, btn("hide", "masquer cet équipement et ses câbles", "eye-off", () => say("masqué (simulé)")), btn("isolate", "isoler avec ses voisins directs", "focus", () => say("isolé (simulé)"))];
  if (isAnno(it)) return [{ kind: "btn", id: "hue", label: "teinte", hue: true }, SEP, btn("size", "taille du texte", "a-large-small", () => say("taille : simulé")), btn("bold", "gras", "bold", () => say("gras : simulé"), { keys: "Ctrl+B" }),
    SEP, btn("layer", "plan", "layers", () => say("plan : simulé")), btn("lock", "verrouiller", "lock-open", () => say("verrou : simulé")), SEP, btn("dup", "dupliquer", "copy-plus", () => say("dupliquer : simulé"), { keys: "Ctrl+D" }), btn("del", "supprimer", "trash-2", () => say("supprimer : simulé"), { keys: "Suppr", danger: true })];
  if (it.kind === "group") return [{ kind: "btn", id: "hue", label: "teinte", hue: true }, SEP, btn("members", "sélectionner les membres", "square-dashed-mouse-pointer", () => { S.sel = [...it.members]; refresh(); }), btn("paint", "appliquer la teinte aux membres", "paintbrush", () => say("teinte appliquée (simulé)")), SEP, btn("del", "supprimer le groupe", "trash-2", () => say("supprimer : simulé"), { danger: true })];
  return null;
}
function anchorBox() { return toScreen(union(S.sel.map((id) => boxOf(item(id))))); }
function obstacles() {
  const out = [];
  for (const it of S.items.values()) { if (S.sel.includes(it.id) || it.kind === "group") continue; out.push({ b: toScreen(boxOf(it)), w: isAnno(it) ? 1 : 0.5 }); }
  return out;
}
const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
function bestPlace(a, w, z, obs) {
  const cx = a.x + a.w / 2, center = clamp(cx - w / 2, z.left, z.right - w);
  const lo = Math.max(z.left, cx + 16 - w), hi = Math.min(z.right - w, cx - 16);
  const sides = [{ below: false, y: a.y - GAP - BAR_H }, { below: true, y: a.y + a.h + GAP }].filter((s) => s.y >= z.top && s.y + BAR_H <= z.bottom);
  if (!sides.length) return { x: center, y: z.top, below: false };
  let best = null;
  for (const s of sides) {
    const xs = [center]; for (const o of obs) xs.push(o.b.x - 8 - w, o.b.x + o.b.w + 8);
    for (const x0 of xs) {
      const x = clamp(x0, lo, hi), cost = obs.reduce((sum, o) => sum + area({ x, y: s.y, w, h: BAR_H }, o.b) * o.w, 0) + (s.below ? 400 : 0) + Math.abs(x - center) * 1.5;
      if (!best || cost < best.cost) best = { x, y: s.y, below: s.below, cost };
    }
  }
  return best;
}
let barShown = false;
function placeBar(entering = false) {
  const spec = barSpec(), suspended = !!S.gesture || S.shift || !!S.menu;
  if (!spec) { fbar.hidden = true; barShown = false; closeVolet(); hideTip(); return; }
  fbar.hidden = false;
  fbar.classList.toggle("suspended", suspended);
  if (suspended) { closeVolet(); hideTip(); barShown = false; return; }
  const z = zone(), b = anchorBox(), w = body.offsetWidth;
  const { x, y, below } = bestPlace(b, w, z, obstacles());
  fbar.classList.toggle("below", below);
  setVars(fbar, { "--fx": `${Math.round(x)}px`, "--fy": `${Math.round(y)}px`, "--cx": `${Math.round(clamp(b.x + b.w / 2 - x, 14, w - 14))}px` });
  if (!barShown || entering) { fbar.classList.remove("enter"); void fbar.offsetWidth; fbar.classList.add("enter"); }
  barShown = true;
  if (S.volet) placeVolet();
}
let lastKey = "";
function renderBar() {
  const spec = barSpec();
  const key = JSON.stringify([S.sel, spec && spec.map((b) => b.kind === "sep" ? "|" : [b.id, b.label, b.pressed]), S.sel.map((id) => item(id) && item(id).hue)]);
  if (key === lastKey) return;
  lastKey = key;
  body.replaceChildren();
  fbar.setAttribute("aria-label", spec ? (S.sel.length > 1 ? `actions rapides : ${S.sel.length} éléments` : "actions rapides") : "");
  if (!spec) return;
  let first = true;
  for (const b of spec) {
    if (b.kind === "sep") { html("span", "fb-sep", body).setAttribute("aria-hidden", "true"); continue; }
    const e = html("button", `fb${b.volet || b.hue ? " opens" : ""}${b.danger ? " danger" : ""}`, body);
    e.type = "button"; e.dataset.id = b.id; e.tabIndex = first ? 0 : -1; first = false;
    e.setAttribute("aria-label", b.label);
    if (b.keys) e.setAttribute("aria-keyshortcuts", b.keys.replace("Maj", "Shift").replace("Suppr", "Delete"));
    if (b.pressed !== undefined) e.setAttribute("aria-pressed", String(!!b.pressed));
    if (b.volet) { e.setAttribute("aria-haspopup", "dialog"); e.setAttribute("aria-expanded", "false"); }
    if (b.hue) { const its = S.sel.map(item), hs = [...new Set(its.map((x) => x.hue || TYPE_HUE[x.type] || "slate"))]; html("span", `fb-hue hue-${hs[0]}`, e); }
    else e.appendChild(lucide(b.icon));
    e.addEventListener("click", () => { hideTip(); if (b.volet) toggleVolet(b, e); else if (b.hue) say("teinte : voir le prototype du lot 4"); else b.act(); });
    e.addEventListener("pointerenter", () => tipLater(e, b.label, b.keys));
    e.addEventListener("pointerleave", hideTip);
    e._spec = b;
  }
  html("span", "fbar-caret", body).setAttribute("aria-hidden", "true");
}
function roving(target) { body.querySelectorAll(".fb").forEach((b) => { b.tabIndex = b === target ? 0 : -1; }); }

// ---------- l'infobulle : libellé · raccourci ----------
let tipTimer = 0, lastTipAt = 0;
function tipLater(e, label, keys) { clearTimeout(tipTimer); if (S.volet) return; tipTimer = later(() => tipNear(e, label, keys, body.getBoundingClientRect(), fbar.classList.contains("below")), performance.now() - lastTipAt < 400 ? 0 : 400); }
function tipNear(e, label, keys, ref, below) {
  tip.querySelector(".ftip-label").textContent = label;
  tip.querySelector(".ftip-keys").textContent = keys || "";
  tip.hidden = false;
  const r = e.getBoundingClientRect(), z = zone(), w = tip.offsetWidth, h = tip.offsetHeight;
  let y = below ? ref.bottom + 6 : ref.top - 6 - h;
  if (y < z.top || y + h > z.bottom) y = below ? ref.top - 6 - h : ref.bottom + 6;
  setVars(tip, { "--tx": `${Math.round(clamp(r.left + r.width / 2 - w / 2, z.left, z.right - w))}px`, "--ty": `${Math.round(y)}px` });
  lastTipAt = performance.now();
}
function hideTip() { clearTimeout(tipTimer); if (!tip.hidden) lastTipAt = performance.now(); tip.hidden = true; }

// ---------- le volet « aligner et répartir », avec la grille ----------
function toggleVolet(b, opener) {
  if (S.volet) return closeVolet(true);
  hideTip();
  S.volet = { id: b.id, opener };
  opener.setAttribute("aria-expanded", "true");
  buildVolet();
  volet.hidden = false;
  placeVolet();
  const first = volet.querySelector("button"); if (first) first.focus({ preventScroll: true });
}
function closeVolet(refocus = false) {
  if (!S.volet) return;
  const opener = S.volet.opener; S.volet = null;
  volet.hidden = true; volet.replaceChildren();
  if (S.preview) preview(false);
  if (opener && opener.isConnected) { opener.setAttribute("aria-expanded", "false"); if (refocus) { roving(opener); opener.focus(); } }
}
function placeVolet() {
  const v = S.volet; if (!v) return;
  const opener = body.querySelector(`[data-id="${v.id}"]`) || v.opener; v.opener = opener;
  const r = opener.getBoundingClientRect(), barBox = body.getBoundingClientRect(), z = zone(), w = volet.offsetWidth, h = volet.offsetHeight;
  // du côté opposé à la sélection : l'objet reste visible pendant qu'on choisit (règle d'Orhan, lot 4)
  const below = fbar.classList.contains("below");
  let y = below ? barBox.bottom + 6 : barBox.top - 6 - h, up = !below;
  if (y < z.top || y + h > z.bottom) { y = below ? barBox.top - 6 - h : barBox.bottom + 6; up = below; }
  volet.classList.toggle("up", up);
  setVars(volet, { "--vx": `${Math.round(clamp(r.left - 8, z.left, z.right - w))}px`, "--vy": `${Math.round(y)}px` });
}
function buildVolet() {
  volet.replaceChildren();
  volet.setAttribute("aria-label", "aligner et répartir");
  const count = selMovable().length;
  volet.className = `fvolet${count >= 3 ? " has-grid" : ""}`;
  const cap = html("div", "volet-cap", volet); html("span", "", cap, "aligner et répartir");
  const val = html("b", "", cap, `${count} éléments`);
  const grid = html("div", "align-grid", volet); grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "aligner et répartir");
  grid.dataset.cols = count >= 3 ? "4" : "3";
  for (const row of ALIGN_ROWS) for (const m of row) {
    if ((m === "dh" || m === "dv") && count < 3) continue;
    const { icon, label, keys } = ALIGN_MODE[m];
    const c = html("button", `vgrid-item${m[0] === "d" ? " dist" : ""}`, grid); c.type = "button"; c.setAttribute("aria-label", label); c.setAttribute("aria-keyshortcuts", keys.replace("Maj", "Shift"));
    c.appendChild(lucide(icon));
    const show = () => tipNear(c, label, keys, volet.getBoundingClientRect(), !volet.classList.contains("up"));
    c.addEventListener("pointerenter", show); c.addEventListener("pointerleave", hideTip);
    c.addEventListener("focus", () => { if (c.matches(":focus-visible")) show(); }); c.addEventListener("blur", hideTip);
    c.addEventListener("click", () => { hideTip(); align(m); });
  }
  if (count < 3) return;
  // la grille : deux réglages nommés (colonnes, ordre), puis l'action ; survoler l'un ou l'autre montre où chacun ira
  html("div", "volet-rule", volet).setAttribute("aria-hidden", "true");
  const plan = () => gridPlan();
  const say2 = () => { const p = plan(); val.textContent = p ? `${count} → ${p.cols} × ${p.rows}` : `${count} éléments`; };
  const on = () => { preview(true); say2(); };
  const off = () => { preview(false); val.textContent = `${count} éléments`; hideTip(); };
  const cols = html("div", "order-row", volet);
  html("span", "order-label", cols, "colonnes");
  const step = html("div", "stepper", cols); step.setAttribute("role", "group"); step.setAttribute("aria-label", "colonnes");
  const minus = html("button", "step", step); minus.type = "button"; minus.setAttribute("aria-label", "une colonne de moins"); minus.appendChild(lucide("minus"));
  const out = html("span", "step-val", step); out.setAttribute("aria-live", "polite");
  const plus = html("button", "step", step); plus.type = "button"; plus.setAttribute("aria-label", "une colonne de plus"); plus.appendChild(lucide("plus"));
  const sync = () => { const c = plan().cols; out.textContent = String(c); out.setAttribute("aria-label", `${c} colonnes`); minus.disabled = c <= 1; plus.disabled = c >= count; };
  const bump = (k) => { S.gridCols = clamp(plan().cols + k, 1, count); sync(); on(); };
  minus.addEventListener("click", () => bump(-1)); plus.addEventListener("click", () => bump(1));
  for (const b of [minus, plus]) { b.addEventListener("pointerenter", on); b.addEventListener("pointerleave", off); }
  sync();
  // l'ordre : par nom (dc01-acc-04, -05… : ce qu'un ingénieur range à la main) ou tel qu'on le voit (rangées par y puis x)
  const ord = html("div", "order-row", volet);
  html("span", "order-label", ord, "ordre");
  const track = html("div", "vseg", ord); track.setAttribute("role", "radiogroup"); track.setAttribute("aria-label", "ordre de la grille");
  for (const [k, label] of [["name", "par nom"], ["screen", "à l'écran"]]) {
    const o = html("button", "vseg-item", track, label); o.type = "button"; o.setAttribute("role", "radio"); o.setAttribute("aria-checked", String(S.gridOrder === k));
    o.addEventListener("click", () => { S.gridOrder = k; track.querySelectorAll(".vseg-item").forEach((x) => x.setAttribute("aria-checked", String(x === o))); on(); });
    o.addEventListener("pointerenter", () => { const was = S.gridOrder; S.gridOrder = k; on(); S.gridOrder = was; });
    o.addEventListener("pointerleave", off);
  }
  const go = html("button", "grid-go", volet); go.type = "button"; go.dataset.role = "grid";
  go.setAttribute("aria-keyshortcuts", "Alt+G");
  go.appendChild(lucide("layout-grid")); html("span", "grid-go-label", go, "mettre en grille"); html("span", "grid-go-keys", go, "Alt+G");
  go.addEventListener("pointerenter", on); go.addEventListener("pointerleave", off);
  go.addEventListener("focus", () => { if (go.matches(":focus-visible")) on(); }); go.addEventListener("blur", off);
  go.addEventListener("click", () => { hideTip(); toGrid(); });
}

// ---------- le menu contextuel d'une sélection ----------
const cmenu = $("#cmenu");
function openMenu(x, y) {
  closeVolet(); hideTip();
  S.menu = true; cmenu.replaceChildren(); cmenu.hidden = false;
  const count = selMovable().length, multi = S.sel.length > 1;
  const entry = (label, keys, act, hover) => {
    const b = html("button", "context-item", cmenu); b.type = "button"; b.setAttribute("role", "menuitem");
    html("span", "context-label", b, label); if (keys) html("span", "context-keys", b, keys);
    b.addEventListener("click", () => { closeMenu(); act(); });
    if (hover) { b.addEventListener("pointerenter", () => preview(true)); b.addEventListener("pointerleave", () => preview(false)); b.addEventListener("focus", () => preview(true)); b.addEventListener("blur", () => preview(false)); }
  };
  const sep = () => html("hr", "context-sep", cmenu);
  entry("centrer", "", () => say("centré (simulé)"));
  entry(multi ? "masquer la sélection" : "masquer", "", () => say("masqué (simulé)"));
  entry(multi ? "isoler la sélection" : "isoler", "", () => say("isolé (simulé)"));
  sep(); entry(multi ? "copier les noms" : "copier le nom", "Ctrl+C", () => say("noms copiés (simulé)"));
  if (count >= 2) { sep(); entry("aligner horizontalement", "", () => align("middle")); entry("aligner verticalement", "", () => align("center")); }
  if (count >= 3) entry("mettre en grille", "Alt+G", toGrid);
  if (multi) entry("grouper la sélection", "Ctrl+G", () => say("grouper : simulé"));
  sep(); entry(multi ? "retirer les épingles" : "retirer l'épingle", "", () => say("épingles retirées (simulé)"));
  const w = cmenu.offsetWidth, h = cmenu.offsetHeight;
  setVars(cmenu, { "--menu-x": `${Math.round(clamp(x, 8, innerWidth - w - 8))}px`, "--menu-y": `${Math.round(clamp(y, 8, innerHeight - h - 8))}px` });
  cmenu.querySelector("button").focus({ preventScroll: true });
  placeBar();
}
function closeMenu() { if (!S.menu) return; S.menu = null; cmenu.hidden = true; cmenu.replaceChildren(); if (S.preview) preview(false); placeBar(true); }

// ---------- l'arrière-plan : barre d'outils, panneau, statut ----------
function renderToolbar() {
  const tb = $("#toolbar"); tb.replaceChildren();
  const tool = (icon, label, act, disabled = false) => { const b = html("button", "tbtn", tb); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.disabled = disabled; b.appendChild(lucide(icon)); if (act) b.addEventListener("click", act); return b; };
  const sep = () => html("span", "toolbar-sep", tb);
  tool("undo-2", "annuler · Ctrl+Z", undo, !S.past.length); tool("redo-2", "rétablir · Ctrl+Y", redo, !S.future.length); sep();
  tool("maximize", "cadrer tout", fitAll); tool("crosshair", "centrer sur la sélection", null, !S.sel.length); sep();
  for (const [i, l] of [["sticky-note", "insérer une note"], ["square", "insérer un rectangle"], ["circle", "insérer une ellipse"], ["table", "insérer un tableau"], ["move-up-right", "outil connecteur · C"], ["image", "insérer une image"]]) tool(i, l, () => say("insertion : voir le prototype du lot 4"));
  if (S.sel.length >= 2) { sep(); const p = html("span", "pill tone-accent toolbar-count", tb, String(S.sel.length)); p.title = `${S.sel.length} éléments sélectionnés`; tool("x", "vider la sélection · Échap", () => { S.sel = []; refresh(); }); }
}
function renderPanel() {
  const panel = $("#panel"), app = $("#app"), its = S.sel.map(item).filter(Boolean), show = its.length > 0 || !!S.special;
  panel.hidden = !show; app.classList.toggle("has-panel", show);
  if (!show) return;
  panel.replaceChildren();
  const head = html("div", "insp-head", panel), top = html("div", "insp-bar", head), kind = html("span", "insp-kind", top);
  const close = html("button", "insp-close", top); close.setAttribute("aria-label", "fermer"); close.appendChild(lucide("x")); close.addEventListener("click", () => { S.sel = []; S.special = null; refresh(); });
  let title, meta, sections, mono = false;
  if (S.special) { kind.append(lucide("group"), document.createTextNode("Cluster HA")); title = "dc01-edge"; meta = "actif-passif · 2 membres"; sections = ["Membres"]; mono = true; }
  else if (its.length > 1) {
    kind.append(lucide("square-dashed-mouse-pointer"), document.createTextNode("Sélection"));
    title = `${its.length} éléments`;
    const d = its.filter((x) => x.kind === "device").length, a = its.length - d;
    meta = [d ? `${d} équipement${d > 1 ? "s" : ""}` : "", a ? `${a} annotation${a > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
    sections = ["Apparence", "Groupe", "Éléments"];
  } else {
    const it = its[0];
    if (it.kind === "device") { kind.append(lucide("workflow"), document.createTextNode(`${it.type === "firewall" ? "Firewall" : "Switch"} · dc01`)); title = it.name; mono = true; meta = it.type === "firewall" ? "fortinet FG-600F · FortiOS 7.4.3" : "cisco N9K-C93180YC-FX · NX-OS 10.4.2"; sections = ["Identité", "Câbles", "Interfaces", "Apparence"]; }
    else if (it.kind === "group") { kind.append(lucide("group"), document.createTextNode("Groupe")); title = it.label; meta = `${it.members.length} membres · orhan`; sections = ["Membres", "Apparence"]; }
    else { kind.append(lucide(it.kind === "note" ? "sticky-note" : "square"), document.createTextNode(it.kind === "note" ? "Note" : "Forme")); title = it.kind === "note" ? "Note" : it.label; meta = `libre · ${it.w} × ${it.h} · orhan`; sections = ["Contenu", "Position", "Forme", "Texte"]; }
  }
  const t = html("h2", `insp-title${mono ? " mono" : ""}`, head, title); t.setAttribute("aria-level", "2");
  html("p", "insp-meta", head, meta);
  for (const s of sections) { const r = html("div", "insp-section", panel, s); r.appendChild(lucide("chevron-down")); }
}
let statusTimer = 0;
function say(msg) { const s = $("#status"); s.textContent = msg; s.classList.add("on"); clearTimeout(statusTimer); statusTimer = later(() => s.classList.remove("on"), 2600); }
function announce(msg) { $("#live").textContent = msg; }
function fitAll() { S.view = { ...HOME }; refresh(); }
function refresh() {
  drawWorld(); drawOverlay(); renderToolbar(); renderPanel(); renderBar(); placeBar();
  if (S.volet && !body.querySelector(`[data-id="${S.volet.id}"]`)) closeVolet();
}

// ---------- les gestes ----------
let press = null;
const TOL_PX = 8;
const freeHeld = (e) => (S.freeKey === "ctrl" ? e.ctrlKey || e.metaKey : e.altKey);
function pick(target) {
  const h = target.closest("[data-handle]"); if (h) return { handle: h.dataset.handle };
  const el = target.closest("[data-id], [data-cluster]");
  if (!el) return null;
  return el.dataset.id ? { id: el.dataset.id } : { special: true };
}
function planePoint(e) { return { x: (e.clientX - S.view.x) / S.view.z, y: (e.clientY - S.view.y) / S.view.z }; }
toile.addEventListener("pointerdown", (e) => {
  if (e.button === 2) return;
  if (e.button !== 0) return;
  closeVolet(); closeMenu(); hideTip();
  const hit = pick(e.target);
  toile.setPointerCapture(e.pointerId);
  if (hit && hit.handle) {
    const it = item(S.sel[0]);
    press = { kind: "resize", handle: hit.handle, id: it.id, x0: e.clientX, y0: e.clientY, from: { x: it.x, y: it.y, w: it.w, h: it.h }, moved: false };
  } else if (hit && hit.special) { S.sel = []; S.special = true; press = null; refresh(); }
  else if (hit) {
    S.special = null;
    if (e.shiftKey || e.ctrlKey || e.metaKey) S.sel = S.sel.includes(hit.id) ? S.sel.filter((x) => x !== hit.id) : [...S.sel, hit.id];
    else if (!S.sel.includes(hit.id)) S.sel = [hit.id];
    const moving = S.sel.includes(hit.id) ? movingSet(S.sel) : [];
    press = { kind: "drag", x0: e.clientX, y0: e.clientY, moved: false, moving, from: new Map(moving.map((id) => [id, { x: item(id).x, y: item(id).y }])) };
    refresh();
  } else if (e.shiftKey) {
    press = { kind: "marquee", start: planePoint(e), base: [...S.sel], moved: false };
  } else {
    press = { kind: "pan", x0: e.clientX, y0: e.clientY, vx: S.view.x, vy: S.view.y, moved: false };
  }
  toile.focus({ preventScroll: true });
});
toile.addEventListener("pointermove", (e) => { if (press) { press.last = e; step(e); } });
function step(e) {
  const dx = e.clientX - (press.x0 ?? e.clientX), dy = e.clientY - (press.y0 ?? e.clientY);
  if (press.kind === "marquee") {
    const p = planePoint(e), s = press.start, r = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    press.moved = press.moved || r.w * S.view.z > 3 || r.h * S.view.z > 3;
    if (!press.moved) return;
    S.gesture = { kind: "marquee", moved: true, rect: r };
    const inside = [...S.items.values()].filter((it) => movable(it) && it.x >= r.x && it.y >= r.y && it.x + it.w <= r.x + r.w && it.y + it.h <= r.y + r.h).map((it) => it.id);
    S.sel = [...new Set([...press.base, ...inside])];
    drawWorld(); renderToolbar(); placeBar();
    return;
  }
  if (!press.moved && Math.hypot(dx, dy) < 3) return;
  if (press.kind === "pan") { press.moved = true; toile.classList.add("panning"); S.view.x = press.vx + dx; S.view.y = press.vy + dy; drawWorld(); drawOverlay(); placeBar(); return; }
  if (press.kind === "drag" && !press.moving.length) return;
  if (!press.moved) { remember(); press.moved = true; S.gesture = { kind: press.kind, moved: true }; hideTip(); placeBar(); }
  if (press.kind === "drag") dragTo(dx, dy, freeHeld(e));
  else resizeTo(dx, dy, freeHeld(e));
}
// glisser : la boîte (englobante s'il y a plusieurs éléments) part de là où le pointeur la mène, puis les repères la
// corrigent, puis l'aimant de grille, sur l'axe que les repères n'ont pas pris ; Ctrl tenu suspend les deux
function dragTo(dx, dy, free) {
  const z = S.view.z, boxes = press.moving.map((id) => ({ ...press.from.get(id), w: item(id).w, h: item(id).h }));
  const u0 = union(boxes), raw = { ...u0, x: u0.x + dx / z, y: u0.y + dy / z };
  let G = { dx: 0, dy: 0, lines: [], gaps: [], snapped: { x: false, y: false } };
  if (!free && S.prefs.guides) G = snapMove(raw, candidates(press.moving, raw), TOL_PX / z);
  let ox = raw.x + G.dx, oy = raw.y + G.dy;
  if (!free && S.prefs.snap) { if (!G.snapped.x) ox = snapGrid(ox); if (!G.snapped.y) oy = snapGrid(oy); }
  const ddx = Math.round(ox) - u0.x, ddy = Math.round(oy) - u0.y;
  for (const [id, p] of press.from) { const it = item(id); it.x = p.x + ddx; it.y = p.y + ddy; }
  const placed = { ...u0, x: u0.x + ddx, y: u0.y + ddy };
  S.guides = { lines: G.lines, gaps: G.gaps, union: press.moving.length > 1 ? placed : null, hits: new Set(G.lines.flatMap((l) => l.hits).concat(G.gaps.flatMap((g) => g.segs.flatMap((s) => s.map((b) => b.id).filter(Boolean))))), pill: { box: placed, text: `${placed.x}, ${placed.y}`, free } };
  drawWorld(); drawOverlay();
}
const MIN_W = 40, MIN_H = 28;
function resizeTo(dx, dy, free) {
  const z = S.view.z, f = press.from, h = press.handle, it = item(press.id);
  const raw = { ...f };
  if (h.includes("e")) raw.w = f.w + dx / z;
  if (h.includes("w")) { raw.x = f.x + dx / z; raw.w = f.w - dx / z; }
  if (h.includes("s")) raw.h = f.h + dy / z;
  if (h.startsWith("n")) { raw.y = f.y + dy / z; raw.h = f.h - dy / z; }
  const edges = [];
  if (h.includes("e")) edges.push(["x", 2]); if (h.includes("w")) edges.push(["x", 0]);
  if (h.includes("s")) edges.push(["y", 2]); if (h.startsWith("n")) edges.push(["y", 0]);
  let R = { d: { x: 0, y: 0 }, snapped: { x: false, y: false } };
  if (!free && S.prefs.guides) R = snapResize(raw, edges, candidates([press.id], raw), TOL_PX / z);
  const out = { ...raw };
  for (const [axis, k] of edges) {
    const lo = AX[axis].lo, size = AX[axis].size;
    let edge = at(raw, axis, k) + R.d[axis];
    if (!free && S.prefs.snap && !R.snapped[axis]) edge = snapGrid(edge);
    edge = Math.round(edge);
    if (k === 2) out[size] = Math.max(axis === "x" ? MIN_W : MIN_H, edge - f[lo]);
    else { const end = f[lo] + f[size]; out[lo] = Math.min(edge, end - (axis === "x" ? MIN_W : MIN_H)); out[size] = end - out[lo]; }
  }
  for (const k of ["x", "y", "w", "h"]) it[k] = Math.round(out[k]);
  const lines = [];
  for (const axis of ["x", "y"]) if (R[axis]) lines.push(alignLine(boxOf(it), candidates([press.id], it), axis, { kind: "edge", line: R[axis].line }));
  S.guides = { lines, gaps: [], union: null, hits: new Set(lines.flatMap((l) => l.hits)), pill: { box: boxOf(it), text: `${it.w} × ${it.h}`, free } };
  drawWorld(); drawOverlay();
}
function endGesture(commit = true) {
  if (!press) return;
  const was = press; press = null; toile.classList.remove("panning");
  if (was.kind === "pan" && !was.moved) { S.sel = []; S.special = null; refresh(); return; }
  if (was.kind === "marquee") { S.gesture = null; refresh(); announce(`${S.sel.length} éléments sélectionnés`); return; }
  if ((was.kind === "drag" || was.kind === "resize") && was.moved) {
    if (!commit) { restore(S.past.pop()); say("glissé annulé"); }
    else if (was.kind === "drag") for (const id of was.moving) if (item(id).kind === "device") item(id).pinned = true;
    S.gesture = null; S.guides = null;
    refresh(); fbar.classList.add("suspended"); later(() => placeBar(true), 120);
    return;
  }
  refresh();
}
toile.addEventListener("pointerup", () => endGesture(true));
toile.addEventListener("pointercancel", () => endGesture(false));
toile.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const hit = pick(e.target);
  if (!hit || !hit.id) return;
  if (!S.sel.includes(hit.id)) { S.sel = [hit.id]; S.special = null; refresh(); }
  openMenu(e.clientX, e.clientY);
});
toile.addEventListener("wheel", (e) => {
  e.preventDefault();
  const k = Math.exp(-e.deltaY * 0.0015), z = clamp(S.view.z * k, 0.3, 2.5), r = z / S.view.z;
  S.view.x = e.clientX - (e.clientX - S.view.x) * r; S.view.y = e.clientY - (e.clientY - S.view.y) * r; S.view.z = z;
  drawWorld(); drawOverlay(); placeBar();
}, { passive: false });

// le clavier : la touche qui libère se relit dès qu'elle change, sans attendre le prochain mouvement
addEventListener("keydown", (e) => {
  if (press && press.moved && (press.kind === "drag" || press.kind === "resize")) {
    if (e.key === "Escape") { e.preventDefault(); return endGesture(false); }
    if (e.key === "Control" || e.key === "Alt" || e.key === "Meta") { e.preventDefault(); rerun(e); }
    return;
  }
  if (S.menu) { if (e.key === "Escape") { e.preventDefault(); closeMenu(); toile.focus(); } else menuKeys(e); return; }
  if (volet.contains(e.target)) return voletKeys(e);
  if (body.contains(e.target)) return barKeys(e);
  if (e.key === "Shift" && !e.repeat && !S.volet) { S.shift = true; placeBar(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); return redo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); S.sel = [...S.items.values()].filter(movable).map((x) => x.id); return refresh(); }
  if (e.altKey && e.code === "KeyG") { e.preventDefault(); return toGrid(); }
  if (e.altKey && e.code === "KeyT") { e.preventDefault(); const f = body.querySelector('.fb[tabindex="0"]'); if (f && !fbar.hidden) f.focus(); return; }
  const ALT = { KeyA: "left", KeyH: "center", KeyD: "right", KeyW: "top", KeyV: "middle", KeyS: "bottom" };
  if (e.altKey && ALT[e.code]) { e.preventDefault(); return align(e.shiftKey && e.code === "KeyH" ? "dh" : e.shiftKey && e.code === "KeyV" ? "dv" : ALT[e.code]); }
  // les flèches : un carreau (20), cinq avec Maj ; aucun repère, aucun aimant : le pas est déjà la grille
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (ARROWS[e.key] && S.sel.length) { e.preventDefault(); const k = e.shiftKey ? 100 : 20, [ax, ay] = ARROWS[e.key]; remember(); for (const id of movingSet(S.sel)) { item(id).x += ax * k; item(id).y += ay * k; } return refresh(); }
  if (e.key === "Escape") { if (S.sel.length || S.special) { S.sel = []; S.special = null; refresh(); } }
});
function rerun(e) {
  // relire le dernier point avec l'état de la touche qui vient de changer
  const ev = press.last; if (!ev) return;
  const fake = { clientX: ev.clientX, clientY: ev.clientY, ctrlKey: e.type === "keydown" ? (e.key === "Control" || e.ctrlKey) : e.ctrlKey && e.key !== "Control", metaKey: e.metaKey && e.key !== "Meta", altKey: e.type === "keydown" ? (e.key === "Alt" || e.altKey) : e.altKey && e.key !== "Alt" };
  step(fake);
}
addEventListener("keyup", (e) => {
  if (press && press.moved && (e.key === "Control" || e.key === "Alt" || e.key === "Meta")) { e.preventDefault(); rerun(e); return; }
  if (e.key === "Shift" && S.shift) { S.shift = false; later(() => placeBar(true), 120); }
});
addEventListener("blur", () => { if (S.shift) { S.shift = false; placeBar(); } });
function barKeys(e) {
  const btns = [...body.querySelectorAll(".fb")], i = btns.indexOf(document.activeElement);
  const go = (j) => { const t = btns[(j + btns.length) % btns.length]; roving(t); t.focus(); };
  if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { const b = btns[i]; if (b && b._spec.volet) { e.preventDefault(); toggleVolet(b._spec, b); } }
  else if (e.key === "Escape") { e.preventDefault(); hideTip(); toile.focus(); }
}
function voletKeys(e) {
  const opts = [...volet.querySelectorAll("button:not(:disabled)")], i = opts.indexOf(document.activeElement);
  const go = (j) => opts[clamp(j, 0, opts.length - 1)].focus();
  if (e.key === "Escape") { e.preventDefault(); closeVolet(true); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); go(i + 4); }
  else if (e.key === "ArrowUp") { e.preventDefault(); go(i - 4); }
  else if (e.key === "Tab") { e.preventDefault(); closeVolet(true); }
}
function menuKeys(e) {
  const opts = [...cmenu.querySelectorAll("button")], i = opts.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
  if (e.key === "ArrowUp") { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length].focus(); }
}
addEventListener("pointerdown", (e) => {
  if (S.volet && !volet.contains(e.target) && !(e.target.closest && e.target.closest(`[data-id="${S.volet.id}"]`))) closeVolet();
  if (S.menu && !cmenu.contains(e.target)) closeMenu();
}, { capture: true });
addEventListener("resize", () => refresh());

// ---------- les réglages : la colonne Controls (préférences du navigateur) et ceux du prototype ----------
const PREF_LABEL = { grid: ["grille", "grille"], snap: ["aimant à la grille", "aimant à la grille"], guides: ["guides d'alignement", "guides d'alignement : aimantent aux objets pendant un glissé"] };
function syncPrefs() {
  for (const k of ["grid", "snap", "guides"]) { const b = $(`#pref-${k}`); b.setAttribute("aria-pressed", String(S.prefs[k])); b.setAttribute("aria-label", PREF_LABEL[k][0]); b.title = PREF_LABEL[k][1]; }
  $("#pref-map").setAttribute("aria-label", "minimap"); $("#pref-map").title = "minimap";
}
for (const k of ["grid", "snap", "guides"]) $(`#pref-${k}`).addEventListener("click", () => {
  S.prefs[k] = !S.prefs[k]; syncPrefs(); refresh();
  const key = S.freeKey === "ctrl" ? "Ctrl" : "Alt";
  if (k === "guides") say(S.prefs.guides ? `guides d'alignement activés · ${key} tenu pendant un glissé pour s'en passer` : "guides d'alignement désactivés");
  if (k === "snap") say(S.prefs.snap ? "aimant à la grille activé : il s'applique après les guides" : "aimant à la grille désactivé");
});
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll("[data-theme-pick]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themePick === t)));
  const tb = $("#theme-btn"); tb.replaceChildren(lucide(t === "dark" ? "sun" : "moon")); tb.setAttribute("aria-label", t === "dark" ? "thème clair" : "thème sombre"); tb.title = tb.getAttribute("aria-label");
  syncColor();
}
function setFree(k) {
  S.freeKey = k;
  document.querySelectorAll("[data-free]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.free === k)));
  $("#free-note").textContent = k === "ctrl" ? "Ctrl tenu pendant le glissé : sans aimant (recommandé ; Alt + glissé reste « cloner », lot 3)" : "Alt tenu pendant le glissé : sans aimant (spécification ; entre en conflit avec Alt + glissé = cloner)";
}
// la couleur des repères : un essai local, posé sur le jeton --guide par le CSSOM ; « rétablir » rend celle de la feuille
let customGuide = null;
function syncColor() {
  const root = document.documentElement;
  if (customGuide) root.style.setProperty("--guide", customGuide); else root.style.removeProperty("--guide");
  const v = getComputedStyle(root).getPropertyValue("--guide").trim();
  $("#guide-color").value = /^#[0-9a-f]{6}$/i.test(v) ? v : "#c6f03a";
}
$("#guide-color").addEventListener("input", (e) => { customGuide = e.target.value; syncColor(); drawOverlay(); });
$("#guide-color-reset").addEventListener("click", () => { customGuide = null; syncColor(); drawOverlay(); });
document.querySelectorAll("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themePick)));
document.querySelectorAll("[data-free]").forEach((b) => b.addEventListener("click", () => setFree(b.dataset.free)));
$("#theme-btn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#proto-help-btn").addEventListener("click", (e) => { const h = $("#proto-help"); h.hidden = !h.hidden; e.currentTarget.setAttribute("aria-expanded", String(!h.hidden)); });
$("#proto-reset").addEventListener("click", () => resetScene());
document.querySelectorAll("[data-icon]").forEach((el) => el.prepend(lucide(el.dataset.icon)));

const HOME = { x: 190, y: 120, z: 0.72 };
function resetScene() { $("#status").classList.remove("on"); world.classList.remove("previewing"); S.preview = null; S.gridOrder = "name"; S.items = new Map(INITIAL.map((it) => [it.id, structuredClone(it)])); S.sel = []; S.special = null; S.past = []; S.future = []; S.gridCols = null; S.gridOrder = "name";
const nameOf = (it) => it.kind === "device" ? it.name : it.kind === "note" ? it.text.split("\n")[0] : it.label; S.view = { ...HOME }; closeVolet(); closeMenu(); refresh(); }

// une petite porte pour les captures (scripts/capture.py)
window.proto = {
  state: S,
  select(ids) { S.special = null; S.sel = ids; refresh(); },
  box(id) { return toScreen(boxOf(item(id))); },
  handle(name) { const h = document.querySelector(`[data-handle="${name}"]`); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  button(id) { const b = body.querySelector(`[data-id="${id}"]`); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  el(sel) { const b = document.querySelector(sel); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
  toScreen(x, y) { return { x: sx(x), y: sy(y) }; },
  view(x, y, z) { S.view = { x, y, z }; refresh(); },
  reset: resetScene, theme: setTheme,
  guides() { return S.guides && { lines: S.guides.lines.map((l) => [l.axis, l.kind, l.at]), gaps: S.guides.gaps.map((g) => [g.axis, g.gap, g.segs.length]) }; },
};
syncPrefs(); setFree("ctrl"); setTheme("dark"); resetScene();
