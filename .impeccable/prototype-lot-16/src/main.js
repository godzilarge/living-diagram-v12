// ---------- les actions ----------
// Une entrée d'historique par geste : un glissé de la poignée en fait une seule ; une rafale de ↑↓ ou de clics sur le
// même réglage (moins de 0,8 s d'écart) aussi.
let liveOpen = false, burst = { key: "", at: 0 };
function historyFor(key, phase) {
  if (phase === "live") { if (!liveOpen) { remember(); liveOpen = true; } return; }
  if (liveOpen) { liveOpen = false; return; }
  const now = performance.now();
  if (burst.key !== key || now - burst.at > 800) remember();
  burst = { key, at: now };
}
function editText(patch, phase) {
  const its = textItems(); if (!its.length) return;
  historyFor("t:" + Object.keys(patch).join(), phase);
  for (const it of its) Object.assign(it.t, patch);
  refreshLight();
}
function editConn(patch, phase) { historyFor("c:" + Object.keys(patch).join(), phase); Object.assign(sel1(), patch); refreshLight(); }
function toggleText(k) {
  const its = textItems(); if (!its.length) return;
  remember();
  if (k === "bold") { const all = its.every((x) => x.t.weight !== "regular"); its.forEach((x) => { x.t.weight = all ? "regular" : "bold"; }); }
  else { const all = its.every((x) => x.t[k]); its.forEach((x) => { x.t[k] = !all; }); }
  refreshLight();
}
/** Ctrl+Maj+> et < : la taille proposée suivante ou précédente (comme les traitements de texte). */
function stepSize(dir) {
  const its = textItems(); if (!its.length) return;
  remember();
  for (const it of its) {
    const s = it.t.size, next = dir > 0 ? SIZE_PRESETS.find((p) => p > s) : [...SIZE_PRESETS].reverse().find((p) => p < s);
    it.t.size = next ?? s;
  }
  const c = common(its, (x) => x.t.size);
  say(`taille du texte : ${c === MIXED ? "mixte" : c + " px"}`);
  refreshLight();
}
function edit(fn) { remember(); for (const id of S.sel) fn(item(id)); refresh(); }
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
function align(mode) {
  const its = S.sel.map(item).filter((x) => x.kind !== "connector" && x.kind !== "group");
  const U = union(its.map(boxOf));
  remember();
  if (mode === "dh" || mode === "dv") {
    const h = mode === "dh", list = [...its].sort((a, b) => a[h ? "x" : "y"] - b[h ? "x" : "y"]), size = list.reduce((s, b) => s + (h ? b.w : b.h), 0);
    const gap = ((h ? U.w : U.h) - size) / (list.length - 1); let at = h ? U.x : U.y;
    for (const b of list) { if (h) b.x = Math.round(at); else b.y = Math.round(at); at += (h ? b.w : b.h) + gap; }
  } else for (const b of its) {
    if (mode === "left") b.x = U.x; if (mode === "right") b.x = U.x + U.w - b.w; if (mode === "center") b.x = Math.round(U.x + U.w / 2 - b.w / 2);
    if (mode === "top") b.y = U.y; if (mode === "bottom") b.y = U.y + U.h - b.h; if (mode === "middle") b.y = Math.round(U.y + U.h / 2 - b.h / 2);
  }
  say(`${its.length} éléments alignés`); refresh();
}
// l'édition en place : double-clic sur une note (son texte) ou une forme (son étiquette)
function editInPlace() {
  const it = sel1(); if (!it || !["note", "shape"].includes(it.kind)) return;
  const input = $("#inplace"), b = toScreen(boxOf(it));
  setVars(input, { "--ix": `${b.x}px`, "--iy": `${b.y}px`, "--iw": `${b.w}px`, "--ih": `${b.h}px` });
  input.value = it.kind === "note" ? it.text : it.label; input.hidden = false; S.editing = it.id; drawWorld(); placeBar();
  input.focus(); input.select();
}
function endEdit(commit) {
  const input = $("#inplace"), id = S.editing; if (!id) return;
  S.editing = null;
  const it = item(id), key = it.kind === "note" ? "text" : "label", v = input.value.replace(/\s+$/, "");
  if (commit && v && v !== it[key]) { remember(); it[key] = v; }
  input.hidden = true; refresh();
  later(() => placeBar(true), 120);
  focusToile();
}

