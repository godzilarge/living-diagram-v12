// ---------- les volets : la barre repliée en rangées ----------
// Même surface, même bordure, même ombre, mêmes coins, même marge de 4 que la barre ; des contrôles de 28 ; un titre à la
// hauteur d'une rangée (le réglage, puis la valeur posée, « 13 → 18 » au survol) ; l'ergot pointe le bouton qui l'a
// ouvert. Un choix s'applique tout de suite (la toile change sous les yeux) et le volet reste ouvert : on essaie, on
// compare, Échap ou un clic dehors le ferme. Chaque volet garde des fonctions de mise à jour (`V.updaters`) : un glissé
// dans un champ du volet ne le reconstruit jamais.
const V = { updaters: [] };
const sel1 = () => item(S.sel[0]);
const textItems = () => S.sel.map(item).filter(hasText);

function toggleVolet(b, openerEl, byKeyboard = false) {
  if (S.volet && S.volet.id === b.id) return closeVolet(true);
  closeVolet();
  hideTip();
  S.volet = { id: b.id, spec: b, opener: openerEl };
  openerEl.setAttribute("aria-expanded", "true");
  buildVolet(b);
  volet.hidden = false;
  placeVolet();
  const first = volet.querySelector('[aria-checked="true"]') || volet.querySelector("button, input");
  if (byKeyboard && first) first.focus({ preventScroll: true }); else volet.focus({ preventScroll: true });
}
function closeVolet(refocus = false) {
  if (!S.volet) return;
  const op = S.volet.opener; S.volet = null; V.updaters = []; S.padGuide = false;
  if (S.barSide) { S.barSide = null; later(() => placeBar(), 0); }
  volet.hidden = true; volet.replaceChildren();
  if (op && op.isConnected) { op.setAttribute("aria-expanded", "false"); if (refocus) { const t = op.closest(".fnum") ? op.closest(".fnum")._input : op; roving(t); t.focus(); } }
  drawWorld();
}
/** Le volet s'ouvre du côté opposé à la sélection, son ergot vers le bouton qui l'a ouvert ; s'il n'y tient pas, de
 *  l'autre côté de la barre, à condition de ne pas couvrir la sélection ; sinon à côté de la barre, sur sa rangée (le
 *  troisième recours du lot 4). Jamais sur l'objet qu'on règle. */
function placeVolet() {
  const v = S.volet; if (!v) return;
  const op = body.querySelector(`[data-id="${v.id}"]`) || v.opener; v.opener = op;
  const r = op.getBoundingClientRect(), bar = body.getBoundingClientRect(), z = zone(), w = volet.offsetWidth, h = volet.offsetHeight;
  const selBox = anchorBox(), barBelow = fbar.classList.contains("below");
  const cx = r.left + r.width / 2, x = clamp(cx - 22, z.left, z.right - w);
  const fits = (y) => y >= z.top && y + h <= z.bottom;
  const guard = [selBox, ...pathRects()];
  const clear = (bx, by) => guard.every((g) => overlap({ x: bx, y: by, w, h }, g) === 0);
  const tries = [{ y: barBelow ? bar.bottom + 8 : bar.top - 8 - h, below: barBelow }, { y: barBelow ? bar.top - 8 - h : bar.bottom + 8, below: !barBelow }];
  const xs = [x, clamp(bar.left, z.left, z.right - w), clamp(bar.right - w, z.left, z.right - w)];
  let place = null, px = x;
  for (const t of tries) { const hit = xs.find((cx2) => fits(t.y) && clear(cx2, t.y)); if (hit !== undefined) { place = t; px = hit; break; } }
  // pas de place du côté libre : la barre passe de l'autre côté de l'objet (une fois, à l'ouverture), le volet la suit
  if (!place && !S.barSide) {
    const room = barBelow ? selBox.y - 8 - BAR_H - 8 - z.top : z.bottom - (selBox.y + selBox.h + 8 + BAR_H + 8);
    if (room >= h) { S.barSide = barBelow ? "above" : "below"; placeBar(); return; }
  }
  if (place) {
    volet.classList.remove("beside");
    volet.classList.toggle("below", place.below);
    setVars(volet, { "--vx": `${Math.round(px)}px`, "--vy": `${Math.round(place.y)}px`, "--cx": `${Math.round(clamp(cx - px, 14, w - 14))}px` });
    return;
  }
  // à côté de la barre : à droite si la place le permet, sinon à gauche ; calé sur le haut de la barre (ou son bas)
  const right = bar.right + 8, left = bar.left - 8 - w;
  const by = clamp(barBelow ? bar.top : bar.bottom - h, z.top, z.bottom - h);
  const cands = [right, left, x].filter((c) => c >= z.left && c + w <= z.right);
  const bx = cands.find((c) => clear(c, by)) ?? cands[0] ?? clamp(right, z.left, z.right - w);
  volet.classList.add("beside"); volet.classList.remove("below");
  setVars(volet, { "--vx": `${Math.round(bx)}px`, "--vy": `${Math.round(by)}px` });
}
function updateVolet() { for (const u of V.updaters) u(); }

