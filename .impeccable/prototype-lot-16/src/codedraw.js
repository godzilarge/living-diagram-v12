// ---------- le dessin d'un bloc de code sur la toile (SVG, le futur app/canvas/code.tsx) ----------
// Une carte : un rail de sa teinte à gauche (comme les cartes d'équipement), un en-tête (titre, langage en pastille, copier),
// la gouttière des numéros, une ligne SVG <text> par ligne de code, un <tspan class="tk-…"> par jeton, et un pied
// « n lignes de plus » quand le bloc est replié. Aucune chaîne HTML depuis une donnée : textContent partout.
const XML_NS = "http://www.w3.org/XML/1998/namespace";
function iconAt(parent, name, x, y, size, cls = "") {
  const s = svg("svg", { x, y, width: size, height: size, viewBox: "0 0 24 24", class: `code-icon ${cls}`, "aria-hidden": "true" }, parent);
  s.innerHTML = LUCIDE[name]; // constante recopiée de lucide-react, jamais une donnée
  return s;
}
const PILL_CH = 6.82; // la chasse des pastilles de l'application (JetBrains Mono 600 11 px, capitales)
function pillAt(parent, text, xRight, cy, cls) {
  const w = Math.round(text.length * PILL_CH + 14), g = svg("g", { class: `code-pill ${cls}`, transform: `translate(${xRight - w} ${cy - 10})` }, parent);
  svg("rect", { width: w, height: 20, rx: 10 }, g);
  svg("text", { x: w / 2, y: 14, "text-anchor": "middle" }, g).textContent = text;
  return w;
}
const secretCount = new Map(); // texte → nombre de valeurs sensibles (recalculé quand le texte change)
function secretsOf(it) { if (!secretCount.has(it.text)) secretCount.set(it.text, findSecrets(it.text).length); return secretCount.get(it.text); }