// ---------- l'arrière-plan : barre d'outils, panneau, statut ----------
function renderToolbar() {
  const tb = $("#toolbar"); tb.replaceChildren();
  const tool = (icon, label, act, disabled = false) => { const b = html("button", "tbtn", tb); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.disabled = disabled; b.appendChild(lucide(icon)); if (act) b.addEventListener("click", act); return b; };
  const sep = () => html("span", "toolbar-sep", tb);
  tool("undo-2", "annuler · Ctrl+Z", undo, !S.past.length); tool("redo-2", "rétablir · Ctrl+Y", redo, !S.future.length); sep();
  tool("maximize", "cadrer tout", () => { S.view = { x: 0, y: 0, z: 1 }; refresh(); }); tool("crosshair", "centrer sur la sélection", null, !S.sel.length); sep();
  tool("sticky-note", "insérer une note"); tool("square", "insérer un rectangle"); tool("circle", "insérer une ellipse");
  tool("table", "insérer un tableau"); tool("move-up-right", "outil connecteur · C"); tool("image", "insérer une image");
  if (S.sel.length >= 2) { sep(); const p = html("span", "pill tone-accent toolbar-count", tb, String(S.sel.length)); p.title = `${S.sel.length} éléments sélectionnés`; tool("x", "vider la sélection · Échap", () => { S.sel = []; refresh(); }); }
}
function renderPanel() {
  const panel = $("#panel"), app = $("#app");
  const its = S.sel.map(item).filter(Boolean);
  const show = (its.length > 0 || !!S.special) && !its.some((x) => x.draft);
  const wide = show && its.length === 1 && its[0].kind === "code" && S.wide;
  panel.hidden = !show; app.classList.toggle("has-panel", show); panel.classList.toggle("wide", wide); app.classList.toggle("has-wide-panel", wide);
  if (!show) return;
  const keepScroll = panel.querySelector("pre") ? panel.querySelector("pre").scrollTop : 0;
  panel.replaceChildren();
  const headEl = html("div", "insp-head", panel), top = html("div", "insp-bar", headEl);
  const kind = html("span", "insp-kind", top);
  const close = html("button", "insp-close", top); close.setAttribute("aria-label", "fermer"); close.appendChild(lucide("x")); close.addEventListener("click", () => { S.sel = []; S.special = null; refresh(); });
  let title = "", meta = "", sections = [], mono = false;
  if (S.special) {
    kind.append(lucide(S.special.kind === "cluster" ? "group" : "workflow"), document.createTextNode(S.special.kind === "cluster" ? "Cluster HA" : "Câble"));
    title = S.special.kind === "cluster" ? "dc01-edge" : S.special.ends.map((id) => item(id).name).join(" — "); mono = true;
    meta = S.special.kind === "cluster" ? "actif-passif · 2 membres" : "câble · Eth1/49 — Eth1/1"; sections = ["Bouts", "Ports"];
  } else if (its.length > 1) {
    kind.append(lucide("square-dashed-mouse-pointer"), document.createTextNode("Sélection"));
    title = `${its.length} éléments`; meta = its.map((x) => ({ note: "note", shape: "forme", table: "tableau", connector: "connecteur", group: "groupe", device: "équipement" }[x.kind])).join(", ");
    sections = ["Apparence", "Texte", "Éléments"];
  } else {
    const it = its[0];
    const K = { code: ["code", "Bloc de code"], note: ["sticky-note", "Note"], shape: ["square", "Forme"], table: ["table", "Tableau"], connector: ["move-up-right", "Flèche"], group: ["group", "Groupe"], device: ["workflow", `${TYPE_FR[it.type] || ""} · dc01`] }[it.kind];
    kind.append(lucide(K[0]), document.createTextNode(K[1].charAt(0).toUpperCase() + K[1].slice(1)));
    if (it.kind === "device") { title = it.name; mono = true; meta = "cisco N9K-C93180YC-FX · NX-OS 10.4.2"; sections = ["Identité", "Câbles", "Interfaces", "Apparence"]; }
    else if (it.kind === "code") { title = it.title || "Bloc sans titre"; meta = `${it.anchor ? `attaché à ${item(it.anchor).name}` : "libre"} · orhan · 14/10 15:02`; sections = []; }
    else if (it.kind === "group") { title = it.label; meta = `${it.members.length} membres · orhan`; sections = ["Membres", "Apparence", "Étiquette"]; }
    else { title = it.kind === "note" ? it.text.split("\n")[0] : it.kind === "table" ? "Tableau" : it.label; meta = "libre · orhan · 2026-10-14 13:01 UTC"; sections = ["Contenu", "Position", "Forme", "Texte"]; }
  }
  const t = html("h2", `insp-title${mono ? " mono" : ""}`, headEl, title); t.setAttribute("aria-level", "2");
  html("p", "insp-meta", headEl, meta);
  for (const s of sections) { const r = html("div", "insp-section", panel, s); r.appendChild(lucide("chevron-down")); }
  if (its.length === 1 && its[0].kind === "code") { codeFiche(panel, its[0]); const pre = panel.querySelector("pre"); if (pre) pre.scrollTop = keepScroll; }
}
let statusTimer = 0;
function say(msg) { const s = $("#status"); s.textContent = msg; s.classList.add("on"); clearTimeout(statusTimer); statusTimer = later(() => s.classList.remove("on"), 2400); }

