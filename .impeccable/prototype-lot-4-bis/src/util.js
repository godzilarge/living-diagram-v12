"use strict";
// Prototype du lot 4 bis (docs/11) : une barre contextuelle qui édite vraiment, sur un morceau de toile factice.
// Tout est construit par le DOM (createElement, textContent) ; les seules chaînes HTML sont les icônes Lucide, des
// constantes. Les places passent par des variables CSS posées par le CSSOM, jamais par un style écrit depuis une donnée.
// Modules, dans l'ordre d'assemblage : util (outils, glyphes de type), scene (données, état, historique, géométrie),
// draw (la toile, le texte), fields (le champ numérique, les glyphes de la barre), bar (quoi et où), volets, main.

const NS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
function svg(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "") e.setAttribute(k, attrs[k]);
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
function later(fn, ms) { return setTimeout(fn, ms); }

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
