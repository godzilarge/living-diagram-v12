// ---------- la barre : quoi (le futur app/state/floating.ts, pur) ----------
// Une grammaire, quatre groupes dans cet ordre, séparés par un filet : l'objet (teinte, remplissage, trait…) | le texte
// (police, taille, gras, italique, souligné, barré, couleur, position) | l'arrangement (plan, verrou) | les actions
// (dupliquer, supprimer). Chaque sorte remplit les groupes qu'elle a ; un groupe vide disparaît avec son filet.
const MIXED = Symbol("mixte");
const SEP = { kind: "sep" };
const btn = (id, label, face, act, more = {}) => ({ kind: "btn", id, label, face, act, ...more });
const opener = (id, label, face, volet, more = {}) => ({ kind: "btn", id, label, face, volet, ...more });
function common(its, get) { const vs = its.map(get); return vs.every((v) => v === vs[0]) ? vs[0] : MIXED; }
const pressed = (v) => (v === MIXED ? "mixed" : String(!!v));

const OPTS = {
  fill: [[0, "aucun"], [25, "25 %"], [50, "50 %"], [100, "plein"]],
  border: [["solid", "plein"], ["dashed", "tirets"], ["dotted", "pointillés"], ["none", "sans bordure"]],
  corners: [[0, "droits"], [6, "6"], [12, "12"], [24, "24"]],
  route: [["straight", "droit"], ["elbow", "coudé"], ["curve", "courbe"]],
  width: [[1, "1"], [2, "2"], [3, "3"], [4, "4"]],
  shape: [["rect", "rectangle"], ["ellipse", "ellipse"]],
  layer: [["dessous", "dessous"], ["dessus", "dessus"]],
  style: [["solid", "plein"], ["dashed", "tirets"], ["dotted", "pointillés"]],
};
const HEADS = ["none", "end", "start", "both"], HEADS_FR = { none: "aucune pointe", end: "pointe à l'arrivée", start: "pointe au départ", both: "deux pointes" };
const seg = (id, label, faceOf, key) => opener(id, label, { glyph: faceOf, key }, { type: "seg", key, opts: OPTS[key], faceOf });
const hueBtn = (ids) => opener("hue", "teinte", { hue: ids }, { type: "hue", ids });
const layerBtn = () => opener("layer", "plan", { icon: "layers" }, { type: "seg", key: "layer", opts: OPTS.layer, icons: { dessous: "send-to-back", dessus: "bring-to-front" } });
const lockBtn = (its) => { const v = common(its, (x) => !!x.locked); return btn("lock", v === true ? "déverrouiller" : "verrouiller", { icon: v === true ? "lock" : "lock-open" }, () => edit((x) => { x.locked = v !== true; }), { keys: "Ctrl+Maj+L", pressed: pressed(v) }); };
const dupBtn = () => btn("dup", "dupliquer", { icon: "copy-plus" }, duplicate, { keys: "Ctrl+D" });
const delBtn = (label = "supprimer") => btn("del", label, { icon: "trash-2" }, remove, { keys: "Suppr", danger: true });