function refresh() {
  drawWorld(); renderToolbar(); renderPanel(); renderBar(); placeBar();
  if (S.volet) { if (!body.querySelector(`[data-id="${S.volet.id}"]`)) closeVolet(); else { updateVolet(); placeVolet(); } }
}
/** Après un réglage : la toile, l'état de la barre et du volet, sans rien reconstruire (un glissé reste tenu). */
function refreshLight() { drawWorld(); renderToolbar(); renderBar(); placeBar(); if (S.volet) { updateVolet(); placeVolet(); } }

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
  if (S.editing) { if (item(S.editing) && item(S.editing).kind === "code") { if (!S.warn) commitCode(); return; } endEdit(true); }
  closeVolet(); hideTip();
  const act = e.target.closest && e.target.closest("[data-act]");
  if (act) {
    const it = item(act.dataset.for || act.closest("[data-id]").dataset.id), a = act.dataset.act;
    S.special = null; if (!S.sel.includes(it.id)) S.sel = [it.id];
    toile.setPointerCapture(e.pointerId);
    press = { kind: "none" };
    if (a === "copy") copyCode(it);
    // la barre de défilement : le pouce se glisse, la piste avance d'une page vers le pointeur
    if (a === "thumb") { const B = codeBox(it); press = { kind: "scroll", id: it.id, y0: e.clientY, first: B.first, perPx: B.maxFirst / Math.max(1, (it.h - CODE.HEAD - B.foot - 8) * S.view.z * (1 - B.visible / B.total)) }; }
    if (a === "track") { const B = codeBox(it), thumbMid = toScreen(boxOf(it)).y + (CODE.HEAD + 4 + (it.h - CODE.HEAD - B.foot - 8) * (B.maxFirst ? B.first / B.maxFirst : 0)) * S.view.z; scrollCode(it, (e.clientY < thumbMid ? -1 : 1) * Math.max(1, B.visible - 1)); }
    if (a.startsWith("resize-") && !it.locked) { press = { kind: "resize", id: it.id, dir: a.slice(7), x0: e.clientX, y0: e.clientY, box: { x: it.x, y: it.y, w: it.w, h: it.h }, moved: false }; S.gesture = true; }
    refresh(); return;
  }
  const hit = pick(e.target);
  toile.setPointerCapture(e.pointerId);
  if (hit && hit.special) { S.sel = []; S.special = hit.special; press = { kind: "none" }; refresh(); return; }
  if (hit) {
    S.special = null;
    if (e.shiftKey) S.sel = S.sel.includes(hit.id) ? S.sel.filter((x) => x !== hit.id) : [...S.sel, hit.id];
    else if (!S.sel.includes(hit.id)) S.sel = [hit.id];
    const moving = new Set();
    for (const id of S.sel) { const it = item(id); if (!it || it.locked || it.kind === "connector") continue; if (it.kind === "group") it.members.forEach((m) => moving.add(m)); else moving.add(id); }
    // un bloc attaché suit son équipement (comme une annotation attachée de l'application)
    for (const it of S.items.values()) if (it.kind === "code" && it.anchor && moving.has(it.anchor) && !it.locked) moving.add(it.id);
    press = { kind: "drag", x0: e.clientX, y0: e.clientY, moved: false, from: new Map([...moving].map((id) => [id, { x: item(id).x, y: item(id).y }])) };
    refresh();
  } else press = { kind: "pan", x0: e.clientX, y0: e.clientY, vx: S.view.x, vy: S.view.y, moved: false };
  focusToile();
});
addEventListener("pointermove", (e) => { S.pointer = e.target === toile || toile.contains(e.target) ? { x: e.clientX, y: e.clientY } : null; }, { passive: true });
toile.addEventListener("pointermove", (e) => {
  if (!press || press.kind === "none") return;
  const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
  if (press.kind === "scroll") { const it = item(press.id); it.scroll = Math.round(press.first + dy * press.perPx); clampScroll(it); drawWorld(); return; }
  if (press.kind === "resize") { if (!press.moved) { remember(); press.moved = true; } resizeCode(item(press.id), press, dx / S.view.z, dy / S.view.z); drawWorld(); placeBar(); return; }
  if (!press.moved && Math.hypot(dx, dy) < 3) return;
  if (!press.moved && press.kind === "drag") { remember(); S.gesture = true; placeBar(); }
  press.moved = true;
  if (press.kind === "pan") { toile.classList.add("panning"); S.view.x = press.vx + dx; S.view.y = press.vy + dy; drawWorld(); placeBar(); return; }
  for (const [id, p] of press.from) { const it = item(id); it.x = Math.round((p.x + dx / S.view.z) / 4) * 4; it.y = Math.round((p.y + dy / S.view.z) / 4) * 4; }
  drawWorld();
});
toile.addEventListener("pointerup", () => {
  if (!press) return;
  const was = press; press = null; toile.classList.remove("panning");
  if (was.kind === "pan" && !was.moved) { S.sel = []; S.special = null; refresh(); return; }
  if (was.kind === "resize") { S.gesture = false; refresh(); later(() => placeBar(true), 120); return; }
  if (was.kind === "drag" && was.moved) { S.gesture = false; refresh(); fbar.classList.add("suspended"); later(() => placeBar(true), 120); return; }
  refresh();
});
toile.addEventListener("dblclick", (e) => {
  if (e.target.closest && e.target.closest("[data-act]")) return;
  const it = sel1();
  if (it && it.kind === "code" && !S.readonly) {
    // sur l'en-tête : le titre (dans la fiche) ; ailleurs : le code
    if (e.clientY - toScreen(boxOf(it)).y < CODE.HEAD * S.view.z) { const t = document.querySelector(".insp-title-row input"); if (t) { t.focus(); t.select(); } return; }
    return codeEdit(it);
  }
  editInPlace();
});
toile.addEventListener("wheel", (e) => {
  e.preventDefault();
  // la molette fait défiler le code d'un bloc sélectionné seul (ou en édition) quand le pointeur est sur lui ; ailleurs,
  // et avec Ctrl toujours, elle zoome la toile (D2). Arrivé en haut ou en bas, rien ne passe à la toile.
  const over = e.target.closest && e.target.closest(".kind-code"), it = over && item(over.dataset.id);
  if (it && !e.ctrlKey && S.sel.length === 1 && S.sel[0] === it.id && codeBox(it).scrolls) {
    wheelAcc += e.deltaMode === 1 ? e.deltaY * codeLineH(it.t.size) : e.deltaY;
    const lines = Math.trunc(wheelAcc / (codeLineH(it.t.size) * S.view.z));
    if (lines) { wheelAcc -= lines * codeLineH(it.t.size) * S.view.z; scrollCode(it, lines); }
    return;
  }
  const k = Math.exp(-e.deltaY * 0.0015), z = clamp(S.view.z * k, 0.4, 2.5), r = z / S.view.z;
  S.view.x = e.clientX - (e.clientX - S.view.x) * r; S.view.y = e.clientY - (e.clientY - S.view.y) * r; S.view.z = z;
  drawWorld(); placeBar();
}, { passive: false });

