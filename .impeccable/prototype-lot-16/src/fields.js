// ---------- le champ numérique de la barre (taille, marge, interligne, place de l'étiquette) ----------
// Creusé dans la barre : une poignée qui se glisse (4 px par cran, Maj × 10), le nombre qu'on tape (Entrée pose, Échap
// rend la valeur, ↑↓ ±1, Maj ±10), et, s'il y en a, un chevron vers les valeurs proposées. La même grammaire que le
// champ « scrub » de l'inspecteur, à la hauteur de la barre (28).
// `onChange(v, phase)` : phase « live » pendant un glissé (pas d'entrée d'historique), « commit » à la fin.
function numField(o) {
  const root = html("div", `fnum${o.wide ? " wide" : ""}`);
  root.dataset.id = o.id;
  const grip = html("button", "fnum-grip", root);
  grip.type = "button"; grip.tabIndex = -1; grip.setAttribute("aria-hidden", "true");
  grip.appendChild(o.grip());
  const input = html("input", "fnum-input", root);
  input.type = "text"; input.inputMode = "numeric"; input.spellcheck = false; input.autocomplete = "off";
  input.setAttribute("aria-label", o.label);
  input.setAttribute("role", "spinbutton");
  input.setAttribute("aria-valuemin", o.min); input.setAttribute("aria-valuemax", o.max);
  if (o.keys) input.setAttribute("aria-keyshortcuts", o.keys);
  if (o.unit) html("span", "fnum-unit", root, o.unit);
  let open = null;
  if (o.presets) {
    open = html("button", "fnum-open", root);
    open.type = "button"; open.tabIndex = -1; open.dataset.id = o.id + "-open";
    open.setAttribute("aria-label", o.presetsLabel || "valeurs proposées");
    open.setAttribute("aria-haspopup", "dialog"); open.setAttribute("aria-expanded", "false");
    open.appendChild(lucide("chevron-down"));
    open.addEventListener("click", () => o.presets(open));
  }
  const fmt = o.format || String, parse = o.parse || ((s) => Number(String(s).replace(",", ".")));
  let value = o.value, mixed = !!o.mixed;
  const show = () => {
    input.value = mixed ? "" : fmt(value); input.placeholder = mixed ? "—" : "";
    input.setAttribute("aria-valuenow", mixed ? "" : value);
    input.setAttribute("aria-valuetext", mixed ? "mixte" : fmt(value) + (o.unit ? " " + o.unit : ""));
  };
  const step = (e) => (e.shiftKey ? o.big || 10 : 1) * (o.step || 1);
  const put = (v, phase) => { const c = clamp(Math.round(v / (o.step || 1)) * (o.step || 1), o.min, o.max); value = c; mixed = false; show(); o.onChange(c, phase); };
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); put((mixed ? o.fallback ?? value : value) + (e.key === "ArrowUp" ? 1 : -1) * step(e), "commit"); input.select(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const v = parse(input.value); if (Number.isFinite(v)) put(v, "commit"); else show(); input.select(); }
    else if (e.key === "Escape") show(); // la valeur revient ; la barre (ou le volet) traite ensuite Échap
  });
  input.addEventListener("focus", () => { input.select(); o.onFocus && o.onFocus(); });
  input.addEventListener("blur", () => { const v = parse(input.value); if (input.value !== "" && Number.isFinite(v) && v !== value) put(v, "commit"); else show(); o.onBlur && o.onBlur(); });
  // la poignée : glisser règle, un clic sans glissé donne le champ
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    const x0 = e.clientX, v0 = mixed ? o.fallback ?? value : value; let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      if (!moved) { moved = true; root.classList.add("scrubbing"); o.onScrub && o.onScrub(true); }
      put(v0 + Math.round(dx / 4) * (ev.shiftKey ? o.big || 10 : 1) * (o.step || 1), "live");
    };
    const up = () => {
      grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
      root.classList.remove("scrubbing");
      if (moved) { o.onChange(value, "commit"); o.onScrub && o.onScrub(false); } else { input.focus(); }
    };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  });
  grip.addEventListener("pointerenter", () => o.onHover && o.onHover(true));
  grip.addEventListener("pointerleave", () => o.onHover && o.onHover(false));
  show();
  root._input = input; root._open = open;
  root._set = (v, m) => { value = v; mixed = !!m; if (document.activeElement !== input) show(); };
  return root;
}

