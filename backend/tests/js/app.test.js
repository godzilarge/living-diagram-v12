// Tests de l'application sous Node, sans aucun DOM : le fichier construit (`assets/app/app.js`) se charge, ne monte
// rien, et expose ses modules purs (`LDApp`) : l'adresse (état de vue ↔ URL) et le réducteur.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const APP = process.env.LD_APP || path.resolve(__dirname, "../../src/ld_backend/render/assets/app/app.js");
const clone = (value) => JSON.parse(JSON.stringify(value));

function loadApp() {
  const context = vm.createContext({ console, URLSearchParams });
  vm.runInContext(fs.readFileSync(APP, "utf8"), context, { filename: "app.js" });
  return context.LDApp;
}

test("sans DOM, l'application ne monte rien et expose ses modules purs", () => {
  const LDApp = loadApp();
  assert.deepEqual(Object.keys(LDApp).sort(), ["address", "alignment", "context", "debug", "history", "initialState", "opening", "prefs", "query", "reducer", "searching", "snap", "walking"]);
  assert.equal(LDApp.debug.state(), null);
  assert.equal(LDApp.debug.handle(), null);
});

test("l'adresse est l'état de vue : run dans la recherche, vue et sélection dans le fragment, aller et retour", () => {
  const { address } = loadApp();
  assert.deepEqual(clone(address.parseSearch("?infrastructure=infra%20lab&run_id=r2&from=r1")), { infrastructure: "infra lab", runId: "r2", from: "r1" });
  assert.deepEqual(clone(address.parseSearch("")), { infrastructure: "", runId: "", from: "" });
  assert.equal(address.formatSearch({ infrastructure: "infra lab", runId: "r2", from: "r1" }), "?infrastructure=infra+lab&run_id=r2&from=r1");
  assert.equal(address.formatSearch({ infrastructure: "", runId: "r2", from: "" }), "", "sans infrastructure, pas de run");
  assert.equal(address.formatSearch({ infrastructure: "x", runId: "", from: "" }), "?infrastructure=x");
  const view = { showStubs: true, showPorts: true, showSpeeds: true, showBeams: true, showPins: false, showNotes: false, showDiff: false, hide: ["fw-", "^(a|b)$"], only: "core", hiddenStatuses: ["documented_only"] };
  const selection = { kind: "link", token: JSON.stringify(["a", "e1", "b", "e2"]) };
  const hash = address.formatHash(view, selection);
  assert.match(hash, /^#stubs=1&ports=1&speeds=1&beams=1&pins=0&notes=0&diff=0&hide=fw-&hide=%5E\(a%7Cb\)%24&only=core&mask=documented_only&link=/);
  assert.equal(clone(address.defaultView()).showNotes, true, "les annotations se voient par défaut ; seul notes=0 les cache");
  assert.deepEqual(clone(address.parseHash("#annotation=a3-1").selection), { kind: "annotation", token: "a3-1" });
  assert.deepEqual(clone(address.parseHash("#connector=c3-1").selection), { kind: "connector", token: "c3-1" });
  const layers = clone(address.defaultView());
  assert.equal(layers.showSpeeds || layers.showBeams, false, "vitesses et port-channels éteints par défaut (panneau Affichage)");
  assert.equal(layers.showPins, true, "les épingles se voient par défaut ; seul pins=0 les cache");
  assert.deepEqual(clone(address.parseHash(hash)), { view, selection });
  assert.deepEqual(clone(address.parseHash("")), { view: clone(address.defaultView()), selection: null });
  assert.equal(address.formatHash(address.defaultView(), null), "", "la vue par défaut ne s'écrit pas");
  const tolerant = address.parseHash("#stubs=1&bad&node=sw-core-01&link=%E0%A4%A&mask=foo,confirmed&=x&only=");
  assert.deepEqual(clone(tolerant), { view: { ...clone(address.defaultView()), showStubs: true, hiddenStatuses: ["confirmed"] }, selection: { kind: "node", token: "sw-core-01" } },
    "un %XX tronqué est ignoré, un statut inconnu aussi, la première sélection gagne");
});

test("le réducteur est pur et ne mute jamais", () => {
  const { reducer, initialState } = loadApp();
  const start = initialState();
  const frozen = JSON.stringify(start);
  const connected = reducer(reducer(start, { type: "session", token: "t", author: "orhan" }), { type: "address", address: { infrastructure: "i", runId: "", from: "" } });
  assert.equal(JSON.stringify(start), frozen, "l'état de départ n'a pas bougé");
  assert.equal(connected.token, "t");
  assert.equal(connected.author, "orhan");
  assert.equal(reducer(connected, { type: "session", author: "" }).token, "t", "un champ absent de l'action est gardé");
  const loading = reducer({ ...connected, connectOpen: true, menuOpen: true }, { type: "loading", infrastructure: "i", runId: "r" });
  assert.equal(loading.run.kind, "loading");
  assert.equal(loading.connectOpen, false);
  assert.equal(loading.menuOpen, false);
  const failed = reducer(loading, { type: "failed", message: "jeton refusé" });
  assert.equal(failed.connectOpen, true, "un échec ramène l'accueil");
  const model = { fake: true };
  const ready = reducer({ ...loading, hosts: ["a", "b"], expanded: true, palette: { open: true, text: "x" } }, { type: "ready", model, data: {}, warnings: [], runs: null, remembered: true });
  assert.equal(ready.run.model, model);
  assert.deepEqual(clone(ready.hosts), [], "une autre run : la sélection multiple ne traverse pas");
  assert.equal(ready.expanded, false);
  assert.equal(ready.palette.open, false);
  assert.equal(ready.palette.text, "x", "le texte de la palette reste");
  assert.equal(ready.runs, null);
  const selected = reducer(ready, { type: "select", selection: { kind: "node", id: "a" }, hosts: ["a"] });
  assert.equal(reducer(selected, { type: "select", selection: { kind: "node", id: "a" }, hosts: ["a"] }), selected, "même sélection : même état (aucun rendu)");
  const colours = reducer({ ...selected, menuOpen: true }, { type: "colors", open: true });
  assert.equal(colours.colorsOpen && !colours.menuOpen, true, "le volet « palette des types » (docs/10) ferme le menu");
  assert.equal(reducer(colours, { type: "loading", infrastructure: "i", runId: "r2" }).colorsOpen, false, "changer de run ferme le volet");
  const expanded = reducer(selected, { type: "expand", expanded: true });
  assert.equal(reducer(expanded, { type: "select", selection: { kind: "node", id: "b" }, hosts: ["b"] }).expanded, false, "une autre fiche se rouvre repliée");
  assert.equal(reducer(expanded, { type: "select", selection: { kind: "node", id: "a" }, hosts: ["a", "b"] }).expanded, true, "même élément, sélection multiple : la fiche reste dépliée");
  const wanted = reducer(ready, { type: "want", wanted: { kind: "node", token: "a" } });
  assert.equal(reducer(wanted, { type: "select", selection: null, hosts: [] }).wanted, null, "la toile a répondu : plus rien à attendre");
  const view = reducer(ready, { type: "view", patch: { hide: ["fw-"], showStubs: true } });
  assert.deepEqual(clone(view.view), clone({ ...ready.view, hide: ["fw-"], showStubs: true }));
  assert.equal(ready.view.hide.length, 0, "l'état d'avant n'a pas été muté");
  assert.equal(reducer(ready, { type: "touched" }).revision, ready.revision + 1);
  assert.deepEqual(clone(reducer(ready, { type: "note", text: "épingle enregistrée", busy: false, at: 5 }).note), { text: "épingle enregistrée", busy: false, at: 5 });
  assert.equal(reducer(ready, { type: "note", text: null }).note, null);
  assert.equal(reducer(ready, { type: "inconnu" }), ready, "une action inconnue ne change rien");
});

test("les règles et l'alignement de la toile sont ceux du moteur", () => {
  const { query, alignment } = loadApp();
  assert.equal(query.exactRule(["b", "a.c"]), "^(a\\.c|b)$");
  assert.equal(query.parseRule("type:firewall site:dc01").terms.length, 2);
  assert.equal(query.parseRule("(").error !== null, true);
  const moved = alignment.align(new Map([["a", { x: 0, y: 10 }], ["b", { x: 0, y: 30 }]]), ["a", "b"], "horizontal");
  assert.deepEqual(clone(Object.fromEntries(moved)), { a: { x: 0, y: 20 }, b: { x: 0, y: 20 } });
});

test("les préférences du navigateur se lisent avec tolérance et passent par le réducteur", () => {
  const { prefs, reducer, initialState } = loadApp();
  assert.deepEqual(clone(prefs.defaultPrefs()), { theme: "dark", grid: false, snap: false, minimap: true, panelWidth: 348 }, "sombre, sans grille ni aimant, minimap, panneau de 348");
  assert.equal(prefs.parsePrefs('{"panelWidth":5000}').panelWidth, 760, "une largeur hors bornes est ramenée au plafond");
  assert.equal(prefs.parsePrefs('{"panelWidth":"large"}').panelWidth, 348, "une largeur illisible vaut le défaut");
  assert.deepEqual(clone(prefs.parsePrefs(null)), clone(prefs.defaultPrefs()), "rien de rangé : les défauts");
  assert.deepEqual(clone(prefs.parsePrefs("{pas du json")), clone(prefs.defaultPrefs()), "texte illisible : les défauts");
  assert.deepEqual(clone(prefs.parsePrefs('{"theme":"light","grid":true,"snap":"oui","minimap":false,"autre":1}')),
    { theme: "light", grid: true, snap: false, minimap: false, panelWidth: 348 }, "un champ mal formé vaut son défaut, un champ inconnu est ignoré");
  assert.equal(prefs.parsePrefs('{"theme":"sepia"}').theme, "dark", "un thème inconnu vaut le défaut");
  const start = initialState();
  const lit = reducer(start, { type: "prefs", patch: { theme: "light" } });
  assert.equal(lit.prefs.theme, "light");
  assert.equal(lit.prefs.minimap, true, "les autres préférences sont gardées");
  assert.equal(start.prefs.theme, "dark", "l'état de départ n'a pas bougé");
});

test("annuler / rétablir : ce qu'une écriture change clé par clé, et les opérations qui y ramènent, sans écraser les autres", () => {
  const { history: h } = loadApp();
  const style = { shape: "rect", hue: "blue" };
  const doc = (revision, extra = {}) => ({ intent_version: "1.1.0", infrastructure: "x", revision, updated_at: null, pins: [], type_colors: [], device_colors: [], groups: [], ...extra });
  const pin = (hostname, x, y) => ({ hostname, x, y, author: "o", at: "t" });
  const d0 = doc(1, { pins: [pin("a", 0, 0)] });
  const d1 = doc(2, { pins: [pin("a", 20, 0), pin("b", 40, 0)] });
  const ops = [{ op: "pin", hostname: "a", x: 20, y: 0 }, { op: "pin", hostname: "b", x: 40, y: 0 }];
  const entry = h.record(ops, d0, d1);
  assert.equal(entry.label, "déplacement de 2 équipements");
  assert.deepEqual(clone(entry.changes.map((c) => [c.before, c.after])), [[{ x: 0, y: 0 }, { x: 20, y: 0 }], [null, { x: 40, y: 0 }]]);
  const undo = h.plan(d1, entry.changes, "undo");
  assert.deepEqual(clone(undo.ops), [{ op: "pin", hostname: "a", x: 0, y: 0 }, { op: "unpin", hostname: "b" }], "annuler : l'ancienne place, ou plus d'épingle");
  const meanwhile = doc(3, { pins: [pin("a", 20, 0), pin("b", 99, 99)] });
  const guarded = h.plan(meanwhile, entry.changes, "undo");
  assert.deepEqual(clone(guarded.ops), [{ op: "pin", hostname: "a", x: 0, y: 0 }], "b a été déplacé par quelqu'un d'autre depuis : sauté");
  assert.equal(guarded.skipped.length, 1);
  assert.deepEqual(clone(h.plan(d0, entry.changes, "redo").ops), clone(ops), "rétablir rejoue l'écriture");
  assert.equal(h.record([{ op: "pin", hostname: "a", x: 0, y: 0 }], d0, d0), null, "rien de changé : aucune entrée");
  // Les couleurs et les groupes : un groupe supprimé puis recréé change d'identité, la pile suit.
  const g = { id: "g4-1", label: "Cœur", description: "", members: ["a", "b"], style, author: "o", at: "t" };
  const withGroup = doc(4, { groups: [g], device_colors: [{ hostname: "a", hue: "red", author: "o", at: "t" }] });
  const created = h.record([{ op: "group_create", label: "Cœur", members: ["a", "b"] }], doc(3), withGroup);
  assert.equal(created.label, "création du groupe Cœur");
  const del = h.plan(withGroup, created.changes, "undo");
  assert.deepEqual(clone(del.ops), [{ op: "group_delete", id: "g4-1" }]);
  const back = h.plan(doc(5), created.changes, "redo");
  assert.equal(back.ops[0].op, "group_create");
  assert.deepEqual(clone(back.created), ["g4-1"]);
  const ids = h.createdIds(back.created, doc(6));
  assert.equal(ids.get("g4-1"), "g6-1", "l'identité que le serveur donne : g<révision>-<n>");
  let stack = h.push(h.push(h.emptyStack(), entry), created);
  assert.deepEqual(clone(h.labels(stack)), { undo: "création du groupe Cœur", redo: null });
  stack = h.moved(stack, "undo", new Map(), del.applied);
  assert.deepEqual(clone(h.labels(stack)), { undo: "déplacement de 2 équipements", redo: "création du groupe Cœur" });
  stack = h.moved(stack, "redo", ids);
  assert.equal(stack.undo[1].changes[0].key, h.keyOf("group", "g6-1"), "le groupe recréé est suivi sous sa nouvelle identité");
  const colour = h.record([{ op: "color", hostname: "a", hue: "red" }], doc(3), withGroup);
  assert.deepEqual(clone(h.plan(withGroup, colour.changes, "undo").ops), [{ op: "uncolor", hostname: "a" }]);
  // La pile : un geste nouveau vide `redo`, 100 entrées au plus, les déplacements locaux oubliés à la run suivante.
  assert.equal(h.push(stack, entry).redo.length, 0);
  let big = h.emptyStack();
  for (let i = 0; i < h.LIMIT + 5; i += 1) big = h.push(big, entry);
  assert.equal(big.undo.length, h.LIMIT);
  const local = { kind: "local", label: "déplacement local", before: new Map(), after: new Map() };
  assert.equal(h.dropLocal(h.push(stack, local)).undo.length, stack.undo.length);
  assert.equal(h.same({ y: 1, x: 2 }, { x: 2, y: 1 }), true, "deux valeurs égales, clés dans un autre ordre");
  // Les annotations (docs/10 §6, A9) : créer, modifier, supprimer entrent dans la pile ; une annotation recréée change d'identité.
  const note = { id: "a7-1", anchor: { kind: "free", ref: null }, x: 10, y: 20, w: 220, h: 80, z: "front", locked: false, leader: false, content: { kind: "note", text: "Baie 12" }, style: { hue: "amber" }, author: "o", at: "t" };
  const withNote = doc(7, { annotations: [note] });
  const made = h.record([{ op: "annotation_create", content: note.content, x: 10, y: 20 }], doc(6), withNote);
  assert.equal(made.label, "création d'une annotation");
  assert.deepEqual(clone(h.plan(withNote, made.changes, "undo").ops), [{ op: "annotation_delete", id: "a7-1" }]);
  const again = h.plan(doc(8), made.changes, "redo");
  assert.equal(again.ops[0].op, "annotation_create");
  assert.equal(again.ops[0].content.text, "Baie 12");
  assert.deepEqual(clone(again.created), ["a7-1"]);
  assert.equal(h.createdIds(["g4-1", "a7-1", "a7-2"], doc(9)).get("a7-2"), "a9-2", "les annotations sont numérotées à part des groupes");
  assert.equal(h.createdIds(["g4-1", "a7-1"], doc(9)).get("g4-1"), "g9-1");
  const movedNote = doc(8, { annotations: [{ ...note, x: 50, w: 300 }] });
  const dragged = h.record([{ op: "annotation_update", id: "a7-1", x: 50, w: 300 }], withNote, movedNote);
  assert.equal(dragged.label, "modification d'une annotation");
  const back2 = h.plan(movedNote, dragged.changes, "undo").ops[0];
  assert.equal(back2.op, "annotation_update");
  assert.deepEqual([back2.x, back2.w], [10, 220], "annuler rend la boîte d'avant");
  assert.deepEqual(clone(h.plan(doc(9), h.record([{ op: "annotation_delete", id: "a7-1" }], movedNote, doc(9)).changes, "undo").ops.map((op) => op.op)), ["annotation_create"], "annuler une suppression recrée");
  // Les connecteurs (1.4.0) : même pile, identités `c…` numérotées à part.
  const line = { id: "c8-1", start: { kind: "free", x: 0, y: 0 }, end: { kind: "device", ref: "sw-core-01" }, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", locked: false, style: { hue: "slate" }, author: "o", at: "t" };
  const withLine = doc(8, { connectors: [line] });
  const drawn = h.record([{ op: "connector_create", start: line.start, end: line.end }], doc(7), withLine);
  assert.equal(drawn.label, "création d'un connecteur");
  assert.deepEqual(clone(h.plan(withLine, drawn.changes, "undo").ops), [{ op: "connector_delete", id: "c8-1" }]);
  const bent = doc(9, { connectors: [{ ...line, route: "curve", bend: 40 }] });
  const curved = h.record([{ op: "connector_update", id: "c8-1", route: "curve", bend: 40 }], withLine, bent);
  assert.equal(curved.label, "modification d'un connecteur");
  const back3 = h.plan(bent, curved.changes, "undo").ops[0];
  assert.equal(back3.op, "connector_update");
  assert.deepEqual([back3.route, back3.bend], ["straight", 0], "annuler rend le tracé d'avant");
  assert.equal(h.createdIds(["a7-1", "c8-1", "c8-2"], doc(10)).get("c8-2"), "c10-2", "les connecteurs sont numérotés à part");
});

test("le menu contextuel (context.ts) : ce qu'un clic droit propose selon la cible, l'écriture et la sélection", () => {
  const { context: c } = loadApp();
  const table = { kind: "table", header: true, rows: [["a", "b"], ["c", "d"]], widths: null, heights: null, merges: [{ row: 0, col: 0, rows: 1, cols: 2 }] };
  const model = {
    annotationById: new Map([["a1-1", { id: "a1-1", anchor: { kind: "device", ref: "sw-core-01" }, z: "front", locked: false, content: table }], ["a1-2", { id: "a1-2", anchor: { kind: "free", ref: null }, z: "back", locked: true, content: { kind: "note", text: "x" } }]]),
    connectorById: new Map([["c1-1", { id: "c1-1", start: { kind: "free", x: 0, y: 0 }, end: { kind: "device", ref: "sw-core-01" }, heads: { start: "none", end: "arrow" }, route: "curve", bend: 30, z: "front", locked: false }]]),
    pinByHost: new Map(),
  };
  const ids = (items) => clone(items.filter((i) => !i.sep).map((i) => i.id));
  const rw = { editable: true, selectedHosts: [], hasSelection: false, pinned: () => false };
  const ro = { ...rw, editable: false };
  assert.deepEqual(ids(c.menuItems({ kind: "pane" }, model, rw)), ["insert:note", "insert:rectangle", "insert:ellipse", "insert:connector", "insert:table", "insert:image", "fit"]);
  assert.deepEqual(ids(c.menuItems({ kind: "pane" }, model, { ...ro, hasSelection: true })), ["fit", "clear"], "en lecture seule, rien à insérer");
  assert.deepEqual(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, pinned: () => true })), ["center", "hide", "isolate", "note", "connect", "unpin"]);
  assert.deepEqual(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, selectedHosts: ["sw-core-01", "sw-core-02"] })), ["center", "hide", "isolate", "align:horizontal", "align:vertical", "group"], "dans une sélection multiple : aligner, grouper");
  assert.deepEqual(ids(c.menuItems({ kind: "group", id: "g1-1" }, model, ro)), ["center", "members", "hide", "isolate"]);
  const cell = ids(c.menuItems({ kind: "annotation", id: "a1-1", cell: [0, 0], range: { r0: 0, c0: 0, r1: 0, c1: 1 } }, model, rw));
  assert.deepEqual(cell, ["cell:edit", "cell:split", "row:above", "row:below", "row:delete", "col:left", "col:right", "col:delete", "header", "center", "duplicate", "lock", "plane", "detach", "connect", "delete"], "une cellule fusionnée se sépare ; une plage d'une seule cellule visible ne se fusionne pas");
  const range = ids(c.menuItems({ kind: "annotation", id: "a1-1", cell: [1, 0], range: { r0: 1, c0: 0, r1: 1, c1: 1 } }, model, rw));
  assert.equal(range.includes("cell:merge") && !range.includes("cell:split"), true, "une plage se fusionne");
  assert.deepEqual(ids(c.menuItems({ kind: "annotation", id: "a1-2" }, model, rw)), ["text", "center", "duplicate", "lock", "plane", "connect", "delete"], "une note libre : son texte, pas de détacher");
  assert.deepEqual(ids(c.menuItems({ kind: "annotation", id: "a1-2" }, model, ro)), ["center"]);
  const line = c.menuItems({ kind: "connector", id: "c1-1" }, model, rw);
  assert.deepEqual(ids(line), ["center", "reverse", "heads:none/arrow", "heads:arrow/none", "heads:arrow/arrow", "heads:none/none", "route:straight", "route:elbow", "route:curve", "straighten", "detach", "lock", "plane", "delete"]);
  assert.equal(line.find((i) => i.id === "route:curve").checked && line.find((i) => i.id === "heads:none/arrow").checked, true, "ce qui est coché est l'état courant");
  assert.deepEqual(ids(c.menuItems({ kind: "connector", id: "c9-9" }, model, rw)), [], "un connecteur inconnu : rien");
});