// ---------- les briques d'un volet ----------
function head(label, valueOf, previewOf, unit = "") {
  const h = html("div", "vhead", volet);
  html("span", "", h, label);
  const b = html("b", "", h);
  const show = (preview) => { const now = valueOf(); b.textContent = (preview !== undefined && preview !== now ? `${now} → ${preview}` : now) + (now === "mixte" && preview === undefined ? "" : unit); };
  show(); V.updaters.push(() => show());
  return { preview: (p) => show(previewOf ? previewOf(p) : p), reset: () => show() };
}
function radio(e, on) { e.setAttribute("role", "radio"); e.setAttribute("aria-checked", String(on)); }
/** Une rangée de choix exclusifs : des boutons de 28, le choix posé relevé. */
function choiceRow(parent, label, opts, current, pick, render, hd) {
  const row = html("div", "vrow", parent); row.setAttribute("role", "radiogroup"); row.setAttribute("aria-label", label); row.dataset.cols = String(opts.length);
  const btns = opts.map((o) => {
    const e = html("button", `vbtn${render.icon ? " icon" : ""}`, row); e.type = "button"; e.setAttribute("aria-label", o.label);
    render(e, o);
    e.addEventListener("click", () => pick(o.value));
    e.addEventListener("pointerenter", () => hd && hd.preview(o.label)); e.addEventListener("pointerleave", () => hd && hd.reset());
    e.addEventListener("focus", () => hd && hd.preview(o.label)); e.addEventListener("blur", () => hd && hd.reset());
    return [e, o];
  });
  const sync = () => { const c = current(); btns.forEach(([e, o]) => { radio(e, o.value === c); e.tabIndex = o.value === c ? 0 : -1; }); };
  sync(); V.updaters.push(sync);
  return row;
}
const vsep = () => html("div", "vsep", volet).setAttribute("role", "separator");