let wheelAcc = 0;
function clampScroll(it) { const B = codeBox({ ...it, scroll: 0 }); it.scroll = clamp(Math.round(it.scroll), 0, Math.max(0, B.total - B.visible)); }
/** Faire défiler un bloc de `n` lignes (état de vue : ni historique, ni document). */
function scrollCode(it, n) { const before = it.scroll; it.scroll += n; clampScroll(it); if (it.scroll !== before) drawWorld(); }
/** Redimensionner un bloc : la poignée tirée bouge son bord, l'autre reste ; aimant à la grille de 20. */
function resizeCode(it, p, dx, dy) {
  const g = CODE.GRID, b = p.box, minW = 240, minH = CODE.HEAD + 2 * CODE.PAD + 3 * codeLineH(it.t.size);
  const snap = (v) => Math.round(v / g) * g;
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  if (p.dir.includes("w")) x0 = Math.min(snap(b.x + dx), x1 - minW);
  if (p.dir.includes("e")) x1 = Math.max(snap(b.x + b.w + dx), x0 + minW);
  if (p.dir.includes("n")) y0 = Math.min(snap(b.y + dy), y1 - minH);
  if (p.dir.includes("s")) y1 = Math.max(snap(b.y + b.h + dy), y0 + minH);
  Object.assign(it, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); clampScroll(it);
}