test("l'accrochage d'un bout (snap.ts) : une ancre à portée, sinon l'élément dessous sur son contour, sinon libre ; une carte avant une annotation avant un cadre", () => {
  const { snap } = loadApp();
  const card = { kind: "device", ref: "sw", frame: { x: 0, y: 0, w: 100, h: 50 }, shape: { kind: "rect", rx: 12 } };
  const note = { kind: "annotation", ref: "a1-1", frame: { x: 200, y: 0, w: 100, h: 50 }, shape: { kind: "ellipse" } };
  const group = { kind: "group", ref: "g1-1", frame: { x: -50, y: -50, w: 400, h: 300 }, shape: { kind: "rect", rx: 16 } };
  const all = [group, note, card];
  const onAnchor = snap.pickEnd(all, { x: 97, y: 27 }, 10);
  assert.deepEqual(clone([onAnchor.end, onAnchor.snapped.side, onAnchor.target.ref, onAnchor.anchors.length]), [{ kind: "device", ref: "sw", side: "e" }, "e", "sw", 4], "à portée de l'ancre droite de la carte");
  assert.deepEqual(clone(onAnchor.place), { kind: "box", frame: card.frame, shape: card.shape, side: "e" }, "la place pour dessiner tout de suite");
  const inside = snap.pickEnd(all, { x: 50, y: 20 }, 10);
  assert.deepEqual(clone([inside.end, inside.snapped, inside.target.ref]), [{ kind: "device", ref: "sw", side: "auto" }, null, "sw"], "dans la carte, loin des ancres : son contour");
  const corner = snap.pickEnd(all, { x: 0, y: 25 }, 10);
  assert.equal(corner.end.ref, "sw", "la carte passe avant le cadre qui la contient");
  const edge = snap.pickEnd(all, { x: -45, y: 100 }, 10);
  assert.deepEqual(clone(edge.end), { kind: "group", ref: "g1-1", side: "w" }, "l'ancre gauche du cadre");
  const onNote = snap.pickEnd(all, { x: 303, y: 25 }, 10);
  assert.deepEqual(clone([onNote.end, onNote.place.shape]), [{ kind: "annotation", ref: "a1-1", side: "e" }, { kind: "ellipse" }]);
  const excluded = snap.pickEnd(all, { x: 97, y: 27 }, 10, (kind, ref) => kind === "device" && ref === "sw");
  assert.deepEqual(clone(excluded.end), { kind: "group", ref: "g1-1", side: "auto" }, "l'autre bout du connecteur est exclu : le cadre dessous prend");
  const far = snap.pickEnd(all, { x: 900, y: 900 }, 10);
  assert.deepEqual(clone([far.end, far.target, far.anchors]), [{ kind: "free", x: 900, y: 900 }, null, []], "ailleurs : libre, au point");
  const hover = snap.pickEnd([card, note], { x: 105, y: 45 }, 10);
  assert.deepEqual(clone([hover.end.kind, hover.target && hover.target.ref]), ["free", "sw"], "à portée sans ancre ni contour : libre, mais les ancres de la carte se montrent");
});

