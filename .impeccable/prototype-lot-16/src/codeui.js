// ---------- le bloc de code : les actions, l'écriture, l'avertissement, le collage, la fiche ----------

/** Un réglage d'un bloc (ou de tous les blocs sélectionnés) : une entrée d'historique. */
function editCode(fn) { remember(); for (const x of codeItems()) fn(x); refresh(); } // la fiche suit (parité)
function editCodeSize(v, phase) { historyFor("code:size", phase); for (const x of codeItems()) x.t.size = v; refreshLight(); }

/** Copier : le texte tel qu'enregistré (une valeur retirée reste retirée) ; l'icône passe à la coche 1,2 s. */
let copiedTimer = 0;
async function copyCode(it) {
  let ok = true;
  try { await navigator.clipboard.writeText(it.text); } catch { ok = fallbackCopy(it.text); }
  S.copied = ok ? it.id : null; clearTimeout(copiedTimer);
  copiedTimer = later(() => { S.copied = null; refreshLight(); }, 1200);
  say(ok ? `copié : ${it.text.split("\n").length} lignes${it.title ? ` de ${it.title}` : ""}` : "copie refusée par le navigateur : sélectionnez le texte dans la fiche");
  refreshLight();
}
function fallbackCopy(text) {
  const t = html("textarea", "", document.body); t.value = text; t.setAttribute("aria-hidden", "true"); t.className = "offscreen"; t.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
  t.remove(); return ok;
}

// ---------- l'écriture en place : un textarea en chasse fixe posé sur la zone du code ----------
const codeEditor = $("#code-edit"), editHint = $("#code-edit-hint"), editGutter = $("#code-edit-gutter"), editNums = editGutter.firstElementChild;
/** La gouttière de l'éditeur : les numéros des lignes écrites, défilant avec le texte, et un point sur chaque ligne
 *  signalée tant que l'avertissement est ouvert. Construite par textContent. */
function syncGutter() {
  if (codeEditor.hidden || editGutter.hidden) return;
  const n = codeEditor.value.split("\n").length, flagged = new Set(S.warn ? S.warn.found.map((f) => f.line) : []);
  if (editNums.childElementCount !== n || editNums.dataset.flags !== [...flagged].join()) {
    editNums.replaceChildren();
    for (let i = 0; i < n; i++) html("div", flagged.has(i) ? "flag" : "", editNums, String(i + 1));
    editNums.dataset.flags = [...flagged].join();
  }
  setVars(editNums, { "--gs": `${-codeEditor.scrollTop}px` });
}
codeEditor.addEventListener("input", syncGutter);
codeEditor.addEventListener("scroll", syncGutter);
function codeEdit(it, prefill) {
  if (it.locked) return say("bloc verrouillé : déverrouillez-le pour écrire");
  closeVolet(); hideTip();
  const B = codeBox(it), z = S.view.z, b = toScreen(boxOf(it));
  const lines = (prefill ?? it.text).split("\n").length;
  // la zone d'écriture est le corps de la boîte (hauteur libre) ; un brouillon de collage reçoit au moins 18 lignes
  const bodyH = Math.max(it.h - CODE.HEAD, it.draft ? Math.min(lines, 18) * B.lh + 2 * CODE.PAD : 0) * z;
  setVars(codeEditor, { "--ix": `${b.x}px`, "--iy": `${b.y + CODE.HEAD * z}px`, "--iw": `${b.w}px`, "--ih": `${bodyH}px`,
    "--ifs": `${it.t.size * z}px`, "--ilh": `${B.lh * z}px`, "--ipx": `${(it.numbers ? B.textX : CODE.LEFT) * z}px`, "--ipy": `${CODE.PAD * z}px` });
  editGutter.hidden = !it.numbers;
  setVars(editGutter, { "--gx": `${b.x + 1}px`, "--gy": `${b.y + CODE.HEAD * z + 1}px`, "--gw": `${B.gutter * z}px`, "--gh": `${bodyH - 2}px`, "--gpr": `${CODE.GUTTER * z}px`, "--grail": `${CODE.RAIL * z}px` });
  codeEditor.value = prefill ?? it.text; codeEditor.hidden = false;
  codeEditor.className = `code-edit cf-${it.cfont}`; editGutter.className = `code-edit-gutter cf-${it.cfont}`;
  codeEditor.setAttribute("aria-label", `code de ${it.title || "ce bloc"}, ${LANG[it.lang].label}`);
  setVars(editHint, { "--bx": `${b.x}px`, "--by": `${b.y - 36}px` }); editHint.hidden = false;
  S.editing = it.id; drawWorld(); placeBar();
  // le texte s'ouvre là où l'on lisait : le curseur au début de la première ligne visible
  const at = codeEditor.value.split("\n").slice(0, B.first).reduce((k, l) => k + l.length + 1, 0);
  codeEditor.focus(); codeEditor.setSelectionRange(at, at); codeEditor.scrollTop = B.first * B.lh * z;
  editNums.replaceChildren(); syncGutter();
}
function closeCodeEditor() { codeEditor.hidden = true; editHint.hidden = true; editGutter.hidden = true; hideWarn(); }
/** Enregistrer : rien ne part tant que les valeurs sensibles n'ont pas été vues. */
function commitCode() {
  const it = item(S.editing); if (!it) return;
  const text = normalizePaste(codeEditor.value);
  if (!text.trim()) return cancelCode();
  const found = findSecrets(text);
  if (found.length) return showWarn(it, text, found);
  saveCode(it, text);
}
function saveCode(it, text, note = "") {
  if (it.draft) { S.past.push(S.draftSnap); S.future = []; delete it.draft; S.draftSnap = null; }
  else if (text !== it.text) remember();
  it.text = text;
  S.editing = null; closeCodeEditor();
  refresh(); later(() => placeBar(true), 120);
  if (note) say(note);
  focusToile();
}
function cancelCode() {
  const it = item(S.editing);
  S.editing = null; closeCodeEditor();
  if (it && it.draft) { S.items.delete(it.id); S.sel = S.sel.filter((x) => x !== it.id); S.draftSnap = null; say("collage abandonné : rien n'a été enregistré"); }
  refresh(); later(() => placeBar(true), 120); focusToile();
}
codeEditor.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return S.warn ? (hideWarn(), codeEditor.focus()) : cancelCode(); }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); return commitCode(); }
  if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); codeEditor.setRangeText("    ", codeEditor.selectionStart, codeEditor.selectionEnd, "end"); }
  e.stopPropagation();
});
codeEditor.addEventListener("paste", (e) => {
  const raw = e.clipboardData && e.clipboardData.getData("text/plain");
  if (!raw) return;
  e.preventDefault();
  codeEditor.setRangeText(normalizePaste(raw), codeEditor.selectionStart, codeEditor.selectionEnd, "end");
});