/** Le groupe « texte », le même pour toutes les sortes qui ont du texte ; les valeurs différentes se disent « mixte ». */
function textGroup(its) {
  const T = (k) => common(its, (x) => x.t[k]);
  const font = T("font"), size = T("size"), weight = T("weight"), color = T("color");
  const out = [
    opener("font", font === MIXED ? "police : mixte" : `police : ${FONT_FR[font]}, ${WEIGHT_FR[weight === MIXED ? "regular" : weight]}`, { font }, { type: "font" }),
    { kind: "num", id: "size", label: "taille du texte", value: size, keys: "Control+Shift+> Control+Shift+<" },
    btn("bold", "gras", { icon: "bold" }, () => toggleText("bold"), { keys: "Ctrl+B", pressed: pressed(common(its, (x) => x.t.weight !== "regular")) }),
    btn("italic", "italique", { icon: "italic" }, () => toggleText("italic"), { keys: "Ctrl+I", pressed: pressed(T("italic")) }),
    btn("underline", "souligné", { icon: "underline" }, () => toggleText("underline"), { keys: "Ctrl+U", pressed: pressed(T("underline")) }),
    btn("strike", "barré", { icon: "strikethrough" }, () => toggleText("strike"), { keys: "Ctrl+Maj+X", pressed: pressed(T("strike")) }),
    opener("tcolor", color === MIXED ? "couleur du texte : mixte" : `couleur du texte : ${colorFR(color)}`, { tcolor: color, objHue: effHue(its[0]) }, { type: "tcolor" }),
  ];
  const kinds = new Set(its.map((x) => x.kind));
  const boxed = [...kinds].every((k) => k === "note" || k === "shape");
  const one = its.length === 1 ? its[0] : null;
  if (boxed) { const v = T("valign"), h = T("align"); out.push(opener("pos", v === MIXED || h === MIXED ? "position du texte : mixte" : `position du texte : ${posFR(v, h)}`, { pos: [v, h] }, { type: "pos" })); }
  else if (one && one.kind === "table") out.push(opener("pos", `alignement des cellules : ${ALIGN_FR[one.t.align]}`, { icon: `text-align-${{ left: "start", center: "center", right: "end" }[one.t.align]}` }, { type: "talign" }));
  else if (one && one.kind === "connector") out.push(opener("pos", `place de l'étiquette : ${one.labelAt} %, ${SIDE_FR[one.labelSide]}`, { glyph: G.along }, { type: "along" }));
  else if (one && one.kind === "group") out.push(opener("pos", `place de l'étiquette : ${posFR(...one.labelPos)}, ${one.placement === "inside" ? "dedans" : "dehors"}`, { pos: one.labelPos }, { type: "gpos" }));
  return out;
}
function barSpec() {
  if (S.special || !S.sel.length) return null;
  const its = S.sel.map(item).filter(Boolean);
  if (its.length > 1) return multiSpec(its);
  const it = its[0];
  switch (it.kind) {
    case "note": return [hueBtn([it.id]), SEP, ...textGroup([it]), SEP, layerBtn(), lockBtn([it]), SEP, dupBtn(), delBtn()];
    case "shape": return [hueBtn([it.id]), seg("fill", "remplissage", G.fill, "fill"), seg("border", "bordure", G.border, "border"), seg("corners", "coins", G.corners, "corners"),
      SEP, ...textGroup([it]), SEP, layerBtn(), lockBtn([it]), SEP, dupBtn(), delBtn()];
    case "table": return [btn("row", "ajouter une ligne", { icon: "between-horizontal-end" }, () => edit((x) => { x.rows.push(x.rows[0].map(() => "")); x.h += 30; })),
      btn("col", "ajouter une colonne", { icon: "between-vertical-end" }, () => edit((x) => { x.rows.forEach((r) => r.push("")); x.w += 80; })),
      btn("head", "première ligne en en-tête", { icon: "panel-top" }, () => edit((x) => { x.header = !x.header; }), { pressed: String(it.header) }),
      hueBtn([it.id]), SEP, ...textGroup([it]), SEP, layerBtn(), SEP, delBtn()];
    case "connector": return [btn("heads", HEADS_FR[it.heads], { glyph: () => G.heads(it.heads) }, () => edit((x) => { x.heads = HEADS[(HEADS.indexOf(x.heads) + 1) % 4]; })),
      seg("route", "tracé", G.route, "route"), hueBtn([it.id]), seg("width", "épaisseur", G.width, "width"), seg("stroke", "style du trait", G.stroke, "style"),
      SEP, ...textGroup([it]), SEP, btn("reverse", "inverser le sens", { icon: "arrow-right-left" }, () => edit((x) => { [x.from, x.to] = [x.to, x.from]; })), lockBtn([it]), SEP, delBtn()];
    case "group": return [hueBtn([it.id]), seg("gshape", "forme", G.shape, "shape"), SEP, ...textGroup([it]),
      SEP, btn("members", "sélectionner les membres", { icon: "square-dashed-mouse-pointer" }, () => { S.sel = [...it.members]; refresh(); }),
      btn("paint", "appliquer la teinte aux membres", { icon: "paintbrush" }, () => { remember(); it.members.forEach((m) => { item(m).hue = it.hue; }); say(`teinte ${HUE_FR[it.hue]} appliquée à ${it.members.length} équipements`); refresh(); }),
      SEP, delBtn("supprimer le groupe")];
    case "code": return codeSpec(it);
    case "device": return [hueBtn([it.id]), SEP,
      btn("pin", it.pinned ? "retirer l'épingle" : "épingler", { icon: it.pinned ? "pin-off" : "pin" }, () => edit((x) => { x.pinned = !x.pinned; }), { pressed: String(it.pinned) }),
      opener("group", "grouper", { icon: "group" }, { type: "groups" }),
      SEP, btn("note", "note attachée", { icon: "sticky-note-plus" }, () => say("note attachée (simulé)")),
      btn("conn", "tirer un connecteur", { icon: "move-up-right" }, () => say("outil connecteur armé (simulé)"), { keys: "C" }),
      SEP, btn("hide", "masquer cet équipement et ses câbles", { icon: "eye-off" }, () => say(`${it.name} masqué (simulé)`)),
      btn("isolate", "isoler avec ses voisins directs", { icon: "focus" }, () => say(`${it.name} isolé (simulé)`))];
  }
  return null;
}
/** La barre d'un bloc de code, dans la grammaire du lot 4 bis : l'objet (teinte) | le code (langage, coloration,
 *  numéros, repli, taille) | l'arrangement (plan, verrou) | les actions (copier, dupliquer, supprimer). */