test("la recherche : équipements, ports (nom, description), groupes et clusters ; champs proposés en écrivant", () => {
  const { searching: s } = loadApp();
  const node = (hostname, type, extra = {}) => ({ hostname, type, kind: "device", site: "dc1", vendor: null, model: null, os_name: null, os_version: null, serial_number: null, collection: "success", ...extra });
  const nodes = [node("sw-core-01", "switch"), node("sw-core-02", "switch"), node("fw-01", "firewall")];
  const itf = (hostname, name, description) => ({ hostname, name, description, type: "physical" });
  const interfaces = [itf("sw-core-01", "Ethernet1/1", "C1|fw-01|port1|"), itf("sw-core-01", "Ethernet1/2", null), itf("fw-01", "port1", "uplink core")];
  const link = { id: "L1" };
  const model = {
    nodes, ghostNodes: [node("sw-old", "switch", { ghost: true })], interfaces, nodeByHost: new Map(nodes.map((n) => [n.hostname, n])),
    linksByIface: new Map([["sw-core-01\u0000Ethernet1/1", [link]]]),
    groupById: new Map([["g1-1", { id: "g1-1", label: "Cœur DC1", description: "", members: ["sw-core-01", "sw-core-02"] }]]),
    clusters: [{ id: "fw-01", hosts: ["fw-01"], raw: { cluster_name: "EDGE", mode: "active_passive" } }],
  };
  const core = s.search(model, "core");
  assert.deepEqual(clone(core.devices.map((h) => h.title)), ["sw-core-01", "sw-core-02"]);
  assert.deepEqual(clone(core.ports.map((h) => h.title)), ["fw-01 · port1"], "« core » dans la description d'un port");
  assert.deepEqual(clone(core.groups.map((h) => h.title)), ["Cœur DC1"].filter(() => false), "« core » ne trouve pas « Cœur »");
  const port = s.search(model, "sw-core-01 eth1/1");
  assert.deepEqual(clone(port.ports.map((h) => [h.title, h.selection])), [["sw-core-01 · Ethernet1/1", { kind: "link", id: "L1" }]], "un port à un câble ouvre son câble");
  assert.equal(port.devices.length, 0);
  assert.deepEqual(clone(s.search(model, "port:eth1/2").ports.map((h) => h.selection)), [{ kind: "node", id: "sw-core-01" }], "sans câble, son équipement");
  assert.equal(s.search(model, "type:firewall").ports.length, 0, "un champ d'équipement seul ne liste pas ses ports");
  assert.deepEqual(clone(s.search(model, "type:firewall").deviceHosts), ["fw-01"]);
  assert.equal(s.search(model, "type:firewall").deviceRule, true);
  assert.equal(s.search(model, "desc:uplink").deviceRule, false);
  assert.deepEqual(clone(s.search(model, "edge").groups.map((h) => [h.title, h.selection])), [["EDGE", { kind: "cluster", id: "fw-01" }]]);
  assert.deepEqual(clone(s.search(model, "dc1").groups.map((h) => h.selection)), [{ kind: "group", id: "g1-1" }]);
  const old = s.search(model, "old");
  assert.equal(old.devices[0].removed, true, "un équipement retiré par le diff, marqué");
  assert.deepEqual(clone(old.deviceHosts), [], "jamais sélectionné");
  assert.deepEqual(clone(core.hosts), ["sw-core-01", "sw-core-02"], "des équipements trouvés : eux seuls s'éclairent");
  assert.deepEqual(clone(s.search(model, "uplink").hosts), ["fw-01"], "sinon les propriétaires des ports");
  const both = s.search(model, "port1");
  assert.deepEqual(clone(both.ports.map((h) => h.title)), ["fw-01 · port1", "sw-core-01 · Ethernet1/1"], "par le nom d'abord, puis par la description");
  assert.equal(s.search(model, "(").error !== null, true, "regex illisible");
  assert.equal(s.search(model, "").empty, true);
  assert.deepEqual(clone(s.suggest("ty")), ["type:"]);
  assert.deepEqual(clone(s.suggest("sw-core type:fi")), []);
  assert.equal(s.suggest("").includes("port:"), true);
  assert.equal(s.complete("sw ty", "type:"), "sw type:");
  assert.equal(s.portNames("port-channel10").split(" ").includes("po10"), true);
  assert.equal(s.portNames("GigabitEthernet1/0/1").split(" ").includes("Gi1/0/1"), true);
  assert.equal(s.portNames("1/1"), "1/1");
  // la recherche et la toile lisent le même texte à chaque frappe : un seul calcul, rendu tel quel
  const once = s.searchCached(model, "core");
  assert.equal(s.searchCached(model, "core"), once, "même modèle, même texte : le même résultat");
  assert.notEqual(s.searchCached(model, "core "), once, "un autre texte : un nouveau calcul");
  assert.deepEqual(clone(s.searchCached(model, "core").devices), clone(core.devices));
});