// ---------- l'avertissement sur les valeurs sensibles ----------
const warn = $("#fwarn"), WARN_W = 448;
function showWarn(it, text, found) {
  S.warn = { id: it.id, text, found };
  warn.replaceChildren();
  const headEl = html("div", "fwarn-head", warn);
  headEl.appendChild(lucide("shield-alert"));
  const n = found.length;
  html("span", "", headEl, n === 1 ? "1 valeur sensible dans ce code" : `${n} valeurs sensibles dans ce code`);
  html("p", "fwarn-why", warn, `Une fois enregistré, ce texte est lu par tous ceux qui ouvrent ${INFRA} et reste dans le journal des modifications. Rien n'est enregistré avant votre choix.`);
  const list = html("div", "fwarn-list", warn); list.setAttribute("role", "list");
  const lines = text.split("\n");
  for (const f of found) {
    // une ligne de la liste mène à la valeur dans le texte (sélectionnée, prête à être réécrite)
    const row = html("button", "fwarn-row", list); row.type = "button"; row.setAttribute("role", "listitem");
    row.setAttribute("aria-label", `ligne ${f.line + 1}, ${f.label}, ${f.nature} : aller à la valeur`);
    html("span", "fwarn-ln", row, `l. ${f.line + 1}`);
    const k = html("span", "fwarn-kind", row, f.label);
    html("span", `fwarn-nature${f.nature === "hash" ? " hash" : ""}`, k, f.nature);
    html("span", "fwarn-line", row, maskedPreview(lines[f.line], f));
    row.addEventListener("click", () => selectSecret(f));
  }
  html("p", "fwarn-note", warn, `Retirer : chaque valeur est remplacée par ${MASK} dans le texte enregistré ; la commande reste lisible.`);
  const act = html("div", "fwarn-actions", warn);
  const mask = html("button", "pbtn primary", act); mask.type = "button"; mask.append(lucide("eraser"), document.createTextNode(n === 1 ? "Retirer la valeur" : "Retirer ces valeurs"));
  mask.addEventListener("click", () => { const it2 = item(S.warn.id); const t = maskSecrets(S.warn.text, S.warn.found); saveCode(it2, t, `${n === 1 ? "1 valeur retirée" : `${n} valeurs retirées`} du texte`); });
  const keep = html("button", "pbtn", act); keep.type = "button"; keep.textContent = "Garder tel quel";
  keep.addEventListener("click", () => { const it2 = item(S.warn.id); saveCode(it2, S.warn.text, "enregistré tel quel : le bloc garde son alerte"); });
  html("span", "spacer", act);
  const back = html("button", "pbtn ghost", act); back.type = "button"; back.textContent = "Modifier le texte";
  back.addEventListener("click", () => { const first = S.warn.found[0]; hideWarn(); selectSecret(first); });
  warn.hidden = false;
  syncGutter();
  placeWarn();
  mask.focus();
}
/** Sélectionne une valeur signalée dans le textarea et l'amène en vue. */
function selectSecret(f) {
  const lines = codeEditor.value.split("\n");
  if (f.line >= lines.length) return codeEditor.focus();
  const at = lines.slice(0, f.line).reduce((k, l) => k + l.length + 1, 0) + f.start;
  codeEditor.focus();
  codeEditor.setSelectionRange(at, Math.min(at + (f.end - f.start), at + lines[f.line].length - f.start));
  const lh = codeLineH(item(S.editing).t.size) * S.view.z;
  codeEditor.scrollTop = Math.max(0, f.line * lh - codeEditor.clientHeight / 3);
  syncGutter();
}
function hideWarn() { S.warn = null; warn.hidden = true; warn.replaceChildren(); syncGutter(); }
/** À droite de la zone d'écriture, sinon à gauche, sinon dessous ; jamais sur le code qu'on relit. */
function placeWarn() {
  if (!S.warn) return;
  const z = zone(), r = codeEditor.getBoundingClientRect(), w = warn.offsetWidth, h = warn.offsetHeight;
  const blockTop = toScreen(boxOf(item(S.warn.id))).y; // aligné sur le haut du bloc qu'il concerne
  const y = clamp(blockTop, z.top, z.bottom - h);
  let x = r.right + 12;
  if (x + w > z.right) x = r.left - 12 - w;
  if (x < z.left) { x = clamp(r.left, z.left, z.right - w); setVars(warn, { "--wx": `${x}px`, "--wy": `${clamp(r.bottom + 12, z.top, z.bottom - h)}px` }); return; }
  setVars(warn, { "--wx": `${Math.round(x)}px`, "--wy": `${Math.round(y)}px` });
}