function codeSpec(it) {
  const B = codeBox(it), det = detectLanguage(it.text);
  return [hueBtn([it.id]), SEP,
    opener("lang", `langage : ${LANG[it.lang].label}${det.id !== it.lang && det.sure ? ` (le contenu ressemble à ${LANG[det.id].label})` : ""}`, { lang: it.lang, hint: det.id !== it.lang && det.sure }, { type: "lang" }),
    opener("cfont", `police : ${CODE_FONT[it.cfont].label}`, { cfont: it.cfont }, { type: "cfont" }),
    ...(it.lang === "plain" ? [] : [btn("hl", it.highlight ? "coloration syntaxique : activée" : "coloration syntaxique : désactivée (texte brut)", { icon: "highlighter" }, () => editCode((x) => { x.highlight = !x.highlight; }), { pressed: String(it.highlight) })]),
    btn("nums", it.numbers ? "numéros de ligne : affichés" : "numéros de ligne : masqués", { icon: "list-ordered" }, () => editCode((x) => { x.numbers = !x.numbers; }), { pressed: String(it.numbers) }),
    // ajuster la hauteur au contenu (60 lignes au plus) : seulement si la boîte n'y est pas déjà
    ...(it.h === fitHeight(it) ? [] : [btn("fit", B.total > CODE.FIT_MAX ? `ajuster la hauteur au contenu (${CODE.FIT_MAX} lignes au plus)` : "ajuster la hauteur au contenu", { icon: "move-vertical" },
      () => editCode((x) => { x.h = fitHeight(x); x.scroll = 0; }))]),
    { kind: "num", id: "size", label: "taille du code", value: it.t.size, code: true },
    SEP, layerBtn(), lockBtn([it]), SEP,
    dupBtn(), delBtn()];
}
function multiSpec(its) {
  const movable = its.filter((x) => x.kind !== "connector" && x.kind !== "group");
  const annos = its.filter((x) => x.kind !== "device");
  const texts = its.filter(hasText);
  const out = [];
  if (movable.length >= 2) out.push(opener("align", "aligner et répartir", { icon: "align-horizontal-distribute-center" }, { type: "align", count: movable.length }), SEP);
  out.push(opener("group", "grouper", { icon: "group" }, { type: "groups" }), hueBtn(its.map((x) => x.id)));
  if (texts.length) out.push(SEP, ...textGroup(texts));
  if (annos.length) out.push(SEP, lockBtn(annos), dupBtn(), delBtn(annos.length < its.length ? "supprimer les annotations (les équipements restent)" : "supprimer"));
  return out;
}