test("l'ouverture : tout si les noms se lisent, sinon ce qui compte au zoom de lecture, sinon le milieu du parc", () => {
  const { opening } = loadApp();
  const { READ_ZOOM, openingView } = opening;
  const area = { x: 0, y: 56, width: 1600, height: 810 };
  const at = (points) => new Map(Object.entries(points));
  // petite infrastructure : elle tient au-dessus du zoom de lecture, la vue cadre tout (milieu du cadre)
  const small = at({ a: { x: 0, y: 0 }, b: { x: 600, y: 300 } });
  const v1 = openingView(small, ["a"], area);
  assert.equal(v1.zoom >= READ_ZOOM, true);
  assert.equal(Math.round(v1.x + 300 * v1.zoom), 800);
  // grande : zoom de lecture, centrée sur ce qui compte
  const big = new Map();
  for (let i = 0; i < 40; i += 1) for (let j = 0; j < 10; j += 1) big.set("n" + String(i).padStart(2, "0") + j, { x: i * 400, y: j * 200 });
  const v2 = openingView(big, ["n300", "n301"], area);
  assert.equal(v2.zoom, READ_ZOOM);
  const center = (v) => ({ x: (area.x + area.width / 2 - v.x) / v.zoom, y: (area.y + area.height / 2 - v.y) / v.zoom });
  assert.equal(Math.abs(center(v2).x - 12000) < 1 && Math.abs(center(v2).y - 100) < 1, true);
  // défauts éparpillés : la fenêtre qui en montre le plus (trois à gauche, un seul loin à droite)
  const v3 = openingView(big, ["n000", "n010", "n020", "n390"], area);
  assert.equal(Math.round(center(v3).x), 400);
  // rien qui compte : l'équipement le plus proche du barycentre, jamais un vide ; hôtes inconnus ignorés
  const v4 = openingView(big, ["absent"], area);
  assert.equal(v4.zoom, READ_ZOOM);
  assert.equal([...big.values()].some((p) => Math.abs(p.x - center(v4).x) < 1 && Math.abs(p.y - center(v4).y) < 1), true);
  assert.equal(openingView(new Map(), [], area), null);
});

