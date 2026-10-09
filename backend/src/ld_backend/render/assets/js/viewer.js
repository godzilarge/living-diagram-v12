// Généré par engine/build.mjs depuis engine/src (TypeScript) : ne pas éditer ici, lancer `npm run build` dans engine/.
"use strict";
(() => {
  // src/canvas/align.ts
  var ALIGN_MODES = ["horizontal", "vertical", "distribute-horizontal", "distribute-vertical"];
  var ALIGN_LABEL = {
    horizontal: "aligner horizontalement",
    vertical: "aligner verticalement",
    "distribute-horizontal": "répartir horizontalement",
    "distribute-vertical": "répartir verticalement"
  };
  var mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  function align(positions, hosts, mode) {
    const moved = /* @__PURE__ */ new Map();
    const known2 = hosts.filter((host) => positions.has(host));
    const at = (host) => positions.get(host);
    if (mode === "horizontal" || mode === "vertical") {
      if (known2.length < 2) return moved;
      const axis2 = mode === "horizontal" ? "y" : "x";
      const level = Math.round(mean(known2.map((host) => at(host)[axis2])));
      known2.forEach((host) => {
        const point = at(host);
        if (point[axis2] !== level) moved.set(host, axis2 === "y" ? { x: Math.round(point.x), y: level } : { x: level, y: Math.round(point.y) });
      });
      return moved;
    }
    if (known2.length < 3) return moved;
    const axis = mode === "distribute-horizontal" ? "x" : "y";
    const ordered = known2.slice().sort((p, q) => at(p)[axis] - at(q)[axis] || (p < q ? -1 : p > q ? 1 : 0));
    const first = at(ordered[0])[axis], last = at(ordered[ordered.length - 1])[axis];
    const step2 = (last - first) / (ordered.length - 1);
    ordered.forEach((host, index) => {
      const point = at(host);
      const value2 = Math.round(first + step2 * index);
      if (point[axis] !== value2) moved.set(host, axis === "x" ? { x: value2, y: Math.round(point.y) } : { x: Math.round(point.x), y: value2 });
    });
    return moved;
  }
  var alignment = { align, ALIGN_MODES, ALIGN_LABEL };

  // src/canvas/icons.ts
  var SIZE = 32;
  var FOOT = 4;
  var n = (v) => String(Math.round(v * 100) / 100);
  function rrect(x, y, w, h2, r) {
    return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h2 - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h2)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + h2 - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}Z`;
  }
  function rrectFoot(x, y, w, h2, r, foot) {
    const top = y + h2 - foot, bottom = y + h2;
    if (foot >= r) return `M${n(x)} ${n(top)}H${n(x + w)}V${n(bottom - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(bottom)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(bottom - r)}Z`;
    const inset = r - Math.sqrt(r * r - (r - foot) * (r - foot));
    return `M${n(x + inset)} ${n(top)}H${n(x + w - inset)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(bottom)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x + inset)} ${n(top)}Z`;
  }
  var circle = (cx, cy, r) => `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx + r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
  function circleFoot(cx, cy, r, foot) {
    const dy = r - foot, half = Math.sqrt(r * r - dy * dy);
    return `M${n(cx - half)} ${n(cy + dy)}A${r} ${r} 0 0 0 ${n(cx + half)} ${n(cy + dy)}Z`;
  }
  var bar = (x, y, w, h2) => `M${n(x)} ${n(y)}h${n(w)}v${n(h2)}h${n(-w)}Z`;
  var dot = (cx, cy, r) => circle(cx, cy, r);
  var poly = (pts) => "M" + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L") + "Z";
  function arrow(x1, y1, x2, y2, s2 = 1.3, hl = 5, hw = 3.4) {
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux;
    const bx = x2 - ux * hl, by = y2 - uy * hl;
    return poly([[x1 + px * s2, y1 + py * s2], [bx + px * s2, by + py * s2], [bx + px * hw, by + py * hw], [x2, y2], [bx - px * hw, by - py * hw], [bx - px * s2, by - py * s2], [x1 - px * s2, y1 - py * s2]]);
  }
  function twoWay(x1, y1, x2, y2, s2 = 1.3, hl = 5, hw = 3.4) {
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, px = -uy, py = ux;
    const ax = x1 + ux * hl, ay = y1 + uy * hl, bx = x2 - ux * hl, by = y2 - uy * hl;
    return poly([
      [x1, y1],
      [ax + px * hw, ay + py * hw],
      [ax + px * s2, ay + py * s2],
      [bx + px * s2, by + py * s2],
      [bx + px * hw, by + py * hw],
      [x2, y2],
      [bx - px * hw, by - py * hw],
      [bx - px * s2, by - py * s2],
      [ax - px * s2, ay - py * s2],
      [ax - px * hw, ay - py * hw]
    ]);
  }
  function arc(cx, cy, ro, ri, a0, a1) {
    const p = (r, a) => `${n(cx + r * Math.cos(a * Math.PI / 180))} ${n(cy + r * Math.sin(a * Math.PI / 180))}`;
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${p(ro, a0)}A${ro} ${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri} ${ri} 0 ${large} 0 ${p(ri, a0)}Z`;
  }
  function bricks(x, y, w, h2, rows, mortar) {
    const rowH = (h2 - mortar * (rows - 1)) / rows;
    let d = "";
    for (let r = 1; r < rows; r++) d += bar(x, y + r * rowH + (r - 1) * mortar, w, mortar);
    for (let r = 0; r < rows; r++) {
      const top = y + r * (rowH + mortar), count = r % 2 === 0 ? 2 : 3;
      for (let k = 1; k <= count; k++) d += bar(x + w * k / (count + 1) - mortar / 2, top, mortar, rowH);
    }
    return d;
  }
  function units(x, y, w, h2, count, sep) {
    const unitH = (h2 - sep * (count - 1)) / count;
    let d = "";
    for (let u = 0; u < count; u++) {
      const mid = y + u * (unitH + sep) + unitH / 2;
      if (u > 0) d += bar(x, y + u * unitH + (u - 1) * sep, w, sep);
      d += dot(x + 4.5, mid, 1.7) + bar(x + 8, mid - 0.8, w - 12, 1.6);
    }
    return d;
  }
  var box = (x, y, w, h2, r) => ({ body: rrect(x, y, w, h2, r), shade: rrectFoot(x, y, w, h2, r, FOOT) });
  var GLYPHS = {
    switch: { ...box(2, 6, 28, 20, 4), mark: twoWay(6, 10.5, 26, 21.5, 1.2, 4.6, 3.1) + twoWay(6, 21.5, 26, 10.5, 1.2, 4.6, 3.1) },
    // le routeur : deux flèches sortantes à l'horizontale, deux entrantes à la verticale
    router: {
      body: circle(16, 16, 14),
      shade: circleFoot(16, 16, 14, FOOT),
      mark: twoWay(4.5, 16, 27.5, 16, 1.3, 4.5, 3.2) + arrow(16, 4.5, 16, 11.5, 1.3, 4.5, 3.2) + arrow(16, 27.5, 16, 20.5, 1.3, 4.5, 3.2)
    },
    firewall: { ...box(2, 5, 28, 22, 3), mark: bricks(2, 5, 28, 22, 3, 1.8) },
    load_balancer: {
      ...box(2, 4, 28, 24, 5),
      mark: bar(5, 14.8, 6, 2.4) + dot(12, 16, 2.8) + arrow(12, 16, 25.5, 8.5, 1.2, 4.5, 3) + arrow(12, 16, 26.5, 16, 1.2, 4.5, 3) + arrow(12, 16, 25.5, 23.5, 1.2, 4.5, 3)
    },
    wireless_controller: { ...box(2, 4, 28, 24, 5), mark: arc(16, 17, 12, 9.6, -140, -40) + arc(16, 17, 7.6, 5.2, -140, -40) + dot(16, 17, 2.5) + bar(14.9, 18, 2.2, 7) },
    server: { ...box(5, 2, 22, 28, 4), mark: units(5, 2, 22, 28, 3, 1.6) },
    other: { ...box(3, 3, 26, 26, 6), mark: dot(9.5, 16, 2.3) + dot(16, 16, 2.3) + dot(22.5, 16, 2.3) }
  };
  var LABEL = {
    switch: "switch",
    router: "routeur",
    firewall: "firewall",
    load_balancer: "répartiteur",
    wireless_controller: "contrôleur Wi-Fi",
    server: "serveur",
    other: "autre"
  };
  var TYPES = Object.keys(GLYPHS);
  var glyph = (type) => type !== null && type !== void 0 && GLYPHS[type] || GLYPHS.other;
  var known = (type) => Object.prototype.hasOwnProperty.call(GLYPHS, type);
  var icons = { glyph, known, LABEL, SIZE, TYPES };

  // src/canvas/card.ts
  var STUB_R = 8;
  var LABEL_MAX = 22;
  var CARD_H = 80;
  var WIDTH_STEP = 40;
  var LABEL_PX = 15;
  var ROLE_PX = 10;
  var STACK_PX = 11;
  var RX = 12;
  var RAIL = 6;
  var PAD = 12;
  var GAP = 12;
  var PAD_RIGHT = 16;
  var SUB_GAP = 8;
  var MIN_W = 168;
  var MAX_W = 360;
  var ICON_SCALE = 1.25;
  var ICON_PX = SIZE * ICON_SCALE;
  var MONO_EM = 0.62;
  var WIDE = /[MWmw@%]/;
  var UPPER = /[A-Z]/;
  var NARROW = /[ilIjt.,:;'|!]/;
  var DASH = /[-_ ]/;
  function em(ch) {
    if (WIDE.test(ch)) return 0.88;
    if (UPPER.test(ch)) return 0.7;
    if (NARROW.test(ch)) return 0.3;
    if (DASH.test(ch)) return 0.42;
    if (ch === "…") return 0.95;
    return 0.6;
  }
  function textWidth(text2, px = LABEL_PX) {
    let total2 = 0;
    for (const ch of text2) total2 += em(ch);
    return Math.ceil(total2 * px + 2);
  }
  var monoWidth = (text2, px = LABEL_PX) => Math.ceil(Array.from(text2).length * MONO_EM * px + 2);
  var shortName = (name) => name.length <= LABEL_MAX ? name : name.slice(0, 11) + "…" + name.slice(-10);
  var displayName = (hostname) => shortName(hostname).toUpperCase();
  var clamp = (value2) => Math.min(MAX_W, Math.max(MIN_W, Math.round(value2)));
  var stackText = (count) => "×" + count;
  var r2 = (value2) => String(Math.round(value2 * 100) / 100);
  function railPath(w, h2, rx, rail) {
    const x0 = -w / 2, y0 = -h2 / 2;
    const dy = rx - Math.sqrt(rx * rx - (rx - rail) * (rx - rail));
    const top = y0 + dy, bottom = y0 + h2 - dy;
    return `M${r2(x0 + rail)} ${r2(top)}V${r2(bottom)}A${rx} ${rx} 0 0 1 ${r2(x0)} ${r2(y0 + h2 - rx)}V${r2(y0 + rx)}A${rx} ${rx} 0 0 1 ${r2(x0 + rail)} ${r2(top)}Z`;
  }
  function wide(labelW, roleW, stackW, imposed) {
    const w = Math.max(imposed, naturalWidth(labelW, roleW, stackW));
    const iconX = -w / 2 + RAIL + PAD, textX = iconX + ICON_PX + GAP;
    const sub = roleW > 0 || stackW > 0;
    const subBaseline = 16;
    return {
      w,
      h: CARD_H,
      rx: RX,
      rail: railPath(w, CARD_H, RX, RAIL),
      icon: { x: iconX, y: -ICON_PX / 2, scale: ICON_SCALE },
      label: { x: textX, y: sub ? -4 : 5.5, anchor: "start" },
      role: roleW ? { x: textX, y: subBaseline, anchor: "start" } : null,
      stack: stackW ? { x: textX + (roleW ? roleW + SUB_GAP : 0), y: subBaseline, anchor: "start" } : null
    };
  }
  function naturalWidth(labelW, roleW, stackW) {
    const subW = roleW + (roleW && stackW ? SUB_GAP : 0) + stackW;
    return clamp(RAIL + PAD + ICON_PX + GAP + Math.max(labelW, subW) + PAD_RIGHT);
  }
  var measures = (label2, extras) => [
    monoWidth(label2),
    extras.role ? textWidth(extras.role.toUpperCase(), ROLE_PX) : 0,
    extras.stack ? monoWidth(stackText(extras.stack), STACK_PX) : 0
  ];
  function width(label2, extras) {
    return naturalWidth(...measures(label2, extras));
  }
  function uniformWidth(widths) {
    return Math.ceil(Math.max(MIN_W, ...widths) / WIDTH_STEP) * WIDTH_STEP;
  }
  function plan(label2, extras, imposed = 0) {
    return wide(...measures(label2, extras), imposed);
  }
  function reach(box2, dx, dy) {
    const length = Math.hypot(dx, dy) || 1;
    const ux = Math.abs(dx) / length, uy = Math.abs(dy) / length;
    return Math.min(ux > 1e-6 ? box2.w / 2 / ux : Infinity, uy > 1e-6 ? box2.h / 2 / uy : Infinity);
  }
  var card = { plan, width, uniformWidth, textWidth, monoWidth, shortName, displayName, reach, STUB_R, LABEL_MAX, CARD_H, WIDTH_STEP };

  // src/canvas/groups.ts
  var SHAPES = ["rectangle", "ellipse"];
  var STROKES = ["solid", "dashed", "dotted", "none"];
  var POSITIONS = ["top_left", "top", "top_right", "left", "center", "right", "bottom_left", "bottom", "bottom_right"];
  var PLACEMENTS = ["inside", "outside"];
  var WEIGHTS = ["regular", "semibold", "bold"];
  var FONTS = ["sans", "mono"];
  var LABEL_COLORS = ["hue", "ink"];
  var BOUNDS = { radius: [0, 80], fill_opacity: [0, 100], stroke_width: [0, 8], padding: [0, 300], label_size: [8, 64] };
  var DEFAULT_STYLE = {
    shape: "rectangle",
    radius: 16,
    hue: "slate",
    fill_opacity: 8,
    stroke_width: 2,
    stroke_style: "dashed",
    padding: 24,
    label_position: "top_left",
    label_placement: "inside",
    label_size: 12,
    label_weight: "semibold",
    label_font: "sans",
    label_color: "hue"
  };
  var STYLE_LABEL = {
    rectangle: "rectangle",
    ellipse: "ellipse",
    solid: "plein",
    dashed: "tirets",
    dotted: "pointillés",
    none: "sans bordure",
    top_left: "haut gauche",
    top: "haut",
    top_right: "haut droite",
    left: "gauche",
    center: "centre",
    right: "droite",
    bottom_left: "bas gauche",
    bottom: "bas",
    bottom_right: "bas droite",
    inside: "dedans",
    outside: "dehors",
    regular: "normal",
    semibold: "demi-gras",
    bold: "gras",
    sans: "sans",
    mono: "mono",
    hue: "teinte",
    ink: "encre"
  };
  var WEIGHT_VALUE = { regular: 450, semibold: 600, bold: 750 };
  var presentMembers = (model2, group) => group.members.filter((host) => {
    const node = model2.nodeByHost.get(host);
    return !!node && !node.ghost;
  });
  var orphanMembers = (model2, group) => group.members.filter((host) => {
    const node = model2.nodeByHost.get(host);
    return !node || !!node.ghost;
  });
  function frameOf(centers, boxes, style) {
    if (!centers.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    centers.forEach((center, i) => {
      const box2 = boxes[i] || { w: 0, h: 0 };
      x0 = Math.min(x0, center.x - box2.w / 2);
      x1 = Math.max(x1, center.x + box2.w / 2);
      y0 = Math.min(y0, center.y - box2.h / 2);
      y1 = Math.max(y1, center.y + box2.h / 2);
    });
    let x = x0 - style.padding, y = y0 - style.padding, w = x1 - x0 + 2 * style.padding, h2 = y1 - y0 + 2 * style.padding;
    if (style.shape === "ellipse") {
      const cx = x + w / 2, cy = y + h2 / 2;
      w *= Math.SQRT2;
      h2 *= Math.SQRT2;
      x = cx - w / 2;
      y = cy - h2 / 2;
    }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h2) };
  }
  function labelSlot(frame, style) {
    const m = Math.max(8, Math.round(style.label_size * 0.6));
    const inside = style.label_placement === "inside";
    const pos = style.label_position;
    const col = pos === "left" || pos.endsWith("_left") ? "left" : pos === "right" || pos.endsWith("_right") ? "right" : "center";
    const row2 = pos.startsWith("top") ? "top" : pos.startsWith("bottom") ? "bottom" : "middle";
    const corner = style.shape === "ellipse" && inside && col !== "center" && row2 !== "middle";
    const ix = m + (corner ? frame.w * 0.146 : 0), iy = m + (corner ? frame.h * 0.146 : 0);
    let x = col === "left" ? inside ? ix : -m : col === "right" ? inside ? frame.w - ix : frame.w + m : frame.w / 2;
    let anchor = col === "left" ? "start" : col === "right" ? "end" : "middle";
    if (!inside && row2 !== "middle" && col !== "center") {
      x = col === "left" ? 0 : frame.w;
    }
    if (!inside && row2 === "middle" && col !== "center") anchor = col === "left" ? "end" : "start";
    const y = row2 === "top" ? inside ? iy : -m : row2 === "bottom" ? inside ? frame.h - iy : frame.h + m : frame.h / 2;
    const baseline = row2 === "middle" ? "middle" : row2 === "top" ? inside ? "hanging" : "alphabetic" : inside ? "alphabetic" : "hanging";
    return { x: Math.round(x), y: Math.round(y), anchor, baseline };
  }
  var dashArray = (style) => {
    const k = Math.max(1, style.stroke_width);
    if (style.stroke_style === "dashed") return `${4 * k} ${2.5 * k}`;
    if (style.stroke_style === "dotted") return `${0.1 * k} ${2.2 * k}`;
    return null;
  };
  var groups = { SHAPES, STROKES, POSITIONS, PLACEMENTS, WEIGHTS, FONTS, LABEL_COLORS, BOUNDS, DEFAULT_STYLE, STYLE_LABEL, WEIGHT_VALUE, presentMembers, orphanMembers, frameOf, labelSlot, dashArray };

  // src/canvas/annotations.ts
  var KINDS = ["note", "shape", "table", "image"];
  var SHAPES2 = ["rectangle", "ellipse"];
  var ANCHORS = ["free", "device", "group"];
  var PLANES = ["back", "front"];
  var ALIGNS = ["left", "center", "right"];
  var VALIGNS = ["top", "middle", "bottom"];
  var BOUNDS2 = { size: [20, 4e3], fill_opacity: [0, 100], stroke_width: [0, 8], radius: [0, 80], opacity: [10, 100], text_size: [8, 64] };
  var KIND_LABEL = { note: "note", shape: "forme", table: "tableau", image: "image" };
  var LABEL2 = {
    rectangle: "rectangle",
    ellipse: "ellipse",
    free: "libre",
    device: "équipement",
    group: "groupe",
    back: "dessous",
    front: "dessus",
    left: "gauche",
    center: "centre",
    right: "droite",
    top: "haut",
    middle: "milieu",
    bottom: "bas"
  };
  var DEFAULT_STYLE2 = {
    note: { hue: "amber", fill_opacity: 12, stroke_width: 1, stroke_style: "solid", radius: 8, opacity: 100, text_size: 13, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" },
    shape: { hue: "slate", fill_opacity: 8, stroke_width: 2, stroke_style: "solid", radius: 12, opacity: 100, text_size: 12, text_weight: "semibold", text_font: "sans", text_color: "hue", text_align: "center", text_valign: "middle" },
    table: { hue: "slate", fill_opacity: 0, stroke_width: 1, stroke_style: "solid", radius: 6, opacity: 100, text_size: 12, text_weight: "regular", text_font: "mono", text_color: "ink", text_align: "left", text_valign: "top" },
    image: { hue: "slate", fill_opacity: 0, stroke_width: 0, stroke_style: "none", radius: 8, opacity: 100, text_size: 12, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" }
  };
  var DEFAULT_SIZE = { note: { w: 220, h: 80 }, shape: { w: 200, h: 120 }, table: { w: 160, h: 52 }, image: { w: 320, h: 240 } };
  var TABLE_CELL_W = 80;
  var TABLE_ROW_H = 26;
  var PAD2 = 8;
  var kindOf = (a) => a.content.kind;
  var anchorHost = (a) => a.anchor.kind === "device" ? a.anchor.ref : null;
  var anchorGroup = (a) => a.anchor.kind === "group" ? a.anchor.ref : null;
  function isOrphan(model2, a) {
    if (a.anchor.kind === "device") {
      const node = model2.nodeByHost.get(a.anchor.ref || "");
      return !node || !!node.ghost;
    }
    if (a.anchor.kind === "group") {
      const group = model2.groupById.get(a.anchor.ref || "");
      return !group || !group.members.some((host) => {
        const node = model2.nodeByHost.get(host);
        return !!node && !node.ghost;
      });
    }
    return false;
  }
  function frameOf2(a, anchor) {
    if (a.anchor.kind === "free") return { x: a.x, y: a.y, w: a.w, h: a.h };
    if (!anchor) return null;
    if (anchor.kind === "device") return { x: Math.round(anchor.center.x + a.x), y: Math.round(anchor.center.y + a.y), w: a.w, h: a.h };
    return { x: anchor.frame.x + a.x, y: anchor.frame.y + a.y, w: a.w, h: a.h };
  }
  function offsetOf(a, at, anchor) {
    if (a.anchor.kind === "free" || !anchor) return { x: Math.round(at.x), y: Math.round(at.y) };
    if (anchor.kind === "device") return { x: Math.round(at.x - anchor.center.x), y: Math.round(at.y - anchor.center.y) };
    return { x: Math.round(at.x - anchor.frame.x), y: Math.round(at.y - anchor.frame.y) };
  }
  var anchorRect = (anchor) => anchor.kind === "group" ? anchor.frame : { x: anchor.center.x - anchor.box.w / 2, y: anchor.center.y - anchor.box.h / 2, w: anchor.box.w, h: anchor.box.h };
  var widthOf = (text2, style) => style.text_font === "mono" ? monoWidth(text2, style.text_size) : textWidth(text2, style.text_size);
  var lineHeight = (size) => Math.round(size * 1.35);
  function wrapText(text2, width2, style) {
    const out = [];
    const fits = (s2) => widthOf(s2, style) <= width2;
    text2.split("\n").forEach((paragraph) => {
      let line = "";
      paragraph.split(" ").forEach((word) => {
        const candidate = line ? line + " " + word : word;
        if (fits(candidate)) {
          line = candidate;
          return;
        }
        if (line) out.push(line);
        line = "";
        let rest = word;
        while (rest && !fits(rest)) {
          let cut = 1;
          while (cut < rest.length && fits(rest.slice(0, cut + 1))) cut += 1;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      });
      out.push(line);
    });
    return out;
  }
  function layoutText(text2, frame, style, pad = PAD2) {
    const inner = Math.max(10, frame.w - 2 * pad);
    const all = wrapText(text2, inner, style);
    const lh = lineHeight(style.text_size);
    const max = Math.max(1, Math.floor((frame.h - 2 * pad) / lh));
    const kept = all.slice(0, max);
    const block = kept.length * lh;
    const top = style.text_valign === "top" ? pad : style.text_valign === "bottom" ? frame.h - pad - block : (frame.h - block) / 2;
    const x = style.text_align === "left" ? pad : style.text_align === "right" ? frame.w - pad : frame.w / 2;
    const anchor = style.text_align === "left" ? "start" : style.text_align === "right" ? "end" : "middle";
    return { lines: kept.map((line, i) => ({ text: line, x: Math.round(x), y: Math.round(top + i * lh + style.text_size) })), anchor, clipped: all.length > kept.length };
  }
  function fitCell(text2, width2, style) {
    if (widthOf(text2, style) <= width2) return text2;
    let cut = text2.length;
    while (cut > 0 && widthOf(text2.slice(0, cut) + "…", style) > width2) cut -= 1;
    return cut ? text2.slice(0, cut) + "…" : "";
  }
  function borderPoint(rect, toward) {
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, dx = toward.x - cx, dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const t = Math.min(dx ? rect.w / 2 / Math.abs(dx) : Infinity, dy ? rect.h / 2 / Math.abs(dy) : Infinity);
    return { x: Math.round(cx + dx * t), y: Math.round(cy + dy * t) };
  }
  function leaderOf(frame, anchor) {
    const from = borderPoint(frame, { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 });
    const to = borderPoint(anchor, { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 });
    const overlap = frame.x < anchor.x + anchor.w && anchor.x < frame.x + frame.w && frame.y < anchor.y + anchor.h && anchor.y < frame.y + frame.h;
    if (overlap || Math.hypot(to.x - from.x, to.y - from.y) < 6) return null;
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  }
  var dashArray2 = (style) => dashArray(style);
  function shownWith(a, shownHosts, drawnGroups) {
    if (a.anchor.kind === "device") return shownHosts.has(a.anchor.ref || "");
    if (a.anchor.kind === "group") return drawnGroups.has(a.anchor.ref || "");
    return true;
  }
  function summary(a) {
    const c = a.content;
    if (c.kind === "note") return c.text.split("\n")[0].slice(0, 60);
    if (c.kind === "shape") return (LABEL2[c.shape] || c.shape) + (c.label ? " · " + c.label : "");
    if (c.kind === "table") return c.rows.length + " × " + (c.rows[0] ? c.rows[0].length : 0) + (c.header && c.rows[0] ? " · " + c.rows[0].join(" | ").slice(0, 40) : "");
    return c.alt || "image";
  }
  var signature = (a) => JSON.stringify([a.anchor, a.x, a.y, a.w, a.h, a.z, a.locked, a.leader, a.content, a.style]);
  var annotations = { KINDS, SHAPES: SHAPES2, ANCHORS, PLANES, ALIGNS, VALIGNS, BOUNDS: BOUNDS2, KIND_LABEL, LABEL: LABEL2, DEFAULT_STYLE: DEFAULT_STYLE2, DEFAULT_SIZE, TABLE_CELL_W, TABLE_ROW_H, kindOf, anchorHost, anchorGroup, isOrphan, frameOf: frameOf2, offsetOf, anchorRect, borderPoint, wrapText, layoutText, lineHeight, fitCell, leaderOf, dashArray: dashArray2, shownWith, summary, signature };

  // src/canvas/connectors.ts
  var ROUTES = ["straight", "elbow", "curve"];
  var HEADS = ["none", "arrow"];
  var END_KINDS = ["free", "device", "group", "annotation"];
  var BOUNDS3 = { stroke_width: [1, 8], opacity: [10, 100], text_size: [8, 64], bend: [-2e3, 2e3] };
  var LABEL3 = { straight: "droit", elbow: "coudé", curve: "courbe", none: "aucune", arrow: "flèche", free: "libre", device: "équipement", group: "groupe", annotation: "annotation" };
  var DEFAULT_STYLE3 = { hue: "slate", stroke_width: 2, stroke_style: "solid", opacity: 100, text_size: 12, text_weight: "semibold", text_font: "sans", text_color: "hue" };
  var DEFAULT_HEADS = { start: "none", end: "arrow" };
  var DEFAULT_LENGTH = 160;
  var SIDES = ["auto", "n", "e", "s", "w"];
  var FIXED_SIDES = ["n", "e", "s", "w"];
  var SIDE_LABEL = { auto: "automatique", n: "haut", e: "droite", s: "bas", w: "gauche" };
  var STUB = 24;
  var RECT = { kind: "rect", rx: 0 };
  var attachedEnds = (c) => [c.start, c.end].flatMap((e) => e.kind === "free" ? [] : [{ kind: e.kind, ref: e.ref }]);
  var key = (kind, ref) => kind + "\0" + ref;
  var hostsOf = (c) => attachedEnds(c).filter((e) => e.kind === "device").map((e) => e.ref);
  function isOrphan2(model2, c) {
    return attachedEnds(c).some((e) => {
      if (e.kind === "device") {
        const node = model2.nodeByHost.get(e.ref);
        return !node || !!node.ghost;
      }
      if (e.kind === "group") {
        const group = model2.groupById.get(e.ref);
        return !group || !group.members.some((host) => {
          const node = model2.nodeByHost.get(host);
          return !!node && !node.ghost;
        });
      }
      const a = model2.annotationById.get(e.ref);
      return !a || model2.orphanAnnotations.includes(a);
    });
  }
  function shownWith2(c, shownHosts, drawnGroups, drawnAnnotations) {
    return attachedEnds(c).every((e) => e.kind === "device" ? shownHosts.has(e.ref) : e.kind === "group" ? drawnGroups.has(e.ref) : drawnAnnotations.has(e.ref));
  }
  var centerOf = (place) => place.kind === "point" ? place.at : { x: place.frame.x + place.frame.w / 2, y: place.frame.y + place.frame.h / 2 };
  var unit = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };
  var r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  var add = (p, d, k) => ({ x: p.x + d.x * k, y: p.y + d.y * k });
  var SIDE_NORMAL = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
  function anchorPoint(frame, side) {
    const n2 = SIDE_NORMAL[side];
    return { x: frame.x + frame.w / 2 + n2.x * frame.w / 2, y: frame.y + frame.h / 2 + n2.y * frame.h / 2 };
  }
  var anchorsOf = (frame) => FIXED_SIDES.map((side) => ({ side, at: anchorPoint(frame, side) }));
  function nearestAnchor(frame, at, tolerance) {
    let best = null, bestD = tolerance;
    anchorsOf(frame).forEach((a) => {
      const d = Math.hypot(a.at.x - at.x, a.at.y - at.y);
      if (d <= bestD) {
        best = a;
        bestD = d;
      }
    });
    return best;
  }
  function outlinePoint(frame, shape, toward) {
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2, dx = toward.x - cx, dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    if (shape.kind === "ellipse") {
      const t2 = 1 / Math.sqrt((dx / (frame.w / 2)) ** 2 + (dy / (frame.h / 2)) ** 2);
      return { x: Math.round(cx + dx * t2), y: Math.round(cy + dy * t2) };
    }
    const rx = Math.max(0, Math.min(shape.rx, frame.w / 2, frame.h / 2));
    const flat = borderPoint(frame, toward);
    if (!rx || Math.abs(flat.x - cx) < frame.w / 2 - rx || Math.abs(flat.y - cy) < frame.h / 2 - rx) return flat;
    const k = { x: cx + Math.sign(dx) * (frame.w / 2 - rx), y: cy + Math.sign(dy) * (frame.h / 2 - rx) };
    const d = unit({ x: cx, y: cy }, toward), o = { x: cx - k.x, y: cy - k.y };
    const od = o.x * d.x + o.y * d.y, disc = od * od - (o.x * o.x + o.y * o.y - rx * rx);
    const t = -od + Math.sqrt(Math.max(0, disc));
    return { x: Math.round(cx + d.x * t), y: Math.round(cy + d.y * t) };
  }
  var sideOf = (place) => place.kind === "box" && place.side && place.side !== "auto" ? place.side : null;
  var normalOf = (place) => {
    const side = sideOf(place);
    return side ? SIDE_NORMAL[side] : null;
  };
  function waypoints(a, b, route, bend, da, db) {
    const straight = { via: [], median: null, chord: [a, b] };
    if (route === "curve" && bend) {
      const n2 = normal(a, b);
      return { via: [{ x: (a.x + b.x) / 2 + n2.x * 2 * bend, y: (a.y + b.y) / 2 + n2.y * 2 * bend }], median: null, chord: [a, b] };
    }
    if (route !== "elbow") return straight;
    const a1 = da ? add(a, da, STUB) : a, b1 = db ? add(b, db, STUB) : b;
    const horizontal = (d) => d ? d.x !== 0 : null;
    const ha = horizontal(da), hb = horizontal(db);
    const stubs = (corners2) => [...da ? [a1] : [], ...corners2, ...db ? [b1] : []];
    if (ha !== null && hb !== null && ha !== hb) {
      const corner = ha ? { x: b1.x, y: a1.y } : { x: a1.x, y: b1.y };
      return { via: stubs([corner]), median: null, chord: [a1, b1] };
    }
    const alongX = ha !== null ? ha : hb !== null ? hb : Math.abs(b1.x - a1.x) >= Math.abs(b1.y - a1.y);
    const corners = alongX ? [{ x: (a1.x + b1.x) / 2 + bend, y: a1.y }, { x: (a1.x + b1.x) / 2 + bend, y: b1.y }] : [{ x: a1.x, y: (a1.y + b1.y) / 2 + bend }, { x: b1.x, y: (a1.y + b1.y) / 2 + bend }];
    return { via: stubs(corners), median: corners, chord: [a1, b1] };
  }
  var normal = (a, b) => {
    const u = unit(a, b);
    return { x: -u.y, y: u.x };
  };
  function pathOf(start, end, route, bend) {
    const da = normalOf(start), db = normalOf(end);
    const fixedA = start.kind === "box" && da ? anchorPoint(start.frame, sideOf(start)) : null;
    const fixedB = end.kind === "box" && db ? anchorPoint(end.frame, sideOf(end)) : null;
    const ca = fixedA || centerOf(start), cb = fixedB || centerOf(end);
    const rough = waypoints(ca, cb, route, bend, da, db);
    const towardA = rough.via[0] || cb, towardB = rough.via[rough.via.length - 1] || ca;
    const a = fixedA || (start.kind === "box" ? outlinePoint(start.frame, start.shape || RECT, towardA) : ca);
    const b = fixedB || (end.kind === "box" ? outlinePoint(end.frame, end.shape || RECT, towardB) : cb);
    const real = waypoints(a, b, route, bend, da, db);
    const points = [a, ...real.via, b];
    let d, mid;
    if (route === "curve" && real.via.length) {
      const c = real.via[0];
      d = `M${r1(a.x)},${r1(a.y)} Q${r1(c.x)},${r1(c.y)} ${r1(b.x)},${r1(b.y)}`;
      mid = { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 };
    } else {
      d = points.map((p, i) => (i ? "L" : "M") + r1(p.x) + "," + r1(p.y)).join(" ");
      const m = real.median;
      mid = m ? { x: (m[0].x + m[1].x) / 2, y: (m[0].y + m[1].y) / 2 } : real.via.length ? real.via[Math.floor((real.via.length - 1) / 2)] : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    return { d, a, b, mid, dirA: unit(points[1], a), dirB: unit(points[points.length - 2], b), chord: { a: real.chord[0], b: real.chord[1] }, bendable: route !== "elbow" || !!real.median };
  }
  function bendFrom(a, b, route, at) {
    if (route === "elbow") return Math.round(Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? at.x - (a.x + b.x) / 2 : at.y - (a.y + b.y) / 2);
    const n2 = normal(a, b);
    return Math.round((at.x - (a.x + b.x) / 2) * n2.x + (at.y - (a.y + b.y) / 2) * n2.y);
  }
  function arrowHead(tip2, dir, size) {
    const back = { x: tip2.x - dir.x * size, y: tip2.y - dir.y * size }, n2 = { x: -dir.y, y: dir.x }, half = size * 0.45;
    return `${r1(tip2.x)},${r1(tip2.y)} ${r1(back.x + n2.x * half)},${r1(back.y + n2.y * half)} ${r1(back.x - n2.x * half)},${r1(back.y - n2.y * half)}`;
  }
  var headSize = (style) => 7 + 2.5 * style.stroke_width;
  function bbox(points, pad = 0) {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
  }
  var endText = (e) => e.kind === "free" ? e.x + ", " + e.y : (LABEL3[e.kind] || e.kind) + " " + e.ref + (e.side && e.side !== "auto" ? " (" + SIDE_LABEL[e.side] + ")" : "");
  var summary2 = (c) => (c.heads.start === "arrow" || c.heads.end === "arrow" ? "flèche" : "ligne") + " · " + endText(c.start) + " → " + endText(c.end) + (c.label ? " · " + c.label : "");
  var freeEnd = (at) => ({ kind: "free", x: Math.round(at.x), y: Math.round(at.y) });
  var attachedEnd = (kind, ref, side = "auto") => ({ kind, ref, side });
  var reversed = (c) => ({ start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } });
  var connectors = { ROUTES, HEADS, END_KINDS, SIDES, FIXED_SIDES, SIDE_LABEL, STUB, BOUNDS: BOUNDS3, LABEL: LABEL3, DEFAULT_STYLE: DEFAULT_STYLE3, DEFAULT_HEADS, DEFAULT_LENGTH, attachedEnds, key, hostsOf, isOrphan: isOrphan2, shownWith: shownWith2, normal, anchorPoint, anchorsOf, nearestAnchor, outlinePoint, normalOf, pathOf, bendFrom, arrowHead, headSize, bbox, summary: summary2, freeEnd, attachedEnd, reversed };

  // src/canvas/dom.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var HANDLERS = /* @__PURE__ */ new Map([["onclick", "click"], ["oninput", "input"], ["onchange", "change"], ["onsubmit", "submit"], ["onkeydown", "keydown"]]);
  function flatten(children, into = []) {
    for (const child of children) {
      if (Array.isArray(child)) flatten(child, into);
      else into.push(child);
    }
    return into;
  }
  function fill(element, attrs, children) {
    for (const [name, value2] of Object.entries(attrs || {})) {
      if (value2 === null || value2 === void 0 || value2 === false) continue;
      const event = HANDLERS.get(name);
      if (name === "class") element.setAttribute("class", String(value2));
      else if (event) element.addEventListener(event, value2);
      else element.setAttribute(name, value2 === true ? "" : String(value2));
    }
    for (const child of flatten(children)) {
      if (child === null || child === void 0 || child === false || Array.isArray(child)) continue;
      element.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
    }
    return element;
  }
  var h = (tag, attrs, ...children) => fill(document.createElement(tag), attrs, children);
  var s = (tag, attrs, ...children) => fill(document.createElementNS(SVG_NS, tag), attrs, children);
  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
    return element;
  }
  var dom = { h, s, clear };

  // src/canvas/model.ts
  var SEP = "\0";
  var SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
  var OBSERVED = { lldp: true, cdp: true };
  var SELECTION_KINDS = ["node", "link", "aggregate", "beam", "cluster"];
  var DIFF_SECTIONS = ["nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters"];
  function haRoleGroup(mode, role) {
    if (role === "active" || mode === "active_passive" && role === "primary") return "lead";
    if (role === "standby" || mode === "active_passive" && role === "secondary") return "follow";
    return "plain";
  }
  function haBadge(mode, role) {
    if (role === "member") return null;
    if (role === "standby") return "P";
    if (role === "active" || mode === "active_active") return "A";
    const group = haRoleGroup(mode, role);
    return group === "lead" ? "A" : group === "follow" ? "P" : null;
  }
  var ifaceKey = (hostname, name) => hostname + SEP + name;
  var linkId = (link) => [link.a.hostname, link.a.interface, link.b.hostname, link.b.interface].join(SEP);
  var pairKey = (link) => link.a.hostname + SEP + link.b.hostname;
  var endLabel = (end) => end.hostname + " · " + (end.interface === null || end.interface === void 0 ? "?" : end.interface);
  var aggregateKey = (hostname, name) => hostname + SEP + name;
  var clusterId = (members) => members.join(SEP);
  function worst(checks) {
    let best = null;
    for (const check of checks) {
      if (best === null || SEVERITY_RANK[check.severity] < SEVERITY_RANK[best]) best = check.severity;
    }
    return best;
  }
  function pushTo(map, key2, value2) {
    const found = map.get(key2);
    if (found) found.push(value2);
    else map.set(key2, [value2]);
  }
  function attachChecks(model2, checks) {
    checks.forEach((check, index) => {
      const entry = { index, code: check.code, severity: check.severity, origin: check.origin, refs: check.refs, details: check.details };
      model2.checks.push(entry);
      const hosts = /* @__PURE__ */ new Set();
      for (const ref of check.refs) {
        if (ref.kind === "link") {
          hosts.add(ref.a.hostname);
          hosts.add(ref.b.hostname);
        } else if (ref.kind === "aggregate") {
          hosts.add(ref.hostname);
          pushTo(model2.checksByAggregate, aggregateKey(ref.hostname, ref.name), entry);
        } else if (ref.kind === "interface") {
          hosts.add(ref.hostname);
        } else if (ref.kind === "cluster") {
          ref.members.forEach((member) => hosts.add(member));
          pushTo(model2.checksByCluster, clusterId(ref.members), entry);
        } else if (ref.hostname) {
          hosts.add(ref.hostname);
        }
      }
      hosts.forEach((host) => pushTo(model2.checksByNode, host, entry));
    });
  }
  function buildLinks(model2, links, ghosts) {
    const groups2 = /* @__PURE__ */ new Map();
    const add2 = (raw, ghost) => {
      const sources = Array.from(new Set(raw.evidence.map((e) => e.source))).sort();
      const link = {
        index: model2.links.length + model2.ghostLinks.length,
        id: linkId(raw),
        pair: pairKey(raw),
        raw,
        a: raw.a,
        b: raw.b,
        status: raw.status,
        sources,
        combo: sources.join(" + "),
        beam: null,
        heartbeat: false,
        ghost,
        checks: [],
        portChecks: [],
        worst: null,
        indexInPair: 0,
        pairCount: 1
      };
      (ghost ? model2.ghostLinks : model2.links).push(link);
      model2.linkById.set(link.id, link);
      pushTo(groups2, link.pair, link);
      pushTo(model2.linksByIface, ifaceKey(raw.a.hostname, raw.a.interface), link);
      pushTo(model2.linksByIface, ifaceKey(raw.b.hostname, raw.b.interface), link);
      pushTo(model2.linksByNode, raw.a.hostname, link);
      if (raw.b.hostname !== raw.a.hostname) pushTo(model2.linksByNode, raw.b.hostname, link);
    };
    links.forEach((raw) => add2(raw, false));
    ghosts.forEach((raw) => {
      if (!model2.linkById.has(linkId(raw))) add2(raw, true);
    });
    groups2.forEach((members) => {
      const ranked = members.map((link, rank) => ({ link, rank, beam: beamIdOf(link.raw) || "" }));
      ranked.sort((x, y) => x.beam < y.beam ? -1 : x.beam > y.beam ? 1 : x.rank - y.rank);
      ranked.forEach(({ link }, index) => {
        link.indexInPair = index;
        link.pairCount = members.length;
      });
    });
  }
  function addGhosts(model2, diff) {
    diff.nodes.removed.forEach((node) => {
      if (model2.nodeByHost.has(node.hostname)) return;
      const ghost = { ...node, ghost: true };
      model2.ghostNodes.push(ghost);
      model2.nodeByHost.set(node.hostname, ghost);
    });
    diff.interfaces.removed.forEach((itf) => {
      const key2 = ifaceKey(itf.hostname, itf.name);
      if (model2.ifaceByKey.has(key2)) return;
      const ghost = { ...itf, ghost: true };
      model2.ghostIfaceByKey.set(key2, ghost);
      pushTo(model2.ghostIfacesByNode, itf.hostname, ghost);
    });
  }
  function interfaceAt(model2, hostname, name, removed) {
    const key2 = ifaceKey(hostname, name);
    const live = model2.ifaceByKey.get(key2);
    if (live) return { itf: live, ghost: false };
    const gone = removed ? model2.ghostIfaceByKey.get(key2) : null;
    return gone ? { itf: gone, ghost: true } : null;
  }
  var emptyDiffIndex = () => ({ node: /* @__PURE__ */ new Map(), interface: /* @__PURE__ */ new Map(), link: /* @__PURE__ */ new Map(), aggregate: /* @__PURE__ */ new Map(), cluster: /* @__PURE__ */ new Map(), mlag_domain: /* @__PURE__ */ new Map() });
  function indexDiff(diff) {
    const of = emptyDiffIndex();
    if (!diff) return of;
    const mark = (map, key2, kind, fields) => {
      map.set(key2, { kind, fields: fields || [] });
    };
    const mlagKey = (id, members) => id + SEP + members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP);
    diff.nodes.added.forEach((n2) => mark(of.node, n2.hostname, "added"));
    diff.nodes.removed.forEach((n2) => mark(of.node, n2.hostname, "removed"));
    diff.nodes.changed.forEach((c) => {
      if (c.ref.kind === "node") mark(of.node, c.ref.hostname, "changed", c.fields);
    });
    diff.interfaces.added.forEach((i) => mark(of.interface, ifaceKey(i.hostname, i.name), "added"));
    diff.interfaces.removed.forEach((i) => mark(of.interface, ifaceKey(i.hostname, i.name), "removed"));
    diff.interfaces.changed.forEach((c) => {
      if (c.ref.kind === "interface") mark(of.interface, ifaceKey(c.ref.hostname, c.ref.name), "changed", c.fields);
    });
    diff.links.added.forEach((l) => mark(of.link, linkId(l), "added"));
    diff.links.removed.forEach((l) => mark(of.link, linkId(l), "removed"));
    diff.links.changed.forEach((c) => {
      if (c.ref.kind === "link") mark(of.link, linkId(c.ref), "changed", c.fields);
    });
    diff.aggregates.added.forEach((a) => mark(of.aggregate, aggregateKey(a.hostname, a.name), "added"));
    diff.aggregates.removed.forEach((a) => mark(of.aggregate, aggregateKey(a.hostname, a.name), "removed"));
    diff.aggregates.changed.forEach((c) => {
      if (c.ref.kind === "aggregate") mark(of.aggregate, aggregateKey(c.ref.hostname, c.ref.name), "changed", c.fields);
    });
    diff.ha_clusters.added.forEach((c) => mark(of.cluster, clusterId(c.members.map((m) => m.hostname)), "added"));
    diff.ha_clusters.removed.forEach((c) => mark(of.cluster, clusterId(c.members.map((m) => m.hostname)), "removed"));
    diff.ha_clusters.changed.forEach((c) => {
      if (c.ref.kind === "cluster") mark(of.cluster, clusterId(c.ref.members), "changed", c.fields);
    });
    diff.mlag_domains.added.forEach((d) => mark(of.mlag_domain, mlagKey(d.mlag_id, d.members), "added"));
    diff.mlag_domains.removed.forEach((d) => mark(of.mlag_domain, mlagKey(d.mlag_id, d.members), "removed"));
    diff.mlag_domains.changed.forEach((c) => {
      if (c.ref.kind === "mlag_domain") mark(of.mlag_domain, mlagKey(c.ref.mlag_id, c.ref.members), "changed", c.fields);
    });
    return of;
  }
  function diffCount(diff) {
    if (!diff) return 0;
    const s2 = diff.summary;
    const sections = DIFF_SECTIONS.reduce((sum, name) => sum + s2[name].added + s2[name].removed + s2[name].changed, 0);
    return sections + s2.checks.appeared + s2.checks.resolved + s2.coverage.changed + s2.events.rebooted + s2.events.flapped;
  }
  function buildAggregates(model2, snapshot) {
    snapshot.aggregates.forEach((raw, index) => {
      const key2 = aggregateKey(raw.hostname, raw.name);
      const entry = { index, key: key2, raw, hostname: raw.hostname, name: raw.name, cables: [], mlag: null, beams: [], checks: [], worst: null };
      entry.cables = raw.cables.map((cable) => model2.linkById.get(linkId(cable))).filter((link) => !!link);
      model2.aggregates.push(entry);
      model2.aggregateByKey.set(key2, entry);
      pushTo(model2.aggregatesByNode, raw.hostname, entry);
    });
    snapshot.mlag_domains.forEach((raw, index) => {
      const members = raw.members.map((m) => model2.aggregateByKey.get(aggregateKey(m.hostname, m.aggregate))).filter((a) => !!a);
      const domain = {
        index,
        raw,
        id: String(raw.mlag_id) + SEP + raw.members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP),
        members,
        peerLink: raw.peer_link ? model2.aggregateByKey.get(aggregateKey(raw.peer_link.hostname, raw.peer_link.aggregate)) || null : null
      };
      model2.mlagDomains.push(domain);
      members.forEach((aggregate) => {
        aggregate.mlag = domain;
      });
    });
  }
  function beamEndsOf(raw) {
    if (raw.aggregate_a === null || raw.aggregate_b === null || raw.a.hostname === raw.b.hostname) return null;
    const ends = [{ hostname: raw.a.hostname, aggregate: raw.aggregate_a }, { hostname: raw.b.hostname, aggregate: raw.aggregate_b }].map((end) => ({ ...end, key: aggregateKey(end.hostname, end.aggregate) })).sort((x, y) => x.key < y.key ? -1 : 1);
    return [ends[0], ends[1]];
  }
  var beamIdOf = (raw) => {
    const ends = beamEndsOf(raw);
    return ends ? ends[0].key + SEP + ends[1].key : null;
  };
  function buildBeams(model2) {
    for (const link of model2.links) {
      const ends = beamEndsOf(link.raw);
      if (!ends) continue;
      const id = ends[0].key + SEP + ends[1].key;
      if (!model2.beamById.has(id)) {
        const aggregates = ends.map((end) => model2.aggregateByKey.get(end.key) || null);
        const known2 = aggregates.filter((agg) => !!agg);
        const mlags = Array.from(new Set(known2.map((agg) => agg.mlag).filter((d) => !!d)));
        const beam2 = {
          index: model2.beams.length,
          id,
          a: ends[0],
          b: ends[1],
          aggregates,
          known: known2,
          links: [],
          peerLink: known2.length > 0 && known2.every((agg) => agg.raw.mlag_peer_link),
          degraded: known2.some((agg) => agg.raw.degraded),
          mlags,
          checks: [],
          worst: null
        };
        model2.beams.push(beam2);
        model2.beamById.set(id, beam2);
        aggregates.forEach((agg) => {
          if (agg) agg.beams.push(beam2);
        });
        ends.forEach((end) => pushTo(model2.beamsByNode, end.hostname, beam2));
      }
      const beam = model2.beamById.get(id);
      beam.links.push(link);
      link.beam = beam;
    }
  }
  function buildClusters(model2, snapshot) {
    snapshot.ha_clusters.forEach((raw, index) => {
      const hosts = raw.members.map((m) => m.hostname);
      const cluster = {
        index,
        raw,
        id: clusterId(hosts),
        hosts,
        checks: [],
        worst: null,
        heartbeats: raw.heartbeat_interfaces.map((hb) => ({ ...hb, link: hb.cable ? model2.linkById.get(linkId(hb.cable)) || null : null }))
      };
      model2.clusters.push(cluster);
      model2.clusterById.set(cluster.id, cluster);
      hosts.forEach((host) => pushTo(model2.clustersByHost, host, cluster));
      raw.members.forEach((member) => pushTo(model2.haMembershipsByHost, member.hostname, { cluster, member }));
      cluster.heartbeats.forEach((hb) => {
        if (hb.link) hb.link.heartbeat = true;
      });
    });
  }
  var LOCAL_PORT_KEYS = /* @__PURE__ */ new Set(["member", "interface", "members", "priorities", "disputed", "clusters"]);
  function mentioned(value2, found) {
    if (Array.isArray(value2)) value2.forEach((item) => mentioned(item, found));
    else if (value2 && typeof value2 === "object") {
      const record = value2;
      if ("hostname" in record && "interface" in record) found.ends.add(ifaceKey(String(record.hostname), record.interface));
      else Object.entries(record).forEach(([key2, item]) => {
        if (!LOCAL_PORT_KEYS.has(key2)) mentioned(item, found);
      });
    } else if (typeof value2 === "string") found.names.add(value2);
    return found;
  }
  function concerns(check, link, portKey) {
    const found = mentioned(check.details, { ends: /* @__PURE__ */ new Set(), names: /* @__PURE__ */ new Set() });
    const other = ifaceKey(link.a.hostname, link.a.interface) === portKey ? link.b : link.a;
    if (found.ends.has(ifaceKey(other.hostname, other.interface)) || found.names.has(other.hostname) || found.names.has(other.interface)) return true;
    return link.raw.evidence.some((e) => ifaceKey(e.witness.hostname, e.witness.interface) === portKey && (found.names.has(e.remote_raw.name) || e.remote_raw.port !== null && found.names.has(e.remote_raw.port)));
  }
  function distributeChecks(model2) {
    const byRank2 = (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.index - y.index;
    model2.links.forEach((link) => {
      link.checks = [];
      link.portChecks = [];
    });
    for (const check of model2.checks) {
      const named = check.refs.filter((ref) => ref.kind === "link").map((ref) => model2.linkById.get(linkId(ref))).filter((l) => !!l);
      if (named.length) {
        named.forEach((link) => link.checks.push(check));
        continue;
      }
      for (const ref of check.refs.filter((r) => r.kind === "interface")) {
        const portKey = ifaceKey(ref.hostname, ref.name);
        const carried = (model2.linksByIface.get(portKey) || []).filter((link) => !link.ghost);
        const chosen = carried.length === 1 ? carried : carried.filter((link) => concerns(check, link, portKey));
        (chosen.length ? chosen : carried).forEach((link) => (chosen.length ? link.checks : link.portChecks).push(check));
      }
    }
    model2.links.forEach((link) => {
      link.checks = Array.from(new Set(link.checks)).sort(byRank2);
      link.portChecks = Array.from(new Set(link.portChecks)).filter((c) => !link.checks.includes(c)).sort(byRank2);
      link.worst = worst(link.checks);
    });
    model2.aggregates.forEach((agg) => {
      agg.checks = (model2.checksByAggregate.get(agg.key) || []).slice().sort(byRank2);
      agg.worst = worst(agg.checks);
    });
    model2.clusters.forEach((cluster) => {
      cluster.checks = (model2.checksByCluster.get(cluster.id) || []).slice().sort(byRank2);
      cluster.worst = worst(cluster.checks);
    });
    model2.beams.forEach((beam) => {
      const own = beam.aggregates.flatMap((agg) => agg ? agg.checks : []);
      beam.checks = Array.from(new Set(own)).sort(byRank2);
      beam.worst = worst(beam.checks);
    });
  }
  function sourceCombos(links) {
    const rows = /* @__PURE__ */ new Map();
    for (const link of links) {
      const key2 = link.combo + SEP + link.status;
      let row2 = rows.get(key2);
      if (!row2) {
        row2 = { combo: link.combo, status: link.status, observed: link.sources.some((s2) => OBSERVED[s2]), count: 0 };
        rows.set(key2, row2);
      }
      row2.count += 1;
    }
    return Array.from(rows.values()).sort((x, y) => y.count - x.count || (x.combo < y.combo ? -1 : 1));
  }
  function countBy(items, keyOf) {
    const counts = /* @__PURE__ */ new Map();
    for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
    return counts;
  }
  function applyIntent(model2, intent2) {
    model2.intent = intent2;
    const absent = (hostname) => {
      const node = model2.nodeByHost.get(hostname);
      return !node || !!node.ghost;
    };
    model2.pinByHost = new Map((intent2 ? intent2.pins : []).map((pin) => [pin.hostname, pin]));
    model2.orphanPins = (intent2 ? intent2.pins : []).filter((pin) => absent(pin.hostname));
    model2.colorByType = new Map((intent2 && intent2.type_colors ? intent2.type_colors : []).map((color) => [color.type, color]));
    model2.colorByHost = new Map((intent2 && intent2.device_colors ? intent2.device_colors : []).map((color) => [color.hostname, color]));
    model2.orphanColors = (intent2 && intent2.device_colors ? intent2.device_colors : []).filter((color) => absent(color.hostname));
    const groups2 = intent2 && intent2.groups ? intent2.groups : [];
    model2.groupById = new Map(groups2.map((group) => [group.id, group]));
    model2.groupsByHost = /* @__PURE__ */ new Map();
    groups2.forEach((group) => group.members.forEach((host) => {
      const list = model2.groupsByHost.get(host) || [];
      list.push(group);
      model2.groupsByHost.set(host, list);
    }));
    model2.orphanGroups = groups2.filter((group) => group.members.every(absent));
    const notes = intent2 && intent2.annotations ? intent2.annotations : [];
    model2.annotationById = new Map(notes.map((a) => [a.id, a]));
    model2.annotationsByHost = /* @__PURE__ */ new Map();
    model2.annotationsByGroup = /* @__PURE__ */ new Map();
    notes.forEach((a) => {
      const index = a.anchor.kind === "device" ? model2.annotationsByHost : a.anchor.kind === "group" ? model2.annotationsByGroup : null;
      if (!index || !a.anchor.ref) return;
      const list = index.get(a.anchor.ref) || [];
      list.push(a);
      index.set(a.anchor.ref, list);
    });
    model2.orphanAnnotations = notes.filter((a) => isOrphan(model2, a));
    const lines = intent2 && intent2.connectors ? intent2.connectors : [];
    model2.connectorById = new Map(lines.map((c) => [c.id, c]));
    model2.connectorsByRef = /* @__PURE__ */ new Map();
    lines.forEach((c) => attachedEnds(c).forEach((e) => {
      const k = key(e.kind, e.ref), list = model2.connectorsByRef.get(k) || [];
      list.push(c);
      model2.connectorsByRef.set(k, list);
    }));
    model2.orphanConnectors = lines.filter((c) => isOrphan2(model2, c));
  }
  function applyPlacement(model2, placement2) {
    model2.placement = placement2;
    model2.placeByHost = new Map((placement2 ? placement2.places : []).map((place) => [place.hostname, place]));
  }
  function build(data2) {
    const snapshot = data2.snapshot;
    const diff = data2.diff || null;
    const model2 = {
      source: snapshot.source,
      report: snapshot.report,
      coverage: snapshot.coverage,
      ingest: data2.ingest || null,
      origin: data2.origin,
      catalogue: data2.catalogue || {},
      snapshotVersion: snapshot.snapshot_version,
      diff,
      nodes: snapshot.nodes,
      ghostNodes: [],
      nodeByHost: /* @__PURE__ */ new Map(),
      interfaces: snapshot.interfaces,
      ifaceByKey: /* @__PURE__ */ new Map(),
      ifacesByNode: /* @__PURE__ */ new Map(),
      ghostIfaceByKey: /* @__PURE__ */ new Map(),
      ghostIfacesByNode: /* @__PURE__ */ new Map(),
      links: [],
      ghostLinks: [],
      linkById: /* @__PURE__ */ new Map(),
      linksByNode: /* @__PURE__ */ new Map(),
      linksByIface: /* @__PURE__ */ new Map(),
      checks: [],
      checksByNode: /* @__PURE__ */ new Map(),
      checksByAggregate: /* @__PURE__ */ new Map(),
      checksByCluster: /* @__PURE__ */ new Map(),
      aggregates: [],
      aggregateByKey: /* @__PURE__ */ new Map(),
      aggregatesByNode: /* @__PURE__ */ new Map(),
      mlagDomains: [],
      beams: [],
      beamById: /* @__PURE__ */ new Map(),
      beamsByNode: /* @__PURE__ */ new Map(),
      clusters: [],
      clusterById: /* @__PURE__ */ new Map(),
      clustersByHost: /* @__PURE__ */ new Map(),
      haMembershipsByHost: /* @__PURE__ */ new Map(),
      combos: [],
      severityCounts: /* @__PURE__ */ new Map(),
      statusCounts: /* @__PURE__ */ new Map(),
      kindCounts: /* @__PURE__ */ new Map(),
      diffOf: emptyDiffIndex(),
      changeOf: () => null,
      diffCount: 0,
      intent: null,
      pinByHost: /* @__PURE__ */ new Map(),
      orphanPins: [],
      colorByType: /* @__PURE__ */ new Map(),
      colorByHost: /* @__PURE__ */ new Map(),
      orphanColors: [],
      groupById: /* @__PURE__ */ new Map(),
      groupsByHost: /* @__PURE__ */ new Map(),
      orphanGroups: [],
      annotationById: /* @__PURE__ */ new Map(),
      annotationsByHost: /* @__PURE__ */ new Map(),
      annotationsByGroup: /* @__PURE__ */ new Map(),
      orphanAnnotations: [],
      connectorById: /* @__PURE__ */ new Map(),
      connectorsByRef: /* @__PURE__ */ new Map(),
      orphanConnectors: [],
      placement: null,
      placeByHost: /* @__PURE__ */ new Map(),
      cardWidth: 0
    };
    snapshot.nodes.forEach((node) => model2.nodeByHost.set(node.hostname, node));
    snapshot.interfaces.forEach((itf) => {
      model2.ifaceByKey.set(ifaceKey(itf.hostname, itf.name), itf);
      pushTo(model2.ifacesByNode, itf.hostname, itf);
    });
    if (diff) addGhosts(model2, diff);
    buildLinks(model2, snapshot.links, diff ? diff.links.removed : []);
    buildAggregates(model2, snapshot);
    buildBeams(model2);
    buildClusters(model2, snapshot);
    attachChecks(model2, snapshot.checks);
    distributeChecks(model2);
    model2.combos = sourceCombos(model2.links);
    model2.severityCounts = countBy(model2.checks, (c) => c.severity);
    model2.statusCounts = countBy(model2.links, (l) => l.status);
    model2.kindCounts = countBy(model2.nodes, (n2) => n2.kind);
    model2.diffOf = indexDiff(diff);
    model2.changeOf = (kind, id) => model2.diffOf[kind].get(id) || null;
    model2.diffCount = diffCount(diff);
    model2.cardWidth = commonCardWidth(model2);
    applyIntent(model2, data2.intent || null);
    applyPlacement(model2, data2.placement || null);
    return model2;
  }
  var linkToken = (link) => JSON.stringify([link.a.hostname, link.a.interface, link.b.hostname, link.b.interface]);
  function parseToken(token, length) {
    try {
      const parts = JSON.parse(token);
      return Array.isArray(parts) && (length === null || parts.length === length) && parts.every((p) => typeof p === "string") ? parts : null;
    } catch (error) {
      return null;
    }
  }
  function linkFromToken(model2, token) {
    const parts = parseToken(token, 4);
    return parts ? model2.linkById.get(parts.join(SEP)) || null : null;
  }
  function entityOf(model2, selection) {
    if (!selection) return null;
    const maps = { node: model2.nodeByHost, link: model2.linkById, aggregate: model2.aggregateByKey, beam: model2.beamById, cluster: model2.clusterById, group: model2.groupById, annotation: model2.annotationById, connector: model2.connectorById };
    return maps[selection.kind] ? maps[selection.kind].get(selection.id) || null : null;
  }
  var nodeOf = (model2, selection) => selection && selection.kind === "node" ? entityOf(model2, selection) : null;
  var linkOf = (model2, selection) => selection && selection.kind === "link" ? entityOf(model2, selection) : null;
  var aggregateOf = (model2, selection) => selection && selection.kind === "aggregate" ? entityOf(model2, selection) : null;
  var beamOf = (model2, selection) => selection && selection.kind === "beam" ? entityOf(model2, selection) : null;
  var clusterOf = (model2, selection) => selection && selection.kind === "cluster" ? entityOf(model2, selection) : null;
  var groupOf = (model2, selection) => selection && selection.kind === "group" ? entityOf(model2, selection) : null;
  var presentOf = (model2, group) => group.members.filter((host) => {
    const node = model2.nodeByHost.get(host);
    return !!node && !node.ghost;
  });
  function hostsOf2(model2, selection) {
    if (!selection || !entityOf(model2, selection)) return [];
    switch (selection.kind) {
      case "node":
        return [nodeOf(model2, selection).hostname];
      case "link": {
        const link = linkOf(model2, selection);
        return [link.a.hostname, link.b.hostname];
      }
      case "aggregate":
        return [aggregateOf(model2, selection).hostname];
      case "beam": {
        const beam = beamOf(model2, selection);
        return [beam.a.hostname, beam.b.hostname];
      }
      case "group":
        return presentOf(model2, groupOf(model2, selection));
      case "annotation": {
        const a = model2.annotationById.get(selection.id);
        return a.anchor.kind === "device" && a.anchor.ref && model2.nodeByHost.has(a.anchor.ref) ? [a.anchor.ref] : a.anchor.kind === "group" ? presentOf(model2, model2.groupById.get(a.anchor.ref || "") || { members: [] }) : [];
      }
      case "connector":
        return hostsOf(model2.connectorById.get(selection.id)).filter((host) => model2.nodeByHost.has(host));
      default:
        return clusterOf(model2, selection).hosts;
    }
  }
  function tokenOf(model2, selection) {
    if (!selection || !entityOf(model2, selection)) return null;
    switch (selection.kind) {
      case "node":
        return ["node", nodeOf(model2, selection).hostname];
      case "link":
        return ["link", linkToken(linkOf(model2, selection))];
      case "aggregate": {
        const agg = aggregateOf(model2, selection);
        return ["aggregate", JSON.stringify([agg.hostname, agg.name])];
      }
      case "beam": {
        const beam = beamOf(model2, selection);
        return ["beam", JSON.stringify([beam.a.hostname, beam.a.aggregate, beam.b.hostname, beam.b.aggregate])];
      }
      case "group":
        return ["group", groupOf(model2, selection).id];
      case "annotation":
        return ["annotation", selection.id];
      case "connector":
        return ["connector", selection.id];
      default:
        return ["cluster", JSON.stringify(clusterOf(model2, selection).hosts)];
    }
  }
  function selectionFromToken(model2, kind, token) {
    if (kind === "node") return model2.nodeByHost.has(token) ? { kind, id: token } : null;
    if (kind === "group") return model2.groupById.has(token) ? { kind, id: token } : null;
    if (kind === "annotation") return model2.annotationById.has(token) ? { kind, id: token } : null;
    if (kind === "connector") return model2.connectorById.has(token) ? { kind, id: token } : null;
    const lengths = { link: 4, aggregate: 2, beam: 4, cluster: null };
    if (!(kind in lengths)) return null;
    const parts = parseToken(token, lengths[kind]);
    if (!parts) return null;
    const swapped = kind === "link" || kind === "beam" ? [parts[2], parts[3], parts[0], parts[1]] : null;
    const candidates2 = kind === "cluster" ? [parts.slice().sort()] : swapped ? [parts, swapped] : [parts];
    for (const order of candidates2) {
      const id = kind === "beam" ? aggregateKey(order[0], order[1]) + SEP + aggregateKey(order[2], order[3]) : order.join(SEP);
      const selection = { kind, id };
      if (entityOf(model2, selection)) return selection;
    }
    return null;
  }
  function cardExtrasOf(model2, node) {
    const ha = (model2.haMembershipsByHost.get(node.hostname) || [])[0];
    return { role: ha ? ha.member.role : null, stack: node.stack ? node.stack.member_count : null };
  }
  function commonCardWidth(model2) {
    const cards = model2.nodes.concat(model2.ghostNodes).filter((node) => node.kind !== "stub");
    return uniformWidth(cards.map((node) => width(displayName(node.hostname), cardExtrasOf(model2, node))));
  }
  var model = {
    build,
    cardExtrasOf,
    haBadge,
    applyIntent,
    applyPlacement,
    ifaceKey,
    interfaceAt,
    linkId,
    endLabel,
    worst,
    linkToken,
    linkFromToken,
    aggregateKey,
    clusterId,
    entityOf,
    hostsOf: hostsOf2,
    tokenOf,
    selectionFromToken,
    groupOf,
    presentOf,
    SEVERITY_RANK,
    OBSERVED,
    haRoleGroup,
    DIFF_SECTIONS,
    SELECTION_KINDS
  };

  // src/canvas/format.ts
  var SOURCE_LABEL = { lldp: "LLDP", cdp: "CDP", description: "Description" };
  var STATUS_LABEL = { confirmed: "confirmé", observed_only: "observé seul", documented_only: "documenté seul" };
  var KIND_LABEL2 = { device: "équipement collecté", external: "équipement d'une autre infra", stub: "voisin inconnu" };
  var COLLECTION_LABEL = { success: "réussie", unreachable: "injoignable", failed: "en échec", partial: "partielle", not_collected: "non collecté" };
  var HA_MODE_LABEL = { active_passive: "actif-passif", active_active: "actif-actif", standalone: "autonome", other: "autre" };
  var SEVERITY_LABEL = { error: "erreur", warning: "avertissement", info: "info" };
  var TYPE_SHORT_LABEL = { switch: "switch", router: "routeur", firewall: "firewall", load_balancer: "répartiteur", wireless_controller: "WLC", server: "serveur", other: "autre" };
  var RESOLUTION_LABEL = {
    hostname: "nom exact",
    hostname_casefold: "nom, à la casse près",
    reported_hostname: "nom annoncé par l'équipement",
    address: "adresse (IP ou MAC)",
    stub: "non résolu : voisin inconnu"
  };
  var DIFF_LABEL = { added: "ajouté", removed: "retiré", changed: "changé" };
  var EVENT_LABEL = { rebooted: "redémarré", flapped: "flap" };
  var PORT_SHORT = [
    ["HundredGigE", "Hu"],
    ["FortyGigabitEthernet", "Fo"],
    ["TwentyFiveGigE", "Twe"],
    ["TenGigabitEthernet", "Te"],
    ["FiveGigabitEthernet", "Fi"],
    ["TwoGigabitEthernet", "Tw"],
    ["AppGigabitEthernet", "Ap"],
    ["GigabitEthernet", "Gi"],
    ["FastEthernet", "Fa"],
    ["Ethernet", "Eth"],
    ["port-channel", "Po"],
    ["Port-channel", "Po"],
    ["Bundle-Ether", "BE"]
  ];
  function shortPort(name) {
    if (!name) return "";
    for (const [long, short] of PORT_SHORT) if (name.startsWith(long) && /^\d/.test(name.slice(long.length))) return short + name.slice(long.length);
    return name;
  }
  var isEnd = (value2) => "hostname" in value2 && "interface" in value2;
  function plain(value2) {
    if (value2 === null || value2 === void 0) return "—";
    if (Array.isArray(value2)) return value2.length ? value2.map(plain).join(", ") : "—";
    if (typeof value2 === "object") {
      if (isEnd(value2)) return endWithFacts(value2);
      return Object.entries(value2).map(([k, v]) => k + " : " + plain(v)).join(" ; ");
    }
    return String(value2);
  }
  var FACT_ORDER = ["oper_status", "oper_reason", "speed_mbps", "switchport_mode", "vlan"];
  var factRank = (key2) => FACT_ORDER.includes(key2) ? FACT_ORDER.indexOf(key2) : FACT_ORDER.length;
  function endWithFacts(value2) {
    const facts = Object.entries(value2).filter(([k, v]) => k !== "hostname" && k !== "interface" && v !== null && v !== void 0).sort((x, y) => factRank(x[0]) - factRank(y[0]) || (x[0] < y[0] ? -1 : 1));
    const label2 = endLabel(value2);
    return facts.length ? label2 + " (" + facts.map(([k, v]) => k + " " + plain(v)).join(", ") + ")" : label2;
  }
  function brief(value2) {
    if (Array.isArray(value2) && value2.some((item) => item && typeof item === "object")) return value2.length + " élément" + (value2.length > 1 ? "s" : "");
    return plain(value2);
  }
  function elapsedText(seconds) {
    if (seconds === 0) return "même début de collecte";
    const abs = Math.abs(seconds);
    const amount = abs >= 86400 ? Math.round(abs / 8640) / 10 + " j" : abs >= 3600 ? Math.round(abs / 360) / 10 + " h" : Math.round(abs / 60) + " min";
    return amount + (seconds < 0 ? " plus tôt" : " plus tard");
  }
  function durationText(seconds) {
    if (seconds === null || seconds === void 0 || seconds < 0) return null;
    const d = Math.floor(seconds / 86400), h2 = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60);
    if (d) return d + " j" + (h2 ? " " + h2 + " h" : "");
    if (h2) return h2 + " h" + (m ? " " + m + " min" : "");
    return m ? m + " min" : Math.floor(seconds) + " s";
  }
  function speedText(mbps) {
    if (mbps === null || mbps === void 0) return null;
    return mbps >= 1e3 ? String(mbps / 1e3).replace(".", ",") + " Gb/s" : mbps + " Mb/s";
  }
  var OBSERVED_SOURCE = { lldp: true, cdp: true };
  function whyText(link, ports = true) {
    const witnesses = (keep) => Array.from(new Set(link.raw.evidence.filter((e) => keep(e.source)).map((e) => ports ? endLabel(e.witness) : e.witness.hostname))).join(", ");
    const seen = witnesses((src) => OBSERVED_SOURCE[src]);
    const written = witnesses((src) => !OBSERVED_SOURCE[src]);
    const protocols = link.sources.filter((src) => OBSERVED_SOURCE[src]).map((src) => src.toUpperCase()).join(" et ");
    const parts = [];
    if (seen) parts.push("Observé en " + protocols + " depuis " + seen + ".");
    else parts.push("Aucune observation LLDP ni CDP : ce câble n'existe que par les descriptions d'interface.");
    parts.push(written ? "Documenté par la description de " + written + "." : "Aucune description ne le documente.");
    if (link.checks.some((c) => c.code === "description_disagrees_with_observed")) parts.push("Attention : une description ne concorde pas avec l'observé, voir le contrôle ci-dessous.");
    return parts.join(" ");
  }
  var format = { plain, brief, shortPort, speedText, durationText, elapsedText, whyText, SOURCE_LABEL, STATUS_LABEL, KIND_LABEL: KIND_LABEL2, RESOLUTION_LABEL, DIFF_LABEL, EVENT_LABEL, COLLECTION_LABEL, HA_MODE_LABEL, SEVERITY_LABEL, TYPE_SHORT_LABEL };

  // src/canvas/layout.ts
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  var IDEAL = 220;
  var MIN_DISTANCE = 1e-4;
  var REACH = IDEAL * 3;
  var DEFAULT_CARD = { w: 200, h: 80 };
  var GAP_X = 60;
  var GAP_Y = 40;
  var SHELF_GAP = 50;
  var HEAT = 1.5;
  var EXTEND_HEAT = 0.5;
  var NEAR_STEP = 0.3;
  function iterationsFor(count) {
    if (count <= 600) return 300;
    return count <= 1500 ? 150 : 80;
  }
  function spiral(index) {
    const radius = IDEAL * 0.6 * Math.sqrt(index + 0.5);
    return { x: radius * Math.cos(index * GOLDEN_ANGLE), y: radius * Math.sin(index * GOLDEN_ANGLE) };
  }
  function seed(ids) {
    return new Map(ids.map((id, index) => [id, spiral(index)]));
  }
  function uniqueEdges(edges, known2) {
    const weights2 = /* @__PURE__ */ new Map();
    for (const [from, to, boost] of edges) {
      if (from === to || !known2.has(from) || !known2.has(to)) continue;
      const key2 = from < to ? from + "\0" + to : to + "\0" + from;
      const found = weights2.get(key2) || { count: 0, boost: 1 };
      weights2.set(key2, { count: found.count + 1, boost: Math.max(found.boost, boost || 1) });
    }
    return Array.from(weights2).sort(([x], [y]) => x < y ? -1 : 1).map(([key2, { count, boost }]) => {
      const [from, to] = key2.split("\0");
      return { from, to, weight: (1 + 0.35 * Math.log(count)) * boost };
    });
  }
  function wired(ids, edges) {
    const known2 = new Set(ids);
    return new Set(uniqueEdges(edges, known2).flatMap((edge) => [edge.from, edge.to]));
  }
  function seedNear(sorted, links, fixed, points) {
    const neighbours = /* @__PURE__ */ new Map();
    const push = (a, b) => {
      const list = neighbours.get(a);
      if (list) list.push(b);
      else neighbours.set(a, [b]);
    };
    links.forEach(({ from, to }) => {
      push(from, to);
      push(to, from);
    });
    const placed2 = new Set(sorted.filter((id) => fixed.has(id)));
    let rank = 0;
    for (let grew = true; grew; ) {
      grew = false;
      for (const id of sorted) {
        if (placed2.has(id)) continue;
        const near = (neighbours.get(id) || []).filter((other) => placed2.has(other)).map((other) => points.get(other));
        if (!near.length) continue;
        const step2 = spiral(rank++);
        points.set(id, { x: near.reduce((sum, p) => sum + p.x, 0) / near.length + step2.x * NEAR_STEP, y: near.reduce((sum, p) => sum + p.y, 0) / near.length + step2.y * NEAR_STEP });
        placed2.add(id);
        grew = true;
      }
    }
  }
  function step(sim, temperature) {
    const { count, x, y, mx, my, from, to, weight, free } = sim;
    mx.fill(0);
    my.fill(0);
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        if (!free[i] && !free[j]) continue;
        const dx = x[i] - x[j];
        const dy = y[i] - y[j];
        const squared = Math.max(dx * dx + dy * dy, MIN_DISTANCE);
        if (squared > REACH * REACH) continue;
        const force = IDEAL * IDEAL / squared;
        mx[i] += dx * force;
        my[i] += dy * force;
        mx[j] -= dx * force;
        my[j] -= dy * force;
      }
      mx[i] -= x[i] * 0.04;
      my[i] -= y[i] * 0.04;
    }
    for (let e = 0; e < from.length; e += 1) {
      const dx = x[from[e]] - x[to[e]];
      const dy = y[from[e]] - y[to[e]];
      const force = Math.max(Math.hypot(dx, dy), MIN_DISTANCE) / IDEAL * weight[e];
      mx[from[e]] -= dx * force;
      my[from[e]] -= dy * force;
      mx[to[e]] += dx * force;
      my[to[e]] += dy * force;
    }
    for (let i = 0; i < count; i += 1) {
      if (!free[i]) continue;
      const length = Math.max(Math.hypot(mx[i], my[i]), MIN_DISTANCE);
      const capped = Math.min(length, temperature);
      x[i] += mx[i] / length * capped;
      y[i] += my[i] / length * capped;
    }
    separate(sim);
  }
  function separate(sim) {
    const { count, x, y, free, spanX, spanY } = sim;
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        if (!free[i] && !free[j]) continue;
        const dx = x[i] - x[j], dy = y[i] - y[j];
        const overX = spanX - Math.abs(dx), overY = spanY - Math.abs(dy);
        if (overX <= 0 || overY <= 0) continue;
        const share = free[i] && free[j] ? 2 : 1;
        const alongX = overX / spanX < overY / spanY;
        const sign = (alongX ? dx : dy) > 0 ? 1 : -1;
        const pushX = alongX ? sign * overX / share : 0, pushY = alongX ? 0 : sign * overY / share;
        if (free[i]) {
          x[i] += pushX;
          y[i] += pushY;
        }
        if (free[j]) {
          x[j] -= pushX;
          y[j] -= pushY;
        }
      }
    }
  }
  function simulation(sorted, points, links, fixed, card2) {
    const rank = new Map(sorted.map((id, index) => [id, index]));
    const at = (id) => points.get(id);
    return {
      count: sorted.length,
      x: Float64Array.from(sorted, (id) => at(id).x),
      y: Float64Array.from(sorted, (id) => at(id).y),
      mx: new Float64Array(sorted.length),
      my: new Float64Array(sorted.length),
      from: Int32Array.from(links, (edge) => rank.get(edge.from)),
      to: Int32Array.from(links, (edge) => rank.get(edge.to)),
      weight: Float64Array.from(links, (edge) => edge.weight),
      free: sorted.map((id) => !fixed.has(id)),
      spanX: card2.w + GAP_X,
      spanY: card2.h + GAP_Y
    };
  }
  function shelve(points, lonely, fixed, card2) {
    const box2 = bounds(points);
    const pitch = card2.w + SHELF_GAP;
    const perRow = Math.max(1, Math.floor(Math.max(box2.width, pitch * 4) / pitch));
    lonely.forEach((id, index) => {
      const spot = { x: box2.x + index % perRow * pitch, y: box2.y + box2.height + 140 + Math.floor(index / perRow) * (card2.h + GAP_Y) };
      const pin = fixed.get(id);
      points.set(id, pin ? { x: pin.x, y: pin.y } : spot);
    });
  }
  function run(ids, edges, fixed, options = {}) {
    const all = Array.from(ids).sort();
    const held = fixed || /* @__PURE__ */ new Map();
    const links = uniqueEdges(edges, new Set(all));
    const connected = new Set(links.flatMap((edge) => [edge.from, edge.to]));
    const sorted = all.filter((id) => connected.has(id));
    const points = seed(sorted);
    held.forEach((point, id) => {
      if (points.has(id)) points.set(id, { x: point.x, y: point.y });
    });
    if (options.extend) seedNear(sorted, links, held, points);
    const card2 = options.card || DEFAULT_CARD;
    const sim = simulation(sorted, points, links, held, card2);
    const iterations = iterationsFor(sorted.length);
    const heat = IDEAL * (options.extend ? EXTEND_HEAT : HEAT);
    for (let i = 0; i < iterations; i += 1) step(sim, heat * (1 - i / iterations) + 1);
    sorted.forEach((id, index) => points.set(id, held.has(id) ? points.get(id) : { x: Math.round(sim.x[index]), y: Math.round(sim.y[index]) }));
    shelve(points, all.filter((id) => !connected.has(id)), held, card2);
    return points;
  }
  function bounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    if (minX === Infinity) return { x: 0, y: 0, width: 1, height: 1 };
    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }
  var layout = { run, wired, bounds, IDEAL };

  // src/canvas/geometry.ts
  var FAN = 14;
  var FAN_MAX = 110;
  var HULL_PAD = 24;
  var BAND = 18;
  var HIT_MARGIN = 8;
  var PORT_GAP = 16;
  var PORT_CLEAR = 62;
  var CHAR_W = 6.6;
  function fanOffset(link) {
    const spacing = Math.min(FAN, FAN_MAX / link.pairCount);
    return (link.indexInPair - (link.pairCount - 1) / 2) * spacing;
  }
  function curve(p, q, link, clear2) {
    if (link.a.hostname === link.b.hostname) {
      const reach2 = 46 + link.indexInPair * 12;
      return {
        path: `M${p.x - 8},${p.y - 12} C${p.x - reach2},${p.y - reach2 - 30} ${p.x + reach2},${p.y - reach2 - 30} ${p.x + 8},${p.y - 12}`,
        mid: { x: p.x, y: p.y - reach2 * 0.75 - 22 },
        ends: [{ x: p.x - 26, y: p.y - 30 }, { x: p.x + 26, y: p.y - 30 }]
      };
    }
    return chord(p, q, fanOffset(link), clear2);
  }
  function chord(p, q, offset, clear2) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.max(Math.hypot(dx, dy), 0.01);
    const nx = -dy / length, ny = dx / length;
    const c = { x: (p.x + q.x) / 2 + nx * offset * 2, y: (p.y + q.y) / 2 + ny * offset * 2 };
    const at = (t) => ({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * c.y + t * t * q.y });
    const inset = (edge) => Math.min(0.45, ((edge === void 0 ? PORT_CLEAR : edge) + PORT_GAP) / length);
    const side = nx * offset;
    const anchor = side > 0.5 ? "start" : side < -0.5 ? "end" : "middle";
    return { path: `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}`, mid: at(0.5), ends: [at(inset(clear2 && clear2[0])), at(1 - inset(clear2 && clear2[1]))], anchor };
  }
  function hull(points, widest, tallest = 0) {
    const box2 = bounds(new Map(points.map((p, i) => [i, p])));
    const padX = widest / 2 + HULL_PAD, padY = tallest / 2 + HULL_PAD;
    return { x: box2.x - padX, y: box2.y - padY - 6, width: box2.width + 2 * padX, height: box2.height + 2 * padY + 6 };
  }
  function beamBand(beam) {
    const offsets = beam.links.length ? beam.links.map(fanOffset) : [0];
    const lo = Math.min(...offsets), hi = Math.max(...offsets);
    const band = BAND + (hi - lo);
    return { band, hit: band + 2 * HIT_MARGIN, offset: (lo + hi) / 2 };
  }
  function beamLabel(beam, full) {
    const parts = full === false ? [] : [beam.a.aggregate + " ⇄ " + beam.b.aggregate];
    if (beam.peerLink) parts.push("peer-link");
    beam.mlags.forEach((domain) => parts.push("MLAG " + domain.raw.mlag_id));
    return parts.join(" · ");
  }
  function clusterLabel(cluster) {
    return "HA · " + (cluster.raw.cluster_name || cluster.hosts.join(" + ")) + " · " + cluster.raw.mode;
  }
  var geometry = { curve, chord, fanOffset, hull, beamBand, beamLabel, clusterLabel, CHAR_W };

  // src/canvas/hues.ts
  var HUES = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"];
  var HUE_LABEL = {
    blue: "bleu",
    sky: "ciel",
    indigo: "indigo",
    violet: "violet",
    pink: "rose",
    red: "rouge",
    orange: "orange",
    amber: "ambre",
    lime: "citron",
    green: "vert",
    teal: "turquoise",
    slate: "ardoise"
  };
  var FALLBACK_HUE = "slate";
  var DEFAULT_HUE = {
    switch: "blue",
    router: "orange",
    firewall: "violet",
    load_balancer: "teal",
    wireless_controller: "green",
    server: "slate",
    other: "slate"
  };
  var isHue = (value2) => typeof value2 === "string" && HUES.includes(value2);
  var hueLabel = (hue) => isHue(hue) ? HUE_LABEL[hue] : hue;
  var defaultHue = (type) => type && DEFAULT_HUE[type] || FALLBACK_HUE;
  function hueOfType(model2, type) {
    const set = type ? model2.colorByType.get(type) : void 0;
    return set && isHue(set.hue) ? set.hue : defaultHue(type);
  }
  function hueOfNode(model2, node) {
    const own = model2.colorByHost.get(node.hostname);
    return own && isHue(own.hue) ? own.hue : hueOfType(model2, node.type);
  }
  var hues = { HUES, HUE_LABEL, DEFAULT_HUE, FALLBACK_HUE, isHue, hueLabel, defaultHue, hueOfType, hueOfNode };

  // src/canvas/pointer.ts
  var CLICK_SLOP = 4;
  var additive = (pointer) => pointer.shiftKey || pointer.ctrlKey || pointer.metaKey;
  function bind(svg, host) {
    let dragging = false;
    let pan = null;
    const marquee = s("rect", { class: "marquee", visibility: "hidden" });
    svg.appendChild(marquee);
    const relative = (pointer) => {
      const rect = svg.getBoundingClientRect();
      return { x: pointer.clientX - rect.left, y: pointer.clientY - rect.top };
    };
    const marqueeRect = (pointer) => {
      const origin = relative({ clientX: pan.x, clientY: pan.y });
      const now = relative(pointer);
      return { left: Math.min(origin.x, now.x), top: Math.min(origin.y, now.y), right: Math.max(origin.x, now.x), bottom: Math.max(origin.y, now.y) };
    };
    const paintMarquee = (rect) => {
      if (!rect) {
        marquee.setAttribute("visibility", "hidden");
        return;
      }
      marquee.setAttribute("x", String(rect.left));
      marquee.setAttribute("y", String(rect.top));
      marquee.setAttribute("width", String(rect.right - rect.left));
      marquee.setAttribute("height", String(rect.bottom - rect.top));
      marquee.setAttribute("visibility", "visible");
    };
    function bindNode(group, hostname) {
      let start = null;
      const end = () => {
        start = null;
        dragging = false;
      };
      group.addEventListener("pointerdown", (event) => {
        const pointer = event;
        if (pointer.button > 0) return;
        event.stopPropagation();
        dragging = true;
        host.tipHide();
        const origins = new Map(host.companions(hostname).map((member) => [member, { ...host.at(member) }]));
        start = { x: pointer.clientX, y: pointer.clientY, origins, moved: false, additive: additive(pointer) };
        group.setPointerCapture(pointer.pointerId);
      });
      group.addEventListener("pointermove", (event) => {
        if (!start) return;
        const pointer = event;
        const dx = pointer.clientX - start.x, dy = pointer.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
        start.moved = true;
        const k = host.view().k;
        start.origins.forEach((origin, member) => host.moveTo(member, { x: origin.x + dx / k, y: origin.y + dy / k }));
      });
      group.addEventListener("pointerup", () => {
        if (start && !start.moved) {
          if (start.additive) host.toggleHost(hostname);
          else host.select({ kind: "node", id: hostname });
        } else if (start && start.moved) host.dropped(Array.from(start.origins.keys()));
        end();
      });
      group.addEventListener("pointercancel", end);
      group.addEventListener("lostpointercapture", end);
    }
    svg.addEventListener("pointerdown", (event) => {
      const pointer = event;
      if (pointer.button > 0) return;
      host.tipHide();
      const view = host.view();
      pan = { x: pointer.clientX, y: pointer.clientY, tx: view.tx, ty: view.ty, moved: false, target: event.target, marquee: additive(pointer) };
      svg.setPointerCapture(pointer.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!pan) return;
      const pointer = event;
      const dx = pointer.clientX - pan.x, dy = pointer.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
      pan.moved = true;
      if (pan.marquee) {
        paintMarquee(marqueeRect(pointer));
        return;
      }
      host.setView({ k: host.view().k, tx: pan.tx + dx, ty: pan.ty + dy });
    });
    svg.addEventListener("pointerup", (event) => {
      if (pan && !pan.moved) host.select(host.entityAt(pan.target));
      else if (pan && pan.marquee) {
        host.selectIn(marqueeRect(event));
        paintMarquee(null);
      }
      pan = null;
    });
    const cancel = () => {
      pan = null;
      paintMarquee(null);
    };
    svg.addEventListener("pointercancel", cancel);
    svg.addEventListener("lostpointercapture", cancel);
    svg.addEventListener("pointermove", (event) => {
      if (pan || dragging) {
        host.tipHide();
        return;
      }
      const entity = host.entityAt(event.target);
      if (!entity) {
        host.tipHide();
        return;
      }
      const point = relative(event);
      host.tipShowAt(entity, point.x, point.y);
    });
    svg.addEventListener("pointerleave", () => host.tipHide());
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const wheel = event;
      const point = relative(wheel);
      const view = host.view();
      const k = Math.min(Math.max(view.k * Math.exp(-wheel.deltaY * 15e-4), 0.05), 6);
      host.setView({ k, tx: point.x - (point.x - view.tx) / view.k * k, ty: point.y - (point.y - view.ty) / view.k * k });
    }, { passive: false });
    return { bindNode, busy: () => dragging || !!pan };
  }

  // src/canvas/query.ts
  var FIELDS = ["hostname", "type", "site", "vendor", "model", "os", "serial", "kind", "collection"];
  var isField = (name) => FIELDS.includes(name);
  function valueOf(node, field) {
    switch (field) {
      case "hostname":
        return node.hostname;
      case "type":
        return node.type || "";
      case "site":
        return node.site || "";
      case "vendor":
        return node.vendor || "";
      case "model":
        return node.model || "";
      case "os":
        return [node.os_name, node.os_version].filter(Boolean).join(" ");
      case "serial":
        return node.serial_number || "";
      case "kind":
        return node.kind;
      default:
        return node.collection || "";
    }
  }
  function term(word) {
    const cut = word.indexOf(":");
    const prefix = cut > 0 ? word.slice(0, cut) : "";
    const field = isField(prefix) ? prefix : "hostname";
    const pattern = isField(prefix) ? word.slice(cut + 1) : word;
    return { field, pattern, regex: new RegExp(pattern, "i") };
  }
  function parseRule(text2) {
    const words = text2.trim().split(/\s+/).filter(Boolean);
    try {
      return { text: text2, terms: words.map(term), error: null };
    } catch (error) {
      return { text: text2, terms: [], error: error.message };
    }
  }
  var matches = (rule2, node) => rule2.terms.length > 0 && rule2.terms.every((t) => t.regex.test(valueOf(node, t.field)));
  var escape = (text2) => text2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var exactRule = (hostnames) => "^(" + hostnames.slice().sort().map(escape).join("|") + ")$";
  function keepByRules(nodes, links, hide, only) {
    const kept = nodes.filter((node) => !hide.some((rule2) => matches(rule2, node)));
    if (!only) return kept;
    const core = new Set(kept.filter((node) => matches(only, node)).map((node) => node.hostname));
    const near = new Set(core);
    links.forEach((link) => {
      if (core.has(link.a.hostname)) near.add(link.b.hostname);
      if (core.has(link.b.hostname)) near.add(link.a.hostname);
    });
    return kept.filter((node) => near.has(node.hostname));
  }
  var query = { FIELDS, parseRule, matches, exactRule, keepByRules, valueOf };

  // src/canvas/pill.ts
  var PILL_H = 20;
  var PILL_PAD = 7;
  var PILL_ADV = 6.82;
  var PILL_ICON = 12;
  var PILL_DOT = 6;
  var PILL_LEAD_GAP = 4;
  var PILL_MAX = 14;
  function pillWidth(text2, lead = null) {
    const leadW = lead === "icon" ? PILL_ICON + PILL_LEAD_GAP : lead === "dot" ? PILL_DOT + PILL_LEAD_GAP : 0;
    return Math.ceil(2 * PILL_PAD + leadW + Array.from(text2).length * PILL_ADV);
  }
  function speedToken(mbps) {
    if (mbps < 1e3) return mbps + "M";
    const g = Math.round(mbps / 100) / 10;
    return (Number.isInteger(g) ? String(g) : g.toFixed(1)) + "G";
  }
  var SHORT = [[/^port-?channel\s*(\d.*)$/i, "PO"], [/^bundle-?ether\s*(\d.*)$/i, "BE"], [/^po(\d.*)$/i, "PO"]];
  function aggregateShort(name) {
    for (const [pattern, prefix] of SHORT) {
      const found = pattern.exec(name);
      if (found) return prefix + found[1];
    }
    return name.toUpperCase();
  }
  function beamPillText(beam) {
    if (beam.peerLink) return "peer-link";
    if (beam.mlags.length) return "MLAG " + beam.mlags.map((d) => d.raw.mlag_id).join("+");
    const a = aggregateShort(beam.a.aggregate), b = aggregateShort(beam.b.aggregate);
    return a === b ? a : a + "/" + b;
  }
  var pill = { beamPillText, pillWidth, speedToken, aggregateShort, PILL_H, PILL_MAX };

  // src/canvas/bubble.ts
  var PAD_X = 16;
  var PAD_Y = 14;
  var RX2 = 10;
  var TITLE_PX = 13;
  var VALUE_PX = 12;
  var META_PX = 11;
  var H_TITLE = 22;
  var H_SUB = 18;
  var H_SPACE = 12;
  var H_RULE = 25;
  var H_ENDS = 36;
  var H_END_NOTE = 16;
  var H_ROW = 23;
  var H_NOTE = 20;
  var H_PILLS = 28;
  var BASE_TITLE = 15;
  var BASE_SUB = H_TITLE + 13;
  var BASE_END_NAME = 14;
  var BASE_END_PORT = 31;
  var BASE_END_NOTE = 46;
  var BASE_ROW = 15;
  var BASE_NOTE = 14;
  var BASE_PILLS = 18;
  var RULE_Y = 12.5;
  var DOT_Y = 11;
  var ICON = 18;
  var ICON_GRID = 16;
  var ICON_GAP = 10;
  var PILL_GAP = 6;
  var LABEL_GAP = 20;
  var COL_GAP = 28;
  var DOT_R = 3;
  var DOT_W = 12;
  var SUB_GAP2 = 8;
  var SEV_GAP = 10;
  var OFFSET = 14;
  var BOLD = 1.05;
  var valueWidth = (v) => (v.dot ? DOT_W : 0) + monoWidth(v.text, VALUE_PX) + (v.sub ? SUB_GAP2 + textWidth(v.sub, META_PX) : 0);
  var titleWidth = (text2) => Math.ceil(textWidth(text2, TITLE_PX) * BOLD);
  var endWidth = (e) => Math.max(titleWidth(e.name), e.port ? monoWidth(e.port, META_PX) : 0, e.note ? textWidth(e.note, META_PX) : 0);
  var pillsWidth = (pills) => pills.length ? pills.reduce((sum, p) => sum + pillWidth(p.text.toUpperCase()), 0) + PILL_GAP * (pills.length - 1) : 0;
  var sevLabel = (severity) => SEVERITY_LABEL[severity] || severity;
  var hasEndNotes = (b) => b.ends.some((e) => !!e.note);
  function columns(blocks) {
    const cols = { label: 0, values: [] };
    const dotted = blocks.some((b) => b.kind === "row" && b.dot);
    for (const b of blocks) {
      if (b.kind === "ends") {
        cols.label = Math.max(cols.label, ICON);
        b.ends.forEach((e, i) => {
          cols.values[i] = Math.max(cols.values[i] || 0, endWidth(e));
        });
        if (b.pills && b.pills.length) {
          const last = b.ends.length - 1;
          cols.values[last] = Math.max(cols.values[last] || 0, titleWidth(b.ends[last].name) + PILL_GAP + pillsWidth(b.pills));
        }
      } else if (b.kind === "row") {
        cols.label = Math.max(cols.label, (dotted ? DOT_W : 0) + (b.mono ? monoWidth(b.label, VALUE_PX) : textWidth(b.label, VALUE_PX)));
        b.values.forEach((v, i) => {
          cols.values[i] = Math.max(cols.values[i] || 0, valueWidth(v));
        });
      }
    }
    return cols;
  }
  var tableWidth = (cols) => cols.values.length ? cols.label + LABEL_GAP + cols.values.reduce((sum, w) => sum + w, 0) + COL_GAP * (cols.values.length - 1) : 0;
  var checksSevWidth = (items) => Math.max(0, ...items.map((c) => textWidth(sevLabel(c.severity), META_PX)));
  function blockWidth(b) {
    switch (b.kind) {
      case "head":
        return Math.max((b.icon ? ICON + ICON_GAP : 0) + titleWidth(b.title) + (b.pills.length ? PILL_GAP + pillsWidth(b.pills) : 0), b.sub ? textWidth(b.sub, META_PX) : 0);
      case "pills":
        return pillsWidth(b.pills) + (b.text ? PILL_GAP + (b.mono ? monoWidth(b.text, VALUE_PX) : textWidth(b.text, META_PX)) : 0);
      case "note":
        return textWidth(b.text, META_PX);
      case "checks": {
        const sev = checksSevWidth(b.items);
        return Math.max(
          0,
          ...b.items.map((c) => DOT_W + sev + SEV_GAP + monoWidth(c.code, VALUE_PX) + (c.count > 1 ? SUB_GAP2 + textWidth("×" + c.count, META_PX) : 0)),
          b.rest ? textWidth(restText(b.rest), META_PX) : 0
        );
      }
      default:
        return 0;
    }
  }
  function blockHeight(b) {
    switch (b.kind) {
      case "head":
        return H_TITLE + (b.sub ? H_SUB : 0);
      case "ends":
        return H_ENDS + (hasEndNotes(b) ? H_END_NOTE : 0);
      case "row":
        return H_ROW;
      case "pills":
        return H_PILLS;
      case "note":
        return H_NOTE;
      case "checks":
        return H_ROW * b.items.length + (b.rest ? H_NOTE : 0);
      case "space":
        return H_SPACE;
      case "rule":
        return H_RULE;
    }
  }
  var restText = (rest) => "… et " + rest + " autre" + (rest > 1 ? "s" : "") + " contrôle" + (rest > 1 ? "s" : "");
  function measure(blocks) {
    const width2 = Math.max(tableWidth(columns(blocks)), ...blocks.map(blockWidth));
    return { width: 2 * PAD_X + Math.ceil(width2), height: 2 * PAD_Y + blocks.reduce((sum, b) => sum + blockHeight(b), 0) };
  }
  var STROKE_ICONS = {
    beam: () => [s("path", { d: "M2.5 10.5 8.5 4.5" }), s("path", { d: "M7.5 13.5 13.5 7.5" }), s("circle", { cx: 2.5, cy: 10.5, r: 1.3 }), s("circle", { cx: 13.5, cy: 7.5, r: 1.3 })],
    cluster: () => [s("rect", { x: 2.5, y: 5.5, width: 8, height: 8, rx: 1.6 }), s("path", { d: "M5.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5H12A1.5 1.5 0 0 1 13.5 4v5a1.5 1.5 0 0 1-1.5 1.5h-1.5" })],
    group: () => [s("rect", { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "stroke-dasharray": "2.5 2" })],
    note: () => [s("path", { d: "M3 2.5h10v7l-3 3H3z" }), s("path", { d: "M10 12.5v-3h3" })],
    connector: () => [s("circle", { cx: 3.5, cy: 12.5, r: 2 }), s("circle", { cx: 12.5, cy: 3.5, r: 2 }), s("path", { d: "M3.5 10.5C3.5 6 6 3.5 10.5 3.5" })]
  };
  function icon(which, x, y) {
    const k = ICON / ICON_GRID;
    if (which.kind === "type") {
      const g = glyph(which.type), kk = ICON / SIZE;
      return s(
        "g",
        { class: "tip-icon type-icon hue-" + which.hue, transform: `translate(${x},${y}) scale(${kk})` },
        s("path", { class: "icon-body", d: g.body }),
        s("path", { class: "icon-shade", d: g.shade }),
        s("path", { class: "icon-mark", d: g.mark })
      );
    }
    if (which.kind === "link") {
      return s(
        "g",
        { class: "tip-icon tip-icon-link", transform: `translate(${x},${y}) scale(${k})` },
        s("path", { d: "M5.2 10.8 10.8 5.2" }),
        s("circle", { class: "tip-end-dot hue-" + which.hues[0], cx: 3.5, cy: 12.5, r: 2.4 }),
        s("circle", { class: "tip-end-dot hue-" + which.hues[1], cx: 12.5, cy: 3.5, r: 2.4 })
      );
    }
    return s("g", { class: "tip-icon tip-icon-" + which.kind, transform: `translate(${x},${y}) scale(${k})` }, ...STROKE_ICONS[which.kind]());
  }
  function pill2(p, x, y) {
    const label2 = p.text.toUpperCase(), w = pillWidth(label2);
    return s(
      "g",
      { class: "pill-svg tone-" + p.tone + (p.dashed ? " dashed" : "") },
      s("rect", { class: "pill-box", x: x + 0.5, y: y + 0.5, width: w - 1, height: PILL_H - 1, rx: (PILL_H - 1) / 2 }),
      s("text", { x: x + PILL_PAD, y: y + 14 }, label2)
    );
  }
  function pillRow(pills, x, y, into) {
    pills.forEach((p, i) => {
      into.appendChild(pill2(p, x, y));
      x += pillWidth(p.text.toUpperCase()) + (i < pills.length - 1 ? PILL_GAP : 0);
    });
    return x;
  }
  var dot2 = (cls, x, y) => s("circle", { class: "tip-dot " + cls, cx: x + DOT_R + 1, cy: y + DOT_Y, r: DOT_R });
  function value(v, x, y, into) {
    if (v.dot) {
      into.appendChild(dot2("dot-" + v.dot, x, y));
      x += DOT_W;
    }
    into.appendChild(s("text", { class: "tip-value" + (v.muted ? " tip-muted" : "") + (v.tone ? " sev-" + v.tone : ""), x, y: y + BASE_ROW }, v.text));
    if (v.sub) into.appendChild(s("text", { class: "tip-sub", x: x + monoWidth(v.text, VALUE_PX) + SUB_GAP2, y: y + BASE_ROW }, v.sub));
  }
  function drawEnds(b, cols, valueX, y, body) {
    body.appendChild(icon(b.icon, PAD_X + (cols.label - ICON) / 2, y + (H_ENDS - ICON) / 2 - 1));
    b.ends.forEach((e, i) => {
      body.appendChild(s("text", { class: "tip-title" + (e.muted ? " tip-muted" : ""), x: valueX(i), y: y + BASE_END_NAME }, e.name));
      if (e.port) body.appendChild(s("text", { class: "tip-port", x: valueX(i), y: y + BASE_END_PORT }, e.port));
      if (e.note) body.appendChild(s("text", { class: "tip-end-note", x: valueX(i), y: y + BASE_END_NOTE }, e.note));
    });
    if (b.pills && b.pills.length) {
      const last = b.ends.length - 1;
      pillRow(b.pills, valueX(last) + titleWidth(b.ends[last].name) + PILL_GAP, y + BASE_END_NAME - PILL_H + 5, body);
    }
  }
  function drawChecks(b, y, body) {
    const sev = checksSevWidth(b.items);
    b.items.forEach((c, i) => {
      const top = y + H_ROW * i, codeX = PAD_X + DOT_W + sev + SEV_GAP;
      body.appendChild(dot2("severity-" + c.severity, PAD_X, top));
      body.appendChild(s("text", { class: "tip-sev severity-" + c.severity, x: PAD_X + DOT_W, y: top + BASE_ROW }, sevLabel(c.severity)));
      body.appendChild(s("text", { class: "tip-code", x: codeX, y: top + BASE_ROW }, c.code));
      if (c.count > 1) body.appendChild(s("text", { class: "tip-sub", x: codeX + monoWidth(c.code, VALUE_PX) + SUB_GAP2, y: top + BASE_ROW }, "×" + c.count));
    });
    if (b.rest) body.appendChild(s("text", { class: "tip-note", x: PAD_X, y: y + H_ROW * b.items.length + BASE_NOTE }, restText(b.rest)));
  }
  function draw(body, box2, blocks) {
    clear(body).appendChild(box2);
    const size = measure(blocks), cols = columns(blocks);
    const dotted = blocks.some((b) => b.kind === "row" && b.dot);
    const valueX = (i) => PAD_X + cols.label + LABEL_GAP + cols.values.slice(0, i).reduce((sum, w) => sum + w + COL_GAP, 0);
    let y = PAD_Y;
    for (const b of blocks) {
      if (b.kind === "head") {
        let x = PAD_X;
        if (b.icon) {
          body.appendChild(icon(b.icon, x, y + (H_TITLE - ICON) / 2));
          x += ICON + ICON_GAP;
        }
        body.appendChild(s("text", { class: "tip-title", x, y: y + BASE_TITLE }, b.title));
        if (b.pills.length) pillRow(b.pills, x + titleWidth(b.title) + PILL_GAP, y + (H_TITLE - PILL_H) / 2, body);
        if (b.sub) body.appendChild(s("text", { class: "tip-subtitle", x: PAD_X, y: y + BASE_SUB }, b.sub));
      } else if (b.kind === "ends") {
        drawEnds(b, cols, valueX, y, body);
      } else if (b.kind === "row") {
        if (b.dot) body.appendChild(dot2("dot-" + b.dot, PAD_X, y));
        body.appendChild(s("text", { class: b.mono ? "tip-value" : "tip-label", x: PAD_X + (dotted ? DOT_W : 0), y: y + BASE_ROW }, b.label));
        b.values.forEach((v, i) => value(v, valueX(i), y, body));
      } else if (b.kind === "pills") {
        const after = pillRow(b.pills, PAD_X, y + (H_PILLS - PILL_H) / 2, body);
        if (b.text) body.appendChild(s("text", { class: b.mono ? "tip-value" : "tip-subtitle", x: after + PILL_GAP, y: y + BASE_PILLS }, b.text));
      } else if (b.kind === "note") {
        body.appendChild(s("text", { class: "tip-note" + (b.tone ? " tone-" + b.tone : ""), x: PAD_X, y: y + BASE_NOTE }, b.text));
      } else if (b.kind === "checks") {
        drawChecks(b, y, body);
      } else if (b.kind === "rule") {
        body.appendChild(s("line", { class: "tip-rule", x1: PAD_X, x2: size.width - PAD_X, y1: y + RULE_Y, y2: y + RULE_Y }));
      }
      y += blockHeight(b);
    }
    box2.setAttribute("width", String(size.width));
    box2.setAttribute("height", String(size.height));
    return size;
  }
  function text(blocks) {
    const lines = [];
    for (const b of blocks) {
      if (b.kind === "head") {
        lines.push([b.title, ...b.pills.map((p) => p.text)].join(" · "));
        if (b.sub) lines.push(b.sub);
      } else if (b.kind === "ends") {
        lines.push(b.ends.map((e) => e.name + " · " + (e.port === null ? "?" : e.port)).join(" | ") + (b.pills && b.pills.length ? " · " + b.pills.map((p) => p.text).join(" · ") : ""));
        b.ends.filter((e) => e.note).forEach((e) => lines.push(e.name + " · " + (e.port === null ? "?" : e.port) + " : " + e.note));
      } else if (b.kind === "row") lines.push([b.label, ...b.values.map((v) => v.text + (v.sub ? " · " + v.sub : ""))].join(" "));
      else if (b.kind === "pills") lines.push([...b.pills.map((p) => p.text), b.text].filter(Boolean).join(" · "));
      else if (b.kind === "note") lines.push(b.text);
      else if (b.kind === "checks") {
        b.items.forEach((c) => lines.push(c.severity + " · " + c.code + (c.count > 1 ? " ×" + c.count : "")));
        if (b.rest) lines.push(restText(b.rest));
      }
    }
    return lines.join("\n");
  }
  function create(svg) {
    const box2 = s("rect", { class: "tip-box", rx: RX2 });
    const body = s("g", { class: "tip-body" }, box2);
    const group = s("g", { class: "tip", visibility: "hidden", role: "tooltip", id: "ld-tip" }, body);
    svg.appendChild(group);
    let shownFor = null, size = { width: 0, height: 0 };
    function place(x, y, area) {
      const x0 = area.x || 0, y0 = area.y || 0, right = x0 + area.width, bottom = y0 + area.height;
      const wanted = {
        x: x + OFFSET + size.width > right ? x - OFFSET - size.width : x + OFFSET,
        y: y + OFFSET + size.height > bottom ? y - OFFSET - size.height : y + OFFSET
      };
      const left = Math.max(x0, Math.min(wanted.x, right - size.width));
      const top = Math.max(y0, Math.min(wanted.y, bottom - size.height));
      group.setAttribute("transform", `translate(${Math.round(left)},${Math.round(top)})`);
    }
    function show2(key2, blocksOf, x, y, area) {
      const visible2 = group.getAttribute("visibility") === "visible";
      const fresh2 = key2 !== shownFor;
      if (fresh2) {
        shownFor = key2;
        size = draw(body, box2, blocksOf());
      }
      if (fresh2 || !visible2) place(x, y, area);
      if (!visible2) group.setAttribute("class", "tip on");
      group.setAttribute("visibility", "visible");
    }
    function hide() {
      shownFor = null;
      group.setAttribute("class", "tip");
      group.setAttribute("visibility", "hidden");
    }
    function dispose() {
      hide();
      if (group.parentNode) group.parentNode.removeChild(group);
    }
    return { group, id: "ld-tip", show: show2, hide, dispose };
  }

  // src/canvas/tip.ts
  var DASH2 = "—";
  var SOURCE_ORDER = ["lldp", "cdp", "description"];
  var MAX_CHECK_LINES = 6;
  var MAX_NAME = 36;
  var MAX_TEXT = 72;
  var STATUS_TONE = { confirmed: "ok", observed_only: "observed", documented_only: "documented" };
  var COLLECTION_DOT = { success: "ok", partial: "warning", failed: "danger", unreachable: "danger", not_collected: "muted" };
  var KIND_PILL = { external: "autre infra", stub: "voisin inconnu" };
  var ROW_OF_CHECK = { link_speed_mismatch: "speed", link_duplex_mismatch: "duplex", link_oper_mismatch: "state" };
  var SEVERITY_DOT = { error: "danger", warning: "warning", info: "muted" };
  var head = (title, icon2, pills = [], sub = null) => ({ kind: "head", title, icon: icon2, pills, sub });
  var row = (label2, ...values) => ({ kind: "row", label: label2, values });
  var val = (text2, extra = {}) => ({ text: String(text2), ...extra });
  var note = (text2, tone) => ({ kind: "note", text: clipText(text2), tone });
  var rule = { kind: "rule" };
  var space = { kind: "space" };
  var present = (candidate) => candidate !== null;
  var portName = (end) => end.interface === null || end.interface === void 0 ? "?" : end.interface;
  var plural = (count, word) => count + " " + word + (count > 1 ? "s" : "");
  var clipName = (name) => name.length <= MAX_NAME ? name : name.slice(0, 18) + "…" + name.slice(-17);
  var clipText = (text2) => text2.length <= MAX_TEXT ? text2 : text2.slice(0, MAX_TEXT - 1) + "…";
  var capitalized = (text2) => text2.charAt(0).toUpperCase() + text2.slice(1);
  var stateDot = (state) => state === "up" ? "ok" : state === "down" ? "danger" : state ? "muted" : null;
  function endFacts(model2, end, removed) {
    const found = interfaceAt(model2, end.hostname, end.interface, removed);
    if (!found) return { present: false, ghost: false, speed: null, duplex: null, media: null, state: null, reason: null };
    const itf = found.itf;
    return { present: true, ghost: found.ghost, speed: speedText(itf.speed_mbps), duplex: itf.duplex, media: itf.media, state: itf.oper_status, reason: itf.oper_reason };
  }
  var endNote = (f) => !f.present ? "absent de interfaces[]" : f.ghost ? "interface retirée, valeurs de la run d'avant" : null;
  function checkBlocks(checks) {
    if (!checks.length) return [];
    const counts = /* @__PURE__ */ new Map();
    checks.forEach((c) => {
      const key2 = c.severity + " " + c.code;
      counts.set(key2, (counts.get(key2) || 0) + 1);
    });
    const rank = (key2) => SEVERITY_RANK[key2.split(" ")[0]];
    const keys = Array.from(counts.keys()).sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0));
    const items = keys.slice(0, MAX_CHECK_LINES).map((key2) => ({ severity: key2.split(" ")[0], code: key2.split(" ")[1], count: counts.get(key2) }));
    const rest = keys.slice(MAX_CHECK_LINES).reduce((sum, key2) => sum + counts.get(key2), 0);
    return [{ kind: "checks", items, rest }];
  }
  var DIFF_WORD = { added: "ajouté", removed: "retiré", changed: "changé" };
  var DIFF_TEXT = { added: "dans cette run", removed: "depuis la run d'avant", changed: "" };
  function diffBlock(change) {
    if (!change) return null;
    const fields = change.fields || [];
    const paths = change.kind === "changed" ? fields.slice(0, 4).map((f) => f.path).join(", ") + (fields.length > 4 ? "…" : "") : DIFF_TEXT[change.kind];
    return { kind: "pills", pills: [{ text: DIFF_WORD[change.kind], tone: change.kind }], text: paths ? clipText(paths) : null, mono: change.kind === "changed" };
  }
  function sourcesText(sources) {
    const ordered = SOURCE_ORDER.filter((src) => sources.includes(src)).concat(sources.filter((src) => !SOURCE_ORDER.includes(src)));
    return ordered.map((src) => SOURCE_LABEL[src] || src).join(" + ");
  }
  var ALL = { control: true };
  function linkLines(model2, link, opts = ALL) {
    const control = opts.control !== false;
    const ends = [link.a, link.b];
    const facts = ends.map((end) => endFacts(model2, end, link.ghost));
    const flagged = /* @__PURE__ */ new Map();
    if (control) link.checks.forEach((c) => {
      const key2 = ROW_OF_CHECK[c.code];
      if (key2 && c.severity !== "info" && flagged.get(key2) !== "error") flagged.set(key2, c.severity);
    });
    const tone = (key2) => flagged.get(key2) || null;
    const rowDot = (key2) => flagged.has(key2) ? SEVERITY_DOT[flagged.get(key2)] : null;
    const trait = (label2, key2) => facts.some((f) => f[key2] !== null) ? { kind: "row", label: label2, dot: rowDot(key2), values: facts.map((f) => f[key2] === null ? val(DASH2, { muted: true }) : val(f[key2], { tone: tone(key2) })) } : null;
    const traits = [trait("vitesse", "speed"), trait("duplex", "duplex"), trait("média", "media")].filter(present);
    const state = facts.some((f) => f.state !== null) ? {
      kind: "row",
      label: "état",
      dot: rowDot("state"),
      values: facts.map((f) => f.state === null ? val(DASH2, { muted: true }) : val(f.state, { dot: stateDot(f.state), sub: f.reason, tone: tone("state") }))
    } : null;
    const verdict = control ? {
      kind: "pills",
      text: sourcesText(link.sources),
      pills: [{ text: STATUS_LABEL[link.status], tone: STATUS_TONE[link.status] || "neutral" }, ...link.raw.oper === "down" ? [{ text: "down", tone: "danger" }] : []]
    } : null;
    const footer = [verdict, diffBlock(link.ghost ? { kind: "removed" } : model2.changeOf("link", link.id)), ...control ? checkBlocks(link.checks) : []].filter(present);
    const hueOf = (hostname) => {
      const node = model2.nodeByHost.get(hostname);
      return node ? hueOfNode(model2, node) : defaultHue(null);
    };
    const heads = {
      kind: "ends",
      icon: { kind: "link", hues: [hueOf(link.a.hostname), hueOf(link.b.hostname)] },
      ends: ends.map((end, index) => ({ name: clipName(end.hostname), port: portName(end), muted: !facts[index].present, note: endNote(facts[index]) }))
    };
    const blocks = [
      heads,
      space,
      ...traits.length ? traits : [note("vitesse, duplex, média : aucune valeur")],
      state,
      ...footer.length ? [rule, ...footer] : []
    ];
    return blocks.filter(present);
  }
  var priorityText = (member) => member.priority !== null && member.priority !== void 0 ? "priorité " + member.priority : null;
  var modeLabel = (mode) => HA_MODE_LABEL[mode] || mode;
  function nodeLines(model2, node, opts = ALL) {
    const control = opts.control !== false;
    const memberships = model2.haMembershipsByHost.get(node.hostname) || [];
    const links = (model2.linksByNode.get(node.hostname) || []).filter((l) => !l.ghost);
    const ghosts = (model2.linksByNode.get(node.hostname) || []).length - links.length;
    const hardware = [node.vendor ? capitalized(node.vendor) : null, node.model].filter(Boolean).join(" ");
    const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
    const pills = [
      ...node.type ? [{ text: TYPE_SHORT_LABEL[node.type] || node.type, tone: "neutral" }] : [],
      ...KIND_PILL[node.kind] ? [{ text: KIND_PILL[node.kind], tone: "muted", dashed: true }] : []
    ];
    const facts = [
      row("câbles", val(links.length, { sub: ghosts ? plural(ghosts, "retiré") : null })),
      node.stack ? row("stack", val(plural(node.stack.member_count, "membre"))) : null,
      node.evidence && node.evidence.capabilities.length ? row("capacités", val(clipText(node.evidence.capabilities.join(", ")))) : null,
      ...memberships.flatMap((ha) => [
        // tous ses clusters (revue, B4)
        row("cluster HA", val(clipName(ha.cluster.raw.cluster_name || ha.cluster.hosts.join(" + ")), { sub: modeLabel(ha.cluster.raw.mode) })),
        row("rôle", val(ha.member.role, { sub: priorityText(ha.member) })),
        row("état", val(ha.member.state, { dot: stateDot(ha.member.state) }))
      ])
    ].filter(present);
    const footer = [
      diffBlock(node.ghost ? { kind: "removed" } : model2.changeOf("node", node.hostname)),
      control && node.collection ? row("collecte", val(COLLECTION_LABEL[node.collection] || node.collection, { dot: COLLECTION_DOT[node.collection] || "muted" })) : null,
      ...control ? checkBlocks(model2.checksByNode.get(node.hostname) || []) : []
    ].filter(present);
    return [
      head(clipName(node.hostname), { kind: "type", type: node.type, hue: hueOfNode(model2, node) }, pills, clipText([hardware, system].filter(Boolean).join(" · ")) || null),
      space,
      ...facts,
      ...footer.length ? [rule, ...footer] : []
    ];
  }
  function beamLines(beam, opts = ALL) {
    const protocols = Array.from(new Set(beam.known.map((agg) => agg.raw.protocol + (agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""))));
    const nature = [...beam.peerLink ? [{ text: "peer-link", tone: "structure" }] : [], ...beam.mlags.map((d) => ({ text: "MLAG " + d.raw.mlag_id, tone: "structure" }))];
    const checks = opts.control !== false ? checkBlocks(beam.checks) : [];
    return [
      { kind: "ends", icon: { kind: "beam" }, ends: [{ name: clipName(beam.a.hostname), port: beam.a.aggregate }, { name: clipName(beam.b.hostname), port: beam.b.aggregate }], pills: nature },
      space,
      row("câbles", val(beam.links.length)),
      ...protocols.length ? [row("protocole", val(protocols.join(" / ")))] : [],
      ...beam.degraded ? [note("un agrégat dégradé", "warning")] : [],
      ...checks.length ? [rule, ...checks] : []
    ];
  }
  function groupLines(group, shown) {
    const first = group.description.split("\n").find((text2) => text2.trim()) || "";
    return [
      head(clipText(group.label), { kind: "group" }, [], shown + " / " + plural(group.members.length, "membre") + " · " + group.author),
      ...first ? [note(first)] : []
    ];
  }
  function annotationLines(a) {
    const where = a.anchor.kind === "free" ? "libre" : "attachée à " + a.anchor.ref;
    return [
      head(KIND_LABEL[a.content.kind] || a.content.kind, { kind: "note" }, [{ text: where, tone: "muted" }]),
      note(summary(a)),
      note("annotation de " + a.author + ", le " + a.at.slice(0, 10))
    ];
  }
  function clusterLines(cluster, opts = ALL) {
    const checks = opts.control !== false ? checkBlocks(cluster.checks) : [];
    return [
      head(clipName(cluster.raw.cluster_name || cluster.hosts.join(" + ")), { kind: "cluster" }, [{ text: "HA", tone: "structure" }], modeLabel(cluster.raw.mode)),
      space,
      ...cluster.raw.members.map((m) => ({
        kind: "row",
        mono: true,
        label: clipName(m.hostname),
        values: [val(m.role), val(m.state, { dot: stateDot(m.state) }), ...priorityText(m) ? [val(priorityText(m), { muted: true })] : []]
      })),
      ...checks.length ? [rule, ...checks] : []
    ];
  }
  function connectorLines(c) {
    return [
      head(clipText(summary2(c)), { kind: "connector" }, [{ text: c.route === "elbow" ? "coudé" : c.route === "curve" ? "courbe" : "droit", tone: "muted" }, { text: c.locked ? "verrouillé" : "glissable", tone: "muted" }]),
      note("connecteur de " + c.author + ", le " + c.at.slice(0, 10))
    ];
  }
  var tip = { groupLines, annotationLines, connectorLines, create, text, clipName, linkLines, nodeLines, beamLines, clusterLines };

  // src/canvas/graph.ts
  var typeGlyph = (type, transform) => {
    const g = glyph(type);
    return s("g", { class: "node-icon", transform }, s("path", { class: "icon-body", d: g.body }), s("path", { class: "icon-shade", d: g.shade }), s("path", { class: "icon-mark", d: g.mark }));
  };
  var ZOOM_FAR = 0.7;
  var ZOOM_NEAR = 1.2;
  var PIN_PATH = "M8 1.5a4 4 0 0 1 4 4c0 2.8-4 7.5-4 7.5S4 8.3 4 5.5a4 4 0 0 1 4-4z M8 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z";
  function create2(svg, model2, onSelect, options = {}) {
    const savedPins = () => new Map(Array.from(model2.pinByHost).filter(([host]) => {
      const node = model2.nodeByHost.get(host);
      return !!node && !node.ghost;
    }).map(([host, pin]) => [host, { x: pin.x, y: pin.y }]));
    const savedPlaces = () => new Map(Array.from(model2.placeByHost, ([host, place2]) => [host, { x: place2.x, y: place2.y }]));
    const state = {
      showStubs: false,
      showPorts: false,
      showDiff: true,
      hiddenStatuses: /* @__PURE__ */ new Set(),
      query: "",
      hide: [],
      only: null,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      pinned: savedPins(),
      placed: savedPlaces(),
      positions: /* @__PURE__ */ new Map(),
      view: { k: 1, tx: 0, ty: 0 },
      selection: null,
      selected: /* @__PURE__ */ new Set(),
      nodeEls: /* @__PURE__ */ new Map(),
      linkEls: /* @__PURE__ */ new Map(),
      beamEls: /* @__PURE__ */ new Map(),
      clusterEls: /* @__PURE__ */ new Map()
    };
    const viewport = s("g", { class: "viewport" });
    const clusterLayer = s("g", { class: "clusters" });
    const beamLayer = s("g", { class: "beams" });
    const linkLayer = s("g", { class: "links" });
    const labelLayer = s("g", { class: "beam-labels" });
    const nodeLayer = s("g", { class: "nodes" });
    [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach((layer) => viewport.appendChild(layer));
    clear(svg).appendChild(viewport);
    const tip2 = create(svg);
    const at = (hostname) => state.positions.get(hostname);
    const cards = /* @__PURE__ */ new Map();
    const boxOf = (hostname) => cards.get(hostname) || { w: STUB_R * 2, h: STUB_R * 2 };
    const allNodes = () => model2.nodes.concat(state.showDiff ? model2.ghostNodes : []);
    const allLinks = () => model2.links.concat(state.showDiff ? model2.ghostLinks : []);
    const linkAt = (index) => index < model2.links.length ? model2.links[index] : model2.ghostLinks[index - model2.links.length];
    const changeOf3 = (kind, entity, id) => !state.showDiff ? null : entity.ghost ? "removed" : (model2.changeOf(kind, id) || { kind: null }).kind;
    const visibleNodes = () => keepByRules(allNodes().filter((n2) => state.showStubs || n2.kind !== "stub"), allLinks(), state.hide, state.only);
    const multi = () => state.selected.size >= 2;
    function svgClasses() {
      const k = state.view.k;
      svg.setAttribute("class", [state.selection || multi() ? "has-selection" : "", state.showPorts ? "show-ports" : "", k < ZOOM_FAR ? "zoom-far" : k >= ZOOM_NEAR ? "zoom-near" : ""].filter(Boolean).join(" "));
    }
    const applyView = () => {
      viewport.setAttribute("transform", `translate(${state.view.tx},${state.view.ty}) scale(${state.view.k})`);
      svgClasses();
    };
    function moveTo(hostname, point) {
      state.positions.set(hostname, point);
      state.pinned.set(hostname, point);
      const el = state.nodeEls.get(hostname);
      if (el) el.classList.toggle("pinned", true);
      moveNode(hostname);
      follow(hostname);
    }
    const pointer = bind(svg, {
      view: () => state.view,
      setView: (view) => {
        state.view = view;
        applyView();
      },
      at,
      moveTo,
      select,
      toggleHost,
      selectIn,
      entityAt,
      // Un équipement de la sélection multiple entraîne toute la sélection (ses équipements dessinés) ; relâchée d'un bloc,
      // elle fait un seul paquet d'épingles ; un seul équipement, ou une page sans `onPins` : une épingle par équipement.
      companions: (hostname) => multi() && state.selected.has(hostname) ? Array.from(state.selected).filter((host) => state.nodeEls.has(host)) : [hostname],
      dropped: (hosts) => {
        const moves = new Map(hosts.map((host) => [host, { ...at(host) }]));
        if (moves.size > 1 && options.onPins) options.onPins(moves, "dragged");
        else if (options.onPin) moves.forEach((point, host) => options.onPin?.(host, point));
      },
      tipHide: () => tip2.hide(),
      tipShowAt: (entity, x, y) => tip2.show(entity.kind + ":" + entity.id, () => tipLines(entity), x, y, svg.getBoundingClientRect())
    });
    function visibleLinks(shown) {
      return allLinks().filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !state.hiddenStatuses.has(l.status));
    }
    function visibleBeams(shown, links) {
      const visible2 = new Set(links.map((l) => l.id));
      return model2.beams.filter((b) => b.a.hostname !== b.b.hostname && shown.has(b.a.hostname) && shown.has(b.b.hostname) && b.links.some((l) => visible2.has(l.id)));
    }
    const visibleClusters = (shown) => model2.clusters.filter((c) => c.hosts.filter((h2) => shown.has(h2)).length >= 2);
    const visibleRect = () => {
      const rect = svg.getBoundingClientRect(), i = state.insets;
      return { x: i.left, y: i.top, width: Math.max((rect.width || 900) - i.left - i.right, 100), height: Math.max((rect.height || 600) - i.top - i.bottom, 100) };
    };
    function fit() {
      const box2 = bounds(state.positions);
      const area = visibleRect(), margin = 70;
      const k = Math.min((area.width - 2 * margin) / box2.width, (area.height - 2 * margin) / box2.height, 1.6);
      state.view = { k: Math.max(k, 0.05), tx: 0, ty: 0 };
      state.view.tx = area.x + area.width / 2 - (box2.x + box2.width / 2) * state.view.k;
      state.view.ty = area.y + area.height / 2 - (box2.y + box2.height / 2) * state.view.k;
      applyView();
    }
    function placeLink(link, els) {
      const p = at(link.a.hostname), q = at(link.b.hostname);
      const clear2 = [reach(boxOf(link.a.hostname), q.x - p.x, q.y - p.y), reach(boxOf(link.b.hostname), q.x - p.x, q.y - p.y)];
      const shape = curve(p, q, link, clear2);
      [els.line, els.hit, els.halo, els.diff].forEach((el) => {
        if (el) el.setAttribute("d", shape.path);
      });
      if (els.mark) {
        els.mark.setAttribute("cx", String(shape.mid.x));
        els.mark.setAttribute("cy", String(shape.mid.y));
      }
      els.ports.forEach((text2, i) => {
        text2.setAttribute("x", String(shape.ends[i].x));
        text2.setAttribute("y", String(shape.ends[i].y));
        text2.setAttribute("text-anchor", shape.anchor || "middle");
      });
    }
    function drawLink(link) {
      const change = changeOf3("link", link, link.id);
      const diffHalo = change ? s("path", { class: "diff-halo" }) : null;
      const halo = link.heartbeat ? s("path", { class: "link-halo" }) : null;
      const line = s("path", { class: "link-line" });
      const hit = s("path", { class: "link-hit" });
      const mark = link.worst === "error" || link.worst === "warning" ? s("circle", { class: "link-mark severity-" + link.worst, r: 4.5 }) : null;
      const ports = [link.a.interface, link.b.interface].map((name) => s("text", { class: "port-label" }, name));
      const classes = `link status-${link.status}${link.raw.oper === "down" ? " oper-down" : ""}${link.pairCount > 2 ? " crowded" : ""}${link.heartbeat ? " heartbeat" : ""}${change ? " diff-" + change : ""}`;
      const group = s(
        "g",
        {
          class: classes,
          "data-link": String(link.index),
          tabindex: 0,
          role: "button",
          "aria-label": `${endLabel(link.a)} ↔ ${endLabel(link.b)} · ${STATUS_LABEL[link.status]} · ${link.combo}${change ? " · " + DIFF_LABEL[change] : ""}`
        },
        diffHalo,
        halo,
        line,
        hit,
        mark,
        ports
      );
      const els = { group, line, hit, halo, diff: diffHalo, mark, ports };
      state.linkEls.set(link.id, els);
      placeLink(link, els);
      bindFocus(group, { kind: "link", id: link.id }, () => toScreen(curve(at(link.a.hostname), at(link.b.hostname), link).mid));
      return group;
    }
    function placeBeam(beam, els) {
      const p = at(beam.a.hostname), q = at(beam.b.hostname);
      const axis = chord(p, q, els.shape.offset);
      els.band.setAttribute("d", axis.path);
      els.hit.setAttribute("d", axis.path);
      const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      const nx = -dy / length, ny = dx / length;
      const up = ny <= 0 ? 1 : -1;
      const side = els.shape.offset === 0 ? up : Math.sign(els.shape.offset);
      const away = els.shape.band / 2 + 8;
      const x = axis.mid.x + nx * side * away, y = axis.mid.y + ny * side * away;
      const text2 = els.label.textContent || "";
      const width2 = CHAR_W * 0.95 * text2.length + 10;
      els.label.setAttribute("x", String(x));
      els.label.setAttribute("y", String(y));
      els.labelHit.setAttribute("x", String(x - width2 / 2));
      els.labelHit.setAttribute("y", String(y - 10));
      els.labelHit.setAttribute("width", String(width2));
      els.labelHit.setAttribute("height", "14");
      els.tag.setAttribute("transform", `rotate(${angle.toFixed(2)} ${x} ${y})`);
      els.tag.setAttribute("visibility", text2 ? "visible" : "hidden");
    }
    function drawBeam(beam) {
      const shape = beamBand(beam);
      const band = s("path", { class: "beam-band", "stroke-width": shape.band });
      const hit = s("path", { class: "beam-hit", "stroke-width": shape.hit });
      const label2 = s("text", { class: "beam-label" }, beamLabel(beam, false));
      const labelHit = s("rect", { class: "beam-label-hit" });
      const tag = s("g", { class: "beam-tag", "data-beam": String(beam.index) }, labelHit, label2);
      const classes = `beam${beam.peerLink ? " peer-link" : ""}${beam.degraded ? " degraded" : ""}${beam.mlags.length ? " mlag" : ""}`;
      const group = s(
        "g",
        {
          class: classes,
          "data-beam": String(beam.index),
          tabindex: 0,
          role: "button",
          "aria-label": `faisceau ${endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate })} ⇄ ${endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate })} · ${beam.links.length} câble(s)`
        },
        band,
        hit
      );
      const els = { group, band, hit, label: label2, labelHit, tag, shape };
      state.beamEls.set(beam.id, els);
      labelLayer.appendChild(tag);
      placeBeam(beam, els);
      bindFocus(group, { kind: "beam", id: beam.id }, () => toScreen(midpoint(beam.a.hostname, beam.b.hostname)));
      return group;
    }
    function placeCluster(cluster, els) {
      const points = cluster.hosts.map((h2) => state.positions.get(h2)).filter((p) => !!p);
      const boxes = cluster.hosts.map(boxOf);
      const box2 = hull(points, Math.max(...boxes.map((b) => b.w)), Math.max(...boxes.map((b) => b.h)));
      ["x", "y", "width", "height"].forEach((name) => els.rect.setAttribute(name, String(box2[name])));
      els.label.setAttribute("x", String(box2.x + 10));
      els.label.setAttribute("y", String(box2.y + 15));
    }
    function drawCluster(cluster) {
      const rect = s("rect", { class: "cluster-hull", rx: 12 });
      const label2 = s("text", { class: "cluster-label" }, clusterLabel(cluster));
      const group = s("g", { class: "cluster", "data-cluster": String(cluster.index), tabindex: 0, role: "button", "aria-label": clusterLabel(cluster) }, rect, label2);
      const els = { group, rect, label: label2 };
      state.clusterEls.set(cluster.id, els);
      placeCluster(cluster, els);
      bindFocus(group, { kind: "cluster", id: cluster.id }, () => toScreen({ x: Number(rect.getAttribute("x")) + 20, y: Number(rect.getAttribute("y")) + 20 }));
      return group;
    }
    function drawNode(node) {
      const checks = model2.checksByNode.get(node.hostname) || [];
      const severity = worst(checks);
      const memberships = model2.haMembershipsByHost.get(node.hostname) || [];
      const ha = memberships[0] || null;
      const haState = memberships.some((m) => m.member.state === "down") ? "down" : ha ? ha.member.state : null;
      const haClasses = ha ? ` ha-member ha-${haRoleGroup(ha.cluster.raw.mode, ha.member.role)} ha-state-${haState}` : "";
      const typeLabel = node.type ? LABEL[node.type] || node.type : null;
      const change = changeOf3("node", node, node.hostname);
      const name = node.kind === "stub" ? shortName(node.hostname) : displayName(node.hostname);
      const card2 = node.kind === "stub" ? null : plan(name, { role: ha ? ha.member.role : null, stack: node.stack ? node.stack.member_count : null }, model2.cardWidth);
      const box2 = card2 || { w: STUB_R * 2, h: STUB_R * 2 };
      cards.set(node.hostname, box2);
      const ring = change && change !== "removed" ? card2 ? s("rect", { class: "node-ring", x: -card2.w / 2 - 4, y: -card2.h / 2 - 4, width: card2.w + 8, height: card2.h + 8, rx: card2.rx + 4 }) : s("circle", { class: "node-ring", r: STUB_R + 4 }) : null;
      const pinned = state.pinned.has(node.hostname) ? " pinned" : "";
      const group = s(
        "g",
        {
          class: `node kind-${node.kind} type-${node.type || "unknown"} hue-${hueOfNode(model2, node)} collection-${node.collection || "none"}${haClasses}${change ? " diff-" + change : ""}${pinned}`,
          tabindex: 0,
          role: "button",
          "data-node": node.hostname,
          "aria-label": `${node.hostname} · ${KIND_LABEL2[node.kind]}${typeLabel ? " · " + typeLabel : ""}${node.collection ? " · collecte : " + node.collection : ""}${ha ? " · HA " + ha.member.role : ""}${change ? " · " + DIFF_LABEL[change] : ""}`
        },
        ring,
        card2 ? s("rect", { class: "node-shape", x: -card2.w / 2, y: -card2.h / 2, width: card2.w, height: card2.h, rx: card2.rx }) : s("circle", { class: "node-shape", r: STUB_R }),
        card2 ? s("path", { class: "node-rail", d: card2.rail }) : null,
        card2 ? typeGlyph(node.type, `translate(${card2.icon.x},${card2.icon.y}) scale(${card2.icon.scale})`) : null,
        card2 && card2.role && ha ? s("text", { class: "node-role", x: card2.role.x, y: card2.role.y, "text-anchor": card2.role.anchor }, ha.member.role) : null,
        s("text", { class: "node-label", x: card2 ? card2.label.x : 0, y: card2 ? card2.label.y : STUB_R + 14, "text-anchor": card2 ? card2.label.anchor : "middle" }, name),
        card2 && card2.stack && node.stack ? s("text", { class: "node-stack", x: card2.stack.x, y: card2.stack.y, "text-anchor": card2.stack.anchor }, "×" + node.stack.member_count) : null,
        severity === "error" || severity === "warning" ? s("circle", { class: "node-badge severity-" + severity, cx: box2.w / 2 - 2, cy: -box2.h / 2 + 2, r: 6 }) : null,
        s("path", { class: "node-pin", d: PIN_PATH, transform: `translate(${-box2.w / 2 - 9},${-box2.h / 2 - 9})` })
      );
      state.nodeEls.set(node.hostname, group);
      moveNode(node.hostname);
      pointer.bindNode(group, node.hostname);
      bindFocus(group, { kind: "node", id: node.hostname }, () => screenPoint(node.hostname));
      return group;
    }
    function moveNode(hostname) {
      const p = at(hostname);
      state.nodeEls.get(hostname).setAttribute("transform", `translate(${p.x},${p.y})`);
    }
    function follow(hostname) {
      (model2.linksByNode.get(hostname) || []).forEach((link) => {
        const els = state.linkEls.get(link.id);
        if (els) placeLink(link, els);
      });
      (model2.beamsByNode.get(hostname) || []).forEach((beam) => {
        const els = state.beamEls.get(beam.id);
        if (els) placeBeam(beam, els);
      });
      model2.clusters.forEach((cluster) => {
        const els = state.clusterEls.get(cluster.id);
        if (els && cluster.hosts.includes(hostname)) placeCluster(cluster, els);
      });
    }
    function screenPoint(hostname) {
      const p = at(hostname);
      return { x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty };
    }
    const onScreen = (point, rect) => point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height;
    const toScreen = (p) => ({ x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty });
    const midpoint = (h1, h2) => {
      const p = at(h1), q = at(h2);
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    };
    function bindFocus(group, selection, pointOf) {
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter") select(selection);
      });
      group.addEventListener("focus", () => {
        if (pointer.busy()) return;
        const rect = svg.getBoundingClientRect();
        if (!onScreen(pointOf(), rect)) centerOn(selection);
        const point = pointOf();
        tip2.show(selection.kind + ":" + selection.id, () => tipLines(selection), point.x, point.y, rect);
        group.setAttribute("aria-describedby", tip2.id);
      });
      group.addEventListener("blur", () => {
        tip2.hide();
        group.removeAttribute("aria-describedby");
      });
    }
    function entityAt(target) {
      for (let el = target; el && el !== svg && el.getAttribute; el = el.parentNode) {
        const link = el.getAttribute("data-link"), beam = el.getAttribute("data-beam"), cluster = el.getAttribute("data-cluster"), node = el.getAttribute("data-node");
        if (link !== null) return { kind: "link", id: linkAt(Number(link)).id };
        if (beam !== null) return { kind: "beam", id: model2.beams[Number(beam)].id };
        if (cluster !== null) return { kind: "cluster", id: model2.clusters[Number(cluster)].id };
        if (node !== null) return { kind: "node", id: node };
      }
      return null;
    }
    function tipLines(selection) {
      if (selection.kind === "link") return linkLines(model2, linkOf(model2, selection));
      if (selection.kind === "node") return nodeLines(model2, nodeOf(model2, selection));
      if (selection.kind === "beam") return beamLines(beamOf(model2, selection));
      return clusterLines(clusterOf(model2, selection));
    }
    function relatedToHosts2(hosts) {
      const related = { hosts: new Set(hosts), links: /* @__PURE__ */ new Set(), beams: /* @__PURE__ */ new Set(), clusters: /* @__PURE__ */ new Set() };
      hosts.forEach((host) => (model2.linksByNode.get(host) || []).forEach((link) => {
        if (hosts.has(link.a.hostname) && hosts.has(link.b.hostname)) related.links.add(link.id);
      }));
      model2.beams.forEach((beam) => {
        if (hosts.has(beam.a.hostname) && hosts.has(beam.b.hostname)) related.beams.add(beam.id);
      });
      model2.clusters.forEach((cluster) => {
        if (cluster.hosts.every((host) => hosts.has(host))) related.clusters.add(cluster.id);
      });
      return related;
    }
    function relatedTo2(selection) {
      const related = { hosts: /* @__PURE__ */ new Set(), links: /* @__PURE__ */ new Set(), beams: /* @__PURE__ */ new Set(), clusters: /* @__PURE__ */ new Set() };
      if (!selection || !entityOf(model2, selection)) return related;
      const addLink = (link) => {
        related.links.add(link.id);
        related.hosts.add(link.a.hostname);
        related.hosts.add(link.b.hostname);
      };
      hostsOf2(model2, selection).forEach((host) => related.hosts.add(host));
      if (selection.kind === "node") {
        const node = nodeOf(model2, selection);
        (model2.linksByNode.get(node.hostname) || []).forEach(addLink);
        (model2.beamsByNode.get(node.hostname) || []).forEach((beam) => related.beams.add(beam.id));
        (model2.clustersByHost.get(node.hostname) || []).forEach((cluster) => related.clusters.add(cluster.id));
      } else if (selection.kind === "link") {
        const link = linkOf(model2, selection);
        if (link.beam) related.beams.add(link.beam.id);
      } else if (selection.kind === "aggregate") {
        const aggregate = aggregateOf(model2, selection);
        if (aggregate) {
          aggregate.cables.forEach(addLink);
          aggregate.beams.forEach((beam) => related.beams.add(beam.id));
        }
      } else if (selection.kind === "beam") {
        beamOf(model2, selection).links.forEach(addLink);
      } else if (selection.kind === "cluster") {
        clusterOf(model2, selection).heartbeats.forEach((hb) => {
          if (hb.link) addLink(hb.link);
        });
      }
      return related;
    }
    function paintSelection() {
      const selection = state.selection;
      const related = multi() ? relatedToHosts2(state.selected) : relatedTo2(selection);
      const is = (kind, id) => !!selection && selection.kind === kind && selection.id === id;
      svgClasses();
      const query3 = parseRule(state.query);
      const selectedAggregate = selection && selection.kind === "aggregate" ? aggregateOf(model2, selection) : null;
      state.nodeEls.forEach((el, id) => {
        const node = model2.nodeByHost.get(id);
        el.classList.toggle("selected", is("node", id) || state.selected.has(id) || !!selectedAggregate && selectedAggregate.hostname === id);
        el.classList.toggle("related", related.hosts.has(id));
        el.classList.toggle("match", !!node && matches(query3, node));
      });
      state.linkEls.forEach((els, id) => {
        els.group.classList.toggle("selected", is("link", id));
        els.group.classList.toggle("related", related.links.has(id));
      });
      state.beamEls.forEach((els, id) => {
        els.group.classList.toggle("selected", is("beam", id));
        els.group.classList.toggle("related", related.beams.has(id));
        els.tag.classList.toggle("selected", is("beam", id));
        els.tag.classList.toggle("related", related.beams.has(id));
      });
      state.clusterEls.forEach((els, id) => {
        els.group.classList.toggle("selected", is("cluster", id));
        els.group.classList.toggle("related", related.clusters.has(id));
      });
    }
    const notifyHosts = () => {
      if (options.onHosts) options.onHosts(Array.from(state.selected));
    };
    function select(selection) {
      state.selection = selection;
      state.selected = new Set(selection && selection.kind === "node" ? [selection.id] : []);
      paintSelection();
      onSelect(selection);
      notifyHosts();
    }
    function selectHosts(hosts) {
      const kept = new Set(hosts.filter((host) => model2.nodeByHost.has(host)));
      state.selected = kept;
      state.selection = kept.size === 1 ? { kind: "node", id: Array.from(kept)[0] } : null;
      paintSelection();
      onSelect(state.selection);
      notifyHosts();
    }
    function toggleHost(hostname) {
      const next = new Set(state.selected);
      if (next.has(hostname)) next.delete(hostname);
      else next.add(hostname);
      selectHosts(Array.from(next));
    }
    function selectIn(rect) {
      const inside = Array.from(state.nodeEls.keys()).filter((host) => {
        const p = screenPoint(host);
        return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
      });
      selectHosts(inside);
    }
    function alignSelected(mode) {
      const moved = align(state.positions, Array.from(state.selected).filter((host) => state.nodeEls.has(host)), mode);
      moved.forEach((point, host) => moveTo(host, point));
      if (moved.size && options.onPins) options.onPins(moved, "aligned");
      return moved;
    }
    function layoutEdges2() {
      const edges = allLinks().map((l) => [l.a.hostname, l.b.hostname]);
      model2.clusters.forEach((c) => c.hosts.slice(1).forEach((host) => edges.push([c.hosts[0], host, 2.5])));
      return edges;
    }
    let unplaced = /* @__PURE__ */ new Set();
    function place(nodes) {
      const edges = layoutEdges2();
      const card2 = { w: model2.cardWidth, h: CARD_H };
      const infra = nodes.filter((n2) => n2.kind !== "stub").map((n2) => n2.hostname);
      const stubs = nodes.filter((n2) => n2.kind === "stub").map((n2) => n2.hostname);
      const of = (ids, source) => ids.filter((id) => source.has(id)).map((id) => [id, source.get(id)]);
      const remembered = of(infra, state.placed);
      const base = run(infra, edges, new Map([...remembered, ...of(infra, state.pinned)]), { extend: remembered.length > 0, card: card2 });
      const fresh2 = /* @__PURE__ */ new Map();
      const held = wired(infra, edges);
      unplaced = new Set(infra.filter((id) => !held.has(id)));
      infra.forEach((id) => {
        const node = model2.nodeByHost.get(id);
        if (state.placed.has(id) || state.pinned.has(id) || !held.has(id) || !node || node.ghost) return;
        const point = { ...base.get(id) };
        state.placed.set(id, point);
        fresh2.set(id, point);
      });
      if (!stubs.length) return { positions: base, fresh: fresh2 };
      const fixed = new Map([...base, ...of(stubs, state.placed), ...of(stubs, state.pinned)]);
      return { positions: run(nodes.map((n2) => n2.hostname), edges, fixed, { extend: true, card: card2 }), fresh: fresh2 };
    }
    function render2(keepView, replace = false) {
      const nodes = visibleNodes();
      const shown = new Set(nodes.map((n2) => n2.hostname));
      const links = visibleLinks(shown);
      const { positions, fresh: fresh2 } = place(nodes);
      state.positions = positions;
      tip2.hide();
      [state.nodeEls, state.linkEls, state.beamEls, state.clusterEls, cards].forEach((map) => map.clear());
      [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach(clear);
      visibleClusters(shown).forEach((cluster) => clusterLayer.appendChild(drawCluster(cluster)));
      visibleBeams(shown, links).forEach((beam) => beamLayer.appendChild(drawBeam(beam)));
      links.forEach((link) => linkLayer.appendChild(drawLink(link)));
      nodes.forEach((node) => nodeLayer.appendChild(drawNode(node)));
      if (!keepView) fit();
      paintSelection();
      if ((fresh2.size || replace) && options.onPlaced) options.onPlaced(fresh2, replace);
      return { nodes: nodes.length, links: links.length };
    }
    function centerOn(selection) {
      const ends = hostsOf2(model2, selection).map((host) => state.positions.get(host)).filter((p) => !!p);
      if (!ends.length) return;
      const area = visibleRect();
      const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
      state.view.k = Math.max(state.view.k, 0.8);
      state.view.tx = area.x + area.width / 2 - x * state.view.k;
      state.view.ty = area.y + area.height / 2 - y * state.view.k;
      applyView();
    }
    function reveal2(selection) {
      if (!selection) {
        select(null);
        return false;
      }
      const entity = entityOf(model2, selection);
      const links = selection.kind === "link" ? [linkOf(model2, selection)].filter((l) => !!l) : selection.kind === "beam" ? (beamOf(model2, selection) || { links: [] }).links : selection.kind === "aggregate" ? (aggregateOf(model2, selection) || { cables: [] }).cables : [];
      const hosts = hostsOf2(model2, selection).concat(links.flatMap((link) => [link.a.hostname, link.b.hostname]));
      const needsStubs = hosts.some((host) => (model2.nodeByHost.get(host) || { kind: null }).kind === "stub");
      let redraw = false;
      if (entity && entity.ghost && !state.showDiff) {
        state.showDiff = true;
        redraw = true;
      }
      if (needsStubs && !state.showStubs) {
        state.showStubs = true;
        redraw = true;
      }
      links.forEach((link) => {
        if (state.hiddenStatuses.has(link.status)) {
          state.hiddenStatuses.delete(link.status);
          redraw = true;
        }
      });
      if (redraw) render2(true);
      select(selection);
      centerOn(selection);
      return redraw;
    }
    function syncPins() {
      savedPins().forEach((point, host) => {
        state.pinned.set(host, point);
        const current = state.positions.get(host);
        if (state.nodeEls.has(host) && current && (current.x !== point.x || current.y !== point.y)) {
          state.positions.set(host, { ...point });
          moveNode(host);
          follow(host);
        }
      });
      state.nodeEls.forEach((el, host) => el.classList.toggle("pinned", state.pinned.has(host)));
    }
    function syncPlaces() {
      state.placed = savedPlaces();
      const stale = Array.from(state.nodeEls.keys()).some((host) => {
        const node = model2.nodeByHost.get(host), place2 = state.placed.get(host), current = state.positions.get(host);
        if (!node || !current || state.pinned.has(host)) return false;
        if (place2) return place2.x !== current.x || place2.y !== current.y;
        return node.kind !== "stub" && !node.ghost && !unplaced.has(host);
      });
      if (stale) render2(true);
    }
    const drawn = () => ({ nodes: state.nodeEls.size, links: state.linkEls.size });
    return {
      state,
      render: (keepView) => render2(keepView),
      fit,
      select,
      selectHosts,
      alignSelected,
      reveal: reveal2,
      repaint: paintSelection,
      resetPins: () => {
        state.pinned = savedPins();
        return render2(true);
      },
      replaceAll: () => {
        state.pinned = savedPins();
        state.placed = /* @__PURE__ */ new Map();
        return render2(false, true);
      },
      syncPins,
      syncPlaces,
      recolor: () => render2(true),
      // Une épingle retirée replace le graphe seulement si son équipement est dessiné (une orpheline ne bouge rien).
      unpin: (hostnames) => {
        const shown = hostnames.some((host) => state.nodeEls.has(host));
        hostnames.forEach((host) => state.pinned.delete(host));
        return shown ? render2(true) : drawn();
      }
    };
  }
  var graph = { create: create2 };

  // src/canvas/neighbors.ts
  var OBSERVED2 = /* @__PURE__ */ new Set(["lldp", "cdp"]);
  var SEP2 = "\0";
  function neighborsOf(model2, hostname) {
    const rows = /* @__PURE__ */ new Map();
    (model2.linksByNode.get(hostname) || []).forEach((link) => {
      if (link.ghost) return;
      link.raw.evidence.forEach((e) => {
        if (e.witness.hostname !== hostname || !OBSERVED2.has(e.source) || e.witness.interface === null) return;
        const key2 = e.witness.interface + SEP2 + e.remote_raw.name + SEP2 + (e.remote_raw.port === null ? "" : e.remote_raw.port);
        const row2 = rows.get(key2);
        if (row2) {
          if (!row2.sources.includes(e.source)) rows.set(key2, { ...row2, sources: row2.sources.concat(e.source).sort() });
          return;
        }
        rows.set(key2, { port: e.witness.interface, neighbor: e.remote_raw.name, neighborPort: e.remote_raw.port, sources: [e.source], resolved: e.remote_resolved.hostname });
      });
    });
    const rank = new Map((model2.ifacesByNode.get(hostname) || []).map((itf, i) => [ifaceKey(hostname, itf.name), i]));
    const at = (port) => {
      const r = rank.get(ifaceKey(hostname, port));
      return r === void 0 ? Number.MAX_SAFE_INTEGER : r;
    };
    const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    return Array.from(rows.values()).sort((x, y) => at(x.port) - at(y.port) || cmp(x.port, y.port) || cmp(x.neighbor, y.neighbor) || cmp(x.neighborPort || "", y.neighborPort || ""));
  }
  var neighbors = { neighborsOf };

  // src/canvas/reveal.ts
  var nothingRevealed = () => ({ primary: /* @__PURE__ */ new Set(), sibling: /* @__PURE__ */ new Set(), peer: /* @__PURE__ */ new Set() });
  function primaryOf(model2, selection) {
    if (selection.kind === "beam") {
      const beam = beamOf(model2, selection);
      return beam ? [beam] : [];
    }
    if (selection.kind === "link") {
      const link = linkOf(model2, selection);
      return link && link.beam ? [link.beam] : [];
    }
    if (selection.kind === "aggregate") {
      const aggregate = aggregateOf(model2, selection);
      return aggregate ? aggregate.beams.slice() : [];
    }
    return [];
  }
  function reveal(model2, selection) {
    const out = nothingRevealed();
    if (!selection) return out;
    const primary = primaryOf(model2, selection);
    primary.forEach((beam) => out.primary.add(beam.id));
    const domains = /* @__PURE__ */ new Set();
    primary.forEach((beam) => {
      if (!beam.peerLink) beam.mlags.forEach((domain) => domains.add(domain));
    });
    domains.forEach((domain) => {
      domain.members.forEach((aggregate) => aggregate.beams.forEach((beam) => {
        if (!out.primary.has(beam.id)) out.sibling.add(beam.id);
      }));
      if (domain.peerLink) domain.peerLink.beams.forEach((beam) => {
        if (!out.primary.has(beam.id)) out.peer.add(beam.id);
      });
    });
    return out;
  }

  // src/canvas/scene.ts
  function visible(model2, f) {
    const allNodes = model2.nodes.concat(f.showDiff ? model2.ghostNodes : []);
    const allLinks = model2.links.concat(f.showDiff ? model2.ghostLinks : []);
    const nodes = keepByRules(allNodes.filter((n2) => f.showStubs || n2.kind !== "stub"), allLinks, f.hide, f.only);
    const shown = new Set(nodes.map((n2) => n2.hostname));
    const links = allLinks.filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !f.hiddenStatuses.has(l.status));
    const drawn = new Set(links.map((l) => l.id));
    const beams = model2.beams.filter((b) => b.a.hostname !== b.b.hostname && shown.has(b.a.hostname) && shown.has(b.b.hostname) && b.links.some((l) => drawn.has(l.id)));
    const clusters = model2.clusters.filter((c) => c.hosts.filter((h2) => shown.has(h2)).length >= 2);
    const groups2 = Array.from(model2.groupById.values()).filter((g) => g.members.some((h2) => shown.has(h2)));
    const drawnGroups = new Set(groups2.map((g) => g.id));
    const annotations2 = f.showNotes === false ? [] : Array.from(model2.annotationById.values()).filter((a) => !model2.orphanAnnotations.includes(a) && shownWith(a, shown, drawnGroups));
    const drawnNotes = new Set(annotations2.map((a) => a.id));
    const connectors2 = f.showNotes === false ? [] : Array.from(model2.connectorById.values()).filter((c) => !model2.orphanConnectors.includes(c) && shownWith2(c, shown, drawnGroups, drawnNotes));
    return { nodes, links, beams, clusters, groups: groups2, annotations: annotations2, connectors: connectors2, shown };
  }
  function changeOf(model2, showDiff, kind, entity, id) {
    if (!showDiff) return null;
    if (entity.ghost) return "removed";
    return (model2.changeOf(kind, id) || { kind: null }).kind;
  }
  function layoutEdges(model2) {
    const edges = model2.links.concat(model2.ghostLinks).map((l) => [l.a.hostname, l.b.hostname]);
    model2.clusters.forEach((c) => c.hosts.slice(1).forEach((host) => edges.push([c.hosts[0], host, 2.5])));
    return edges;
  }
  function placeScene(model2, nodes, pinned, placed2) {
    const edges = layoutEdges(model2);
    const card2 = { w: model2.cardWidth, h: CARD_H };
    const infra = nodes.filter((n2) => n2.kind !== "stub").map((n2) => n2.hostname);
    const stubs = nodes.filter((n2) => n2.kind === "stub").map((n2) => n2.hostname);
    const of = (ids, source) => ids.filter((id) => source.has(id)).map((id) => [id, source.get(id)]);
    const remembered = of(infra, placed2);
    const base = run(infra, edges, new Map([...remembered, ...of(infra, pinned)]), { extend: remembered.length > 0, card: card2 });
    const fresh2 = /* @__PURE__ */ new Map();
    const held = wired(infra, edges);
    const unplaced = new Set(infra.filter((id) => !held.has(id)));
    infra.forEach((id) => {
      const node = model2.nodeByHost.get(id);
      if (placed2.has(id) || pinned.has(id) || !held.has(id) || !node || node.ghost) return;
      const point = { ...base.get(id) };
      placed2.set(id, point);
      fresh2.set(id, point);
    });
    if (!stubs.length) return { positions: base, fresh: fresh2, unplaced };
    const fixed = new Map([...base, ...of(stubs, placed2), ...of(stubs, pinned)]);
    return { positions: run(nodes.map((n2) => n2.hostname), edges, fixed, { extend: true, card: card2 }), fresh: fresh2, unplaced };
  }
  var none = () => ({ hosts: /* @__PURE__ */ new Set(), links: /* @__PURE__ */ new Set(), beams: /* @__PURE__ */ new Set(), clusters: /* @__PURE__ */ new Set(), groups: /* @__PURE__ */ new Set(), annotations: /* @__PURE__ */ new Set(), connectors: /* @__PURE__ */ new Set() });
  var touching = (model2, related, kind, ref) => (model2.connectorsByRef.get(key(kind, ref)) || []).forEach((c) => related.connectors.add(c.id));
  function relatedToHosts(model2, hosts) {
    const related = none();
    hosts.forEach((host) => related.hosts.add(host));
    hosts.forEach((host) => (model2.linksByNode.get(host) || []).forEach((link) => {
      if (hosts.has(link.a.hostname) && hosts.has(link.b.hostname)) related.links.add(link.id);
    }));
    model2.beams.forEach((beam) => {
      if (hosts.has(beam.a.hostname) && hosts.has(beam.b.hostname)) related.beams.add(beam.id);
    });
    model2.clusters.forEach((cluster) => {
      if (cluster.hosts.every((host) => hosts.has(host))) related.clusters.add(cluster.id);
    });
    model2.groupById.forEach((group) => {
      const present2 = presentOf(model2, group);
      if (present2.length && present2.every((host) => hosts.has(host))) related.groups.add(group.id);
    });
    return related;
  }
  function relatedTo(model2, selection) {
    const related = none();
    if (!selection || !entityOf(model2, selection)) return related;
    const addLink = (link) => {
      related.links.add(link.id);
      related.hosts.add(link.a.hostname);
      related.hosts.add(link.b.hostname);
    };
    hostsOf2(model2, selection).forEach((host) => related.hosts.add(host));
    if (selection.kind === "node") {
      const node = nodeOf(model2, selection);
      (model2.linksByNode.get(node.hostname) || []).forEach(addLink);
      (model2.beamsByNode.get(node.hostname) || []).forEach((beam) => related.beams.add(beam.id));
      (model2.clustersByHost.get(node.hostname) || []).forEach((cluster) => related.clusters.add(cluster.id));
      (model2.groupsByHost.get(node.hostname) || []).forEach((group) => related.groups.add(group.id));
      (model2.annotationsByHost.get(node.hostname) || []).forEach((a) => related.annotations.add(a.id));
      touching(model2, related, "device", node.hostname);
    } else if (selection.kind === "annotation") {
      related.annotations.add(selection.id);
      const a = model2.annotationById.get(selection.id);
      if (a && a.anchor.kind === "group" && a.anchor.ref) related.groups.add(a.anchor.ref);
      touching(model2, related, "annotation", selection.id);
    } else if (selection.kind === "connector") {
      related.connectors.add(selection.id);
      const c = model2.connectorById.get(selection.id);
      if (c) attachedEnds(c).forEach((e) => {
        if (e.kind === "group") related.groups.add(e.ref);
        else if (e.kind === "annotation") related.annotations.add(e.ref);
      });
    } else if (selection.kind === "group") {
      const members = new Set(related.hosts);
      members.forEach((host) => (model2.linksByNode.get(host) || []).forEach((link) => {
        if (members.has(link.a.hostname) && members.has(link.b.hostname)) related.links.add(link.id);
      }));
      related.groups.add(selection.id);
      (model2.annotationsByGroup.get(selection.id) || []).forEach((a) => related.annotations.add(a.id));
      touching(model2, related, "group", selection.id);
    } else if (selection.kind === "link") {
      const link = linkOf(model2, selection);
      if (link.beam) related.beams.add(link.beam.id);
    } else if (selection.kind === "aggregate") {
      const aggregate = aggregateOf(model2, selection);
      if (aggregate) {
        aggregate.cables.forEach(addLink);
        aggregate.beams.forEach((beam) => related.beams.add(beam.id));
      }
    } else if (selection.kind === "beam") {
      beamOf(model2, selection).links.forEach(addLink);
    } else if (selection.kind === "cluster") {
      clusterOf(model2, selection).heartbeats.forEach((hb) => {
        if (hb.link) addLink(hb.link);
      });
    }
    const shown = reveal(model2, selection);
    [shown.sibling, shown.peer].forEach((ids) => ids.forEach((id) => {
      const beam = model2.beamById.get(id);
      if (!beam) return;
      related.beams.add(id);
      beam.links.forEach(addLink);
    }));
    return related;
  }
  var scene = { visible, changeOf, layoutEdges, placeScene, relatedTo, relatedToHosts };

  // src/canvas/speed.ts
  var PHYSICAL = /* @__PURE__ */ new Set(["physical", "management"]);
  var SLOTS = [0.5, 0.65, 0.35, 0.8, 0.2];
  function endSpeed(model2, end) {
    const found = interfaceAt(model2, end.hostname, end.interface, false);
    if (!found || !PHYSICAL.has(found.itf.type)) return null;
    const mbps = found.itf.speed_mbps;
    return typeof mbps === "number" ? mbps : null;
  }
  function cableSpeed(model2, link) {
    const a = endSpeed(model2, link.a), b = endSpeed(model2, link.b);
    if (a !== null && b !== null) {
      return a === b ? { token: speedToken(a), rank: a, mismatch: false, partial: false } : { token: speedToken(a) + "/" + speedToken(b), rank: Math.max(a, b), mismatch: true, partial: false };
    }
    const one = a !== null ? a : b;
    return one === null ? { token: null, rank: 0, mismatch: false, partial: false } : { token: speedToken(one), rank: one, mismatch: false, partial: true };
  }
  function groupText(speeds) {
    const counts = /* @__PURE__ */ new Map();
    speeds.forEach((s2) => {
      if (!s2.token) return;
      const got = counts.get(s2.token);
      counts.set(s2.token, { count: (got ? got.count : 0) + 1, rank: s2.rank });
    });
    return Array.from(counts).sort((x, y) => y[1].rank - x[1].rank || (x[0] < y[0] ? -1 : 1)).map(([token, { count }]) => count > 1 ? count + "×" + token : token).join("+");
  }
  function speedGroups(model2, links) {
    const byKey = /* @__PURE__ */ new Map();
    links.forEach((link) => {
      if (link.ghost || link.a.hostname === link.b.hostname) return;
      const key2 = link.beam ? "beam:" + link.beam.id : "pair:" + link.pair;
      const got = byKey.get(key2);
      if (got) got.push(link);
      else byKey.set(key2, [link]);
    });
    const groups2 = [];
    byKey.forEach((members, key2) => {
      const speeds = members.map((link) => cableSpeed(model2, link));
      if (!speeds.some((s2) => s2.token)) return;
      const beam = members[0].beam;
      const tone = speeds.some((s2) => s2.mismatch) ? "warning" : members.every((l) => l.raw.oper === "down") ? "muted" : "neutral";
      const offset = beam ? beamBand(beam).offset : members.reduce((sum, link) => sum + fanOffset(link), 0) / members.length;
      groups2.push({
        key: key2,
        pair: members[0].pair,
        beam,
        links: members,
        text: groupText(speeds),
        tone,
        dashed: speeds.some((s2) => s2.partial || !s2.token),
        worst: worst(members.flatMap((link) => link.worst ? [{ severity: link.worst }] : [])),
        offset,
        t: SLOTS[0]
      });
    });
    const byPair = /* @__PURE__ */ new Map();
    groups2.forEach((g) => {
      const got = byPair.get(g.pair);
      if (got) got.push(g);
      else byPair.set(g.pair, [g]);
    });
    byPair.forEach((list) => list.sort((x, y) => x.offset - y.offset || (x.key < y.key ? -1 : 1)).forEach((g, i) => {
      g.t = SLOTS[Math.min(i, SLOTS.length - 1)];
    }));
    return groups2;
  }
  function pointOn(p, q, offset, t) {
    const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
    const c = { x: (p.x + q.x) / 2 - dy / length * offset * 2, y: (p.y + q.y) / 2 + dx / length * offset * 2 };
    return { x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * c.y + t * t * q.y };
  }
  var speed = { speedGroups, pointOn, SLOTS };

  // src/canvas/table.ts
  var MAX_ROWS = 30;
  var MAX_COLUMNS = 8;
  var MAX_CELL = 120;
  var MIN_TRACK = 20;
  var columnsOf = (content) => content.rows[0] ? content.rows[0].length : 0;
  var asRows = (rows) => rows;
  var weights = (given, count) => given && given.length === count ? given.slice() : new Array(count).fill(1);
  function tracks(given, count, length) {
    const w = weights(given, count), total2 = w.reduce((sum, v) => sum + v, 0) || 1;
    const out = [0];
    let acc = 0;
    w.forEach((v, i) => {
      acc += v;
      out.push(i === count - 1 ? length : Math.round(length * acc / total2));
    });
    return out;
  }
  function grid(content, frame) {
    const columns2 = Math.max(1, columnsOf(content)), rows = Math.max(1, content.rows.length);
    return { xs: tracks(content.widths, columns2, frame.w), ys: tracks(content.heights, rows, frame.h), columns: columns2, rows };
  }
  function mergeAt(content, r, c) {
    return content.merges.find((m) => r >= m.row && r < m.row + m.rows && c >= m.col && c < m.col + m.cols) || null;
  }
  function anchorOf(content, r, c) {
    const m = mergeAt(content, r, c);
    return m ? [m.row, m.col] : [r, c];
  }
  function cells(content, g) {
    const out = [];
    content.rows.forEach((row2, r) => row2.forEach((text2, c) => {
      const m = mergeAt(content, r, c);
      if (m && (m.row !== r || m.col !== c)) return;
      const rows = m ? m.rows : 1, cols = m ? m.cols : 1;
      out.push({ r, c, rows, cols, x: g.xs[c], y: g.ys[r], w: g.xs[c + cols] - g.xs[c], h: g.ys[r + rows] - g.ys[r], text: text2 });
    }));
    return out;
  }
  function cellAt(content, g, x, y) {
    if (x < 0 || y < 0 || x > g.xs[g.columns] || y > g.ys[g.rows]) return null;
    let c = 0, r = 0;
    while (c < g.columns - 1 && x >= g.xs[c + 1]) c += 1;
    while (r < g.rows - 1 && y >= g.ys[r + 1]) r += 1;
    return anchorOf(content, r, c);
  }
  function rangeOf(content, a, b) {
    let range = { r0: Math.min(a[0], b[0]), c0: Math.min(a[1], b[1]), r1: Math.max(a[0], b[0]), c1: Math.max(a[1], b[1]) };
    for (let guard = 0; guard < 64; guard += 1) {
      const grown = { ...range };
      content.merges.forEach((m) => {
        const touches = m.row <= range.r1 && m.row + m.rows - 1 >= range.r0 && m.col <= range.c1 && m.col + m.cols - 1 >= range.c0;
        if (!touches) return;
        grown.r0 = Math.min(grown.r0, m.row);
        grown.c0 = Math.min(grown.c0, m.col);
        grown.r1 = Math.max(grown.r1, m.row + m.rows - 1);
        grown.c1 = Math.max(grown.c1, m.col + m.cols - 1);
      });
      if (grown.r0 === range.r0 && grown.c0 === range.c0 && grown.r1 === range.r1 && grown.c1 === range.c1) break;
      range = grown;
    }
    return range;
  }
  var isSingle = (range) => range.r0 === range.r1 && range.c0 === range.c1;
  function normalized(content, merges) {
    const kept = merges.filter((m) => m.rows * m.cols >= 2 && m.rows >= 1 && m.cols >= 1).sort((a, b) => a.row - b.row || a.col - b.col);
    return { ...content, merges: kept };
  }
  function setCell(content, r, c, text2) {
    return { ...content, rows: asRows(content.rows.map((row2, i) => i === r ? row2.map((cell, j) => j === c ? text2.slice(0, MAX_CELL) : cell) : row2)) };
  }
  var average = (values) => Math.max(1, Math.round(values.reduce((s2, v) => s2 + v, 0) / values.length));
  function insertRow(content, at) {
    if (content.rows.length >= MAX_ROWS) return content;
    const columns2 = columnsOf(content);
    const rows = content.rows.slice();
    rows.splice(at, 0, new Array(columns2).fill(""));
    const heights = content.heights ? content.heights.slice() : null;
    if (heights) heights.splice(at, 0, average(content.heights));
    const merges = content.merges.map((m) => m.row >= at ? { ...m, row: m.row + 1 } : m.row + m.rows > at ? { ...m, rows: m.rows + 1 } : m);
    return normalized({ ...content, rows: asRows(rows), heights }, merges);
  }
  function deleteRow(content, at) {
    if (content.rows.length <= 1 || at < 0 || at >= content.rows.length) return content;
    const rows = content.rows.filter((_, i) => i !== at);
    const heights = content.heights ? content.heights.filter((_, i) => i !== at) : null;
    const merges = content.merges.map((m) => m.row > at ? { ...m, row: m.row - 1 } : m.row + m.rows > at ? { ...m, rows: m.rows - 1 } : m);
    return normalized({ ...content, rows: asRows(rows), heights }, merges);
  }
  function insertColumn(content, at) {
    if (columnsOf(content) >= MAX_COLUMNS) return content;
    const rows = content.rows.map((row2) => {
      const next = row2.slice();
      next.splice(at, 0, "");
      return next;
    });
    const widths = content.widths ? content.widths.slice() : null;
    if (widths) widths.splice(at, 0, average(content.widths));
    const merges = content.merges.map((m) => m.col >= at ? { ...m, col: m.col + 1 } : m.col + m.cols > at ? { ...m, cols: m.cols + 1 } : m);
    return normalized({ ...content, rows: asRows(rows), widths }, merges);
  }
  function deleteColumn(content, at) {
    const columns2 = columnsOf(content);
    if (columns2 <= 1 || at < 0 || at >= columns2) return content;
    const rows = content.rows.map((row2) => row2.filter((_, j) => j !== at));
    const widths = content.widths ? content.widths.filter((_, j) => j !== at) : null;
    const merges = content.merges.map((m) => m.col > at ? { ...m, col: m.col - 1 } : m.col + m.cols > at ? { ...m, cols: m.cols - 1 } : m);
    return normalized({ ...content, rows: asRows(rows), widths }, merges);
  }
  function merge(content, range) {
    const full = rangeOf(content, [range.r0, range.c0], [range.r1, range.c1]);
    if (isSingle(full)) return content;
    const outside = content.merges.filter((m) => !(m.row >= full.r0 && m.row + m.rows - 1 <= full.r1 && m.col >= full.c0 && m.col + m.cols - 1 <= full.c1));
    return normalized(content, outside.concat({ row: full.r0, col: full.c0, rows: full.r1 - full.r0 + 1, cols: full.c1 - full.c0 + 1 }));
  }
  function split(content, r, c) {
    const m = mergeAt(content, r, c);
    return m ? normalized(content, content.merges.filter((x) => x !== m)) : content;
  }
  function resized(bounds2, index, delta) {
    if (index < 1 || index >= bounds2.length - 1) return null;
    const lo = bounds2[index - 1] + MIN_TRACK, hi = bounds2[index + 1] - MIN_TRACK;
    const at = Math.round(Math.min(hi, Math.max(lo, bounds2[index] + delta)));
    if (at === bounds2[index] || hi < lo) return null;
    const next = bounds2.slice();
    next[index] = at;
    return next.slice(1).map((b, i) => Math.max(1, b - next[i]));
  }
  function resizeColumn(content, g, index, delta) {
    const widths = resized(g.xs, index, delta);
    return widths ? { ...content, widths } : content;
  }
  function resizeRow(content, g, index, delta) {
    const heights = resized(g.ys, index, delta);
    return heights ? { ...content, heights } : content;
  }
  function grownBox(before, after, frame) {
    const g = grid(before, frame);
    const dc = columnsOf(after) - columnsOf(before), dr = after.rows.length - before.rows.length;
    const colW = Math.round(frame.w / Math.max(1, g.columns)), rowH = Math.round(frame.h / Math.max(1, g.rows));
    const clamp2 = (v) => Math.min(4e3, Math.max(20, Math.round(v)));
    return { w: clamp2(frame.w + dc * colW), h: clamp2(frame.h + dr * rowH) };
  }
  var fresh = (rows, header2 = true) => ({ kind: "table", header: header2, rows: asRows(rows), widths: null, heights: null, merges: [] });
  var table = { MAX_ROWS, MAX_COLUMNS, MAX_CELL, MIN_TRACK, columnsOf, grid, mergeAt, anchorOf, cells, cellAt, rangeOf, isSingle, setCell, insertRow, deleteRow, insertColumn, deleteColumn, merge, split, resizeColumn, resizeRow, grownBox, fresh };

  // src/canvas/tags.ts
  var MIDDLE = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75];
  var NEAR_Q = [0.7, 0.62, 0.78, 0.55, 0.5, 0.45, 0.4];
  var NEAR_P = NEAR_Q.map((t) => Math.round((1 - t) * 100) / 100);
  var GAP2 = 3;
  var TAG_WEIGHT = 4;
  var CELL = 64;
  function normal2(p, q) {
    const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
    return { x: -dy / length, y: dx / length };
  }
  function tagCenter(p, q, offset, w, slot) {
    const at = pointOn(p, q, offset, slot.t);
    if (!slot.side) return at;
    const n2 = normal2(p, q);
    const away = Math.abs(n2.x) * (w / 2) + Math.abs(n2.y) * (PILL_H / 2) + GAP2;
    return { x: at.x + n2.x * slot.side * away, y: at.y + n2.y * slot.side * away };
  }
  var Grid = class {
    constructor() {
      this.cells = /* @__PURE__ */ new Map();
    }
    keys(r) {
      const out = [];
      for (let i = Math.floor(r.x / CELL); i <= Math.floor((r.x + r.w) / CELL); i++) {
        for (let j = Math.floor(r.y / CELL); j <= Math.floor((r.y + r.h) / CELL); j++) out.push(i + "," + j);
      }
      return out;
    }
    add(r) {
      this.keys(r).forEach((k) => {
        const got = this.cells.get(k);
        if (got) got.push(r);
        else this.cells.set(k, [r]);
      });
    }
    overlap(r) {
      const seen = /* @__PURE__ */ new Set();
      let area = 0;
      this.keys(r).forEach((k) => (this.cells.get(k) || []).forEach((o) => {
        if (seen.has(o)) return;
        seen.add(o);
        const w = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x), h2 = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y);
        if (w > 0 && h2 > 0) area += w * h2 * o.weight;
      }));
      return area;
    }
  };
  function rectAt(center, w, pad) {
    return { x: center.x - w / 2 - pad, y: center.y - PILL_H / 2 - pad, w: w + 2 * pad, h: PILL_H + 2 * pad };
  }
  function candidates(req) {
    const n2 = normal2(req.p, req.q);
    const up = n2.y <= 0 ? 1 : -1;
    const outer = req.offset > 0 ? 1 : req.offset < 0 ? -1 : up;
    const other = outer === 1 ? -1 : 1;
    return [0, outer, other, 2 * outer, 2 * other].flatMap((side) => req.prefer.map((t) => ({ t, side })));
  }
  function placeTags(requests, obstacles) {
    const grid2 = new Grid();
    obstacles.forEach((r) => grid2.add({ ...r, weight: 1 }));
    const out = /* @__PURE__ */ new Map();
    requests.forEach((req) => {
      let best = null, cost = Infinity;
      for (const slot of candidates(req)) {
        const got = grid2.overlap(rectAt(tagCenter(req.p, req.q, req.offset, req.w, slot), req.w, GAP2));
        if (got < cost) {
          best = slot;
          cost = got;
        }
        if (got === 0) break;
      }
      const chosen = best || { t: 0.5, side: 0 };
      grid2.add({ ...rectAt(tagCenter(req.p, req.q, req.offset, req.w, chosen), req.w, 0), weight: TAG_WEIGHT });
      out.set(req.id, chosen);
    });
    return out;
  }
  var tags = { placeTags, tagCenter, MIDDLE, NEAR_P, NEAR_Q };

  // src/shell/apps.ts
  var apps = {};

  // src/shell/widgets.ts
  var pill3 = (kind, value2, label2) => h("span", { class: "pill " + kind + "-" + value2 }, label2 === void 0 ? value2 : label2);
  var sourcePill = (source) => pill3("source", source, SOURCE_LABEL[source] || source);
  var statusPill = (status) => pill3("status", status, STATUS_LABEL[status] || status);
  var severityPill = (severity) => pill3("severity", severity);
  var diffPill = (kind) => pill3("diff", kind, DIFF_LABEL[kind] || kind);
  function definition(rows) {
    const kept = rows.filter((row2) => !!row2 && row2[1] !== null && row2[1] !== void 0 && row2[1] !== "");
    return h("dl", { class: "kv" }, kept.map(([label2, value2]) => [h("dt", {}, label2), h("dd", {}, typeof value2 === "object" ? value2 : String(value2))]));
  }
  function table2(headers, rows, options) {
    const head2 = h("tr", {}, headers.map((label2) => h("th", {}, label2)));
    const body = rows.map((row2) => {
      const line = h(
        "tr",
        { class: row2.onclick ? "clickable" : null, onclick: row2.onclick || null, tabindex: row2.onclick ? 0 : null },
        row2.cells.map((cell) => h("td", {}, cell))
      );
      const onclick = row2.onclick;
      if (onclick) line.addEventListener("keydown", (event) => {
        if (event.key === "Enter") onclick();
      });
      return line;
    });
    const empty = rows.length ? null : h("tr", {}, h("td", { colspan: headers.length, class: "empty" }, options && options.empty || "rien à signaler"));
    return h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, head2), h("tbody", {}, body, empty)));
  }
  function confirmable(label2, run2, options = {}) {
    const suffix = options.count === void 0 ? "" : " (" + options.count + ")";
    const holder = h("span", { class: "confirm-row" });
    const ask = () => {
      clear(holder).appendChild(h("button", { type: "button", onclick: () => {
        clear(holder).appendChild(first());
        run2();
      } }, "confirmer : " + label2 + suffix));
      holder.appendChild(h("button", { type: "button", class: "linklike", onclick: () => {
        clear(holder).appendChild(first());
      } }, "annuler"));
    };
    const first = () => h("button", { type: "button", title: options.title || null, onclick: ask }, label2 + suffix);
    holder.appendChild(first());
    return holder;
  }
  var widgets = { pill: pill3, sourcePill, statusPill, severityPill, diffPill, definition, table: table2, confirmable };

  // src/shell/tables.ts
  var CHECK_HEADERS = ["sévérité", "code", "vise", "détails", "règle"];
  var QUALITY_CODES = [
    "description_unparseable",
    "description_ha_unresolved",
    "description_disagrees_with_observed",
    "neighbor_unknown",
    "neighbor_name_ambiguous",
    "neighbor_name_case_differs",
    "neighbor_resolved_by_reported_hostname",
    "neighbor_resolved_by_address",
    "remote_port_is_mac",
    "remote_port_is_aggregate",
    "one_way_observation",
    "multiple_observed_neighbors",
    "self_observation"
  ];
  function targetsOf(model2, check) {
    return check.refs.map((ref) => {
      if (ref.kind === "link") return { label: endLabel(ref.a) + " ↔ " + endLabel(ref.b), selection: { kind: "link", id: linkId(ref) } };
      if (ref.kind === "cluster") return { label: "cluster " + ref.members.join(" + "), selection: { kind: "cluster", id: clusterId(ref.members) } };
      if (ref.kind === "aggregate") return { label: ref.hostname + " · " + ref.name, selection: { kind: "aggregate", id: aggregateKey(ref.hostname, ref.name) } };
      const label2 = ref.kind === "interface" ? ref.hostname + " · " + ref.name : ref.hostname;
      return { label: label2, selection: { kind: "node", id: ref.hostname } };
    }).filter((target) => entityOf(model2, target.selection) !== null);
  }
  var refHost = (ref) => "hostname" in ref ? ref.hostname : "";
  function targetCell(model2, check, onSelect) {
    const targets = targetsOf(model2, check);
    if (!targets.length) return plain(check.refs.map(refHost));
    return targets.map((t) => h("button", { class: "linklike", type: "button", onclick: () => onSelect(t.selection) }, t.label));
  }
  function checkRows(model2, checks, onSelect) {
    return checks.map((check) => ({ cells: [
      severityPill(check.severity),
      h("code", {}, check.code),
      targetCell(model2, check, onSelect),
      Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : "",
      check.origin === "bundle" ? "contrat d'entrée" : (model2.catalogue[check.code] || { rule: "" }).rule || ""
    ] }));
  }
  var byRank = (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || (x.code < y.code ? -1 : x.code > y.code ? 1 : 0) || x.index - y.index;
  function checksView(container, model2, onSelect) {
    const state = { severity: "", code: "", text: "" };
    const codes = Array.from(new Set(model2.checks.map((c) => c.code))).sort();
    const body = h("div", {});
    const draw2 = () => {
      const text2 = state.text.trim().toLowerCase();
      const rows = model2.checks.filter((c) => (!state.severity || c.severity === state.severity) && (!state.code || c.code === state.code) && (!text2 || JSON.stringify([c.refs, c.details]).toLowerCase().includes(text2))).sort(byRank);
      clear(body).appendChild(h("p", { class: "muted" }, rows.length + " contrôle" + (rows.length > 1 ? "s" : "") + " sur " + model2.checks.length));
      body.appendChild(table2(CHECK_HEADERS, checkRows(model2, rows, onSelect), { empty: "aucun contrôle ne correspond" }));
    };
    const select = (id, label2, values, key2) => h(
      "label",
      { class: "field" },
      label2,
      h("select", { id, onchange: (e) => {
        state[key2] = e.target.value;
        draw2();
      } }, h("option", { value: "" }, "tous"), values.map((v) => h("option", { value: v }, v)))
    );
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Contrôles"),
      h("p", { class: "lead" }, "Un désaccord n'est jamais résolu en silence : il devient un contrôle. Cliquer une cible l'ouvre dans le graphe."),
      h(
        "div",
        { class: "filters" },
        select("f-severity", "sévérité", ["error", "warning", "info"], "severity"),
        select("f-code", "code", codes, "code"),
        h("label", { class: "field" }, "contient", h("input", { id: "f-text", type: "search", placeholder: "hostname, port…", oninput: (e) => {
          state.text = e.target.value;
          draw2();
        } }))
      ),
      glossary(model2, codes),
      body
    ));
    draw2();
    return { setSeverity: (severity) => {
      state.severity = severity;
      const field = document.getElementById("f-severity");
      if (field) field.value = severity;
      draw2();
    } };
  }
  function glossary(model2, codes) {
    if (!codes.length) return null;
    return h(
      "details",
      { class: "glossary" },
      h("summary", {}, "Sens des " + codes.length + " codes présents"),
      definition(codes.map((code) => [code, (model2.catalogue[code] || { meaning: "" }).meaning || "(constat du contrat d'entrée)"]))
    );
  }
  function coverageTable(model2) {
    const topics = model2.coverage.length ? Object.keys(model2.coverage[0].topics) : [];
    return table2(["équipement", "collecte", ...topics], model2.coverage.map((c) => {
      const statuses = c.topics;
      return { cells: [c.hostname, pill3("collection", c.status, c.status), ...topics.map((t) => pill3("topic", statuses[t], statuses[t]))] };
    }), { empty: "aucun équipement dans le périmètre" });
  }
  function findingsTable(model2) {
    if (!model2.ingest) return h("p", { class: "muted" }, "Rapport d'ingestion non disponible pour cette page.");
    return table2(["code", "équipement", "objet", "détails", "message"], model2.ingest.findings.map((f) => ({
      cells: [h("code", {}, f.code), f.hostname || "", f.ref || "", plain(f.details), f.message]
    })), { empty: "aucun constat : la livraison respecte le contrat sans réserve" });
  }
  function counters(object, emptyText) {
    const entries = Object.entries(object || {});
    if (!entries.length) return h("p", { class: "muted" }, emptyText);
    return definition(entries.map(([k, v]) => [k, String(v)]));
  }
  function qualityView(container, model2, onSelect) {
    const summary3 = model2.ingest && model2.ingest.summary;
    const dataChecks = model2.checks.filter((c) => QUALITY_CODES.includes(c.code));
    const described = model2.interfaces.filter((i) => i.description !== null && i.description !== "");
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Qualité des données"),
      h("p", { class: "lead" }, "Ce que la livraison dit d'elle-même et ce que B1 n'a pas su lire : de quoi corriger l'exportateur ou les descriptions d'interface."),
      h("h3", {}, "Couverture de la collecte, par équipement et par topic"),
      coverageTable(model2),
      h("h3", {}, "La livraison"),
      summary3 ? definition(Object.entries(summary3).filter(([k]) => k !== "residual_normalizations").map(([k, v]) => [k, String(v)])) : null,
      h("h3", {}, "Constats du contrat d'entrée"),
      h("p", { class: "muted" }, "Clés nullables oubliées (nullable_key_absent), interface locale inconnue, membre d'agrégat inconnu… Tout doit tendre vers zéro."),
      findingsTable(model2),
      h("h3", {}, "Noms et descriptions que B1 a dû interpréter"),
      definition([
        ["interfaces avec une description", described.length + " sur " + model2.interfaces.length],
        ["descriptions non lues par la grammaire", String(model2.report.unparseable_descriptions)],
        ["voisins finis en « inconnu »", model2.report.unresolved_names.length ? model2.report.unresolved_names.join(", ") : "aucun"]
      ]),
      table2(["sévérité", "code", "vise", "détails", "règle"], checkRows(model2, dataChecks, onSelect), { empty: "aucun contrôle de nom ni de description" }),
      h("h3", {}, "Normalisations"),
      h("p", { class: "muted" }, "Résiduelles : ce que l'exportateur a dû normaliser lui-même (doit tendre vers zéro). Appliquées : ce que B1 a normalisé."),
      h(
        "div",
        { class: "two" },
        h("div", {}, h("h4", {}, "résiduelles (exportateur)"), counters(model2.report.residual_normalizations, "aucune")),
        h("div", {}, h("h4", {}, "appliquées (B1)"), counters(model2.report.applied_normalizations, "aucune"))
      )
    ));
  }
  function sourcesView(container, model2, onSelect) {
    const state = { combo: null, text: "" };
    const body = h("div", {});
    const draw2 = () => {
      const text2 = state.text.trim().toLowerCase();
      const combo = state.combo;
      const rows = model2.links.filter((l) => (combo === null || l.combo === combo.combo && l.status === combo.status) && (!text2 || (endLabel(l.a) + " " + endLabel(l.b)).toLowerCase().includes(text2)));
      clear(body).appendChild(h(
        "p",
        { class: "muted" },
        rows.length + " câble" + (rows.length > 1 ? "s" : "") + (combo ? " · " + combo.combo + " · " : ""),
        combo ? h("button", { class: "linklike", type: "button", onclick: () => {
          state.combo = null;
          draw2();
        } }, "tout afficher") : null
      ));
      body.appendChild(table2(["bout a", "bout b", "statut", "sources", "état", "contrôles"], rows.map((link) => ({
        onclick: () => onSelect({ kind: "link", id: link.id }),
        cells: [endLabel(link.a), endLabel(link.b), statusPill(link.status), link.sources.map(sourcePill), link.raw.oper, link.checks.length ? String(link.checks.length) : ""]
      })), { empty: "aucun câble" }));
    };
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Sources des câbles"),
      h("p", { class: "lead" }, "Chaque câble est tracé par une ou plusieurs sources. LLDP et CDP observent, une description documente : l'observé dessine le lien, le documenté le commente."),
      table2(["sources", "statut", "câbles"], model2.combos.map((combo) => ({
        onclick: () => {
          state.combo = combo;
          draw2();
        },
        cells: [combo.combo.split(" + ").map(sourcePill), statusPill(combo.status), String(combo.count)]
      })), { empty: "aucun câble" }),
      h("h3", {}, "Tous les câbles"),
      h("div", { class: "filters" }, h(
        "label",
        { class: "field" },
        "équipement ou port",
        h("input", { id: "s-text", type: "search", placeholder: "hostname, port…", oninput: (e) => {
          state.text = e.target.value;
          draw2();
        } })
      )),
      body
    ));
    draw2();
  }
  function structuresView(container, model2, onSelect) {
    const memberText = (aggregate) => aggregate.raw.members.map((m) => m.name + " (" + m.status + ")").join(", ");
    const mlagText3 = (aggregate) => {
      const raw = aggregate.raw;
      if (raw.mlag_peer_link) return "peer-link";
      const id = raw.mlag_id !== null ? String(raw.mlag_id) : "";
      return raw.mlag_peer_link === null ? id ? id + " · peer-link non lu" : "peer-link non lu" : id;
    };
    const aggregateRows = model2.aggregates.map((aggregate) => ({
      onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }),
      cells: [
        aggregate.hostname,
        aggregate.name,
        aggregate.raw.protocol + (aggregate.raw.lacp_mode ? " " + aggregate.raw.lacp_mode : ""),
        memberText(aggregate),
        String(aggregate.cables.length),
        pill3("degraded", String(aggregate.raw.degraded), aggregate.raw.degraded ? "dégradé" : "complet"),
        mlagText3(aggregate)
      ]
    }));
    const domainRows = model2.mlagDomains.map((domain) => ({
      onclick: () => onSelect(domain.members.length ? { kind: "aggregate", id: domain.members[0].key } : null),
      cells: [
        String(domain.raw.mlag_id),
        domain.raw.members.map((m) => m.hostname + " · " + m.aggregate).join(" + "),
        domain.raw.peer_link ? domain.raw.peer_link.hostname + " · " + domain.raw.peer_link.aggregate : "—",
        plain(domain.raw.downstream)
      ]
    }));
    const clusterRows = model2.clusters.map((cluster) => ({
      onclick: () => onSelect({ kind: "cluster", id: cluster.id }),
      cells: [
        plain(cluster.raw.cluster_name),
        pill3("mode", cluster.raw.mode, cluster.raw.mode),
        cluster.raw.members.map((m) => m.hostname + " (" + m.role + ", " + m.state + ")").join(", "),
        cluster.heartbeats.map((hb) => hb.hostname + " · " + hb.interface + (hb.link ? "" : " (sans câble)")).join(", ") || "—"
      ]
    }));
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Structures"),
      h("p", { class: "lead" }, "Ce que B1 a reconstruit au-dessus des câbles : agrégats (document aggregates de chaque équipement), domaines MLAG (deux agrégats de même identifiant, appariés par leur peer-link) et clusters HA (documents ha de leurs membres). Cliquer une ligne l'ouvre dans le graphe."),
      h("h3", {}, "Agrégats : " + model2.aggregates.length),
      table2(["équipement", "agrégat", "protocole", "membres", "câbles", "état", "MLAG"], aggregateRows, { empty: "aucun agrégat : aucun document aggregates dans le bundle" }),
      h("h3", {}, "Domaines MLAG : " + model2.mlagDomains.length),
      table2(["identifiant", "agrégats", "peer-link", "équipement aval"], domainRows, { empty: "aucun domaine MLAG" }),
      h("h3", {}, "Clusters HA : " + model2.clusters.length),
      table2(["cluster", "mode", "membres", "heartbeat"], clusterRows, { empty: "aucun cluster : aucun document ha dans le bundle" })
    ));
  }
  var SECTION_LABEL = { nodes: "équipements", interfaces: "interfaces", links: "câbles", aggregates: "agrégats", mlag_domains: "domaines MLAG", ha_clusters: "clusters HA" };
  var total = (part) => part.added + part.removed + part.changed;
  var fieldsCell = (change) => definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]));
  var byHost = (items) => {
    const counts = /* @__PURE__ */ new Map();
    items.forEach((item) => counts.set(item.hostname, (counts.get(item.hostname) || 0) + 1));
    return Array.from(counts, ([host, n2]) => host + " (" + n2 + ")").join(", ");
  };
  var mlagText = (domain) => "MLAG " + domain.mlag_id + " · " + domain.members.map((m) => m.hostname + " · " + m.aggregate).join(" + ");
  function diffNodeRows(model2, d, onSelect) {
    const row2 = (kind, hostname, node, change) => ({
      onclick: () => onSelect({ kind: "node", id: hostname }),
      cells: [diffPill(kind), hostname, node ? KIND_LABEL2[node.kind] : "", node ? plain(node.type) : "", change ? fieldsCell(change) : ""]
    });
    return [
      ...d.nodes.added.map((n2) => row2("added", n2.hostname, n2, null)),
      ...d.nodes.removed.map((n2) => row2("removed", n2.hostname, n2, null)),
      ...d.nodes.changed.flatMap((c) => c.ref.kind === "node" ? [row2("changed", c.ref.hostname, model2.nodeByHost.get(c.ref.hostname), c)] : [])
    ];
  }
  function diffLinkRows(model2, d, onSelect) {
    const row2 = (kind, ref, change) => {
      const id = linkId(ref), live = model2.linkById.get(id);
      return {
        onclick: () => onSelect({ kind: "link", id }),
        cells: [
          diffPill(kind),
          endLabel(ref.a),
          endLabel(ref.b),
          !live ? "" : live.ghost ? h("span", { class: "muted" }, "était " + STATUS_LABEL[live.status]) : statusPill(live.status),
          change ? fieldsCell(change) : ""
        ]
      };
    };
    return [
      ...d.links.added.map((l) => row2("added", l, null)),
      ...d.links.removed.map((l) => row2("removed", l, null)),
      ...d.links.changed.flatMap((c) => c.ref.kind === "link" ? [row2("changed", c.ref, c)] : [])
    ];
  }
  function diffStructureRows(d, onSelect) {
    const aggregate = (kind, hostname, name, change) => ({
      onclick: () => onSelect({ kind: "aggregate", id: aggregateKey(hostname, name) }),
      cells: [diffPill(kind), "agrégat", hostname + " · " + name, change ? fieldsCell(change) : ""]
    });
    const domain = (kind, ref, change) => ({ cells: [diffPill(kind), "domaine MLAG", mlagText(ref), change ? fieldsCell(change) : ""] });
    const cluster = (kind, hosts, change) => ({
      onclick: () => onSelect({ kind: "cluster", id: clusterId(hosts) }),
      cells: [diffPill(kind), "cluster HA", hosts.join(" + "), change ? fieldsCell(change) : ""]
    });
    return [
      ...d.aggregates.added.map((a) => aggregate("added", a.hostname, a.name, null)),
      ...d.aggregates.removed.map((a) => ({ cells: [diffPill("removed"), "agrégat", a.hostname + " · " + a.name, ""] })),
      ...d.aggregates.changed.flatMap((c) => c.ref.kind === "aggregate" ? [aggregate("changed", c.ref.hostname, c.ref.name, c)] : []),
      ...d.mlag_domains.added.map((m) => domain("added", m, null)),
      ...d.mlag_domains.removed.map((m) => domain("removed", m, null)),
      ...d.mlag_domains.changed.flatMap((c) => c.ref.kind === "mlag_domain" ? [domain("changed", c.ref, c)] : []),
      ...d.ha_clusters.added.map((c) => cluster("added", c.members.map((m) => m.hostname), null)),
      ...d.ha_clusters.removed.map((c) => ({ cells: [diffPill("removed"), "cluster HA", c.members.map((m) => m.hostname).join(" + "), ""] })),
      ...d.ha_clusters.changed.flatMap((c) => c.ref.kind === "cluster" ? [cluster("changed", c.ref.members, c)] : [])
    ];
  }
  function diffView(container, model2, onSelect) {
    const d = model2.diff, s2 = d.summary;
    const openNode = (hostname) => () => onSelect({ kind: "node", id: hostname });
    const summaryRows = Object.entries(SECTION_LABEL).map(([name, label2]) => ({ cells: [label2, String(s2[name].added), String(s2[name].removed), String(s2[name].changed)] }));
    const interfaceRows = d.interfaces.changed.flatMap((c) => c.ref.kind === "interface" ? [{ onclick: openNode(c.ref.hostname), cells: [diffPill("changed"), c.ref.hostname + " · " + c.ref.name, fieldsCell(c)] }] : []);
    const coverageRows = d.coverage.changed.flatMap((c) => c.ref.kind === "node" ? [{ onclick: openNode(c.ref.hostname), cells: [c.ref.hostname, fieldsCell(c)] }] : []);
    const eventRows = d.events.flatMap((e) => {
      const ref = e.ref;
      if (ref.kind !== "node" && ref.kind !== "interface") return [];
      return [{
        onclick: openNode(ref.hostname),
        cells: [pill3("event", e.kind, EVENT_LABEL[e.kind] || e.kind), ref.kind === "node" ? ref.hostname : ref.hostname + " · " + ref.name, plain(e.details)]
      }];
    });
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Diff"),
      h("p", { class: "lead" }, "De la run " + d.before.collector_run_id + " (" + d.before.start_datetime + ") à la run " + d.after.collector_run_id + " (" + d.after.start_datetime + "), " + elapsedText(d.elapsed_seconds) + ". Les équipements et câbles ajoutés, retirés ou changés sont peints dans le graphe ; cliquer une ligne l'y ouvre, un élément retiré compris. Les champs volatils (uptime, âge du dernier changement) ne comptent pas : " + s2.volatile_changes + " différence" + (s2.volatile_changes > 1 ? "s" : "") + " ignorée" + (s2.volatile_changes > 1 ? "s" : "") + "."),
      table2(["section", "ajoutés", "retirés", "changés"], summaryRows),
      h("h3", {}, "Équipements : " + total(s2.nodes)),
      table2(["changement", "équipement", "sorte", "type", "changements"], diffNodeRows(model2, d, onSelect), { empty: "aucun équipement ajouté, retiré ni changé" }),
      h("h3", {}, "Câbles : " + total(s2.links)),
      table2(["changement", "bout a", "bout b", "statut", "changements"], diffLinkRows(model2, d, onSelect), { empty: "aucun câble ajouté, retiré ni changé" }),
      h("h3", {}, "Interfaces : " + total(s2.interfaces)),
      definition([["ajoutées", d.interfaces.added.length ? byHost(d.interfaces.added) : null], ["retirées", d.interfaces.removed.length ? byHost(d.interfaces.removed) : null]]),
      table2(["changement", "interface", "changements"], interfaceRows, { empty: "aucune interface changée" }),
      h("h3", {}, "Structures : " + (total(s2.aggregates) + total(s2.mlag_domains) + total(s2.ha_clusters))),
      table2(["changement", "sorte", "élément", "changements"], diffStructureRows(d, onSelect), { empty: "aucune structure ajoutée, retirée ni changée" }),
      h("h3", {}, "Contrôles apparus : " + s2.checks.appeared),
      table2(CHECK_HEADERS, checkRows(model2, d.checks.appeared.map(asEntry), onSelect), { empty: "aucun contrôle apparu" }),
      h("h3", {}, "Contrôles résolus : " + s2.checks.resolved + " · persistants : " + s2.checks.persisted),
      table2(CHECK_HEADERS, checkRows(model2, d.checks.resolved.map(asEntry), onSelect), { empty: "aucun contrôle résolu" }),
      h("h3", {}, "Couverture changée : " + s2.coverage.changed),
      table2(["équipement", "changements"], coverageRows, { empty: "aucun changement de couverture" }),
      h("h3", {}, "Événements : " + (s2.events.rebooted + s2.events.flapped)),
      h("p", { class: "muted" }, "Lus dans les champs volatils : un uptime plus court que l'écart entre les runs, c'est un redémarrage ; un âge de dernier changement plus court, à état égal, c'est un flap (le port a bougé puis est revenu au même état), sauf sur un équipement redémarré, dont le redémarrage explique les ports."),
      table2(["sorte", "élément", "détails"], eventRows, { empty: "aucun redémarrage, aucun flap" })
    ));
  }
  var asEntry = (check, index) => ({ index, ...check });
  var tables = { checksView, qualityView, sourcesView, structuresView, diffView, targetsOf };

  // src/shell/checks.ts
  function checkList(model2, checks, onSelect) {
    if (!checks.length) return h("p", { class: "muted" }, "Aucun contrôle sur cet élément.");
    return h("ul", { class: "checks" }, checks.map((check) => h(
      "li",
      { class: "check" },
      h("div", { class: "check-head" }, severityPill(check.severity), h("code", {}, check.code)),
      h("div", { class: "check-meaning" }, (model2.catalogue[check.code] || { meaning: "" }).meaning || ""),
      Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : null,
      refButtons(model2, check, onSelect)
    )));
  }
  function refButtons(model2, check, onSelect) {
    const targets = targetsOf(model2, check);
    if (!targets.length || !onSelect) return null;
    return h("div", { class: "ref-row" }, targets.map((target) => h("button", { class: "linklike", type: "button", onclick: () => onSelect(target.selection) }, target.label)));
  }

  // src/shell/structures.ts
  var aggregateLabel = (aggregate) => aggregate.hostname + " · " + aggregate.name;
  var aggregateButton = (aggregate, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }) }, aggregateLabel(aggregate));
  var nodeButton = (hostname, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: hostname }) }, hostname);
  var beamButton = (beam, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "beam", id: beam.id }) }, beamLabel(beam));
  var clusterButton = (cluster, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "cluster", id: cluster.id }) }, clusterLabel(cluster));
  function topicPill(model2, hostname, topic) {
    const coverage = model2.coverage.find((c) => c.hostname === hostname);
    const status = coverage ? coverage.topics[topic] : "absent";
    return pill3("topic", status, "topic " + topic + " : " + status);
  }
  function cableRows(links, onSelect) {
    return links.map((link) => ({
      onclick: () => onSelect({ kind: "link", id: link.id }),
      cells: [endLabel(link.a), endLabel(link.b), [statusPill(link.status), link.sources.map(sourcePill)], link.raw.oper]
    }));
  }
  var cableTable = (links, onSelect, empty) => table2(["bout a", "bout b", "statut · sources", "état"], cableRows(links, onSelect), { empty });
  function memberRows(model2, aggregate, onSelect) {
    return aggregate.raw.members.map((member) => {
      const links = model2.linksByIface.get(ifaceKey(aggregate.hostname, member.name)) || [];
      const facing = links.map((link) => endLabel(link.a.hostname === aggregate.hostname && link.a.interface === member.name ? link.b : link.a));
      return {
        onclick: links.length === 1 ? () => onSelect({ kind: "link", id: links[0].id }) : null,
        cells: [member.name, pill3("member", member.status, member.status), facing.length ? facing.join(", ") : "—"]
      };
    });
  }
  function mlagText2(aggregate, onSelect) {
    const domain = aggregate.mlag;
    if (!domain) return null;
    const partner = domain.members.find((m) => m !== aggregate);
    return definition([
      ["domaine MLAG", String(domain.raw.mlag_id)],
      ["agrégat pair", partner ? aggregateButton(partner, onSelect) : "(absent du snapshot)"],
      ["peer-link", domain.peerLink ? aggregateButton(domain.peerLink, onSelect) : "aucun agrégat marqué peer-link"],
      ["équipement aval", domain.raw.downstream ? nodeButton(domain.raw.downstream, onSelect) : "non unique ou inconnu (voir les contrôles)"]
    ]);
  }
  var stoppedCables = (model2, aggregate) => model2.linksByIface.get(ifaceKey(aggregate.hostname, aggregate.name)) || [];
  function aggregateWhy(model2, aggregate) {
    const raw = aggregate.raw;
    const bundled = raw.members.filter((m) => m.status === "bundled").length;
    const stopped = stoppedCables(model2, aggregate).length;
    const parts = [raw.members.length + " membre" + (raw.members.length > 1 ? "s" : "") + " dont " + bundled + " bundled, " + raw.protocol + (raw.lacp_mode ? " " + raw.lacp_mode : "") + (raw.min_links !== null ? ", min_links " + raw.min_links : "") + "."];
    parts.push(aggregate.cables.length ? aggregate.cables.length + " câble" + (aggregate.cables.length > 1 ? "s" : "") + " tracé" + (aggregate.cables.length > 1 ? "s" : "") + " sur ses membres." : "Aucun câble tracé sur ses membres.");
    if (stopped) parts.push(stopped + " câble" + (stopped > 1 ? "s" : "") + " arrêté" + (stopped > 1 ? "s" : "") + " à l'agrégat lui-même : le voisin l'annonce en port-id et B1 n'a pas su désigner le membre.");
    if (raw.mlag_peer_link) parts.push("Cet agrégat est le peer-link de son domaine MLAG.");
    else if (aggregate.mlag) parts.push("Membre du domaine MLAG " + aggregate.mlag.raw.mlag_id + ".");
    if (raw.mlag_peer_link === null) parts.push("Peer-link non lu : la source MLAG du document aggregates n'a pas répondu, B1 ne le tient pas pour un peer-link.");
    return parts.join(" ");
  }
  function aggregatePanel(model2, aggregate, onSelect) {
    const raw = aggregate.raw;
    const stopped = stoppedCables(model2, aggregate);
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, "agrégat"),
        pill3("degraded", String(raw.degraded), raw.degraded ? "dégradé" : "complet"),
        pill3("oper", raw.oper_status, raw.oper_status),
        raw.mlag_peer_link ? pill3("role", "peer-link", "peer-link") : null
      ),
      h("h3", { class: "ends" }, nodeButton(raw.hostname, onSelect), " · " + raw.name),
      h("p", { class: "why" }, aggregateWhy(model2, aggregate)),
      definition([
        ["protocole", raw.protocol + (raw.lacp_mode ? " · " + raw.lacp_mode : "")],
        ["min_links", raw.min_links],
        ["MLAG id", raw.mlag_id],
        ["peer-link", raw.mlag_peer_link === null ? "non lu" : raw.mlag_peer_link ? "oui" : "non"]
      ]),
      h("h4", { class: "section" }, "Membres : " + raw.members.length),
      table2(["port", "statut", "câble vers"], memberRows(model2, aggregate, onSelect), { empty: "aucun membre listé" }),
      stopped.length ? [
        h("h4", { class: "section" }, "Câbles arrêtés à l'agrégat lui-même : " + stopped.length),
        h("p", { class: "muted" }, "Le voisin annonce le nom de l'agrégat en port-id (R1-bis) ; le membre n'a pas pu être désigné : contrôle remote_port_is_aggregate sur chaque câble."),
        cableTable(stopped, onSelect, "aucun")
      ] : null,
      aggregate.beams.length ? [h("h4", { class: "section" }, "Faisceaux"), h("ul", { class: "plain" }, aggregate.beams.map((beam) => h("li", {}, beamButton(beam, onSelect))))] : null,
      aggregate.mlag ? [h("h4", { class: "section" }, "Domaine MLAG"), mlagText2(aggregate, onSelect)] : null,
      h("h4", { class: "section" }, "Sources"),
      h("p", { class: "muted" }, "Document du topic aggregates de " + raw.hostname + " : membres et statuts tels que l'équipement les rapporte. ", topicPill(model2, raw.hostname, "aggregates")),
      h("p", { class: "muted" }, "Chaque câble a ses propres sources : cliquer un membre câblé."),
      h("h4", { class: "section" }, "Contrôles"),
      checkList(model2, aggregate.checks, onSelect)
    ];
  }
  function beamWhy(beam) {
    const parts = [beam.links.length + " câble" + (beam.links.length > 1 ? "s" : "") + " entre les membres de " + beam.a.aggregate + " et de " + beam.b.aggregate + "."];
    const missing = beam.aggregates.map((agg, index) => agg ? null : [beam.a, beam.b][index]).filter((end) => !!end);
    if (missing.length) {
      const known2 = beam.known.map((agg) => agg.raw.protocol);
      parts.push((known2.length ? "Protocole " + known2[0] + " d'un côté ; " : "") + missing.map((end) => end.hostname + " · " + end.aggregate).join(" et ") + " n'a pas de document aggregates (appartenance lue dans interfaces[].members) : B1 ne compare pas les protocoles.");
    } else {
      const protocols = beam.known.map((agg) => agg.raw.protocol);
      parts.push(protocols[0] === protocols[1] ? "Protocole " + protocols[0] + " des deux côtés." : "Protocoles différents : " + protocols.join(" / ") + ".");
    }
    if (beam.peerLink) parts.push("C'est le peer-link d'un domaine MLAG.");
    beam.mlags.forEach((domain) => parts.push("Patte du domaine MLAG " + domain.raw.mlag_id + (domain.raw.downstream ? " (vers " + domain.raw.downstream + ")" : "") + "."));
    return parts.join(" ");
  }
  function beamPanel(model2, beam, onSelect) {
    const ends = [beam.a, beam.b].map((end, index) => {
      const aggregate = beam.aggregates[index];
      return aggregate ? aggregateButton(aggregate, onSelect) : h("span", {}, end.hostname + " · " + end.aggregate + " (sans document aggregates)");
    });
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, "faisceau"),
        beam.peerLink ? pill3("role", "peer-link", "peer-link") : null,
        beam.mlags.map((domain) => pill3("role", "mlag", "MLAG " + domain.raw.mlag_id)),
        beam.degraded ? pill3("degraded", "true", "un agrégat dégradé") : null
      ),
      h("h3", { class: "ends" }, ends[0], h("span", { class: "arrow" }, " ⇄ "), ends[1]),
      h("p", { class: "why" }, beamWhy(beam)),
      h("h4", { class: "section" }, "Câbles : " + beam.links.length),
      cableTable(beam.links, onSelect, "aucun câble"),
      h("h4", { class: "section" }, "Contrôles des deux agrégats"),
      checkList(model2, beam.checks, onSelect)
    ];
  }
  function memberTable(cluster, onSelect) {
    return table2(["membre", "rôle", "état", "priorité", "rapporté par"], cluster.raw.members.map((member) => ({
      cells: [nodeButton(member.hostname, onSelect), member.role, pill3("state", member.state, member.state), plain(member.priority), member.reported_by.join(", ")]
    })), { empty: "aucun membre" });
  }
  function heartbeatTable(cluster, onSelect) {
    return table2(["membre", "interface", "câble"], cluster.heartbeats.map((hb) => {
      const link = hb.link;
      return { cells: [hb.hostname, hb.interface, link ? h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "link", id: link.id }) }, endLabel(link.a) + " ↔ " + endLabel(link.b)) : h("span", { class: "muted" }, "aucun câble observé ni documenté : rien n'est inventé")] };
    }), { empty: "aucune interface de heartbeat rapportée" });
  }
  function clusterSources(model2, cluster) {
    const reporters = new Set(cluster.raw.members.flatMap((m) => m.reported_by));
    return h("ul", { class: "plain" }, cluster.hosts.map((host) => {
      const node = model2.nodeByHost.get(host);
      const collection = node ? node.collection : null;
      return h("li", {}, reporters.has(host) ? ["document ha de " + host + " ", topicPill(model2, host, "ha")] : h("span", { class: "muted" }, host + " : aucun document ha" + (collection ? " (collecte : " + collection + ")" : "")));
    }));
  }
  function clusterWhy(cluster) {
    const reporters = Array.from(new Set(cluster.raw.members.flatMap((m) => m.reported_by)));
    const down = cluster.raw.members.filter((m) => m.state === "down").map((m) => m.hostname);
    const parts = [cluster.hosts.length + " membre" + (cluster.hosts.length > 1 ? "s" : "") + " en " + cluster.raw.mode + ", décrit" + (cluster.hosts.length > 1 ? "s" : "") + " par le document ha de " + reporters.join(" et de ") + "."];
    if (down.length) parts.push("Membre" + (down.length > 1 ? "s" : "") + " down : " + down.join(", ") + ".");
    const without = cluster.heartbeats.filter((hb) => !hb.link).length;
    if (without) parts.push(without + " interface" + (without > 1 ? "s" : "") + " de heartbeat sans câble.");
    return parts.join(" ");
  }
  function clusterPanel(model2, cluster, onSelect) {
    const raw = cluster.raw;
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "cluster HA"), pill3("mode", raw.mode, raw.mode)),
      h("h3", {}, raw.cluster_name || cluster.hosts.join(" + ")),
      h("p", { class: "why" }, clusterWhy(cluster)),
      h("h4", { class: "section" }, "Membres : " + cluster.hosts.length),
      memberTable(cluster, onSelect),
      h("h4", { class: "section" }, "Heartbeat"),
      heartbeatTable(cluster, onSelect),
      h("h4", { class: "section" }, "Sources"),
      clusterSources(model2, cluster),
      h("h4", { class: "section" }, "Contrôles"),
      checkList(model2, cluster.checks, onSelect)
    ];
  }
  function nodeStructures(model2, hostname, onSelect) {
    const node = model2.nodeByHost.get(hostname);
    const aggregates = model2.aggregatesByNode.get(hostname) || [];
    const clusters = model2.clustersByHost.get(hostname) || [];
    return [
      clusters.length ? [
        h("h4", { class: "section" }, "Cluster" + (clusters.length > 1 ? "s" : "") + " HA"),
        h("ul", { class: "plain" }, clusters.map((cluster) => h("li", {}, clusterButton(cluster, onSelect))))
      ] : null,
      !node || node.kind !== "device" ? null : [
        h("h4", { class: "section" }, "Agrégats : " + aggregates.length),
        table2(["agrégat", "protocole", "membres", "câbles", "état"], aggregates.map((aggregate) => ({
          onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }),
          cells: [
            aggregate.name,
            aggregate.raw.protocol,
            aggregate.raw.members.filter((m) => m.status === "bundled").length + " / " + aggregate.raw.members.length + " bundled",
            String(aggregate.cables.length),
            pill3("degraded", String(aggregate.raw.degraded), aggregate.raw.degraded ? "dégradé" : "complet")
          ]
        })), { empty: "aucun document aggregates pour cet équipement" })
      ]
    ];
  }
  var structures = { aggregatePanel, beamPanel, clusterPanel, nodeStructures, aggregateButton, beamButton, clusterButton, aggregateLabel };

  // src/shell/inspect.ts
  function changeOf2(model2, kind, id, ghost) {
    if (ghost) return { kind: "removed", fields: [] };
    return model2.changeOf ? model2.changeOf(kind, id) : null;
  }
  function diffBlock2(model2, change, what) {
    if (!change || !model2.diff) return null;
    const before = model2.diff.before.collector_run_id;
    if (change.kind === "added") return h("p", { class: "diff-note diff-added" }, "Ajouté : ce " + what + " n'était pas dans la run " + before + ".");
    if (change.kind === "removed") return h("p", { class: "diff-note diff-removed" }, "Retiré : ce " + what + " était dans la run " + before + " et n'est plus dans celle-ci ; la fiche le montre tel qu'il était.");
    return [
      h("h4", { class: "section" }, "Changements depuis la run " + before),
      definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]))
    ];
  }
  function evidenceCard(evidence) {
    const observed = OBSERVED[evidence.source];
    const raw = evidence.remote_raw, resolved = evidence.remote_resolved;
    const renamed = raw.port !== null && resolved.interface !== null && raw.port !== resolved.interface;
    return h(
      "li",
      { class: "evidence " + (observed ? "observed" : "documented") },
      h("div", { class: "evidence-head" }, sourcePill(evidence.source), h("span", { class: "muted" }, observed ? "observé" : "documenté")),
      definition([
        ["témoin", endLabel(evidence.witness)],
        ["il annonce", raw.name + " · " + (raw.port === null ? "sans port" : raw.port)],
        ["résolu en", resolved.hostname + " · " + (resolved.interface === null ? "port non précisé" : resolved.interface)],
        ["résolution du nom", RESOLUTION_LABEL[evidence.resolution] || evidence.resolution],
        renamed ? ["nom de port", "normalisé par B1 (R1) : " + raw.port + " → " + resolved.interface] : null
      ])
    );
  }
  function portCard(model2, end, aggregate, removed) {
    const found = interfaceAt(model2, end.hostname, end.interface, removed);
    const title = h("h4", {}, endLabel(end));
    if (!found) return h("div", { class: "port" }, title, h("p", { class: "muted" }, "Port absent de interfaces[] : équipement non collecté, ou nom tel qu'annoncé par le voisin."));
    const itf = found.itf;
    const parsed = itf.description_parsed;
    return h(
      "div",
      { class: "port" },
      title,
      found.ghost ? h("p", { class: "muted diff-removed" }, "Interface retirée depuis la run d'avant : valeurs telles qu'elles étaient.") : null,
      definition([
        ["état", itf.oper_status + " (admin " + itf.admin_status + ")" + (itf.oper_reason ? " · " + itf.oper_reason : "")],
        ["type · vitesse", itf.type + (itf.speed_mbps ? " · " + speedText(itf.speed_mbps) : "") + (itf.duplex ? " · " + itf.duplex : "")],
        ["média", itf.media],
        ["agrégat", aggregate || (itf.aggregate ? itf.aggregate.name + (itf.aggregate.member_status ? " (" + itf.aggregate.member_status + ")" : "") : null)],
        ["rôles", itf.roles.length ? itf.roles.join(", ") : null],
        ["description brute", itf.description === null ? "(aucune)" : h("code", { class: "wrap" }, itf.description)],
        ["description lue", parsed ? "criticité " + parsed.criticality + " · voisin " + parsed.neighbor + " · port " + plain(parsed.port) + (parsed.options ? " · " + parsed.options : "") : itf.description ? "non lue par la grammaire criticité|voisin|port|options" : null],
        ["mode · VLAN", itf.switchport_mode ? itf.switchport_mode + vlanText(itf) : null],
        ["MAC", itf.mac_address],
        ["IP", itf.ip_addresses.length ? itf.ip_addresses.map((ip) => ip.address + "/" + ip.prefix).join(", ") : null]
      ])
    );
  }
  function vlanText(itf) {
    if (itf.access_vlan) return " · access " + itf.access_vlan;
    if (itf.native_vlan || itf.allowed_vlans) {
      const allowed = itf.allowed_vlans ? itf.allowed_vlans.map((r) => r.first === r.last ? String(r.first) : r.first + "-" + r.last).join(",") : "?";
      return " · natif " + plain(itf.native_vlan) + " · autorisés " + (allowed || "aucun");
    }
    return "";
  }
  function aggregateEnds(model2, link, onSelect) {
    const raw = link.raw;
    const ends = [[raw.a.hostname, raw.aggregate_a], [raw.b.hostname, raw.aggregate_b]].filter((end) => end[1] !== null);
    if (!ends.length) return null;
    return h("span", {}, ends.map(([hostname, name], index) => {
      const aggregate = model2.aggregateByKey.get(aggregateKey(hostname, name));
      return [index ? " · " : null, aggregate ? aggregateButton(aggregate, onSelect) : hostname + " · " + name];
    }));
  }
  function linkPanel(model2, link, onSelect) {
    const raw = link.raw;
    const why = whyText(link);
    const change = changeOf2(model2, "link", link.id, link.ghost);
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, "câble"),
        statusPill(link.status),
        raw.oper === "down" ? pill3("oper", "down", "down") : null,
        change ? diffPill(change.kind) : null
      ),
      h(
        "h3",
        { class: "ends" },
        h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.a.hostname }) }, raw.a.hostname),
        " · " + raw.a.interface,
        h("span", { class: "arrow" }, " ↔ "),
        h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.b.hostname }) }, raw.b.hostname),
        " · " + raw.b.interface
      ),
      h("p", { class: "why" }, why),
      diffBlock2(model2, change, "câble"),
      definition([
        ["état", raw.oper],
        ["vitesse commune", raw.speed_mbps ? speedText(raw.speed_mbps) : "différente ou inconnue"],
        ["agrégats", aggregateEnds(model2, link, onSelect)],
        ["faisceau", link.beam ? beamButton(link.beam, onSelect) : null]
      ]),
      h("h4", { class: "section" }, "Sources : " + raw.evidence.length + " évidence" + (raw.evidence.length > 1 ? "s" : "")),
      h("ul", { class: "evidences" }, raw.evidence.map((e) => evidenceCard(e))),
      h("h4", { class: "section" }, "Contrôles liés"),
      checkList(model2, link.checks, onSelect),
      link.portChecks.length ? [
        h("h4", { class: "section" }, "Contrôles d'un port partagé avec d'autres câbles"),
        h("p", { class: "muted" }, "Ils visent un port qui porte plusieurs câbles, sans dire lequel : ils ne sont pas comptés sur celui-ci."),
        checkList(model2, link.portChecks, onSelect)
      ] : null,
      h("h4", { class: "section" }, "Les deux ports"),
      portCard(model2, raw.a, raw.aggregate_a, link.ghost),
      portCard(model2, raw.b, raw.aggregate_b, link.ghost)
    ];
  }
  function coverageRow(model2, hostname) {
    const coverage = model2.coverage.find((c) => c.hostname === hostname);
    if (!coverage) return null;
    return h("div", { class: "topic-row" }, Object.entries(coverage.topics).map(([topic, status]) => pill3("topic", status, topic + " : " + status)));
  }
  var facingOf = (model2, itf) => (model2.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || []).map((l) => endLabel(l.a.hostname === itf.hostname && l.a.interface === itf.name ? l.b : l.a) + (l.ghost ? " (retiré)" : "")).join(", ");
  function interfaceTable(model2, ifaces) {
    const holder = h("div", {});
    const cabled = (itf) => model2.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || [];
    const lonely = ifaces.filter((itf) => (itf.type === "physical" || itf.type === "management") && itf.oper_status === "up" && !cabled(itf).some((l) => !l.ghost));
    const draw2 = (only) => {
      const rows = (only ? lonely : ifaces).map((itf) => {
        const facing = facingOf(model2, itf);
        return { cells: [itf.name, itf.type, itf.oper_status, facing || "—", itf.description === null ? "" : h("code", { class: "wrap" }, itf.description)] };
      });
      clear(holder).appendChild(table2(["nom", "type", "état", "câble vers", "description"], rows, { empty: only ? "aucun port physique up sans câble" : "aucune interface collectée" }));
    };
    draw2(false);
    return [h(
      "label",
      { class: "check-field" },
      h("input", { type: "checkbox", onchange: (e) => draw2(e.target.checked) }),
      "seulement les ports physiques up sans câble (" + lonely.length + ")"
    ), holder];
  }
  function ghostInterfaceTable(model2, gone) {
    const rows = gone.map((itf) => ({ cells: [diffPill("removed"), itf.name, itf.type, itf.oper_status, facingOf(model2, itf) || "—"] }));
    return table2(["changement", "nom", "type", "état (run d'avant)", "câble vers"], rows, { empty: "aucune" });
  }
  function nodePanel(model2, node, onSelect, extra) {
    const links = model2.linksByNode.get(node.hostname) || [];
    const gone = links.filter((l) => l.ghost).length;
    const ifaces = model2.ifacesByNode.get(node.hostname) || [];
    const ghostIfaces = model2.ghostIfacesByNode.get(node.hostname) || [];
    const seen = node.evidence ? node.evidence.seen_by : [];
    const change = changeOf2(model2, "node", node.hostname, node.ghost);
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, KIND_LABEL2[node.kind]),
        node.collection ? pill3("collection", node.collection, "collecte : " + node.collection) : null,
        change ? diffPill(change.kind) : null
      ),
      h("h3", {}, node.hostname),
      diffBlock2(model2, change, "équipement"),
      definition([
        ["type", node.type],
        ["constructeur · modèle", [node.vendor, node.model].filter(Boolean).join(" · ") || null],
        ["système", [node.os_name, node.os_version].filter(Boolean).join(" ") || null],
        ["série", node.serial_number],
        ["site", node.site],
        ["nom annoncé", node.reported_hostname],
        ["contextes virtuels", node.virtual_contexts.length ? node.virtual_contexts.join(", ") : null],
        ["stack", node.stack ? node.stack.member_count + " membres : " + node.stack.members.map((m) => m.slot + " " + m.role).join(", ") : null],
        ["capacités annoncées", node.evidence && node.evidence.capabilities.length ? node.evidence.capabilities.join(", ") : null]
      ]),
      node.kind === "device" ? [h("h4", { class: "section" }, "Couverture de la collecte"), coverageRow(model2, node.hostname)] : null,
      seen.length ? [h("h4", { class: "section" }, "Vu par"), h("ul", { class: "plain" }, seen.map((w) => h("li", {}, sourcePill(w.source), " ", endLabel(w))))] : null,
      h("h4", { class: "section" }, "Câbles : " + (links.length - gone) + (gone ? " · " + gone + " retiré" + (gone > 1 ? "s" : "") : "")),
      table2(["port local", "en face"], links.map((link) => {
        const local = link.a.hostname === node.hostname ? link.a : link.b, remote = local === link.a ? link.b : link.a;
        return { onclick: () => onSelect({ kind: "link", id: link.id }), cells: [local.interface, [h("div", {}, endLabel(remote)), h("div", {}, link.ghost ? diffPill("removed") : null, statusPill(link.status), link.sources.map(sourcePill))]] };
      }), { empty: "aucun câble" }),
      nodeStructures(model2, node.hostname, onSelect),
      extra,
      h("h4", { class: "section" }, "Contrôles"),
      checkList(model2, model2.checksByNode.get(node.hostname) || [], onSelect),
      node.ghost ? null : [h("h4", { class: "section" }, "Interfaces : " + ifaces.length), interfaceTable(model2, ifaces)],
      ghostIfaces.length ? [
        h("h4", { class: "section" }, (node.ghost ? "Interfaces telles qu'elles étaient : " : "Interfaces retirées depuis la run d'avant : ") + ghostIfaces.length),
        ghostInterfaceTable(model2, ghostIfaces)
      ] : null
    ];
  }
  function overview(model2) {
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "vue d'ensemble")),
      h("p", { class: "why" }, "Cliquer un câble montre ses sources ; cliquer un équipement montre sa fiche. Survoler un câble donne vitesse, duplex, média et état des deux bouts. Glisser un équipement le déplace, la molette zoome, Tab parcourt les éléments."),
      definition([
        ["voisins inconnus", (model2.kindCounts.get("stub") || 0) + " (masqués par défaut)"],
        ["agrégats", String(model2.aggregates.length)],
        ["faisceaux", model2.beams.length + " (bandes sous les câbles)"],
        ["domaines MLAG", String(model2.mlagDomains.length)],
        ["clusters HA", model2.clusters.length + " (cadres autour des membres)"]
      ])
    ];
  }
  var KIND_WORD = { link: "câble", node: "équipement", aggregate: "agrégat", beam: "faisceau", cluster: "cluster HA", group: "groupe", annotation: "annotation", connector: "connecteur" };
  function describe(model2, selection) {
    if (!selection || !entityOf(model2, selection)) return "";
    const label2 = (() => {
      switch (selection.kind) {
        case "link": {
          const link = model2.linkById.get(selection.id);
          return endLabel(link.a) + " ↔ " + endLabel(link.b);
        }
        case "node":
          return model2.nodeByHost.get(selection.id).hostname;
        case "aggregate": {
          const agg = aggregateOf(model2, selection);
          return agg ? agg.hostname + " · " + agg.name : "";
        }
        case "beam": {
          const beam = beamOf(model2, selection);
          return beam ? beamLabel(beam, true) : "";
        }
        case "group": {
          const group = model2.groupById.get(selection.id);
          return group ? group.label : "";
        }
        case "annotation": {
          const a = model2.annotationById.get(selection.id);
          return a ? a.content.kind : "";
        }
        case "connector": {
          const c = model2.connectorById.get(selection.id);
          return c ? c.label || c.id : "";
        }
        default: {
          const cluster = clusterOf(model2, selection);
          return cluster ? clusterLabel(cluster) : "";
        }
      }
    })();
    return KIND_WORD[selection.kind] + " " + label2 + " sélectionné";
  }
  function show(container, model2, selection, onSelect, nodeExtra) {
    clear(container);
    let content = overview(model2);
    if (selection && selection.kind === "link" && model2.linkById.has(selection.id)) content = linkPanel(model2, model2.linkById.get(selection.id), onSelect);
    if (selection && selection.kind === "node" && model2.nodeByHost.has(selection.id)) {
      content = nodePanel(model2, model2.nodeByHost.get(selection.id), onSelect, nodeExtra ? nodeExtra(selection.id) : null);
    }
    const aggregate = aggregateOf(model2, selection), beam = beamOf(model2, selection), cluster = clusterOf(model2, selection);
    if (aggregate) content = aggregatePanel(model2, aggregate, onSelect);
    if (beam) content = beamPanel(model2, beam, onSelect);
    if (cluster) content = clusterPanel(model2, cluster, onSelect);
    container.appendChild(h("div", { class: "panel" }, content));
    container.scrollTop = 0;
    if (selection && typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches && container.scrollIntoView) container.scrollIntoView({ block: "start" });
  }
  var inspect = { show, checkList, describe };

  // src/shell/intent.ts
  var OPS_PER_REQUEST = 500;
  var AUTHOR_MAX_LENGTH = 80;
  var dateText = (iso) => iso.replace("T", " ").replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/, " $2").replace(" Z", " UTC");
  function localMoves(model2, graph2) {
    return Array.from(graph2.state.pinned.keys()).filter((host) => !model2.pinByHost.has(host)).sort();
  }
  function chunks(items, size) {
    const out = [];
    for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
    return out;
  }
  function createIntentHost(model2, writer, hooks) {
    const canWrite = () => !!(writer && writer.author);
    const accept = (intent2) => {
      if (model2.intent && intent2.revision < model2.intent.revision) return false;
      applyIntent(model2, intent2);
      return true;
    };
    const refresh = () => {
      if (hooks.mounted()) view();
      hooks.refreshPage();
    };
    async function send(ops, removed, done, colour = false, all = false) {
      if (!writer) return false;
      hooks.note("enregistrement…");
      let failure = null;
      for (const part of chunks(ops, OPS_PER_REQUEST)) {
        const outcome = await writer.save(part);
        if (!outcome.ok) {
          failure = outcome.message;
          break;
        }
        accept(outcome.intent);
      }
      const graph2 = hooks.graph();
      if (colour || all) graph2.recolor();
      if (removed.length) graph2.unpin(removed.filter((host) => model2.pinByHost.has(host) === false));
      if (all || !colour && !removed.length) graph2.syncPins();
      hooks.note(failure ? "non enregistré : " + failure : done);
      refresh();
      return failure === null;
    }
    function onPin(hostname, point) {
      if (!writer) {
        hooks.note("déplacement local de " + hostname + ", non enregistré (page sans serveur)");
        return;
      }
      if (!writer.author) {
        hooks.note("déplacement local de " + hostname + " : donnez votre nom (onglet Intentions) pour l'enregistrer");
        return;
      }
      hooks.note("enregistrement de l'épingle de " + hostname + "…");
      writer.save([{ op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) }]).then((outcome) => {
        if (outcome.ok) {
          accept(outcome.intent);
          hooks.graph().syncPins();
          hooks.note("épingle de " + hostname + " enregistrée (" + writer.author + ")");
        } else hooks.note("épingle de " + hostname + " non enregistrée : " + outcome.message);
        refresh();
      });
    }
    function onPins(moves, cause = "aligned") {
      const hosts = Array.from(moves.keys()).sort();
      const plural3 = hosts.length > 1 ? "s" : "";
      const what = hosts.length + " équipement" + plural3 + (cause === "dragged" ? " déplacé" : " aligné") + plural3;
      if (!writer) {
        hooks.note(what + " ici, non enregistré" + (hosts.length > 1 ? "s" : "") + " (page sans serveur)");
        return;
      }
      if (!writer.author) {
        hooks.note(what + " ici : donnez votre nom pour enregistrer les épingles");
        return;
      }
      const ops = hosts.map((hostname) => {
        const point = moves.get(hostname);
        return { op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) };
      });
      void send(ops, [], what + ", épingles enregistrées (" + writer.author + ")");
    }
    function colourOps(ops, done) {
      if (!writer) {
        hooks.note("couleur non enregistrée (page sans serveur)");
        return;
      }
      if (!writer.author) {
        hooks.note("donnez votre nom pour enregistrer une couleur");
        return;
      }
      void send(ops, [], done + " (" + writer.author + ")", true);
    }
    const onColor = (hostname, hue) => colourOps(
      hue ? [{ op: "color", hostname, hue }] : [{ op: "uncolor", hostname }],
      hue ? "couleur de " + hostname + " : " + hueLabel(hue) : "couleur de " + hostname + " retirée"
    );
    const onColors = (hostnames, hue) => {
      const hosts = hostnames.slice().sort();
      if (!hosts.length) return;
      const what = hosts.length === 1 ? hosts[0] : hosts.length + " équipements";
      colourOps(
        hosts.map((hostname) => hue ? { op: "color", hostname, hue } : { op: "uncolor", hostname }),
        hue ? "couleur de " + what + " : " + hueLabel(hue) : "couleur de " + what + " retirée"
      );
    };
    const onTypeColor = (type, hue) => colourOps(
      hue ? [{ op: "color_type", type, hue }] : [{ op: "uncolor_type", type }],
      hue ? "couleur des " + (LABEL[type] || type) + " : " + hueLabel(hue) : "couleur des " + (LABEL[type] || type) + " retirée"
    );
    async function onOps(ops, done, what) {
      if (!writer) {
        hooks.note(what + " non enregistré (page sans serveur)");
        return null;
      }
      if (!writer.author) {
        hooks.note("donnez votre nom pour enregistrer " + what);
        return null;
      }
      await send(ops, [], done + " (" + writer.author + ")", true);
      return model2.intent;
    }
    const onGroup = (ops, done) => onOps(ops, done, "un groupe");
    const onAnnotation = (ops, done) => onOps(ops, done, "une annotation");
    const onConnector = (ops, done) => onOps(ops, done, "un connecteur");
    async function apply(ops, done) {
      if (!writer || !writer.author) {
        hooks.note("donnez votre nom pour annuler ou rétablir");
        return null;
      }
      const removed = ops.flatMap((op) => op.op === "unpin" ? [op.hostname] : []);
      return await send(ops, removed, done, false, true) ? model2.intent : null;
    }
    const unpinOps = (hosts) => hosts.map((hostname) => ({ op: "unpin", hostname }));
    const unpin = (hosts) => {
      if (hosts.length) void send(unpinOps(hosts), hosts, hosts.length + " épingle" + (hosts.length > 1 ? "s retirées" : " retirée"));
    };
    const removeOne = (hostname, button) => {
      button.setAttribute("disabled", "");
      void send(unpinOps([hostname]), [hostname], "épingle de " + hostname + " retirée");
    };
    function writerNote() {
      if (!writer) {
        const why = model2.intent ? "cette page a été générée sans serveur (ld render)" : "cette page vient d'un fichier, sans archive ni serveur";
        return h("p", { class: "intent-note warn" }, "Lecture seule : " + why + ". Glisser un équipement le déplace ici seulement ; rien n'est enregistré.");
      }
      const field = h("input", {
        id: "i-author",
        type: "text",
        value: writer.author,
        placeholder: "votre nom",
        maxlength: AUTHOR_MAX_LENGTH,
        "aria-label": "votre nom, écrit sur chaque épingle",
        spellcheck: "false",
        onchange: (e) => {
          writer.setAuthor(e.target.value.trim().slice(0, AUTHOR_MAX_LENGTH));
          refresh();
        }
      });
      const text2 = writer.author ? "Vos épingles s'enregistrent sous le nom « " + writer.author + " » : glisser un équipement l'épingle pour tout le monde. Dernier écrivain gagne, par épingle ; chaque écriture est journalisée." : "Sans nom, vos déplacements restent locaux. Donnez votre nom pour que vos épingles s'enregistrent :";
      return h("p", { class: "intent-note" + (writer.author ? "" : " warn") }, text2, " ", h("label", { class: "check-field" }, "nom ", field));
    }
    function pinRow(pin, orphan) {
      const target = orphan ? pin.hostname : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: pin.hostname }) }, pin.hostname);
      const state = orphan ? pill3("pin", "orphan", "orpheline : équipement absent de cette run") : pill3("pin", "present", "présente");
      const remove = canWrite() ? h("button", { type: "button", onclick: (e) => removeOne(pin.hostname, e.target) }, "retirer") : "";
      return { cells: [target, String(pin.x), String(pin.y), pin.author, dateText(pin.at), state, remove] };
    }
    function colourRow(target, hue, author, at, orphan, remove) {
      const state = orphan === null ? "" : orphan ? pill3("pin", "orphan", "orpheline : équipement absent de cette run") : pill3("pin", "present", "présente");
      const button = canWrite() ? h("button", { type: "button", onclick: (e) => {
        e.target.setAttribute("disabled", "");
        void send(remove(), [], "couleur retirée", true);
      } }, "retirer la couleur") : "";
      return { cells: [target, h("span", { class: "hue-dot hue-" + hue }, hueLabel(hue)), author, dateText(at), state, button] };
    }
    function coloursBlock() {
      const types = model2.intent && model2.intent.type_colors ? model2.intent.type_colors : [];
      const devices = model2.intent && model2.intent.device_colors ? model2.intent.device_colors : [];
      const orphans = new Set(model2.orphanColors.map((c) => c.hostname));
      const rows = types.map((c) => colourRow("type · " + (LABEL[c.type] || c.type), c.hue, c.author, c.at, null, () => [{ op: "uncolor_type", type: c.type }])).concat(devices.map((c) => colourRow(
        orphans.has(c.hostname) ? c.hostname : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: c.hostname }) }, c.hostname),
        c.hue,
        c.author,
        c.at,
        orphans.has(c.hostname),
        () => [{ op: "uncolor", hostname: c.hostname }]
      )));
      const orphanOps = () => model2.orphanColors.map((c) => ({ op: "uncolor", hostname: c.hostname }));
      return [
        h("h3", {}, "Couleurs enregistrées : " + rows.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
        h("p", { class: "muted" }, "La teinte d'un type vaut pour toute l'infrastructure ; celle d'un équipement l'emporte. Douze teintes nommées, jamais une valeur libre (docs/10)."),
        table2(["cible", "teinte", "auteur", "date", "état", ""], rows, { empty: "aucune couleur : la palette des types et la fiche d'un équipement, dans l'application" }),
        canWrite() && orphans.size ? h("div", { class: "toolbar-row" }, confirmable("retirer les couleurs orphelines", () => {
          void send(orphanOps(), [], "couleurs orphelines retirées", true);
        }, { count: orphans.size })) : null
      ];
    }
    function groupsBlock() {
      const list = model2.intent && model2.intent.groups ? model2.intent.groups : [];
      const rows = list.map((group) => {
        const orphans = group.members.filter((host) => {
          const node = model2.nodeByHost.get(host);
          return !node || !!node.ghost;
        });
        const present2 = group.members.length - orphans.length;
        const state = present2 === 0 ? pill3("pin", "orphan", "orphelin : aucun membre dans cette run") : orphans.length ? pill3("pin", "orphan", orphans.length + " membre(s) absent(s)") : pill3("pin", "present", "présent");
        const remove = canWrite() ? confirmable("supprimer", () => {
          void send([{ op: "group_delete", id: group.id }], [], "groupe " + group.label + " supprimé", true);
        }, { count: group.members.length }) : "";
        return { cells: [
          h("span", {}, h("b", {}, group.label), " ", h("code", { class: "muted" }, group.id)),
          h("span", { class: "hue-dot hue-" + group.style.hue }, STYLE_LABEL[group.style.shape] || group.style.shape),
          present2 + " / " + group.members.length + (orphans.length ? " · absents : " + orphans.join(", ") : ""),
          group.author,
          dateText(group.at),
          state,
          remove
        ] };
      });
      return [
        h("h3", {}, "Groupes enregistrés : " + rows.length + (model2.orphanGroups.length ? " · " + model2.orphanGroups.length + " orphelin" + (model2.orphanGroups.length > 1 ? "s" : "") : "")),
        h("p", { class: "muted" }, "Un groupe = des membres + un style ; son cadre se calcule depuis ses membres (docs/10 §5). Il se crée, se modifie et se glisse dans l'application ; ici, la comptabilité."),
        table2(["groupe", "forme", "membres", "auteur", "date", "état", ""], rows, { empty: "aucun groupe : depuis la fiche d'une sélection multiple, dans l'application" })
      ];
    }
    function annotationsBlock() {
      const list = model2.intent && model2.intent.annotations ? model2.intent.annotations : [];
      const orphans = new Set(model2.orphanAnnotations.map((a) => a.id));
      const rows = list.map((a) => {
        const where = a.anchor.kind === "free" ? "libre" : a.anchor.kind + " · " + a.anchor.ref;
        const state = orphans.has(a.id) ? pill3("pin", "orphan", "orpheline : ancre absente de cette run") : pill3("pin", "present", "présente");
        const remove = canWrite() ? confirmable("supprimer", () => {
          void send([{ op: "annotation_delete", id: a.id }], [], "annotation supprimée", true);
        }, { count: 1 }) : "";
        return { cells: [h("span", {}, h("b", {}, KIND_LABEL[a.content.kind] || a.content.kind), " ", h("code", { class: "muted" }, a.id)), summary(a), where, a.x + ", " + a.y + " · " + a.w + " × " + a.h, a.author, dateText(a.at), state, remove] };
      });
      return [
        h("h3", {}, "Annotations enregistrées : " + rows.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
        h("p", { class: "muted" }, "Une annotation dit ce que la donnée ignore : note, forme, tableau, image, libre ou attachée à un équipement ou à un groupe (docs/10 §6). Elle se crée et se règle dans l'application ; ici, la comptabilité."),
        table2(["sorte", "contenu", "ancrage", "boîte", "auteur", "date", "état", ""], rows, { empty: "aucune annotation : la barre d'outils de l'application, « insérer »" })
      ];
    }
    function connectorsBlock() {
      const list = model2.intent && model2.intent.connectors ? model2.intent.connectors : [];
      const orphans = new Set(model2.orphanConnectors.map((c) => c.id));
      const rows = list.map((c) => {
        const state = orphans.has(c.id) ? pill3("pin", "orphan", "orphelin : un bout vise un élément absent de cette run") : pill3("pin", "present", "présent");
        const remove = canWrite() ? confirmable("supprimer", () => {
          void send([{ op: "connector_delete", id: c.id }], [], "connecteur supprimé", true);
        }, { count: 1 }) : "";
        return { cells: [h("code", { class: "muted" }, c.id), summary2(c), c.route, c.author, dateText(c.at), state, remove] };
      });
      return [
        h("h3", {}, "Connecteurs enregistrés : " + rows.length + (orphans.size ? " · " + orphans.size + " orphelin" + (orphans.size > 1 ? "s" : "") : "")),
        h("p", { class: "muted" }, "Un connecteur relie deux bouts, libres ou attachés à un équipement, un groupe ou une annotation : une ligne ou une flèche de contexte, jamais un câble (docs/10 §6). Il se trace dans l'application ; ici, la comptabilité."),
        table2(["id", "connecteur", "tracé", "auteur", "date", "état", ""], rows, { empty: "aucun connecteur : la barre d'outils de l'application, « insérer »" })
      ];
    }
    const removeMany = (label2, hosts) => hosts.length ? confirmable(label2, () => {
      void send(unpinOps(hosts), hosts, hosts.length + " épingle" + (hosts.length > 1 ? "s retirées" : " retirée"));
    }, { count: hosts.length }) : null;
    function view() {
      const container = hooks.container();
      const graph2 = hooks.graph();
      const pins = model2.intent ? model2.intent.pins : [];
      const orphans = new Set(model2.orphanPins.map((p) => p.hostname));
      const local = localMoves(model2, graph2);
      const headers = ["équipement", "x", "y", "auteur", "date", "état", ""];
      const rows = pins.map((pin) => pinRow(pin, orphans.has(pin.hostname)));
      const orphanHosts = model2.orphanPins.map((p) => p.hostname);
      const allHosts = pins.map((p) => p.hostname);
      clear(container).appendChild(h(
        "div",
        { class: "page" },
        h("h2", {}, "Intentions"),
        h("p", { class: "lead" }, "La couche d'intention est ce que vous voulez en plus de ce que la collecte montre. Première intention : l'épingle, la place voulue d'un équipement, keyée par son nom, qui survit aux runs. Glisser un équipement sur le graphe l'épingle ; « replacer » recalcule le placement autour des épingles. Le diff ne lit jamais l'intention. Les équipements non épinglés gardent aussi leur place d'une run à l'autre : c'est le placement mémorisé, une donnée calculée que « replacer » renouvelle."),
        writerNote(),
        model2.intent ? definition([
          ["infrastructure", model2.intent.infrastructure],
          ["révision", String(model2.intent.revision)],
          ["dernière écriture", model2.intent.updated_at ? dateText(model2.intent.updated_at) : "jamais"]
        ]) : null,
        h("h3", {}, "Épingles enregistrées : " + pins.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
        orphans.size ? h("p", { class: "muted" }, "Une épingle orpheline vise un équipement qui n'est pas dans cette run (retiré, renommé, ou pas encore collecté). Elle n'est pas dessinée, elle n'est pas effacée : si l'équipement revient, elle s'applique à nouveau.") : null,
        table2(headers, rows, { empty: model2.intent ? "aucune épingle : glisser un équipement sur le graphe" : "pas de couche d'intention dans cette page" }),
        canWrite() ? h("div", { class: "toolbar-row" }, removeMany("retirer les épingles orphelines", orphanHosts), removeMany("retirer toutes les épingles", allHosts)) : null,
        coloursBlock(),
        groupsBlock(),
        annotationsBlock(),
        connectorsBlock(),
        h("h3", {}, "Déplacements locaux non enregistrés : " + local.length),
        local.length ? [
          h("p", { class: "muted" }, local.join(", ")),
          h("button", { type: "button", title: "chaque équipement retrouve sa place mémorisée ou son épingle", onclick: () => {
            graph2.resetPins();
            refresh();
          } }, "oublier les déplacements locaux")
        ] : h("p", { class: "muted" }, "aucun")
      ));
    }
    function pinBlock(hostname) {
      const pin = model2.pinByHost.get(hostname);
      const local = !pin && hooks.graph().state.pinned.has(hostname);
      if (!pin && !local) return null;
      return [
        h("h4", { class: "section" }, "Épingle"),
        pin ? definition([["place voulue", pin.x + ", " + pin.y], ["par", pin.author], ["le", dateText(pin.at)]]) : h("p", { class: "muted" }, "déplacé dans cette page, non enregistré"),
        pin && canWrite() ? h("button", { type: "button", onclick: (e) => removeOne(hostname, e.target) }, "retirer l'épingle") : null
      ];
    }
    return { onPin, onPins, unpin, onColor, onTypeColor, onColors, onGroup, onAnnotation, onConnector, apply, canWrite, view, pinBlock };
  }
  var intent = { createIntentHost, OPS_PER_REQUEST, AUTHOR_MAX_LENGTH };

  // src/shell/placement.ts
  var MAX_RETRIES = 3;
  var plural2 = (count, word) => count + " " + word + (count > 1 ? "s" : "");
  var placed = (count) => plural2(count, "équipement") + " placé" + (count > 1 ? "s" : "");
  var byHostname = (a, b) => a.hostname < b.hostname ? -1 : 1;
  function createPlacementHost(model2, placer, hooks) {
    const pending = /* @__PURE__ */ new Map();
    let queue = Promise.resolve();
    let replacing = false;
    let retries = 0;
    const accept = (placement2, realign) => {
      if (model2.placement && placement2.revision < model2.placement.revision) return;
      applyPlacement(model2, placement2);
      if (realign) hooks.graph().syncPlaces();
    };
    async function send(replace, what) {
      if (!placer) return;
      const places = Array.from(pending.values()).sort(byHostname);
      if (!replace && !places.length) return;
      hooks.note(what + ", mémorisation…");
      const outcome = await placer.save({ base_revision: model2.placement ? model2.placement.revision : 0, replace, places });
      if (replace) replacing = false;
      if (outcome.ok) {
        pending.clear();
        const kept = new Set(outcome.placement.places.map((place) => place.hostname));
        const missing = places.filter((place) => !kept.has(place.hostname)).length;
        retries = missing ? retries + 1 : 0;
        const stopped = retries > MAX_RETRIES;
        if (stopped) retries = 0;
        accept(outcome.placement, replace || !replacing && !stopped);
        hooks.note(replace ? "placement recalculé et mémorisé pour tout le monde" : stopped ? what + ", non mémorisé" + (places.length > 1 ? "s" : "") + " : l'API ne retient pas " + plural2(missing, "équipement") : what + " et mémorisé" + (places.length > 1 ? "s" : ""));
      } else if (outcome.stale) {
        pending.clear();
        retries = replace ? 0 : retries + 1;
        const stopped = retries > MAX_RETRIES;
        if (stopped) retries = 0;
        hooks.note(replace ? "placement recalculé, non mémorisé : le placement mémorisé a changé entre-temps ; replacer à nouveau si besoin" : stopped ? what + ", non mémorisé" + (places.length > 1 ? "s" : "") + " : le placement mémorisé a changé " + MAX_RETRIES + " fois de suite" : what + " sur un placement qui a changé entre-temps : replacé autour du nouveau…");
        accept(outcome.placement, replace || !stopped && !replacing);
      } else {
        hooks.note(what + ", non mémorisé" + (places.length > 1 && !replace ? "s" : "") + " : " + outcome.message + " (renvoyé au prochain dessin)");
      }
    }
    function onPlaced(fresh2, replace) {
      if (replace) {
        pending.clear();
        replacing = true;
      }
      fresh2.forEach((point, hostname) => pending.set(hostname, { hostname, x: point.x, y: point.y }));
      const what = replace ? "placement recalculé" : placed(fresh2.size);
      if (!placer) {
        if (model2.placement) hooks.note(what + " ici, non mémorisé" + (fresh2.size > 1 && !replace ? "s" : "") + " (page sans serveur)");
        return;
      }
      queue = queue.then(() => send(replace, what)).catch(() => void 0);
    }
    const replaceTitle = () => "recalcule tout le placement autour des épingles enregistrées ; les déplacements non enregistrés sont oubliés" + (placer ? ", et le nouveau placement remplace celui mémorisé, pour tout le monde" : "");
    return { onPlaced, replaceTitle, needsConfirmation: () => !!placer };
  }
  var placement = { createPlacementHost, MAX_RETRIES };

  // src/shell/main.ts
  var BASE_TABS = [["graph", "Graphe"], ["structures", "Structures"], ["intent", "Intentions"], ["checks", "Contrôles"], ["quality", "Qualité des données"], ["sources", "Sources"]];
  var STATUSES = ["confirmed", "observed_only", "documented_only"];
  var tabsFor = (model2) => model2.diff ? [BASE_TABS[0], ["diff", "Diff"], ...BASE_TABS.slice(1)] : BASE_TABS;
  var byId = (id) => document.getElementById(id);
  function renewCanvas() {
    const svg = byId("canvas");
    const parent = svg.parentNode;
    if (!parent) return;
    const fresh2 = s("svg", {});
    svg.getAttributeNames().forEach((name) => fresh2.setAttribute(name, svg.getAttribute(name)));
    parent.replaceChild(fresh2, svg);
  }
  function toggleStatus(graph2, status, st) {
    const hidden = graph2.state.hiddenStatuses;
    if (hidden.has(st)) hidden.delete(st);
    else hidden.add(st);
    status(graph2.render(true));
  }
  function intentChipText(model2) {
    const orphans = model2.orphanPins.length;
    return model2.pinByHost.size + " épingle" + (model2.pinByHost.size > 1 ? "s" : "") + (orphans ? " · " + orphans + " orpheline" + (orphans > 1 ? "s" : "") : "");
  }
  function header(model2, graph2, status, openChecks, openTab) {
    const run2 = model2.source.run, source = model2.source;
    const meta = clear(byId("run-meta"));
    meta.appendChild(h("div", { class: "run-line" }, h("strong", {}, source.infrastructure), " · run ", h("code", {}, source.collector_run_id)));
    meta.appendChild(h(
      "div",
      { class: "run-detail" },
      "collecte du " + run2.start_datetime + (run2.end_datetime ? " au " + run2.end_datetime : "") + " (" + run2.status + ")",
      " · bundle ",
      h("code", {}, source.bundle_sha256.slice(0, 12)),
      " · ",
      h("span", { class: "file" }, model2.origin)
    ));
    if (model2.diff) {
      const before = model2.diff.before;
      meta.appendChild(h("div", { class: "run-diff" }, "comparée à la run ", h("code", {}, before.collector_run_id), " du " + before.start_datetime + " · " + elapsedText(model2.diff.elapsed_seconds)));
    }
    const count = (map, key2) => map.get(key2) || 0;
    const statusChip = (st) => h("button", {
      type: "button",
      id: "c-" + st,
      class: "chip pill status-" + st,
      "aria-pressed": "true",
      title: "afficher ou masquer ces câbles",
      onclick: () => toggleStatus(graph2, status, st)
    }, count(model2.statusCounts, st) + " " + STATUS_LABEL[st]);
    const severityChip = (sev) => h("button", {
      type: "button",
      id: "c-" + sev,
      class: "chip pill severity-" + sev,
      title: "ouvrir les contrôles " + sev,
      onclick: () => openChecks(sev)
    }, count(model2.severityCounts, sev) + " " + sev);
    const diffChip = () => {
      if (!model2.diff) return null;
      const sum = model2.diff.summary.links;
      return h("span", { class: "chip-group" }, h(
        "button",
        { type: "button", id: "c-diff", class: "chip diff-chip", title: "ouvrir le diff", onclick: () => openTab("diff") },
        "diff · câbles +" + sum.added + " −" + sum.removed + " ~" + sum.changed
      ));
    };
    const intentChip = () => model2.intent ? h("span", { class: "chip-group" }, h("button", { type: "button", id: "c-intent", class: "chip intent-chip", title: "ouvrir les intentions", onclick: () => openTab("intent") }, intentChipText(model2))) : null;
    clear(byId("run-counts")).appendChild(h(
      "div",
      { class: "chips" },
      h("span", { class: "chip-group" }, h("span", { class: "chip" }, model2.nodes.length + " nœuds"), h("span", { class: "chip" }, model2.links.length + " câbles")),
      h("span", { class: "chip-group" }, STATUSES.map(statusChip)),
      h("span", { class: "chip-group" }, ["error", "warning", "info"].map(severityChip)),
      diffChip(),
      intentChip()
    ));
  }
  function toolbar(model2, graph2, status, placements) {
    const stubs = model2.kindCounts.get("stub") || 0;
    const redraw = { showStubs: () => graph2.render(false), showPorts: () => (graph2.repaint(), null), showDiff: () => graph2.render(true) };
    const toggle = (id, label2, key2) => h(
      "label",
      { class: "check-field" },
      h("input", { id, type: "checkbox", checked: graph2.state[key2] || null, onchange: (e) => {
        graph2.state[key2] = e.target.checked;
        status(redraw[key2]());
      } }),
      label2
    );
    clear(byId("graph-toolbar")).appendChild(h(
      "div",
      { class: "toolbar-row" },
      toggle("t-stubs", "voisins inconnus (" + stubs + ")", "showStubs"),
      toggle("t-ports", "noms des ports", "showPorts"),
      model2.diff ? toggle("t-diff", "changements (" + model2.diffCount + ")", "showDiff") : null,
      h("input", {
        id: "t-search",
        type: "search",
        placeholder: "chercher un équipement",
        "aria-label": "chercher un équipement",
        oninput: (e) => {
          graph2.state.query = e.target.value;
          graph2.repaint();
        }
      }),
      h("button", { type: "button", onclick: () => graph2.fit() }, "recentrer"),
      h("button", { type: "button", id: "t-legend", "aria-pressed": "true", title: "afficher ou masquer la légende", onclick: (e) => {
        const legend2 = byId("graph-legend");
        legend2.hidden = !legend2.hidden;
        e.target.setAttribute("aria-pressed", legend2.hidden ? "false" : "true");
      } }, "légende"),
      // « Replacer » renouvelle le placement mémorisé : dans une page servie, c'est pour tout le monde, donc confirmé.
      placements.needsConfirmation() ? confirmable("replacer", () => status(graph2.replaceAll()), { title: placements.replaceTitle() }) : h("button", { type: "button", title: placements.replaceTitle(), onclick: () => status(graph2.replaceAll()) }, "replacer"),
      h("span", { class: "muted", id: "graph-status" })
    ));
  }
  function legend(model2, graph2, status) {
    const item = (st) => h("button", {
      type: "button",
      id: "l-" + st,
      class: "legend-item status-" + st,
      "aria-pressed": "true",
      title: "afficher ou masquer ces câbles",
      onclick: () => toggleStatus(graph2, status, st)
    }, h("span", { class: "swatch" }), STATUS_LABEL[st]);
    const span = (cls) => h("span", { class: cls });
    const note2 = (swatch, text2, title) => h("span", { class: "legend-note", title: title || null }, swatch, text2);
    const group = (name, ...items) => h("span", { class: "legend-group" }, h("span", { class: "group-name" }, name), items);
    const icon2 = (type) => s("svg", { class: "legend-icon hue-" + hueOfType(model2, type), viewBox: "0 0 32 32", "aria-hidden": "true" }, s("path", { class: "icon-body", d: glyph(type).body }), s("path", { class: "icon-shade", d: glyph(type).shade }), s("path", { class: "icon-mark", d: glyph(type).mark }));
    clear(byId("graph-legend")).appendChild(h(
      "div",
      { class: "legend-row" },
      group("câbles", STATUSES.map(item), note2(span("swatch down"), "down (estompé)")),
      group("contrôles", note2(span("dot severity-warning"), "warning"), note2(span("dot severity-error"), "error")),
      group(
        "structures",
        note2(span("band"), "faisceau"),
        note2(span("band degraded"), "dégradé"),
        note2(span("frame"), "cluster HA"),
        note2(span("halo"), "heartbeat"),
        note2(span("role-swatch lead"), "forwarde", "rôle HA active, ou primary en active_passive"),
        note2(span("role-swatch follow"), "en attente", "rôle HA standby, ou secondary en active_passive")
      ),
      group(
        "équipements",
        note2(span("box external"), "autre infra"),
        note2(span("box unreachable"), "injoignable"),
        note2(span("box partial"), "collecte partielle"),
        note2(span("box not_collected"), "non collecté"),
        note2(span("box stub"), "voisin inconnu")
      ),
      group("types", TYPES.map((type) => note2(icon2(type), LABEL[type]))),
      model2.diff ? group(
        "changements",
        note2(span("swatch diff-added"), "ajouté"),
        note2(span("swatch diff-changed"), "changé"),
        note2(span("swatch diff-removed"), "retiré (fantôme)", "tel qu'il était dans la run d'avant")
      ) : null
    ));
  }
  function mountTabs(list, activate, model2) {
    const counts = { diff: model2.diffCount, structures: model2.aggregates.length, intent: model2.pinByHost.size, checks: model2.checks.length, sources: model2.links.length };
    const bar2 = clear(byId("tabs"));
    list.forEach(([id, label2]) => bar2.appendChild(h("button", {
      type: "button",
      role: "tab",
      id: "tab-" + id,
      "aria-selected": "false",
      "aria-controls": "view-" + id,
      onclick: () => activate(id)
    }, label2, id in counts ? h("span", { class: "tab-count", id: "count-" + id }, " · " + counts[id]) : null)));
  }
  function readHash() {
    const wanted = /* @__PURE__ */ new Map();
    if (typeof location === "undefined" || !location.hash) return wanted;
    for (const part of location.hash.slice(1).split("&")) {
      const cut = part.indexOf("=");
      if (cut <= 0) continue;
      try {
        wanted.set(part.slice(0, cut), decodeURIComponent(part.slice(cut + 1)));
      } catch (error) {
        continue;
      }
    }
    return wanted;
  }
  function writeHash(view, graph2, model2) {
    if (typeof history === "undefined" || typeof location === "undefined") return;
    const parts = ["view=" + view];
    if (graph2.state.showStubs) parts.push("stubs=1");
    if (graph2.state.showPorts) parts.push("ports=1");
    if (model2.diff && !graph2.state.showDiff) parts.push("diff=0");
    const token = tokenOf(model2, graph2.state.selection);
    if (token) parts.push(token[0] + "=" + encodeURIComponent(token[1]));
    history.replaceState(null, "", "#" + parts.join("&"));
  }
  var VIEWS = {
    diff: tables.diffView,
    structures: tables.structuresView,
    quality: tables.qualityView,
    sources: tables.sourcesView
  };
  function boot(data2, options = {}) {
    const model2 = build(data2);
    const tabs = tabsFor(model2);
    const inspector = byId("inspector");
    const writer = options.writer || null;
    const placer = options.placer || null;
    let graph2 = null;
    let view = "graph";
    let note2 = "";
    let checks = null;
    let disposed = false;
    const built = /* @__PURE__ */ new Set();
    const g = () => graph2;
    const openChecks = (severity) => {
      activate("checks");
      if (checks) checks.setSeverity(severity);
    };
    const activate = (id) => {
      view = id;
      if (graph2) writeHash(view, g(), model2);
      tabs.forEach(([tab]) => {
        byId("view-" + tab).hidden = tab !== id;
        byId("tab-" + tab).setAttribute("aria-selected", tab === id ? "true" : "false");
      });
      if (id !== "graph" && !built.has(id)) {
        built.add(id);
        if (id === "intent") intents.view();
        else if (id === "checks") checks = tables.checksView(byId("view-checks"), model2, openInGraph);
        else VIEWS[id](byId("view-" + id), model2, openInGraph);
      }
    };
    const openInGraph = (selection) => {
      activate("graph");
      g().reveal(selection);
      status();
    };
    const onSelect = (selection) => {
      show(inspector, model2, selection, (next) => {
        g().reveal(next);
        status();
      }, (hostname) => intents.pinBlock(hostname));
      const live = document.getElementById("live");
      if (live) live.textContent = describe(model2, selection);
      if (graph2) writeHash(view, g(), model2);
    };
    const refreshPage = () => {
      if (disposed) return;
      const count = document.getElementById("count-intent");
      if (count) count.textContent = " · " + model2.pinByHost.size;
      const chip = document.getElementById("c-intent");
      if (chip) chip.textContent = intentChipText(model2);
      else if (model2.intent) header(model2, g(), status, openChecks, activate);
      if (g().state.selection && g().state.selection?.kind === "node") onSelect(g().state.selection);
      status();
    };
    const intents = createIntentHost(model2, writer, {
      graph: g,
      openInGraph,
      refreshPage,
      note: (text2) => {
        note2 = text2;
        status();
      },
      mounted: () => built.has("intent"),
      container: () => byId("view-intent")
    });
    const drawn = () => {
      const nodes = Array.from(g().state.nodeEls.keys(), (host) => model2.nodeByHost.get(host)).filter((n2) => !!n2);
      const links = Array.from(g().state.linkEls.keys(), (id) => model2.linkById.get(id)).filter((l) => !!l);
      return {
        nodes: nodes.filter((n2) => !n2.ghost).length,
        links: links.filter((l) => !l.ghost).length,
        ghosts: nodes.filter((n2) => n2.ghost).length + links.filter((l) => l.ghost).length
      };
    };
    const ghostText = (shownGhosts) => {
      const parts = [
        model2.ghostNodes.length ? model2.ghostNodes.length + " équipement" + (model2.ghostNodes.length > 1 ? "s" : "") : null,
        model2.ghostLinks.length ? model2.ghostLinks.length + " câble" + (model2.ghostLinks.length > 1 ? "s" : "") : null
      ].filter(Boolean);
      const masked = model2.ghostNodes.length + model2.ghostLinks.length - shownGhosts;
      return "retirés depuis la run d'avant : " + parts.join(" et ") + " en fantômes" + (masked ? ", dont " + masked + " masqué" + (masked > 1 ? "s" : "") + " par le filtre des voisins inconnus" : "");
    };
    const status = () => {
      if (disposed) return;
      const shown = drawn();
      const total2 = { nodes: model2.nodes.length, links: model2.links.length };
      const hidden = [];
      const stubs = total2.nodes - shown.nodes;
      if (stubs > 0) hidden.push(stubs + (stubs > 1 ? " voisins inconnus masqués" : " voisin inconnu masqué"));
      if (g().state.hiddenStatuses.size) hidden.push("statuts masqués : " + Array.from(g().state.hiddenStatuses).map((st) => STATUS_LABEL[st]).join(", "));
      if (model2.diff && !g().state.showDiff) hidden.push("changements masqués");
      if (g().state.showDiff && model2.ghostNodes.length + model2.ghostLinks.length) hidden.push(ghostText(shown.ghosts));
      byId("graph-status").textContent = shown.nodes + " nœuds sur " + total2.nodes + " et " + shown.links + " câbles sur " + total2.links + " affichés" + (hidden.length ? " · " + hidden.join(" · ") : "") + (note2 ? " · " + note2 : "");
      const box2 = document.getElementById("t-stubs");
      if (box2) box2.checked = g().state.showStubs;
      const diffBox = document.getElementById("t-diff");
      if (diffBox) diffBox.checked = g().state.showDiff;
      STATUSES.forEach((st) => ["l-", "c-"].forEach((prefix) => {
        const el = document.getElementById(prefix + st);
        if (el) el.setAttribute("aria-pressed", g().state.hiddenStatuses.has(st) ? "false" : "true");
      }));
      const ports = document.getElementById("t-ports");
      if (ports) ports.checked = g().state.showPorts;
      writeHash(view, g(), model2);
    };
    const placements = createPlacementHost(model2, placer, { graph: g, note: (text2) => {
      note2 = text2;
      status();
    } });
    graph2 = create2(byId("canvas"), model2, onSelect, { onPin: intents.onPin, onPins: intents.onPins, onPlaced: placements.onPlaced });
    header(model2, graph2, status, openChecks, activate);
    mountTabs(tabs, activate, model2);
    toolbar(model2, graph2, status, placements);
    legend(model2, graph2, status);
    if (typeof matchMedia === "function" && matchMedia("(max-width: 1199px)").matches) {
      byId("graph-legend").hidden = true;
      byId("t-legend").setAttribute("aria-pressed", "false");
    }
    const applyHash = (first) => {
      const wanted = readHash();
      const stubs = wanted.get("stubs") === "1";
      const diffShown = wanted.get("diff") !== "0";
      const redraw = first || stubs !== g().state.showStubs || diffShown !== g().state.showDiff;
      g().state.showStubs = stubs;
      g().state.showDiff = diffShown;
      g().state.showPorts = wanted.get("ports") === "1";
      if (redraw) g().render(!first);
      const kind = SELECTION_KINDS.find((name) => wanted.has(name) && selectionFromToken(model2, name, wanted.get(name)));
      if (kind) g().reveal(selectionFromToken(model2, kind, wanted.get(kind)));
      else g().select(null);
      const wantedView = wanted.get("view");
      activate(wantedView !== void 0 && tabs.some(([id]) => id === wantedView) ? wantedView : "graph");
      g().repaint();
      status();
    };
    applyHash(true);
    const onHashChange = () => {
      if (!disposed) applyHash(false);
    };
    if (typeof window !== "undefined") window.addEventListener("hashchange", onHashChange);
    const dispose = () => {
      disposed = true;
      if (typeof window !== "undefined") window.removeEventListener("hashchange", onHashChange);
      renewCanvas();
    };
    return { model: model2, graph: graph2, activate, applyHash, writer, placer, dispose };
  }
  function startPage(data2) {
    if (typeof document === "undefined") return;
    try {
      apps.app = boot(data2);
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + error.message));
      throw error;
    }
  }

  // src/shell/http.ts
  var TOKEN_KEY = "ld-api-token";
  var AUTHOR_KEY = "ld-author";
  var ROUTES2 = { runs: "/api/ingest/bundles", snapshot: "/api/snapshot", report: "/api/ingest/report", diff: "/api/diff", intent: "/api/intent", patches: "/api/intent/patches", placement: "/api/placement", assets: "/api/intent/assets", journal: "/api/intent/journal" };
  function storage() {
    try {
      return globalThis.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }
  function readToken() {
    try {
      const store = storage();
      return store && store.getItem(TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  }
  function writeToken(token) {
    try {
      const store = storage();
      if (store) {
        if (token) store.setItem(TOKEN_KEY, token);
        else store.removeItem(TOKEN_KEY);
      }
    } catch (error) {
    }
  }
  function readAuthor() {
    try {
      return globalThis.localStorage && globalThis.localStorage.getItem(AUTHOR_KEY) || "";
    } catch (error) {
      return "";
    }
  }
  function writeAuthor(name) {
    try {
      const store = globalThis.localStorage;
      if (store) {
        if (name) store.setItem(AUTHOR_KEY, name);
        else store.removeItem(AUTHOR_KEY);
      }
    } catch (error) {
    }
  }
  var withParams = (route, params) => route + "?" + new URLSearchParams(params).toString();
  async function call(route, params, token, payload) {
    const init = { headers: { Authorization: "Bearer " + token }, credentials: "omit" };
    if (payload !== void 0) Object.assign(init, { method: "POST", headers: { ...init.headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const response = await fetch(withParams(route, params), init);
    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      body = null;
    }
    return { status: response.status, body };
  }
  var isRecord = (value2) => !!value2 && typeof value2 === "object";
  function explain(status, body) {
    if (status === 401) return "jeton refusé par l'API";
    const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : "";
    if (status === 404) return detail || "run inconnue pour cette infrastructure";
    return "l'API répond " + status + (detail ? " : " + detail : "");
  }

  // src/shell/timeline.ts
  var indexOf = (runs, runId) => runs.findIndex((run2) => run2.run_id === runId);
  var previousOf = (runs, runId) => {
    const at = indexOf(runs, runId);
    return at > 0 ? runs[at - 1] : null;
  };
  var nextOf = (runs, runId) => {
    const at = indexOf(runs, runId);
    return at >= 0 && at + 1 < runs.length ? runs[at + 1] : null;
  };
  var previousId = (runs, runId) => {
    const run2 = previousOf(runs, runId);
    return run2 ? run2.run_id : "";
  };
  var label = (run2) => run2.run_start.replace("T", " ").slice(0, 16);
  var pendingFocus = false;
  function render(container, host) {
    const { runs, current, from, busy } = host;
    const at = indexOf(runs, current);
    const prev = previousOf(runs, current), next = nextOf(runs, current);
    const go = (run2, fromId) => {
      if (run2 && !busy) host.open(run2.run_id, fromId);
    };
    const stepButton = (text2, run2, fromId, title) => h("button", { type: "button", class: "timeline-step", title, "aria-label": title, disabled: !run2 || busy || null, onclick: () => go(run2, fromId) }, text2);
    const runButton = (run2) => h("button", {
      type: "button",
      class: "timeline-run run-" + run2.run_status + (run2.run_id === from ? " compared" : ""),
      "data-run": run2.run_id,
      "aria-current": run2.run_id === current ? "true" : null,
      disabled: busy || null,
      title: "run " + run2.run_id + " · " + run2.run_status + " · ingérée le " + run2.stored_at + (run2.run_id === from ? " · run comparée" : ""),
      onclick: () => {
        if (run2.run_id !== current) go(run2, previousId(runs, run2.run_id));
      }
    }, label(run2));
    const buttons = runs.map(runButton);
    const option = (run2) => h(
      "option",
      { value: run2.run_id, selected: run2.run_id === from || null },
      label(run2) + (run2.run_id === previousId(runs, current) ? " (précédente)" : "")
    );
    const compare = h(
      "select",
      {
        id: "timeline-compare",
        "aria-label": "comparer à une run antérieure",
        disabled: busy || at <= 0 || null,
        onchange: (event) => host.open(current, event.target.value)
      },
      h("option", { value: "", selected: from === "" || null }, "aucune"),
      runs.slice(0, Math.max(at, 0)).map(option)
    );
    const keys = (event) => {
      const key2 = event.key;
      if (key2 === "ArrowLeft") {
        event.preventDefault();
        go(prev, prev ? previousId(runs, prev.run_id) : "");
      } else if (key2 === "ArrowRight") {
        event.preventDefault();
        go(next, current);
      }
    };
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && typeof container.contains === "function" && container.contains(active)) pendingFocus = true;
    clear(container).appendChild(h(
      "div",
      { class: "timeline-row", onkeydown: keys },
      stepButton("←", prev, prev ? previousId(runs, prev.run_id) : "", "run précédente"),
      h("ol", { class: "timeline-runs" }, buttons.map((button) => h("li", {}, button))),
      stepButton("→", next, current, "run suivante"),
      h("label", { class: "timeline-compare" }, "comparer à ", compare),
      h("span", { class: "muted timeline-count" }, busy ? "chargement…" : (at >= 0 ? at + 1 + " sur " : "") + runs.length + (runs.length > 1 ? " runs" : " run"))
    ));
    container.hidden = false;
    const shown = at >= 0 ? buttons[at] : null;
    if (!shown) return;
    if (typeof shown.scrollIntoView === "function") shown.scrollIntoView({ inline: "center", block: "nearest" });
    if (pendingFocus && !busy && typeof shown.focus === "function") {
      pendingFocus = false;
      shown.focus();
    }
  }
  var timeline = { render, indexOf, previousOf, nextOf, label };

  // src/shell/shell.ts
  var query2 = (name) => new URLSearchParams(location.search).get(name) || "";
  function create3(root, data2) {
    const state = { token: readToken(), author: readAuthor(), infrastructure: query2("infrastructure"), runId: query2("run_id"), from: query2("from"), runs: null, message: null, busy: false, pending: null };
    const fields = {};
    const input = (id, label2, type, value2, placeholder, maxlength) => h(
      "label",
      { class: "field" },
      label2,
      fields[id] = h("input", { id, type, value: value2, placeholder: placeholder || null, autocomplete: type === "password" ? "off" : null, spellcheck: "false", maxlength: maxlength || null })
    );
    function runsTable() {
      const runs = state.runs;
      if (!runs) return null;
      const compare = (run2, index) => index === 0 ? "—" : h("button", { type: "button", class: "linklike", onclick: (event) => {
        event.stopPropagation();
        state.runId = run2.run_id;
        state.from = runs[index - 1].run_id;
        state.pending = open();
      } }, "avec la précédente");
      return [
        h("h3", {}, "Runs archivées de " + state.infrastructure + " : " + runs.length),
        table2(
          ["run", "début de collecte", "statut", "ingérée le", "comparer"],
          runs.map((run2, index) => ({
            onclick: () => {
              state.runId = run2.run_id;
              state.from = "";
              state.pending = open();
            },
            cells: [h("code", {}, run2.run_id), run2.run_start, pill3("run", run2.run_status, run2.run_status), run2.stored_at, compare(run2, index)]
          })),
          { empty: "aucune run archivée pour cette infrastructure" }
        )
      ];
    }
    function siblings(hidden) {
      const parent = root.parentNode;
      (parent ? Array.from(parent.childNodes) : []).forEach((node) => {
        const el = node;
        const id = el.getAttribute ? el.getAttribute("id") : null;
        if (node !== root && id && id.startsWith("view-")) el.hidden = hidden;
      });
    }
    function timeline2() {
      const container = document.getElementById("timeline");
      if (!container) return;
      if (!state.runs || !apps.app) {
        container.hidden = true;
        return;
      }
      render(container, {
        runs: state.runs,
        current: state.runId,
        from: state.from,
        busy: state.busy,
        open: (runId, from) => {
          state.runId = runId;
          state.from = from;
          state.pending = open();
        }
      });
    }
    function render2() {
      root.hidden = false;
      siblings(true);
      const strip = document.getElementById("timeline");
      if (strip) strip.hidden = true;
      clear(root).appendChild(h(
        "div",
        { class: "page" },
        h("h2", {}, "Lire une run archivée"),
        h("p", { class: "lead" }, "Cette page lit le snapshot par l'API du backend. Le jeton d'API (LD_API_TOKEN) se saisit ici : il reste dans cet onglet et n'entre jamais dans l'adresse. L'adresse, elle, se partage : elle porte l'infrastructure, la run et l'état de vue."),
        h(
          "form",
          { class: "shell-form", onsubmit: (event) => {
            event.preventDefault();
            submit();
          } },
          input("s-token", "jeton d'API", "password", state.token),
          input("s-author", "votre nom (écrit sur les épingles que vous posez ; vide = déplacements locaux seulement)", "text", state.author, "prénom, trigramme…", 80),
          input("s-infrastructure", "infrastructure", "text", state.infrastructure, "libellé de devices[].infrastructure"),
          input("s-run", "run (collector_run_id, vide = lister les runs)", "text", state.runId),
          input("s-from", "comparer à la run d'avant (collector_run_id, optionnel : la page embarque alors le diff)", "text", state.from),
          h(
            "div",
            { class: "toolbar-row" },
            h("button", { type: "submit", disabled: state.busy || null }, state.busy ? "chargement…" : "ouvrir"),
            h("button", { type: "button", onclick: () => {
              state.token = "";
              writeToken("");
              state.message = "jeton oublié";
              render2();
            } }, "oublier le jeton")
          )
        ),
        state.message ? h("p", { class: "shell-message" }, state.message) : null,
        runsTable()
      ));
    }
    function readForm() {
      state.token = fields["s-token"].value.trim();
      state.author = fields["s-author"].value.trim();
      writeAuthor(state.author);
      state.infrastructure = fields["s-infrastructure"].value.trim();
      state.runId = fields["s-run"].value.trim();
      state.from = fields["s-from"].value.trim();
      writeToken(state.token);
    }
    function submit() {
      readForm();
      if (!state.token || !state.infrastructure) {
        state.message = "le jeton et l'infrastructure sont nécessaires";
        render2();
        return;
      }
      state.pending = state.runId ? open() : list();
    }
    async function list() {
      state.busy = true;
      state.message = null;
      state.runs = null;
      render2();
      const found = await call(ROUTES2.runs, { infrastructure: state.infrastructure }, state.token);
      state.busy = false;
      if (found.status === 200 && isRecord(found.body) && Array.isArray(found.body.runs)) state.runs = found.body.runs;
      else failed(found);
      render2();
    }
    function failed(response) {
      state.message = explain(response.status, response.body);
      if (response.status === 401) {
        state.token = "";
        writeToken("");
      }
    }
    function writer() {
      let queue = Promise.resolve();
      const send = async (ops) => {
        if (!me.author) return { ok: false, message: "donnez votre nom dans l'onglet Intentions" };
        try {
          const done = await call(ROUTES2.patches, { infrastructure: state.infrastructure }, state.token, { author: me.author, ops });
          if (done.status === 200 && isRecord(done.body)) return { ok: true, intent: done.body };
          return { ok: false, message: explain(done.status, done.body) };
        } catch (error) {
          return { ok: false, message: "l'API ne répond pas" };
        }
      };
      const me = {
        author: state.author,
        setAuthor: (name) => {
          state.author = name;
          me.author = name;
          writeAuthor(name);
        },
        save: (ops) => {
          const turn = queue.then(() => send(ops));
          queue = turn.catch(() => void 0);
          return turn;
        }
      };
      return me;
    }
    function placer() {
      const send = async (write) => {
        try {
          const done = await call(ROUTES2.placement, { infrastructure: state.infrastructure }, state.token, write);
          if (done.status === 200 && isRecord(done.body)) return { ok: true, placement: done.body };
          if (done.status === 409 && isRecord(done.body)) return { ok: false, stale: true, placement: done.body };
          return { ok: false, message: explain(done.status, done.body) };
        } catch (error) {
          return { ok: false, message: "l'API ne répond pas" };
        }
      };
      return { save: send };
    }
    async function open() {
      state.busy = true;
      state.message = null;
      if (apps.app) timeline2();
      else render2();
      const params = { infrastructure: state.infrastructure, run_id: state.runId };
      const infra = { infrastructure: state.infrastructure };
      const diffParams = { infrastructure: state.infrastructure, from: state.from, to: state.runId };
      const [snapshot, report, diff, intent2, placement2, runs] = await Promise.all([
        call(ROUTES2.snapshot, params, state.token),
        call(ROUTES2.report, params, state.token),
        state.from ? call(ROUTES2.diff, diffParams, state.token) : Promise.resolve(null),
        call(ROUTES2.intent, infra, state.token),
        call(ROUTES2.placement, infra, state.token),
        call(ROUTES2.runs, infra, state.token)
      ]);
      state.busy = false;
      if (snapshot.status !== 200 || !isRecord(snapshot.body)) {
        failed(snapshot);
        render2();
        return;
      }
      data2.snapshot = snapshot.body;
      const reportBody = report.status === 200 && isRecord(report.body) ? report.body : null;
      data2.ingest = reportBody ? { summary: reportBody.summary, findings: reportBody.findings || [] } : null;
      data2.origin = "api · " + state.infrastructure + " · " + state.runId;
      delete data2.diff;
      if (diff) {
        if (diff.status === 200 && isRecord(diff.body)) data2.diff = diff.body;
        else data2.origin += " · diff indisponible : " + explain(diff.status, diff.body);
      }
      delete data2.intent;
      if (intent2.status === 200 && isRecord(intent2.body)) data2.intent = intent2.body;
      else data2.origin += " · intention indisponible : " + explain(intent2.status, intent2.body);
      delete data2.placement;
      let remembered = false;
      if (placement2.status === 200 && isRecord(placement2.body)) {
        data2.placement = placement2.body;
        remembered = true;
      } else data2.origin += " · placement mémorisé indisponible : " + explain(placement2.status, placement2.body);
      if (runs.status === 200 && isRecord(runs.body) && Array.isArray(runs.body.runs)) state.runs = runs.body.runs;
      else {
        state.runs = null;
        data2.origin += " · liste des runs indisponible : " + explain(runs.status, runs.body);
      }
      root.hidden = true;
      clear(root);
      siblings(false);
      const address = state.from ? { ...params, from: state.from } : params;
      if (typeof history !== "undefined") history.replaceState(null, "", "?" + new URLSearchParams(address).toString() + (location.hash || ""));
      if (apps.app) apps.app.dispose();
      apps.app = boot(data2, { writer: writer(), placer: remembered ? placer() : null });
      timeline2();
    }
    if (state.token && state.infrastructure && state.runId) state.pending = open();
    else render2();
    return { state, render: render2, submit, open, list };
  }
  function startShell(data2) {
    const root = typeof document === "undefined" ? null : document.getElementById("view-shell");
    if (!root) return;
    try {
      apps.shellApp = create3(root, data2);
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu démarrer : " + error.message));
      throw error;
    }
  }
  var shell = { create: create3, explain, TOKEN_KEY, AUTHOR_KEY };

  // src/index.ts
  var LD = Object.assign(apps, { model, neighbors, layout, annotations, table, connectors, geometry, query, alignment, card, scene, pill, speed, tags, reveal: { reveal }, dom: { ...dom, ...format, ...widgets }, icons, hues, groups, tip, graph, inspect, intent, placement, structures, tables, timeline, boot, shell });
  globalThis.LD = LD;
  function embedded() {
    if (typeof document === "undefined") return null;
    const block = document.getElementById("ld-data");
    if (!block) return null;
    try {
      return JSON.parse(block.textContent || "");
    } catch (error) {
      document.body.appendChild(dom.h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + error.message));
      throw error;
    }
  }
  var data = embedded();
  if (data) {
    if (data.snapshot) startPage(data);
    else startShell(data);
  }
})();