// ---------- la barre : le rendu, construit une fois par sélection puis mis à jour en place ----------
const fbar = $("#fbar"), body = $("#fbar-body"), volet = $("#fvolet"), tip = $("#ftip");
let lastKey = "";
function renderBar() {
  const spec = barSpec();
  const key = JSON.stringify([S.sel, spec && spec.map((b) => b.kind === "sep" ? "|" : b.id)]);
  if (key === lastKey) { if (spec) updateBar(spec); return; }
  const focused = document.activeElement && body.contains(document.activeElement) ? (document.activeElement.closest("[data-id]") || {}).dataset?.id : null;
  lastKey = key;
  body.replaceChildren();
  fbar.setAttribute("aria-label", spec ? barLabel() : "");
  if (!spec) return;
  for (const b of spec) {
    if (b.kind === "sep") { html("span", "fb-sep", body).setAttribute("aria-hidden", "true"); continue; }
    body.appendChild(b.kind === "num" ? sizeField(b) : barButton(b));
  }
  html("span", "fbar-caret", body).setAttribute("aria-hidden", "true");
  const stops = tabStops(); stops.forEach((s, i) => { s.tabIndex = i === 0 ? 0 : -1; });
  if (focused) { const again = body.querySelector(`[data-id="${focused}"]`); if (again) { const t = again._input || again; roving(t); t.focus(); } }
}
function updateBar(spec) {
  const els = [...body.children].filter((e) => e.dataset.id);
  spec.filter((b) => b.kind !== "sep").forEach((b, i) => { const e = els[i]; if (e && e._update) e._update(b); });
}
function barButton(b) {
  const e = html("button", "fb");
  e.type = "button"; e.dataset.id = b.id;
  if (b.keys) e.setAttribute("aria-keyshortcuts", b.keys.replace(/Ctrl/g, "Control").replace(/Maj/g, "Shift").replace("Suppr", "Delete"));
  if (b.volet) e.setAttribute("aria-haspopup", "dialog");
  e._update = (nb) => {
    e._spec = nb;
    e.className = `fb${nb.volet ? " opens" : ""}${nb.danger ? " danger" : ""}${nb.face.font !== undefined ? " font" : nb.face.lang !== undefined ? " font lang" : nb.face.cfont !== undefined ? ` font cfont cf-${nb.face.cfont}` : nb.face.tcolor !== undefined ? " tcolor" : " icon"}`;
    e.disabled = !!nb.disabled;
    e.setAttribute("aria-label", nb.label);
    if (nb.pressed !== undefined) e.setAttribute("aria-pressed", nb.pressed);
    if (nb.volet) e.setAttribute("aria-expanded", String(!!(S.volet && S.volet.id === nb.id)));
    e.replaceChildren(face(nb));
    if (nb.face.font !== undefined || nb.face.lang !== undefined || nb.face.cfont !== undefined) e.appendChild(lucide("chevron-down")).classList.add("chev");
  };
  e._update(b);
  e.addEventListener("click", () => { hideTip(); const s = e._spec; if (s.volet) toggleVolet(s, e); else s.act(); });
  e.addEventListener("pointerenter", () => tipLater(e, () => e._spec));
  e.addEventListener("pointerleave", hideTip);
  e.addEventListener("focus", () => { if (e.matches(":focus-visible")) showTip(e, e._spec); });
  e.addEventListener("blur", hideTip);
  return e;
}
/** Le champ de la taille du texte : libre de 8 à 64, au clavier, à la poignée, par les valeurs proposées. */
function sizeField(b) {
  const f = numField({
    id: "size", label: b.code ? "taille du code, en pixels" : "taille du texte, en pixels", min: SIZE_MIN, max: b.code ? 24 : SIZE_MAX, value: b.value === MIXED ? 13 : b.value, mixed: b.value === MIXED, fallback: 13, keys: b.keys,
    grip: () => lucide("a-large-small"),
    onChange: (v, phase) => (b.code ? editCodeSize(v, phase) : editText({ size: v }, phase)),
    onScrub: (on) => { S.gesture = false; fbar.classList.toggle("scrubbing", on); },
    presets: (open) => toggleVolet({ id: "size-open", label: b.code ? "taille du code" : "taille du texte", volet: { type: "size", code: !!b.code } }, open),
    presetsLabel: "tailles proposées",
  });
  f._update = (nb) => f._set(nb.value === MIXED ? 13 : nb.value, nb.value === MIXED);
  f.addEventListener("pointerenter", (ev) => { if (ev.target === f || f.contains(ev.target)) tipLater(f, () => ({ label: b.code ? "taille du code (8 à 24) · glisser l'icône" : "taille du texte (8 à 64) · glisser l'icône", keys: b.code ? "" : "Ctrl+Maj+> <" })); });
  f.addEventListener("pointerleave", hideTip);
  return f;
}
function face(b) {
  const f = b.face || {};
  if (f.hue) {
    const effs = [...new Set(f.hue.map(item).map(effHue))];
    if (effs.length === 1) return html("span", `fb-hue hue-${effs[0]}`);
    const m = svg("svg", { viewBox: "0 0 14 14", class: "fb-mix", "aria-hidden": "true" });
    svg("path", { class: `hue-${effs[0]}`, d: "M7 0.5A6.5 6.5 0 0 0 7 13.5Z" }, m); svg("path", { class: `hue-${effs[1]}`, d: "M7 0.5A6.5 6.5 0 0 1 7 13.5Z" }, m);
    svg("circle", { class: "fb-mix-ring", cx: 7, cy: 7, r: 6.5 }, m);
    return m;
  }
  if (f.font !== undefined) return html("span", `fname${f.font === "mono" ? " mono" : ""}`, undefined, f.font === MIXED ? "Mixte" : FONT_FR[f.font]);
  if (f.cfont !== undefined) return html("span", "fname", undefined, CODE_FONT[f.cfont].short);
  if (f.lang !== undefined) { const w = html("span", "fname"); w.textContent = LANG[f.lang].label; if (f.hint) html("span", "lang-hint", w).setAttribute("aria-hidden", "true"); return w; }
  if (f.tcolor !== undefined) {
    const w = html("span", "tc");
    const a = html("span", "tc-letter", w, "A"); a.setAttribute("aria-hidden", "true");
    const bar = html("span", `tc-bar${f.tcolor === "hue" ? ` hue-${f.objHue}` : f.tcolor !== "ink" && f.tcolor !== MIXED ? ` hue-${f.tcolor}` : ""}`, w);
    if (f.tcolor === MIXED) bar.classList.add("mixed");
    else if (f.tcolor !== "ink") setVars(bar, { "--tc": "var(--type)" });
    return w;
  }
  if (f.pos) return f.pos[0] === MIXED || f.pos[1] === MIXED ? posMini("middle", "center") : posMini(f.pos[0], f.pos[1]);
  if (f.icon) return lucide(f.icon);
  if (f.glyph) { const it = item(S.sel[0]); return f.key ? f.glyph(f.key === "style" ? it.style : it[f.key]) : f.glyph(); }
  return html("span");
}
function barLabel() {
  const its = S.sel.map(item);
  if (its.length > 1) return `actions rapides : ${its.length} éléments`;
  const it = its[0];
  return `actions rapides : ${{ note: "note", shape: "forme", table: "tableau", connector: "connecteur", group: "groupe", code: "bloc de code", device: it.name }[it.kind]}`;
}
// une seule étape de tabulation pour toute la barre ; ← → passent d'un contrôle au suivant (le champ compte pour un)
const tabStops = () => [...body.children].filter((e) => e.dataset.id).map((e) => e._input || e);
function roving(target) { tabStops().forEach((b) => { b.tabIndex = b === target ? 0 : -1; }); }