// ---------- le collage : un texte qui ressemble à du code devient un bloc, au centre de la vue ----------
function pasteText(raw, at) {
  const text = normalizePaste(raw);
  if (!text.trim()) return;
  const det = detectLanguage(text), lines = text.split("\n").length;
  if (det.id === "plain" && lines < 3) return say("texte collé : il deviendrait une note (lot 3), pas un bloc de code");
  // sans pointeur : au centre de la vue, décalé à gauche pour que l'avertissement tienne à sa droite
  const w = Math.min(640, Math.max(380, Math.max(...text.split("\n").map((l) => l.length)) * codeCharW(13) + 80));
  const z = zone(), cx = at ? at.x : (z.left + z.right - WARN_W - 12) / 2, cy = at ? at.y : (z.top + z.bottom) / 2;
  const id = `code-c${S.seq++}`;
  const it = code(id, Math.round((cx - S.view.x) / S.view.z - w / 2), Math.round((cy - S.view.y) / S.view.z - 120), Math.round(w / 20) * 20, text, det.id, { hue: "slate", draft: true });
  S.draftSnap = snapshot();
  S.items.set(id, it); S.sel = [id]; S.special = null; // un brouillon n'a pas de fiche : rien n'existe encore
  refresh();
  codeEdit(it, text);
  const found = findSecrets(text);
  if (found.length) showWarn(it, text, found);
  else saveCode(it, text, `bloc créé : ${lines} lignes, ${det.sure ? "langage reconnu" : "langage proposé"} : ${LANG[det.id].label} · modifiable dans la barre`);
}
addEventListener("paste", (e) => {
  if (S.editing || S.readonly) return;
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  const raw = e.clipboardData && e.clipboardData.getData("text/plain");
  if (raw) { e.preventDefault(); pasteText(raw, S.pointer); }
});