function buildVolet(b) {
  volet.replaceChildren(); V.updaters = [];
  volet.setAttribute("aria-label", b.label);
  volet.className = `fvolet hue-${effHue(sel1())}`;
  const v = b.volet;
  (VOLETS[v.type] || (() => {}))(v, b);
  html("span", "fvolet-caret", volet).setAttribute("aria-hidden", "true");
}
const VOLETS = {
  // la taille : seize valeurs proposées, celles des traitements de texte ; le champ de la barre reste la voie libre
  size(v) {
    const T = () => { const c = common(textItems(), (x) => x.t.size); return c === MIXED ? "mixte" : String(c); };
    const hd = head("taille", T, (p) => String(p), " px");
    const grid = html("div", "size-grid", volet); grid.setAttribute("role", "radiogroup"); grid.setAttribute("aria-label", "tailles proposées"); grid.dataset.cols = "4";
    const btns = SIZE_PRESETS.map((n) => {
      const e = html("button", "vbtn num", grid, String(n)); e.type = "button"; e.setAttribute("aria-label", `${n} pixels`);
      e.addEventListener("click", () => { editText({ size: n }, "commit"); });
      e.addEventListener("pointerenter", () => hd.preview(n)); e.addEventListener("pointerleave", () => hd.reset());
      e.addEventListener("focus", () => hd.preview(n));
      return [e, n];
    });
    const sync = () => { const c = common(textItems(), (x) => x.t.size); btns.forEach(([e, n]) => { radio(e, n === c); e.tabIndex = n === c ? 0 : -1; }); };
    sync(); V.updaters.push(sync);
  },
  // la police et sa graisse : chaque nom écrit dans sa police, chaque graisse dans sa graisse
  font() {
    const F = () => { const c = common(textItems(), (x) => x.t.font); return c === MIXED ? "mixte" : FONT_FR[c]; };
    head("police", F);
    const list = html("div", "", volet); list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", "police"); list.dataset.cols = "1";
    const items = ["sans", "mono"].map((f) => {
      const e = html("button", `vitem${f === "mono" ? " mono" : ""}`, list); e.type = "button"; e.setAttribute("aria-label", FONT_LONG[f]);
      html("span", "", e, f === "sans" ? "Inter" : "JetBrains Mono"); html("span", "vitem-sub", e, f === "sans" ? "sans empattement" : "chasse fixe");
      e.appendChild(lucide("check")).classList.add("vcheck");
      e.addEventListener("click", () => editText({ font: f }, "commit"));
      return [e, f];
    });
    const sync = () => { const c = common(textItems(), (x) => x.t.font); items.forEach(([e, f]) => { radio(e, f === c); e.tabIndex = f === c ? 0 : -1; }); };
    sync(); V.updaters.push(sync);
    vsep();
    const W = () => { const c = common(textItems(), (x) => x.t.weight); return c === MIXED ? "mixte" : WEIGHT_FR[c]; };
    const hd = head("graisse", W);
    const row = choiceRow(volet, "graisse", ["regular", "semibold", "bold"].map((w) => ({ value: w, label: WEIGHT_FR[w] })),
      () => common(textItems(), (x) => x.t.weight), (w) => editText({ weight: w }, "commit"),
      (e, o) => { e.textContent = o.label; e.classList.add("wide", `fw-${o.value}`); }, hd);
    row.classList.add("grow");
  },
  // la couleur du texte : l'encre du thème, la teinte de l'objet, ou l'une des douze teintes
  tcolor() {
    const C = () => { const c = common(textItems(), (x) => x.t.color); return c === MIXED ? "mixte" : colorFR(c); };
    const hd = head("couleur", C, (p) => colorFR(p));
    const list = html("div", "", volet); list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", "couleur du texte"); list.dataset.cols = "1";
    const objHue = effHue(sel1());
    const special = [["ink", "encre du thème", "ink"], ["hue", `teinte de l'objet`, `objhue hue-${objHue}`]].map(([val, label, cls]) => {
      const e = html("button", "vitem", list); e.type = "button"; e.setAttribute("aria-label", label);
      const dot = html("span", `swatch ${cls}`, e); dot.setAttribute("aria-hidden", "true"); setVars(dot, { "--sw": "18px" });
      html("span", "", e, label);
      e.appendChild(lucide("check")).classList.add("vcheck");
      e.addEventListener("click", () => editText({ color: val }, "commit"));
      e.addEventListener("pointerenter", () => hd.preview(val)); e.addEventListener("pointerleave", () => hd.reset());
      return [e, val];
    });
    vsep();
    const grid = html("div", "hue-grid", volet); grid.setAttribute("role", "radiogroup"); grid.setAttribute("aria-label", "teintes"); grid.dataset.cols = "6";
    const sws = HUES.map((h) => {
      const e = html("button", `swatch hue-${h}`, grid); e.type = "button"; e.setAttribute("aria-label", HUE_FR[h]);
      e.addEventListener("click", () => editText({ color: h }, "commit"));
      e.addEventListener("pointerenter", () => hd.preview(h)); e.addEventListener("pointerleave", () => hd.reset());
      return [e, h];
    });
    const sync = () => {
      const c = common(textItems(), (x) => x.t.color);
      for (const [e, val] of [...special, ...sws]) { radio(e, val === c); e.tabIndex = val === c ? 0 : -1; const k = e.querySelector(".lucide:not(.vcheck)"); if (k) k.remove(); if (val === c && e.classList.contains("swatch")) e.appendChild(lucide("check")); }
    };
    sync(); V.updaters.push(sync);
  },
  // la position du texte dans sa boîte : neuf cases qui se dessinent, puis la marge et l'interligne
  pos() {
    const P = () => { const v = common(textItems(), (x) => x.t.valign), h = common(textItems(), (x) => x.t.align); return v === MIXED || h === MIXED ? "mixte" : posFR(v, h); };
    const hd = head("position", P);
    const cols = html("div", "vcols", volet);
    posPad(cols, () => [common(textItems(), (x) => x.t.valign), common(textItems(), (x) => x.t.align)], ([vv, hh]) => editText({ valign: vv, align: hh }, "commit"), hd);
    html("div", "vsep-v", cols).setAttribute("role", "separator");
    const side = html("div", "pos-side", cols);
    const T = (k) => common(textItems(), (x) => x.t[k]);
    fieldRow("marge", numField({ id: "pad", label: "marge intérieure, en pixels", min: 0, max: 64, value: T("pad") === MIXED ? 8 : T("pad"), mixed: T("pad") === MIXED, fallback: 8, unit: "px",
      grip: G.pad, onChange: (val, phase) => editText({ pad: val }, phase), onHover: guide, onFocus: () => guide(true), onBlur: () => guide(false), onScrub: guide }), () => T("pad"), side);
    fieldRow("interligne", numField({ id: "lh", label: "interligne, en multiple de la taille", min: 100, max: 300, step: 5, big: 25, value: T("lh") === MIXED ? 135 : T("lh"), mixed: T("lh") === MIXED, fallback: 135, wide: true,
      format: (n) => (n / 100).toFixed(2).replace(".", ","), parse: (s) => Math.round(Number(String(s).replace(",", ".")) * 100), grip: G.lh, onChange: (val, phase) => editText({ lh: val }, phase) }), () => T("lh"), side);
  },
  // un tableau : l'alignement des cellules (le contrat n'aligne pas verticalement une cellule)
  talign() {
    const hd = head("alignement des cellules", () => ALIGN_FR[sel1().t.align]);
    choiceRow(volet, "alignement des cellules", ["left", "center", "right"].map((a) => ({ value: a, label: ALIGN_FR[a] })), () => sel1().t.align,
      (a) => editText({ align: a }, "commit"), Object.assign((e, o) => e.appendChild(lucide(`text-align-${{ left: "start", center: "center", right: "end" }[o.value]}`)), { icon: true }), hd);
  },
  // l'étiquette d'un connecteur : où sur le tracé (départ, milieu, arrivée, ou n'importe quel pourcentage), et de quel côté
  along() {
    const c = sel1();
    const hd = null; head("étiquette", () => `${c.labelAt} % · ${SIDE_FR[c.labelSide]}`);
    const r1 = html("div", "vrow", volet); html("span", "vlabel", r1, "repère");
    choiceRow(r1, "repère sur le tracé", [{ value: 10, label: "départ" }, { value: 50, label: "milieu" }, { value: 90, label: "arrivée" }], () => c.labelAt,
      (n) => editConn({ labelAt: n }, "commit"), (e, o) => { e.textContent = o.label; e.classList.add("wide"); }, hd);
    fieldRow("position", numField({ id: "along", label: "place de l'étiquette sur le tracé, en pourcent", min: 0, max: 100, value: c.labelAt, unit: "%", grip: G.along, onChange: (n, phase) => editConn({ labelAt: n }, phase) }), () => c.labelAt);
    const r3 = html("div", "vrow", volet); html("span", "vlabel", r3, "côté");
    choiceRow(r3, "côté du tracé", ["above", "on", "below"].map((s) => ({ value: s, label: SIDE_FR[s] })), () => c.labelSide,
      (s) => editConn({ labelSide: s }, "commit"), (e, o) => { e.textContent = o.label; e.classList.add("wide"); }, hd);
  },
  // l'étiquette d'un groupe : neuf positions, dedans ou dehors (déjà dans le contrat)
  gpos() {
    const g = sel1();
    const hd = head("étiquette", () => `${posFR(...g.labelPos)} · ${g.placement === "inside" ? "dedans" : "dehors"}`);
    const cols = html("div", "vcols", volet);
    posPad(cols, () => g.labelPos, (p) => editConn({ labelPos: p }, "commit"), hd);
    html("div", "vsep-v", cols).setAttribute("role", "separator");
    const side = html("div", "pos-side", cols);
    choiceRow(side, "dedans ou dehors", [{ value: "inside", label: "dedans" }, { value: "outside", label: "dehors" }], () => g.placement,
      (p) => editConn({ placement: p }, "commit"), (e, o) => { e.textContent = o.label; e.classList.add("wide"); }, hd);
  },
  hue(v) {
    const its = v.ids.map(item), effs = () => its.map(effHue);
    const shown = () => { const e = effs(); return e.every((h) => h === e[0]) ? e[0] : null; };
    const hd = head("teinte", () => (shown() ? HUE_FR[shown()] : "mixte"), (p) => HUE_FR[p] || p);
    const grid = html("div", "hue-grid", volet); grid.setAttribute("role", "radiogroup"); grid.setAttribute("aria-label", "teinte"); grid.dataset.cols = "6";
    const sws = HUES.map((h) => {
      const e = html("button", `swatch hue-${h}`, grid); e.type = "button"; e.setAttribute("aria-label", HUE_FR[h]);
      e.addEventListener("pointerenter", () => hd.preview(h)); e.addEventListener("pointerleave", () => hd.reset()); e.addEventListener("focus", () => hd.preview(h));
      e.addEventListener("click", () => { remember(); v.ids.forEach((id) => { item(id).hue = h; }); refreshLight(); });
      return [e, h];
    });
    const sync = () => { const c = shown(); sws.forEach(([e, h]) => { radio(e, c === h); e.tabIndex = (c || "blue") === h ? 0 : -1; e.replaceChildren(); if (c === h) e.appendChild(lucide("check")); }); };
    sync(); V.updaters.push(sync);
  },
  seg(v, b) {
    const it = sel1(), cur = () => (v.key === "style" ? it.style : it[v.key]);
    const lab = (val) => (v.opts.find((o) => o[0] === val) || [0, String(val)])[1];
    const hd = head(b.label, () => lab(cur()));
    choiceRow(volet, b.label, v.opts.map(([value, label]) => ({ value, label })), cur, (val) => { remember(); it[v.key] = val; refreshLight(); },
      Object.assign((e, o) => { if (v.icons) { e.appendChild(lucide(v.icons[o.value])); html("span", "", e, o.label); } else if (v.faceOf) { e.appendChild(v.faceOf(o.value)); e.classList.add("icon"); } else e.textContent = o.label; }, {}), hd);
  },
  align(v) {
    head("aligner et répartir", () => `${v.count} éléments`);
    const grid = html("div", "align-grid", volet); grid.setAttribute("role", "group"); grid.dataset.cols = v.count >= 3 ? "4" : "3";
    for (const row of ALIGN_ROWS) for (const m of row) {
      if ((m === "dh" || m === "dv") && v.count < 3) continue;
      const { icon, label, keys } = ALIGN_MODE[m];
      const c = html("button", `vbtn icon${m[0] === "d" ? " dist" : ""}`, grid); c.type = "button"; c.setAttribute("aria-label", label);
      c.appendChild(lucide(icon));
      const show = () => tipNear(c, label, keys, volet.getBoundingClientRect(), volet.classList.contains("below"));
      c.addEventListener("pointerenter", show); c.addEventListener("pointerleave", hideTip);
      c.addEventListener("click", () => { hideTip(); align(m); });
    }
  },
  groups() {
    head("grouper", () => "");
    const list = html("div", "", volet); list.dataset.cols = "1"; list.setAttribute("role", "menu");
    const add = (icon, text, act) => { const m = html("button", "vitem", list); m.type = "button"; m.setAttribute("role", "menuitem"); m.appendChild(lucide(icon)); html("span", "", m, text); m.addEventListener("click", act); };
    add("group", "nouveau groupe", () => { closeVolet(); say("groupe créé (simulé)"); });
    for (const g of [...S.items.values()].filter((x) => x.kind === "group")) add("square-dashed-mouse-pointer", `ajouter à ${g.label}`, () => { closeVolet(); say(`ajouté à ${g.label} (simulé)`); });
  },
};
const BOX_MODES = [["left", "align-start-vertical", "aligner à gauche", "Alt+A"], ["center", "align-center-vertical", "centrer horizontalement", "Alt+H"], ["right", "align-end-vertical", "aligner à droite", "Alt+D"],
  ["top", "align-start-horizontal", "aligner en haut", "Alt+W"], ["middle", "align-center-horizontal", "centrer verticalement", "Alt+V"], ["bottom", "align-end-horizontal", "aligner en bas", "Alt+S"]];