// ---------- la barre : où (repris du lot 4 : dessus d'abord, puis dessous, sans couvrir une annotation) ----------
const GAP = 8, BAR_H = 36;
function zone() {
  const panel = $("#panel"), tb = $("#toolbar").getBoundingClientRect(), search = $(".search").getBoundingClientRect(), band = $(".band").getBoundingClientRect();
  const right = panel.hidden ? innerWidth : panel.getBoundingClientRect().left;
  return { left: GAP, top: Math.max(tb.bottom, search.bottom) + GAP, right: right - GAP, bottom: band.top - GAP };
}
function anchorBox() {
  const one = S.sel.length === 1 && item(S.sel[0]);
  if (one && one.kind === "connector") { const b = labelPlace(one), p = alongPath(one, one.labelAt); return toScreen(union([{ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h }, { x: p.x - 3, y: p.y - 3, w: 6, h: 6 }])); }
  // un groupe dont l'étiquette est dehors : l'étiquette fait partie de l'objet, la barre ne la couvre pas
  if (one && one.kind === "group" && one.placement === "outside") { const f = groupBox(one), m = one.t.size + 12; return toScreen({ x: f.x - 4, y: f.y - (one.labelPos[0] === "top" ? m : 0), w: f.w + 8, h: f.h + (one.labelPos[0] !== "middle" ? m : 0) }); }
  return toScreen(union(S.sel.map((id) => boxOf(item(id)))));
}
/** Le tracé d'un connecteur sélectionné, en petits rectangles d'écran (échantillonné, gonflé de 4) : la barre et le
 *  volet ne s'y posent jamais (poids infini), comme dans `app/state/floating.ts` du lot 4. */