// ---------- les glyphes de la barre et des volets (16 × 16 au trait, dessinés ici : ce que Lucide n'a pas) ----------
function glyph(build, vb = "0 0 16 16") { const s = svg("svg", { viewBox: vb, class: "glyph", "aria-hidden": "true" }); build(s); return s; }
const G = {
  fill: (lv) => glyph((s) => { if (lv) svg("rect", { class: "g-tint", x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "fill-opacity": { 25: 0.3, 50: 0.6, 100: 1 }[lv] }, s); svg("rect", { class: "g-line", x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "stroke-opacity": 0.55 }, s); if (!lv) svg("path", { class: "g-line", d: "M3.5 12.5L12.5 3.5", "stroke-opacity": 0.55 }, s); }),
  border: (st) => glyph((s) => { svg("rect", { class: "g-line", x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, "stroke-dasharray": { solid: "", dashed: "3.2 2", dotted: "0.1 2.6", none: "0.1 2.6" }[st], "stroke-opacity": st === "none" ? 0.35 : 1 }, s); if (st === "none") svg("path", { class: "g-line", d: "M3 13L13 3" }, s); }),
  corners: (r) => glyph((s) => { const k = { 0: 0, 6: 3, 12: 6, 24: 9 }[r] ?? 3; svg("path", { class: "g-line", d: k ? `M3 14V${3 + k}A${k} ${k} 0 0 1 ${3 + k} 3H14` : "M3 14V3H14" }, s); }),
  heads: (v) => glyph((s) => {
    svg("path", { class: "g-line", d: `M${v === "start" || v === "both" ? 5 : 2} 8H${v === "end" || v === "both" ? 11 : 14}` }, s);
    if (v === "end" || v === "both") svg("path", { class: "g-fill", d: "M14.5 8L10 5V11Z" }, s);
    if (v === "start" || v === "both") svg("path", { class: "g-fill", d: "M1.5 8L6 5V11Z" }, s);
  }),
  route: (v) => glyph((s) => svg("path", { class: "g-line", d: { straight: "M3 13L13 3", elbow: "M3 13H8V3H13", curve: "M3 13C9 13 7 3 13 3" }[v] }, s)),
  width: (w) => glyph((s) => svg("path", { class: "g-line", d: "M2.5 8H13.5", "stroke-width": 0.6 + w * 0.9 }, s)),
  stroke: (st) => glyph((s) => svg("path", { class: "g-line", d: "M2 8H14", "stroke-dasharray": { solid: "", dashed: "3.5 2.5", dotted: "0.1 3" }[st] }, s)),
  widths: () => glyph((s) => { svg("path", { class: "g-line", d: "M2.5 3.5H13.5", "stroke-width": 1 }, s); svg("path", { class: "g-line", d: "M2.5 7.5H13.5", "stroke-width": 1.8 }, s); svg("path", { class: "g-line", d: "M2.5 12H13.5", "stroke-width": 2.8 }, s); }),
  strokes: () => glyph((s) => { svg("path", { class: "g-line", d: "M2.5 3.5H13.5" }, s); svg("path", { class: "g-line", d: "M2.5 8H13.5", "stroke-dasharray": "3 2.2" }, s); svg("path", { class: "g-line", d: "M2.5 12.5H13.5", "stroke-dasharray": "0.1 2.6" }, s); }),
  shape: (v) => glyph((s) => v === "ellipse" ? svg("ellipse", { class: "g-line", cx: 8, cy: 8, rx: 6, ry: 4.8 }, s) : svg("rect", { class: "g-line", x: 2, y: 3.5, width: 12, height: 9, rx: 2 }, s)),
  // la marge intérieure : la boîte, et la zone du texte en retrait
  pad: () => glyph((s) => { svg("rect", { class: "g-faint", x: 1.5, y: 1.5, width: 13, height: 13, rx: 2 }, s); svg("rect", { class: "g-line", x: 5, y: 5, width: 6, height: 6, rx: 1, "stroke-dasharray": "1.6 1.6" }, s); }),
  // l'interligne : deux lignes et l'écart entre elles
  lh: () => glyph((s) => { svg("path", { class: "g-line", d: "M6 4H14M6 12H14" }, s); svg("path", { class: "g-thin", d: "M2.5 3.5V12.5M1 5L2.5 3.5L4 5M1 11L2.5 12.5L4 11" }, s); }),
  // la place de l'étiquette sur le tracé : un trait, un repère
  along: () => glyph((s) => { svg("path", { class: "g-line", d: "M1.5 11H14.5" }, s); svg("rect", { class: "g-fill", x: 6, y: 4, width: 4, height: 4, rx: 1 }, s); svg("path", { class: "g-thin", d: "M8 8V11" }, s); }),
  // la taille : la poignée du champ (deux « A » de tailles différentes, l'icône a-large-small de Lucide)
};
/** La position du texte en miniature : un cadre, trois lignes posées comme elles le seront (aligné, en haut, au milieu…). */
function posMini(v, h, w = 16, hh = 16, cell = false) {
  if (cell) return glyph((s) => {
    svg("rect", { class: "pf", x: 1.5, y: 1.5, width: w - 3, height: hh - 3, rx: 2 }, s);
    const gap = 3.5, block = gap * 2, lens = [12, 8, 10.5];
    const top = v === "top" ? 4.5 : v === "bottom" ? hh - 4.5 - block : (hh - block) / 2;
    lens.forEach((len, i) => {
      const x0 = h === "left" ? 5 : h === "right" ? w - 5 - len : (w - len) / 2;
      svg("path", { class: "pl", d: `M${x0} ${top + i * gap}H${x0 + len}`, "stroke-width": 1.5 }, s);
    });
  }, `0 0 ${w} ${hh}`);
  return glyph((s) => {
    const pad = cell ? 3 : 2.5, inner = w - 2 * pad, lens = [1, 0.62, 0.84].map((k) => k * inner * (cell ? 0.72 : 0.78));
    if (!cell) svg("rect", { class: "g-faint", x: 1.5, y: 1.5, width: w - 3, height: hh - 3, rx: 2 }, s);
    const gap = cell ? 4.5 : 3.4, block = gap * 2, top = v === "top" ? pad + (cell ? 1.5 : 1.6) : v === "bottom" ? hh - pad - (cell ? 1.5 : 1.6) - block : (hh - block) / 2;
    lens.forEach((len, i) => {
      const x0 = h === "left" ? pad + (cell ? 1 : 1) : h === "right" ? w - pad - (cell ? 1 : 1) - len : (w - len) / 2;
      svg("path", { class: cell ? "pl" : "g-line", d: `M${x0.toFixed(2)} ${(top + i * gap).toFixed(2)}H${(x0 + len).toFixed(2)}`, "stroke-width": cell ? 1.6 : 1.4 }, s);
    });
  }, `0 0 ${w} ${hh}`);
}