// ---------- la fiche d'un bloc : le code en entier, ce qui est réglé ----------
const INFRA = "demo-dc";
function codeFiche(panel, it) {
  const B = codeBox(it), n = secretsOf(it);
  if (n) {
    const w = html("div", "insp-warn", panel); w.appendChild(lucide("shield-alert"));
    const t = html("span", "", w, `${n === 1 ? "1 valeur sensible est visible" : `${n} valeurs sensibles sont visibles`} dans ce bloc, pour tous ceux qui ouvrent ${INFRA}. `);
    const b = html("button", "insp-btn", t, "Retirer ces valeurs"); b.type = "button";
    b.prepend(lucide("eraser"));
    b.addEventListener("click", () => { remember(); it.text = maskSecrets(it.text, findSecrets(it.text)); say(`${n === 1 ? "1 valeur retirée" : `${n} valeurs retirées`} du texte`); refresh(); });
  }
  html("div", "insp-section open", panel, "Code").appendChild(lucide("chevron-up"));
  // le titre : un nom de fichier, une commande, ce que dit le bloc ; écrit ici ou au double-clic sur l'en-tête
  const tr = html("div", "insp-row insp-title-row", panel); html("span", "insp-label", tr, "titre");
  const title = html("input", "insp-input", tr); title.type = "text"; title.maxLength = 80; title.value = it.title;
  title.placeholder = "Ajouter un titre"; title.setAttribute("aria-label", "titre du bloc");
  title.addEventListener("change", () => { const v = title.value.trim(); if (v !== it.title) { remember(); it.title = v; refresh(); } });
  title.addEventListener("keydown", (e) => { if (e.key === "Enter") title.blur(); if (e.key === "Escape") { title.value = it.title; title.blur(); } e.stopPropagation(); });
  const box = html("div", `insp-code cf-${it.cfont}`, panel);
  const hd = html("div", "insp-code-head", box);
  html("span", "", hd, `${LANG[it.lang].label} · ${B.total} lignes`);
  html("span", "grow", hd);
  const cp = html("button", "insp-btn", hd); cp.type = "button"; cp.append(lucide(S.copied === it.id ? "check" : "copy"), document.createTextNode(S.copied === it.id ? "copié" : "copier"));
  cp.addEventListener("click", () => copyCode(it));
  const pre = html("pre", "", box); pre.tabIndex = 0; pre.setAttribute("aria-label", `code, ${B.total} lignes`);
  for (const segs of codeLines(it.text, it.lang, it.highlight)) {
    const ln = html("span", "ln", pre);
    for (const sg of segs) html("span", sg.c && (it.highlight || sg.c === "masked") ? `tk-${sg.c}` : "", ln, sg.t);
    ln.appendChild(document.createTextNode("\n"));
  }
  // l'affichage : les mêmes réglages que la barre (parité), plus le nombre de lignes montrées replié
  const open = S.ficheOpen.has("Affichage");
  const sec = html("button", `insp-section toggle-section${open ? " open" : ""}`, panel, "Affichage"); sec.type = "button"; sec.setAttribute("aria-expanded", String(open));
  sec.appendChild(lucide(open ? "chevron-up" : "chevron-down"));
  sec.addEventListener("click", () => { S.ficheOpen.has("Affichage") ? S.ficheOpen.delete("Affichage") : S.ficheOpen.add("Affichage"); refresh(); });
  if (open) {
    const rows = html("div", "insp-rows", panel);
    const row = (label) => { const r = html("div", "insp-row", rows); html("span", "insp-label", r, label); return r; };
    const lang = html("select", "insp-select", row("langage")); lang.setAttribute("aria-label", "langage");
    for (const L of LANGS) { const o = html("option", "", lang, L.label); o.value = L.id; o.selected = L.id === it.lang; }
    lang.addEventListener("change", () => editCode((x) => { x.lang = lang.value; }));
    const fr = row("police"); fr.classList.add("tall");
    fontList(fr, () => it.cfont, (id) => editCode((x) => { x.cfont = id; }), false);
    const seg = (label, opts, value, pick) => {
      const g = html("div", "insp-seg", row(label)); g.setAttribute("role", "radiogroup"); g.setAttribute("aria-label", label);
      for (const [v, text] of opts) { const b = html("button", "insp-seg-item", g, text); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(v === value)); b.addEventListener("click", () => pick(v)); }
    };
    if (it.lang !== "plain") seg("coloration", [[true, "activée"], [false, "texte brut"]], it.highlight, (v) => editCode((x) => { x.highlight = v; }));
    seg("numéros", [[true, "affichés"], [false, "cachés"]], it.numbers, (v) => editCode((x) => { x.numbers = v; }));
    const num = (label, id, min, max, value, unit, apply, grip) => row(label).appendChild(numField({ id, label, min, max, value, unit, grip, onChange: (v, phase) => apply(v, phase) }));
    const hr = row("hauteur");
    hr.appendChild(numField({ id: "code-h", label: "hauteur de la boîte, en pixels", min: 80, max: 4000, step: CODE.GRID, big: 5, value: it.h, unit: "px", grip: () => lucide("move-vertical"),
      onChange: (v, phase) => { historyFor("code:h", phase); for (const x of codeItems()) x.h = v; refreshLight(); } }));
    if (it.h !== fitHeight(it)) { const fit = html("button", "insp-btn insp-fit", hr, "ajuster au contenu"); fit.type = "button"; fit.addEventListener("click", () => editCode((x) => { x.h = fitHeight(x); x.scroll = 0; })); }
    num("taille", "fiche-size", 8, 24, it.t.size, "px", (v, phase) => editCodeSize(v, phase), () => lucide("a-large-small"));
  }
  for (const s of ["Ancrage", "Forme"]) html("div", "insp-section", panel, s).appendChild(lucide("chevron-down"));
}

// ---------- le premier dessin (en dernier : toutes les constantes des modules sont posées) ----------
setTheme("dark");
refresh();