function pathRects() {
  const out = [];
  for (const id of S.sel) {
    const c = item(id); if (!c || c.kind !== "connector") continue;
    let prev = null;
    for (let k = 0; k <= 40; k++) {
      const p = alongPath(c, k * 2.5);
      if (prev) { const x0 = Math.min(prev.x, p.x) - 4, y0 = Math.min(prev.y, p.y) - 4; out.push(toScreen({ x: x0, y: y0, w: Math.abs(p.x - prev.x) + 8, h: Math.abs(p.y - prev.y) + 8 })); }
      prev = p;
    }
  }
  return out;
}
function obstacles() {
  const out = [];
  for (const it of S.items.values()) {
    if (S.sel.includes(it.id)) continue;
    if (isAnno(it) || it.kind === "device") out.push({ b: toScreen(boxOf(it)), w: 1 });
  }
  for (const b of pathRects()) out.push({ b, w: 1e6 });
  return out;
}
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
function bestPlace(a, w, z, obs) {
  const cx = a.x + a.w / 2, center = clamp(cx - w / 2, z.left, z.right - w);
  const lo = Math.max(z.left, cx + 16 - w), hi = Math.min(z.right - w, cx - 16);
  const sides = [{ below: false, y: a.y - GAP - BAR_H }, { below: true, y: a.y + a.h + GAP }].filter((s) => s.y >= z.top && s.y + BAR_H <= z.bottom)
    .filter((s, _, all) => !S.barSide || all.length < 2 || s.below === (S.barSide === "below"));
  // un objet plus haut que la vue (un bloc de code déplié) : ni dessus ni dessous ; la barre se pose à côté, en haut de la
  // zone visible, jamais sur l'objet (règle du lot 4)
  if (!sides.length) {
    const y = clamp(a.y, z.top, z.bottom - BAR_H), beside = [a.x + a.w + GAP, a.x - GAP - w].filter((x) => x >= z.left && x + w <= z.right);
    if (beside.length) return { x: beside[0], y, below: false, covers: 0, side: true };
    return { x: center, y: z.top, below: false, covers: 0 };
  }
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
  const { x, y, below, covers, side } = bestPlace(b, w, z, obstacles());
  fbar.classList.toggle("below", below);
  fbar.classList.toggle("beside", !!side);
  fbar.dataset.covers = String(Math.round(covers));
  setVars(fbar, { "--fx": `${Math.round(x)}px`, "--fy": `${Math.round(y)}px`, "--cx": `${Math.round(clamp(b.x + b.w / 2 - x, 14, w - 14))}px` });
  if (!barShown || entering) { fbar.classList.remove("enter"); void fbar.offsetWidth; fbar.classList.add("enter"); }
  barShown = true;
  if (S.volet) placeVolet();
}

// ---------- l'infobulle : libellé · raccourci ----------
let tipTimer = 0, lastTipAt = 0;
function tipLater(e, specOf) { clearTimeout(tipTimer); if (S.volet) return; const wait = performance.now() - lastTipAt < 400 ? 0 : 400; tipTimer = later(() => showTip(e, specOf()), wait); }
function showTip(e, b) { if (S.volet || fbar.classList.contains("suspended") || !b) return; tipNear(e, b.label, b.keys, body.getBoundingClientRect(), fbar.classList.contains("below")); }
function tipNear(e, label, keys, ref, below) {
  tip.querySelector(".ftip-label").textContent = label;
  tip.querySelector(".ftip-keys").textContent = keys ? keys.replace(/Control/g, "Ctrl").replace(/Shift/g, "Maj") : "";
  tip.hidden = false;
  const r = e.getBoundingClientRect(), z = zone(), w = tip.offsetWidth, h = tip.offsetHeight;
  let y = below ? ref.bottom + 6 : ref.top - 6 - h;
  if (y < z.top || y + h > z.bottom) y = below ? ref.top - 6 - h : ref.bottom + 6;
  setVars(tip, { "--tx": `${Math.round(clamp(r.left + r.width / 2 - w / 2, z.left, z.right - w))}px`, "--ty": `${Math.round(y)}px` });
  lastTipAt = performance.now();
}
function hideTip() { clearTimeout(tipTimer); if (!tip.hidden) lastTipAt = performance.now(); tip.hidden = true; }