// ---------- le clavier ----------
addEventListener("keydown", (e) => {
  const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (e.target.id === "inplace") { if (e.key === "Escape") endEdit(false); if (e.key === "Enter" && (e.ctrlKey || sel1().kind === "shape")) { e.preventDefault(); endEdit(true); } return; }
  const ctrl = e.ctrlKey || e.metaKey;
  // la mise en forme, d'où que vienne le focus (la toile, la barre, un volet) : celle des traitements de texte
  if (ctrl && !e.altKey && (e.key === ">" || e.key === "<")) { e.preventDefault(); return stepSize(e.key === ">" ? 1 : -1); }
  if (ctrl && !inField && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "b" && !e.shiftKey) { e.preventDefault(); return toggleText("bold"); }
    if (k === "i" && !e.shiftKey) { e.preventDefault(); return toggleText("italic"); }
    if (k === "u" && !e.shiftKey) { e.preventDefault(); return toggleText("underline"); }
    if (k === "x" && e.shiftKey) { e.preventDefault(); return toggleText("strike"); }
  }
  if (e.altKey && e.code === "KeyT") { e.preventDefault(); const first = tabStops().find((s) => s.tabIndex === 0) || tabStops()[0]; if (first && !fbar.hidden) { hideTip(); first.focus(); } return; }
  if (e.key === "Shift" && !e.repeat && !inField && !S.volet && !body.contains(e.target)) { S.shift = true; placeBar(); return; }
  if (volet.contains(e.target)) return voletKeys(e);
  if (body.contains(e.target)) return barKeys(e);
  if (inField) return;
  if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (ctrl && e.key.toLowerCase() === "y") { e.preventDefault(); return redo(); }
  if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); return duplicate(); }
  { const it = S.sel.length === 1 && sel1(); if (it && it.kind === "code" && ["PageUp", "PageDown", "Home", "End"].includes(e.key)) {
    e.preventDefault(); const B = codeBox(it), page = Math.max(1, B.visible - 1);
    return scrollCode(it, { PageUp: -page, PageDown: page, Home: -B.total, End: B.total }[e.key]);
  } }
  if (e.key === "Delete" || e.key === "Backspace") { if (S.sel.length) remove(); return; }
  if ((e.key === "Enter" || e.key === "F2") && S.sel.length === 1) { e.preventDefault(); const it = sel1(); return it && it.kind === "code" ? (S.readonly ? null : codeEdit(it)) : editInPlace(); }
  if (e.key === "Escape" && (S.sel.length || S.special)) { S.sel = []; S.special = null; refresh(); }
});
addEventListener("keyup", (e) => { if (e.key === "Shift" && S.shift) { S.shift = false; later(() => placeBar(true), 120); } });
addEventListener("blur", () => { if (S.shift) { S.shift = false; placeBar(); } });
function barKeys(e) {
  const stops = tabStops(), i = stops.indexOf(document.activeElement);
  const go = (j) => { const t = stops[(j + stops.length) % stops.length]; roving(t); t.focus(); if (!t._input && t.matches(".fb")) showTip(t, t._spec); };
  const input = e.target instanceof HTMLInputElement ? e.target : null;
  if (input && e.altKey && e.key === "ArrowDown") { e.preventDefault(); const f = input.closest(".fnum"); if (f && f._open) toggleVolet({ id: "size-open", label: "taille du texte", volet: { type: "size" } }, f._open, true); return; }
  if (input && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    // dans le nombre, les flèches déplacent le curseur ; au bord (ou tout sélectionné), elles passent au contrôle voisin
    const all = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    const atEdge = e.key === "ArrowLeft" ? input.selectionStart === 0 : input.selectionEnd === input.value.length;
    if (!all && !atEdge) return;
  }
  if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  else if (e.key === "Home" && !input) { e.preventDefault(); go(0); }
  else if (e.key === "End" && !input) { e.preventDefault(); go(stops.length - 1); }
  else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !input) { const b = stops[i]; if (b && b._spec && b._spec.volet) { e.preventDefault(); toggleVolet(b._spec, b, true); } }
  else if (e.key === "Escape") { e.preventDefault(); hideTip(); focusToile(); }
}
function voletKeys(e) {
  if (e.key === "Escape") { e.preventDefault(); return closeVolet(true); }
  const focusables = [...volet.querySelectorAll("button:not(.fnum-grip):not(.fnum-open), input")];
  if (e.key === "Tab") { e.preventDefault(); const i = focusables.indexOf(document.activeElement); focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus(); return; }
  if (e.target instanceof HTMLInputElement) return;
  const group = e.target.closest("[data-cols]"); if (!group) return;
  const opts = [...group.querySelectorAll(":scope > button")], i = opts.indexOf(document.activeElement), cols = Number(group.dataset.cols) || 1;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
  if (!step) return;
  e.preventDefault();
  const t = opts[clamp(i + step, 0, opts.length - 1)]; if (t) t.focus();
}
addEventListener("pointerdown", (e) => {
  if (S.volet && !volet.contains(e.target) && !(e.target.closest && e.target.closest(`[data-id="${S.volet.id}"]`))) closeVolet();
}, { capture: true });
$("#inplace").addEventListener("blur", () => endEdit(true));
addEventListener("resize", () => { refresh(); placeWarn(); });

