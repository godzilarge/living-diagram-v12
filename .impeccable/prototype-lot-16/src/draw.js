// ---------- le dessin de la toile ----------
const L = { frames: $("#layer-frames"), links: $("#layer-links"), under: $("#layer-under"), nodes: $("#layer-nodes"), over: $("#layer-over"), handles: $("#layer-handles") };
const world = $("#world"), toile = $("#toile");

function itemGroup(layer, it, cls) {
  const sel = S.sel.includes(it.id);
  const g = svg("g", { class: `item ${cls} hue-${effHue(it)}${sel ? " selected" : ""}${related().has(it.id) ? " related" : ""}`, "data-id": it.id }, layer);
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

// ---------- le texte : retour à la ligne par chasse estimée (comme canvas/annotations.ts), jamais mesuré ----------
const charW = (t) => t.size * (t.font === "mono" ? 0.6 : 0.54) * (t.weight === "bold" ? 1.07 : t.weight === "semibold" ? 1.04 : 1);
function wrap(text, width, t) {
  const per = Math.max(1, Math.floor(width / charW(t))), out = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? line + " " + word : word;
      if (next.length <= per) { line = next; continue; }
      if (line) out.push(line);
      line = word;
      while (line.length > per) { out.push(line.slice(0, per)); line = line.slice(per); }
    }
    out.push(line);
  }
  return out;
}
const lineH = (t) => Math.round(t.size * t.lh / 100);
/** Les lignes d'un texte dans une boîte (x, y, w, h), selon la position (`align`, `valign`), la marge et l'interligne. */
function layout(text, box, t) {
  const inner = Math.max(10, box.w - 2 * t.pad), lh = lineH(t);
  const all = wrap(text, inner, t), max = Math.max(1, Math.floor((box.h - 2 * t.pad + (lh - t.size)) / lh));
  const kept = all.slice(0, max), block = kept.length * lh - (lh - t.size);
  const top = t.valign === "top" ? t.pad : t.valign === "bottom" ? box.h - t.pad - block : (box.h - block) / 2;
  const x = t.align === "left" ? t.pad : t.align === "right" ? box.w - t.pad : box.w / 2;
  const anchor = { left: "start", center: "middle", right: "end" }[t.align];
  return { lines: kept.map((s, i) => ({ s, x: box.x + x, y: box.y + top + i * lh + t.size * 0.8 })), anchor, clipped: all.length > kept.length };
}
function textAttrs(t, extraClass = "") {
  const deco = [t.underline ? "underline" : "", t.strike ? "line-through" : ""].filter(Boolean).join(" ");
  const color = t.color === "ink" ? "c-ink" : t.color === "hue" ? "c-hue" : `c-hue hue-${t.color}`;
  return { class: `tx f-${t.font} ${color} ${extraClass}`, "font-size": t.size, "font-weight": WEIGHT_CSS[t.weight], "font-style": t.italic ? "italic" : "", "text-decoration": deco };
}
function drawLines(parent, lay, t) {
  for (const l of lay.lines) { const e = svg("text", { ...textAttrs(t), x: l.x, y: l.y, "text-anchor": lay.anchor }, parent); e.textContent = l.s; }
}
// la marge intérieure se voit pendant qu'on la règle (un pointillé à l'accent), puis s'efface
function padGuide(parent, w, h, t, it) {
  if (!S.padGuide || !S.sel.includes(it.id)) return;
  svg("rect", { class: "pad-guide", x: t.pad, y: t.pad, width: Math.max(0, w - 2 * t.pad), height: Math.max(0, h - 2 * t.pad), rx: 2 }, parent);
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
  // neuf positions, dedans ou dehors (le contrat les a déjà : label_position, label_placement)
  const [v, h] = it.labelPos, t = it.t, inside = it.placement === "inside", m = 14;
  const x = h === "left" ? b.x + (inside ? m : 0) : h === "right" ? b.x + b.w - (inside ? m : 0) : b.x + b.w / 2;
  let y = v === "top" ? (inside ? b.y + m + t.size * 0.8 : b.y - 8) : v === "bottom" ? (inside ? b.y + b.h - m : b.y + b.h + 8 + t.size * 0.8) : b.y + b.h / 2 + t.size * 0.3;
  let anchor = { left: "start", center: "middle", right: "end" }[h];
  if (!inside && v === "middle") { anchor = h === "left" ? "end" : h === "right" ? "start" : "middle"; }
  const xx = !inside && v === "middle" ? (h === "left" ? b.x - 10 : h === "right" ? b.x + b.w + 10 : x) : x;
  const e = svg("text", { ...textAttrs(t), x: xx, y, "text-anchor": anchor }, g); e.textContent = it.label;
}
const FILL = { 0: 0, 25: 0.18, 50: 0.4, 100: 0.85 };
const DASH = { solid: "", dashed: "6 4", dotted: "1.5 4", none: "" };
function drawAnno(it) {
  if (it.kind === "code") return drawCode(it);
  const layer = it.layer === "dessous" ? L.under : L.over;
  const g = itemGroup(layer, it, `annotation kind-${it.kind}${it.locked ? " locked" : ""}`);
  svg("rect", { class: "hover-ring", x: -3, y: -3, width: it.w + 6, height: it.h + 6, rx: 6 }, g);
  const t = it.t;
  if (it.kind === "note") {
    svg("rect", { class: "annotation-shape", width: it.w, height: it.h, rx: 6, "fill-opacity": it.fill / 100 + 0.06, "stroke-opacity": 0.7 }, g);
    if (S.editing !== it.id) drawLines(g, layout(it.text, { x: 0, y: 0, w: it.w, h: it.h }, t), t);
    padGuide(g, it.w, it.h, t, it);
  } else if (it.kind === "shape") {
    const common = { class: "annotation-shape", "fill-opacity": FILL[it.fill], "stroke-opacity": it.border === "none" ? 0 : 0.9, "stroke-dasharray": DASH[it.border] };
    if (it.shape === "ellipse") svg("ellipse", { ...common, cx: it.w / 2, cy: it.h / 2, rx: it.w / 2, ry: it.h / 2 }, g);
    else svg("rect", { ...common, width: it.w, height: it.h, rx: it.corners }, g);
    drawLines(g, layout(it.label, { x: 0, y: 0, w: it.w, h: it.h }, t), t);
    padGuide(g, it.w, it.h, t, it);
  } else if (it.kind === "table") {
    const rows = it.rows.length, cols = it.rows[0].length, rh = it.h / rows, cw = it.w / cols;
    svg("rect", { class: "annotation-shape", width: it.w, height: it.h, rx: 4, "fill-opacity": 0.08, "stroke-opacity": 0.7 }, g);
    if (it.header) svg("rect", { class: "table-head", x: 0.5, y: 0.5, width: it.w - 1, height: rh - 0.5 }, g);
    for (let r = 1; r < rows; r++) svg("line", { class: "table-line", x1: 0, x2: it.w, y1: r * rh, y2: r * rh }, g);
    for (let c = 1; c < cols; c++) svg("line", { class: "table-line", y1: 0, y2: it.h, x1: c * cw, x2: c * cw }, g);
    it.rows.forEach((row, r) => row.forEach((cell, c) => {
      const tt = r === 0 && it.header ? { ...t, weight: "bold" } : t, cellPad = 10;
      const x = t.align === "left" ? c * cw + cellPad : t.align === "right" ? (c + 1) * cw - cellPad : c * cw + cw / 2;
      const e = svg("text", { ...textAttrs(tt), x, y: r * rh + rh / 2 + t.size * 0.36, "text-anchor": { left: "start", center: "middle", right: "end" }[t.align] }, g); e.textContent = cell;
    }));
  }
}
function arrowHead(parent, from, to, w) {
  const a = Math.atan2(to.y - from.y, to.x - from.x), l = 7 + w * 1.6, hw = 3.6 + w * 0.9;
  const bx = to.x - Math.cos(a) * l, by = to.y - Math.sin(a) * l, px = -Math.sin(a), py = Math.cos(a);
  svg("path", { class: "connector-head", d: `M${to.x} ${to.y}L${bx + px * hw} ${by + py * hw}L${bx - px * hw} ${by - py * hw}Z` }, parent);
}
/** Où se pose l'étiquette d'un connecteur : à `labelAt` % du tracé, sur le trait, au-dessus ou au-dessous. */
function labelPlace(it) {
  const p = alongPath(it, it.labelAt), t = it.t;
  let { nx, ny } = p;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; } // la normale vers le haut de l'écran : « au-dessus » se lit
  const off = it.labelSide === "on" ? 0 : (t.size * 0.6 + 8) * (it.labelSide === "above" ? 1 : -1);
  const w = it.label.length * charW(t) + 14, h = t.size + 9;
  const cx = p.x + nx * off * (Math.abs(ny) < 0.3 ? 0 : 1) + (Math.abs(ny) < 0.3 ? (it.labelSide === "on" ? 0 : (it.labelSide === "above" ? -1 : 1) * (w / 2 + 6)) : 0);
  const cy = p.y + ny * off;
  return { x: cx, y: cy, w, h };
}
function drawConnector(it) {
  const g = svg("g", { class: `item connector hue-${it.hue}${S.sel.includes(it.id) ? " selected" : ""}`, "data-id": it.id }, L.over);
  const P = connPoints(it);
  const trim = (pair, w) => { const [a, b] = pair, d = Math.hypot(b.x - a.x, b.y - a.y) || 1, l = 5 + w * 1.6; return { x: b.x - ((b.x - a.x) / d) * l, y: b.y - ((b.y - a.y) / d) * l }; };
  let d = P.d;
  if (it.heads === "end" || it.heads === "both") { const e = trim(P.head, it.width); d = d.replace(/[LC][^LC]*$/, (seg) => seg.replace(/(-?[\d.]+) (-?[\d.]+)$/, `${e.x} ${e.y}`)); }
  if (it.heads === "start" || it.heads === "both") { const s = trim(P.tail, it.width); d = d.replace(/^M(-?[\d.]+) (-?[\d.]+)/, `M${s.x} ${s.y}`); }
  svg("path", { class: "connector-line", d, "stroke-width": it.width, "stroke-dasharray": it.style === "dashed" ? "7 5" : it.style === "dotted" ? "1 5" : "" }, g);
  if (it.heads === "end" || it.heads === "both") arrowHead(g, P.head[0], P.head[1], it.width);
  if (it.heads === "start" || it.heads === "both") arrowHead(g, P.tail[0], P.tail[1], it.width);
  svg("path", { class: "connector-hit", d: P.d }, g);
  if (it.label) {
    const b = labelPlace(it), t = it.t;
    if (it.labelSide === "on") svg("rect", { class: "connector-label-box", x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h, rx: 4 }, g);
    const e = svg("text", { ...textAttrs(t), x: b.x, y: b.y + t.size * 0.36, "text-anchor": "middle" }, g); e.textContent = it.label;
  }
}
function drawHandles() {
  if (S.sel.length !== 1) return;
  const it = item(S.sel[0]);
  if (!isAnno(it) || S.gesture || S.editing) return;
  const z = S.view.z, k = 1 / z, c = 8 * k, bw = 14 * k, bh = 5 * k;
  // un bloc de code ne règle que sa largeur : sa hauteur vient des lignes montrées (replié ou non)
  // un bloc de code se redimensionne comme une note (hauteur libre, réponse d'Orhan) : huit poignées actives, aimant à la grille
  if (it.kind === "code") {
    const H = it.h, W = it.w, at = (dir, x, y, w, h, rx) => svg("rect", { class: `handle h-${dir}`, "data-act": `resize-${dir}`, "data-for": it.id, x: it.x + x - w / 2, y: it.y + y - h / 2, width: w, height: h, rx }, L.handles);
    for (const [dir, x, y] of [["nw", 0, 0], ["ne", W, 0], ["se", W, H], ["sw", 0, H]]) at(dir, x, y, c, c, 1.5 * k);
    at("n", W / 2, 0, bw, bh, bh / 2); at("s", W / 2, H, bw, bh, bh / 2); at("w", 0, H / 2, bh, bw, bh / 2); at("e", W, H / 2, bh, bw, bh / 2);
    return;
  }
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
  drawLeaders();
  for (const it of S.items.values()) if (isAnno(it)) drawAnno(it);
  for (const it of S.items.values()) if (it.kind === "device") drawDevice(it);
  for (const it of S.items.values()) if (it.kind === "connector") drawConnector(it);
  drawHandles();
}