function drawCode(it) {
  const layer = it.layer === "dessous" ? L.under : L.over;
  const B = codeBox(it), w = it.w, h = B.h, size = it.t.size;
  const g = itemGroup(layer, it, `annotation kind-code cf-${it.cfont}${it.locked ? " locked" : ""}${it.highlight ? " hl" : " plain"}`);
  g.setAttribute("aria-label", `bloc de code ${LANG[it.lang].label}${it.title ? ", " + it.title : ""}, ${B.total} lignes`);
  const clip = `clip-${it.id}`;
  svg("rect", { width: w, height: h, rx: 8 }, svg("clipPath", { id: clip }, svg("defs", {}, g)));
  svg("rect", { class: "hover-ring", x: -3, y: -3, width: w + 6, height: h + 6, rx: 10 }, g);
  svg("rect", { class: "code-body", width: w, height: h, rx: 8 }, g);
  const inner = svg("g", { "clip-path": `url(#${clip})` }, g);
  svg("rect", { class: "code-head", width: w, height: CODE.HEAD }, inner);
  svg("rect", { class: "code-rail", width: CODE.RAIL, height: h }, inner);
  svg("line", { class: "code-rule", x1: CODE.RAIL, x2: w, y1: CODE.HEAD + 0.5, y2: CODE.HEAD + 0.5 }, inner);
  // l'en-tête : le titre à gauche ; à droite, la pastille du langage, l'alerte, copier
  const cy = CODE.HEAD / 2;
  const copyX = w - 8 - 24;
  const copy = svg("g", { class: "code-copy", "data-act": "copy", transform: `translate(${copyX} ${cy - 12})`, role: "button", "aria-label": "copier le code" }, g);
  svg("rect", { width: 24, height: 24, rx: 6 }, copy);
  iconAt(copy, S.copied === it.id ? "check" : "copy", 5, 5, 14);
  let right = copyX - 6;
  right -= pillAt(g, LANG[it.lang].short.toUpperCase(), right, cy, it.highlight ? "lang" : "lang off") + 6;
  if (secretsOf(it)) { iconAt(g, "shield-alert", right - 16, cy - 8, 16, "code-warn"); right -= 22; }
  if (it.title) {
    const room = Math.floor((right - CODE.RAIL - 14 - 8) / 7.1);
    const t = it.title.length > room ? it.title.slice(0, Math.max(1, room - 1)) + "…" : it.title;
    svg("text", { class: "code-title", x: CODE.RAIL + 12, y: cy + 4.5 }, g).textContent = t;
  } else svg("text", { class: "code-count", x: CODE.RAIL + 12, y: cy + 4 }, g).textContent = `${B.total} lignes`; // sans titre : la taille du bloc
  // la gouttière et les lignes : seules les lignes visibles sont dessinées (un bloc de 2 000 lignes coûte sa fenêtre)
  const all = codeLines(it.text, it.lang, it.highlight), lines = all.slice(B.first, B.first + B.visible);
  const top = CODE.HEAD + CODE.PAD, base = (i) => top + i * B.lh + B.lh / 2 + size * 0.36;
  if (it.numbers) {
    svg("rect", { class: "code-gutter", x: CODE.RAIL, y: CODE.HEAD + 1, width: B.gutter, height: h - CODE.HEAD - 1 - B.foot }, inner);
    const nums = svg("g", { class: "code-nums", "font-size": size }, g);
    for (let i = 0; i < lines.length; i++) svg("text", { x: CODE.RAIL + B.gutter - CODE.GUTTER, y: base(i), "text-anchor": "end" }, nums).textContent = String(B.first + i + 1);
  }
  const body = svg("g", { class: "code-text", "font-size": size }, g);
  if (S.editing !== it.id) lines.forEach((segs, i) => {
    const { segs: kept, clipped } = clipLine(segs, B.cols);
    const line = svg("text", { x: B.textX, y: base(i) }, body);
    line.setAttributeNS(XML_NS, "xml:space", "preserve");
    for (const sg of kept) { const ts = svg("tspan", sg.c && (it.highlight || sg.c === "masked") ? { class: `tk-${sg.c}` } : {}, line); ts.textContent = sg.t; }
    if (clipped) svg("tspan", { class: "tk-clip" }, line).textContent = "›";
  });
  if (!B.scrolls) return;
  // la barre de défilement : fine, visible au survol et sur le bloc sélectionné ; le pouce se glisse, la piste pagine
  const trackY = CODE.HEAD + 4, trackH = h - CODE.HEAD - B.foot - 8, thumbH = Math.max(18, trackH * B.visible / B.total);
  const thumbY = trackY + (trackH - thumbH) * (B.maxFirst ? B.first / B.maxFirst : 0);
  const sc = svg("g", { class: "code-scroll" }, g);
  svg("rect", { class: "code-track", "data-act": "track", x: w - CODE.SCROLL, y: trackY, width: CODE.SCROLL, height: trackH }, sc);
  svg("rect", { class: "code-thumb", "data-act": "thumb", x: w - CODE.SCROLL + 3.5, y: thumbY, width: 5, height: thumbH, rx: 2.5 }, sc);
  // le pied : où l'on est dans le code, discret
  const fy = h - B.foot;
  svg("line", { class: "code-rule", x1: CODE.RAIL, x2: w, y1: fy + 0.5, y2: fy + 0.5 }, inner);
  const last = B.first + B.visible;
  svg("text", { class: "code-foot-hint", x: w - 14, y: fy + B.foot / 2 + 4, "text-anchor": "end" }, g).textContent = `lignes ${B.first + 1}-${last} sur ${B.total}`;
  if (B.first > 0 || last < B.total) svg("text", { class: "code-foot-more", x: CODE.RAIL + 12, y: fy + B.foot / 2 + 4 }, g).textContent = last < B.total ? `${B.total - last} plus bas` : "fin du code";
}

/** Le bord d'une boîte sur la droite de son centre vers un point (comme canvas/annotations.ts, borderPoint). */
function edgeToward(b, p) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = p.x - cx, dy = p.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const k = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * k, y: cy + dy * k };
}
/** Les lignes de rappel des blocs attachés : du bord du bloc au bord de la carte qu'il suit. */
function drawLeaders() {
  for (const it of S.items.values()) {
    if (it.kind !== "code" || !it.anchor || !item(it.anchor)) continue;
    const a = boxOf(it), d = boxOf(item(it.anchor));
    const from = edgeToward(a, { x: d.x + d.w / 2, y: d.y + d.h / 2 }), to = edgeToward(d, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    const on = S.sel.includes(it.id) || S.sel.includes(it.anchor);
    svg("line", { class: `leader hue-${it.hue}${on ? " related" : ""}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y }, L.under);
  }
}