// ---------- les réglages du prototype ----------
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll("[data-theme-pick]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themePick === t)));
  const tb = $("#theme-btn"); tb.replaceChildren(lucide(t === "dark" ? "sun" : "moon")); tb.setAttribute("aria-label", t === "dark" ? "thème clair" : "thème sombre");
}
function setVolets(v) { $("#app").dataset.volets = v; document.querySelectorAll("[data-volets-pick]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.voletsPick === v))); if (S.volet) placeVolet(); }
document.querySelectorAll("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themePick)));
document.querySelectorAll("[data-volets-pick]").forEach((b) => b.addEventListener("click", () => setVolets(b.dataset.voletsPick)));
$("#theme-btn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
document.querySelectorAll("[data-paste]").forEach((b) => b.addEventListener("click", () => window.proto.paste(b.dataset.paste)));
$("#readonly").addEventListener("change", (e) => { S.readonly = e.target.checked; say(S.readonly ? "sans nom : lecture seule, pas de barre" : "écriture rétablie"); refresh(); });
$("#proto-help-btn").addEventListener("click", (e) => { const h = $("#proto-help"); h.hidden = !h.hidden; e.currentTarget.setAttribute("aria-expanded", String(!h.hidden)); });
document.querySelectorAll("[data-icon]").forEach((el) => el.prepend(lucide(el.dataset.icon)));

// une petite porte pour les captures (scripts/capture.py)
const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
window.proto = {
  state: S, select(ids) { S.special = null; S.sel = ids; refresh(); }, center(id) { return toScreen(boxOf(item(id))); },
  button(id) { return rectOf(body.querySelector(`[data-id="${id}"]`)); }, open(id) { return rectOf(body.querySelector(`[data-id="${id}"] .fnum-open`)); },
  grip(id) { return rectOf(document.querySelector(`[data-id="${id}"] .fnum-grip`)); },
  inVoletStart(label) { return rectOf([...volet.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || "").startsWith(label))); },
  inVolet(label) { return rectOf([...volet.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === label)); },
  view(x, y, z) { S.view = { x, y, z }; refresh(); }, theme: setTheme, volets: setVolets,
  paste(name) { pasteText({ cisco: PASTE_CISCO, fortios: PASTE_FORTIOS, python: SAMPLE_PYTHON }[name]); },
  inWarn(label) { return rectOf([...warn.querySelectorAll("button")].find((x) => x.textContent.startsWith(label))); },
  thumb(id) { return rectOf(document.querySelector(`[data-id="${id}"] .code-thumb`)); },
  scroll(id, n) { item(id).scroll = n; clampScroll(item(id)); drawWorld(); },
  editor() { return rectOf(codeEditor); },
  chrome(on) { document.querySelector(".proto").hidden = !on; },
  openFiche(name) { S.ficheOpen.add(name); refresh(); },
  set(id, patch) { Object.assign(item(id), patch); refresh(); }, wide(on) { S.wide = on; refresh(); },
  labelOf(id) { const it = item(id); return it && labelPlace(it); },
};