const DIST = [["dh", "align-horizontal-space-around", "répartir horizontalement", "Alt+Maj+H"], ["dv", "align-vertical-space-around", "répartir verticalement", "Alt+Maj+V"]];
const ALIGN_ROWS = [["left", "center", "right", "dh"], ["top", "middle", "bottom", "dv"]];
const ALIGN_MODE = Object.fromEntries([...BOX_MODES, ...DIST].map(([m, icon, label, keys]) => [m, { icon, label, keys }]));

/** Les neuf cases de la position : chacune dessine trois lignes posées comme elles le seront. */
function posPad(parent, current, pick, hd) {
  const pad = html("div", "pos-pad", parent); pad.setAttribute("role", "radiogroup"); pad.setAttribute("aria-label", "position"); pad.dataset.cols = "3";
  const cells = POS9.map(([v, h]) => {
    const c = html("button", "pos-cell", pad); c.type = "button"; c.setAttribute("aria-label", posFR(v, h));
    c.appendChild(posMini(v, h, 28, 20, true));
    c.addEventListener("click", () => pick([v, h]));
    c.addEventListener("pointerenter", () => hd.preview(posFR(v, h))); c.addEventListener("pointerleave", () => hd.reset());
    c.addEventListener("focus", () => hd.preview(posFR(v, h))); c.addEventListener("blur", () => hd.reset());
    return [c, v, h];
  });
  const sync = () => { const [v, h] = current(); cells.forEach(([c, cv, ch]) => { const on = cv === v && ch === h; radio(c, on); c.tabIndex = on ? 0 : -1; }); };
  sync(); V.updaters.push(sync);
}
function fieldRow(label, field, valueOf, parent = volet) {
  const row = html("div", "vrow", parent);
  html("span", "vlabel", row, label);
  row.appendChild(field);
  V.updaters.push(() => { const v = valueOf(); field._set(v === MIXED ? field._input.value : v, v === MIXED); });
}
function guide(on) { S.padGuide = !!on; drawWorld(); }
