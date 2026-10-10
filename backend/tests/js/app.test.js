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
  assert.deepEqual(Object.keys(LDApp).sort(), ["address", "alignment", "context", "debug", "history", "initialState", "journal", "journalCsv", "opening", "prefs", "query", "reducer", "searching", "snap", "walking"]);
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
  const view = { mode: "control", showStubs: true, showPorts: true, showSpeeds: true, showBeams: true, showPins: false, showNotes: false, showOper: true, showDiff: false, hide: ["fw-", "^(a|b)$"], only: "core", hiddenStatuses: ["documented_only"], journal: clone(address.defaultView()).journal };
  const selection = { kind: "link", token: JSON.stringify(["a", "e1", "b", "e2"]) };
  const hash = address.formatHash(view, selection);
  assert.match(hash, /^#mode=control&stubs=1&ports=1&speeds=1&beams=1&pins=0&notes=0&oper=1&diff=0&hide=fw-&hide=%5E\(a%7Cb\)%24&only=core&mask=documented_only&link=/);
  // les deux vues (2026-10-09) : Diagramme par défaut, absente de l'adresse ; `mode=control` seul s'écrit ; une valeur inconnue = Diagramme
  assert.equal(clone(address.defaultView()).mode, "diagram");
  assert.equal(clone(address.parseHash("#mode=control").view).mode, "control");
  assert.equal(clone(address.parseHash("#mode=admin").view).mode, "diagram", "une vue inconnue est la vue par défaut");
  assert.equal(address.formatHash({ ...address.defaultView(), mode: "diagram" }, null), "");
  assert.equal(address.formatHash({ ...address.defaultView(), mode: "control" }, null), "#mode=control");
  assert.equal(clone(address.parseHash("#oper=1").view).showOper, true, "la couche « câbles down » (panneau Affichage)");
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

test("la vue Journal : mode et filtres dans l'adresse, écrits en mode Journal seulement", () => {
  const { address } = loadApp();
  const filters = { q: "cœur dc02", authors: ["Orhan TOSUN", "alice"], categories: ["groups", "positions"], actions: [], infrastructure: "*", period: "7d", from: "", to: "", object: "", rev: null };
  const view = { ...clone(address.defaultView()), mode: "journal", journal: filters };
  const hash = address.formatHash(view, null);
  assert.equal(hash, "#mode=journal&jq=c%C5%93ur%20dc02&jau=Orhan%20TOSUN&jau=alice&jcat=groups,positions&jinfra=*&jp=7d");
  assert.deepEqual(clone(address.parseHash(hash).view), view, "aller et retour");
  assert.equal(address.formatHash({ ...view, mode: "diagram" }, null), "", "hors du Journal, ses filtres ne s'écrivent pas");
  const tolerant = clone(address.parseHash("#mode=journal&jcat=groups,teleport&jp=1y&jau=&jau=bob&jau=bob").view.journal);
  assert.deepEqual(tolerant, { q: "", authors: ["bob"], categories: ["groups"], actions: [], infrastructure: "", period: "all", from: "", to: "", object: "", rev: null }, "catégorie et période inconnues ignorées, auteur vide ou répété aussi");
});

test("le journal : requête, phrases, rafales, jours", () => {
  const { journal } = loadApp();
  const f = { ...clone(journal.defaultFilters()), q: " cœur ", authors: ["a", "b"], categories: ["groups"], period: "24h" };
  const now = Date.parse("2026-10-09T12:00:00Z");
  assert.deepEqual(clone(journal.queryOf(f, "lab", now, "CUR")), [["infrastructure", "lab"], ["author", "a"], ["author", "b"], ["category", "groups"], ["q", "cœur"], ["since", "2026-10-08T12:00:00Z"], ["before", "CUR"]]);
  assert.deepEqual(clone(journal.queryOf({ ...f, infrastructure: "*", period: "all", q: "", authors: [], categories: [] }, "lab", now)), [], "toutes les infrastructures : pas de paramètre");
  assert.equal(journal.filtered(journal.defaultFilters()), false);
  const entry = (ops, extra = {}) => ({ infrastructure: "lab", revision: 7, at: "2026-10-09T10:00:00Z", author: "orhan", categories: [], created: [], subjects: [], ops, ...extra });
  const say = (e) => journal.textOf(journal.headline(e));
  assert.equal(say(entry([{ op: "pin", hostname: "sw-1", x: 1, y: 2 }])), "a placé sw-1");
  assert.equal(say(entry([{ op: "color", hostname: "sw-1", hue: "red" }])), "a coloré sw-1 en rouge");
  assert.equal(say(entry([{ op: "color_type", type: "router", hue: "amber" }])), "a coloré le type routeur en ambre");
  assert.equal(say(entry([{ op: "pin", hostname: "a", x: 0, y: 0 }, { op: "pin", hostname: "b", x: 0, y: 0 }])), "a placé 2 équipements", "une rafale en une phrase");
  const mixed = entry([{ op: "color", hostname: "a", hue: "red" }, { op: "pin", hostname: "b", x: 0, y: 0 }, { op: "pin", hostname: "c", x: 0, y: 0 }]);
  assert.equal(say(mixed), "a placé 2 équipements et 1 autre modification", "le groupe le plus nombreux porte la phrase");
  assert.equal(journal.headline(mixed).category, "positions", "et la catégorie majoritaire, pas celle de la première opération");
  const created = entry([{ op: "group_create", label: "Cœur", members: ["a", "b"] }], { created: ["g7-1"], subjects: [{ id: "g7-1", kind: "group", label: "Cœur", form: "" }] });
  assert.equal(say(created), "a créé le groupe Cœur (2 membres)");
  const piece = clone(journal.headline(created).pieces[1]);
  assert.deepEqual(piece, { ref: "group", id: "g7-1", text: "Cœur" }, "le groupe cité se montre dans le diagramme");
  const update = entry([{ op: "annotation_update", id: "a3-1", x: 4, y: null, w: 10, h: null, content: null, style: null }], { subjects: [{ id: "a3-1", kind: "annotation", label: "", form: "" }] });
  assert.equal(say(update), "a modifié l'annotation sans titre : position, taille", "les clés nulles ne sont pas des changements ; sans nom, la sorte, jamais l'identité");
  const note = entry([{ op: "annotation_create", content: { kind: "table", rows: [["x"]] } }], { created: ["a7-1"], subjects: [{ id: "a7-1", kind: "annotation", label: "1 × 1", form: "table" }] });
  assert.equal(say(note), "a ajouté un tableau 1 × 1");
  assert.equal(say(entry([{ op: "annotation_delete", id: "a7-1" }], { subjects: [{ id: "a7-1", kind: "annotation", label: "Salle B", form: "note" }] })), "a supprimé la note Salle B");
  assert.equal(say(entry([{ op: "connector_create", start: {}, end: {} }])), "a tracé le connecteur sans nom", "sans nom ni sujet connu : jamais l'identité reçue");
  assert.equal(say(entry([{ op: "teleport" }])), "opération inconnue « teleport »");
  assert.equal(journal.headline(entry([{ op: "teleport" }])).category, "other");
  const items = (list) => journal.fold(list);
  const days = clone(journal.byDay(items([entry([], { at: "2026-10-09T10:00:00Z" }), entry([], { at: "2026-10-09T08:00:00Z", revision: 6 }), entry([], { at: "2026-10-08T10:00:00Z", revision: 5 }), entry([], { at: "2026-10-01T10:00:00Z", revision: 4 })]), now));
  assert.deepEqual(days.map((d) => [d.day, d.items.length]).slice(0, 2), [["aujourd'hui", 2], ["hier", 1]]);
  assert.match(days[2].day, /1 octobre 2026/);
});

test("le journal : suites repliées, détail par verbe, faits en mots, surlignage, fuseau", () => {
  const LDApp = loadApp();
  const { journal } = LDApp;
  const at = (m) => "2026-10-09T10:" + String(m).padStart(2, "0") + ":00Z";
  const e = (rev, m, op, extra = {}) => ({ infrastructure: "lab", revision: rev, at: at(m), author: "orhan", categories: [], created: [], subjects: [], ops: [op], ...extra });
  const style = (n) => ({ op: "annotation_update", id: "a1-1", x: null, style: n ? { hue: "red" } : null, w: n ? null : 40, h: n ? null : 20 });
  const r = (id, size) => ({ group: { id, kind: "repeat", size } }); // le regroupement vient du serveur (journal_groups.py)
  const list = [e(9, 9, style(1), r("r7", 3)), e(8, 8, style(0), r("r7", 3)), e(7, 7, style(1), r("r7", 3)), e(6, 3, { op: "pin", hostname: "sw", x: 1, y: 2 }, r("r5", 2)),
    e(5, 2, { op: "pin", hostname: "sw", x: 3, y: -4 }, r("r5", 2)), e(4, 1, { op: "pin", hostname: "fw", x: 0, y: 0 })];
  const folded = clone(journal.fold(list));
  assert.deepEqual(folded.map((i) => [i.kind, i.kind === "fold" ? i.entries.map((x) => x.revision) : i.entry.revision]), [["fold", [9, 8, 7]], ["fold", [6, 5]], ["entry", 4]],
    "les entrées voisines d'un même regroupement se replient ; une entrée sans regroupement reste seule");
  assert.deepEqual(clone(journal.changedFields(journal.mergedOp(list.slice(0, 3)))), ["style", "taille"], "la suite dit tout ce qu'elle a changé");
  assert.equal(journal.fold([e(2, 30, style(1)), e(1, 1, style(1))]).length, 2, "sans regroupement du serveur, deux lignes");
  const burst = { ...e(3, 0, null), ops: [{ op: "pin", hostname: "a", x: 0, y: 0 }, { op: "color", hostname: "b", hue: "red" }, { op: "pin", hostname: "a", x: 1, y: 1 }, { op: "pin", hostname: "c", x: 0, y: 0 }] };
  const groups = clone(journal.detailGroups(burst)).map((g) => [journal.textOf(g.sentence), g.hosts]);
  assert.deepEqual(groups, [["a placé 3 équipements", ["a", "c"]], ["a coloré b en rouge", []]], "regroupé par verbe, les noms dédoublonnés");
  const facts = clone(journal.factsOf({ op: "annotation_update", id: "a1-1", x: 584, y: -961, w: null, h: null, style: { hue: "teal", opacity: 80, radius: null }, z: "back" }));
  assert.deepEqual(facts, [{ label: "position", value: "584, −961" }, { label: "plan", value: "dessous" }, { label: "style", value: "teinte turquoise, opacité 80 %" }]);
  assert.deepEqual(clone(journal.factsOf({ op: "group_add", id: "g1-1", members: ["a", "b"] })), [{ label: "2 membres", value: "", list: ["a", "b"] }]);
  assert.deepEqual(clone(journal.marks("dc01-CORE-02 et core", ["core"])), [{ text: "dc01-", hit: false }, { text: "CORE", hit: true }, { text: "-02 et ", hit: false }, { text: "core", hit: true }]);
  assert.equal(journal.visibleMatch(journal.headline(list[3]), "orhan", ["sw"]), true);
  assert.equal(journal.visibleMatch(journal.headline(list[3]), "orhan", ["584"]), false, "trouvé dans le détail seulement");
  assert.equal(journal.hiddenHit(burst, ["C"]), "c", "le nom trouvé hors de la phrase");
  assert.equal(journal.hiddenHit(burst, ["zz"]), null);
  const purge = e(9, 0, { op: "journal_prune", removed: 3, before: "2026-10-07T00:00:00Z", categories: ["positions", "colors"], archive: "journal-archive/x.jsonl.gz" });
  assert.equal(journal.textOf(journal.headline(purge)), "a purgé le journal : 3 entrées antérieures au 7 octobre 2026 (positions, couleurs)",
    "une date seule est minuit UTC : jamais la veille en heure locale");
  assert.deepEqual(clone(journal.factsOf(purge.ops[0])).map((f) => f.label), ["retirées", "avant le", "catégories", "archive"]);
  const csv = LDApp.journalCsv;
  assert.equal(csv.cell("=SUM(A1)"), "'=SUM(A1)", "une formule est désamorcée");
  assert.equal(csv.cell('a;"b"'), '"a;""b"""', "séparateur et guillemets protégés");
  assert.equal(csv.cell("-12"), "'-12");
  const text = csv.csvOf([list[3]]);
  assert.ok(text.startsWith("\uFEFFdate (UTC);infrastructure;"), "marque UTF-8 et en-tête");
  const line = text.split("\r\n")[1].split(";");
  assert.deepEqual(line.slice(0, 6), [list[3].at, "lab", "6", "orhan", "Positions", "placé sw"], "une entrée, sa phrase sans le « a »");
  assert.match(csv.csvName("demo dc", new Date(2026, 9, 10, 9, 5)), /^journal-demo_dc-20261010-0905\.csv$/);
  assert.match(journal.zoneLabel(Date.now()), /^UTC([+−]\d+(:\d\d)?)?$/);
  assert.deepEqual(clone(journal.queryOf(journal.defaultFilters(), "lab", 0, null, 300)), [["infrastructure", "lab"], ["limit", "300"]], "une relecture redemande autant d'entrées");
  assert.equal(journal.newer(list[0], list[1]), true);
});

test("le journal : sessions de positions, plage de dates, noms des sujets cités, suppressions", () => {
  const LDApp = loadApp();
  const { journal, address } = LDApp;
  const at = (h, m) => "2026-10-09T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00Z";
  const session = (id, size) => ({ group: { id, kind: "session", size } });
  const pin = (rev, h, m, host, extra = session("s1", 5)) => ({ infrastructure: "lab", revision: rev, at: at(h, m), author: "orhan", categories: ["positions"], created: [], subjects: [],
    ops: [{ op: "pin", hostname: host, x: 0, y: 0 }], ...extra });
  const group = { infrastructure: "lab", revision: 20, at: at(11, 0), author: "orhan", categories: ["groups"], created: [], subjects: [{ id: "g1-1", kind: "group", label: "Cœur", form: "" }],
    ops: [{ op: "group_delete", id: "g1-1" }] };
  const list = [group, pin(19, 10, 50, "a"), pin(18, 10, 40, "b"), pin(17, 10, 30, "a"), pin(16, 10, 20, "c"), pin(15, 9, 0, "d", session("s0", 3)), pin(14, 8, 59, "e", {})];
  const items = clone(journal.fold(list));
  assert.deepEqual(items.map((i) => [i.kind, i.kind === "entry" ? i.entry.revision : i.entries.map((e) => e.revision)]),
    [["entry", 20], ["session", [19, 18, 17, 16]], ["entry", 15], ["entry", 14]],
    "les entrées voisines d'une même session : une ligne ; seule de la sienne à l'écran, une entrée reste une ligne");
  assert.equal(items[1].size, 5, "la session entière compte 5 entrées : la page dit « 4 des 5 »");
  assert.deepEqual(clone(journal.sessionHosts(items[1].entries)), { placed: ["a", "b", "c"], unpinned: [] });
  const other = { ...pin(18, 10, 40, "b"), infrastructure: "edge" };
  assert.equal(journal.fold([pin(19, 10, 50, "a"), other, pin(17, 10, 30, "a")]).length, 3, "une autre infrastructure entre deux : jamais fusionnées par-dessus");
  // la plage : du premier jour à minuit au lendemain du dernier, en heure locale, dans l'adresse
  const f = { ...clone(journal.defaultFilters()), period: "range", from: "2026-09-01", to: "2026-09-15" };
  const q = Object.fromEntries(clone(journal.queryOf(f, "lab", 0)));
  assert.equal(Date.parse(q.since), new Date(2026, 8, 1).getTime());
  assert.equal(Date.parse(q.until), new Date(2026, 8, 16).getTime(), "le dernier jour compris (`until` est exclusif)");
  const view = { ...clone(address.defaultView()), mode: "journal", journal: f };
  assert.equal(address.formatHash(view, null), "#mode=journal&jp=range&jfrom=2026-09-01&jto=2026-09-15");
  assert.deepEqual(clone(address.parseHash("#mode=journal&jp=range&jfrom=2026-09-01&jto=2026-09-15").view.journal), f);
  assert.equal(clone(address.parseHash("#mode=journal&jp=range&jfrom=2026-02-30").view.journal).period, "all", "une plage sans borne lisible n'est pas une plage");
  assert.equal(journal.rangeLabel("2026-09-01", "2026-09-15", Date.parse("2026-10-09")), "1 sept. – 15 sept.");
  assert.equal(journal.rangeLabel("2026-09-01", "", Date.parse("2026-10-09")), "depuis le 1 sept.");
  // un ancrage et un bout de connecteur nommés par le sujet que le serveur cite, jamais par leur identité
  const anchored = { ...group, ops: [{ op: "annotation_update", id: "a2-1", anchor: { kind: "group", ref: "g1-1" }, start: { kind: "annotation", ref: "a9-9", side: "n" } }],
    subjects: [{ id: "a2-1", kind: "annotation", label: "", form: "shape" }, { id: "g1-1", kind: "group", label: "Cœur", form: "" }, { id: "a9-9", kind: "annotation", label: "", form: "image" }] };
  assert.equal(journal.textOf(journal.headline(anchored)), "a modifié la forme sans titre : ancrage, bouts");
  const facts = Object.fromEntries(clone(journal.factsOf(anchored.ops[0], anchored)).map((x) => [x.label, x.value]));
  assert.equal(facts["ancrage"], "groupe Cœur");
  assert.equal(facts["départ"], "image sans titre, côté haut");
  assert.equal(journal.destroys(journal.headline(group)), true, "une phrase qui retire ressort");
  assert.equal(journal.destroys(journal.headline(list[1])), false);
  // l'action, l'historique d'un objet, le lien vers une entrée : dans l'adresse et dans la requête
  const linked = { ...clone(journal.defaultFilters()), actions: ["deleted"], object: "g1-1", infrastructure: "lab", rev: 986 };
  const hash = address.formatHash({ ...clone(address.defaultView()), mode: "journal", journal: linked }, null);
  assert.equal(hash, "#mode=journal&jact=deleted&jobj=g1-1&jinfra=lab&jrev=986");
  assert.deepEqual(clone(address.parseHash(hash).view.journal), linked, "aller et retour");
  assert.equal(clone(address.parseHash("#mode=journal&jrev=12a&jact=deleted,renamed").view.journal).rev, null, "une révision illisible est ignorée");
  assert.deepEqual(clone(journal.queryOf(linked, "lab", 0)), [["infrastructure", "lab"], ["action", "deleted"], ["object", "g1-1"], ["start", "986"]]);
  assert.deepEqual(clone(journal.queryOf(linked, "lab", 0, "CUR")).slice(-1), [["before", "CUR"]], "la suite part du curseur, plus de la révision");
  assert.deepEqual(clone(journal.queryOf({ ...linked, infrastructure: "*" }, "lab", 0)).map((p) => p[0]), ["action"], "toutes les infrastructures : ni révision ni identité (uniques dans la leur seulement)");
  assert.deepEqual(clone(address.parseHash("#mode=journal&jinfra=*&jobj=g1-1&jrev=4").view.journal).object, "", "« toutes » quitte l'historique et le lien");
  assert.equal(journal.entryLink("https://ld.example/ld/", { ...group, infrastructure: "dc 1" }), "https://ld.example/ld/?infrastructure=dc%201#mode=journal&jinfra=dc%201&jrev=20", "sous un sous-chemin aussi");
  // les accents se replient comme sur le serveur : « supprime » se voit, surligné, dans « a supprimé »
  assert.equal(journal.visibleMatch(journal.headline(group), "orhan", ["supprime"]), true);
  assert.deepEqual(clone(journal.marks("a supprimé Cœur", ["SUPPRIME"])), [{ text: "a ", hit: false }, { text: "supprimé", hit: true }, { text: " Cœur", hit: false }]);
  assert.equal(journal.filtered({ ...clone(journal.defaultFilters()), rev: 4 }), false, "un lien n'est pas un filtre");
  assert.equal(journal.filtered({ ...clone(journal.defaultFilters()), object: "sw" }), true);
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