test("le parcours d'un compte : les équipements touchés, le plus touché d'abord, jamais un voisin inconnu ; en boucle", () => {
  const { walking } = loadApp();
  const node = (hostname, extra = {}) => ({ hostname, kind: "device", ...extra });
  const nodes = [node("b"), node("a"), node("c"), node("d"), node("e"), node("stub-1", { kind: "stub" })];
  const ghost = node("gone", { ghost: true });
  const check = (severity) => ({ severity });
  const model = {
    nodes, ghostNodes: [ghost], nodeByHost: new Map(nodes.concat(ghost).map((n) => [n.hostname, n])),
    checksByNode: new Map([["a", [check("error")]], ["b", [check("error"), check("error"), check("warning")]], ["stub-1", [check("error")]], ["c", [check("info")]]]),
    links: [{ id: "l1", a: { hostname: "a" }, b: { hostname: "c" } }, { id: "l2", a: { hostname: "b" }, b: { hostname: "stub-1" } }],
    ghostLinks: [{ id: "l3", ghost: true, a: { hostname: "c" }, b: { hostname: "gone" } }],
    diff: {
      interfaces: { added: [], removed: [{ hostname: "d" }], changed: [{ ref: { kind: "interface", hostname: "e" } }] },
      aggregates: { added: [], removed: [], changed: [] }, ha_clusters: { added: [], removed: [], changed: [] },
    },
    changeOf: (kind, id) => (kind === "link" && id === "l1" ? { kind: "changed" } : kind === "node" && id === "a" ? { kind: "changed" } : null),
  };
  assert.deepEqual(clone(walking.walkHosts(model, "error")), ["b", "a"], "b porte deux erreurs ; le voisin inconnu n'est jamais parcouru");
  assert.deepEqual(clone(walking.walkHosts(model, "warning")), ["b"]);
  assert.deepEqual(clone(walking.walkHosts(model, "diff")), ["a", "c", "gone", "d", "e"], "a, c, le retiré : deux changements chacun ; d, e : une interface");
  assert.deepEqual(clone(walking.walkHosts({ ...model, diff: null }, "diff")), []);
  const walk = { kind: "error", hosts: ["b", "a"], index: 0 };
  assert.equal(walking.stepWalk(walk, -1).index, 1);
  assert.equal(walking.stepWalk(walking.stepWalk(walk, 1), 1).index, 0);
  assert.equal(walk.index, 0, "jamais muté");
  assert.deepEqual([walking.walkLabel("diff", 0), walking.walkLabel("diff", 1), walking.walkLabel("error", 4)], ["aucun équipement changé", "1 équipement changé", "4 équipements en erreur"]);
});
