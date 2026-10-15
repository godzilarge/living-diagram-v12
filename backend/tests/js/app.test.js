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
  assert.deepEqual(Object.keys(LDApp).sort(), ["address", "alignment", "boxAlignment", "checkMeaning", "clipToile", "clipboard", "code", "context", "debug", "floating", "gridding", "guides", "handles", "history", "hover", "http", "i18n", "initialState", "intentHost", "journal", "journalCsv", "model", "opening", "prefs", "query", "reducer", "reusing", "searching", "selecting", "snap", "toile", "tool", "undoing", "walking", "wheel"]);
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
  assert.match(days[2].day, /1er octobre 2026/, "le premier du mois s'écrit « 1er »");
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
  assert.deepEqual(clone(prefs.defaultPrefs()), { theme: "dark", language: null, grid: false, snap: false, minimap: true, panelWidth: 348, fbar: true, guides: true, guideHue: null, gridOrder: "name" }, "sombre, langue du navigateur, sans grille ni aimant, minimap, panneau de 348, barre contextuelle affichée, repères allumés en chartreuse, grille par nom");
  assert.equal(prefs.parsePrefs('{"fbar":false}').fbar, false, "la barre contextuelle masquée se relit (lot 4)");
  assert.equal(prefs.parsePrefs('{"fbar":"non"}').fbar, true, "une valeur illisible : affichée");
  assert.equal(prefs.parsePrefs('{"panelWidth":5000}').panelWidth, 760, "une largeur hors bornes est ramenée au plafond");
  assert.equal(prefs.parsePrefs('{"panelWidth":"large"}').panelWidth, 348, "une largeur illisible vaut le défaut");
  assert.deepEqual(clone(prefs.parsePrefs(null)), clone(prefs.defaultPrefs()), "rien de rangé : les défauts");
  assert.deepEqual(clone(prefs.parsePrefs("{pas du json")), clone(prefs.defaultPrefs()), "texte illisible : les défauts");
  assert.deepEqual(clone(prefs.parsePrefs('{"theme":"light","grid":true,"snap":"oui","minimap":false,"autre":1}')),
    { theme: "light", language: null, grid: true, snap: false, minimap: false, panelWidth: 348, fbar: true, guides: true, guideHue: null, gridOrder: "name" }, "un champ mal formé vaut son défaut, un champ inconnu est ignoré");
  // les repères (lot 8 de docs/11) : allumés ou non, leur teinte (seulement celles qui tiennent 3:1), l'ordre de la grille
  assert.equal(prefs.parsePrefs('{"guides":false}').guides, false);
  assert.equal(prefs.parsePrefs('{"guides":"non"}').guides, true, "illisible : allumés");
  assert.equal(prefs.parsePrefs('{"guideHue":"teal"}').guideHue, "teal");
  assert.equal(prefs.parsePrefs('{"guideHue":"orange"}').guideHue, null, "une teinte sous 3:1 sur la toile claire n'est pas proposée : le chartreuse");
  assert.equal(prefs.parsePrefs('{"guideHue":"#ff00ff"}').guideHue, null, "jamais une valeur libre");
  assert.equal(prefs.parsePrefs('{"gridOrder":"screen"}').gridOrder, "screen");
  assert.equal(prefs.parsePrefs('{"gridOrder":"random"}').gridOrder, "name");
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
  assert.equal(h.labelText(entry.label), "déplacement de 2 équipements");
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
  assert.equal(h.labelText(created.label), "création du groupe Cœur");
  const del = h.plan(withGroup, created.changes, "undo");
  assert.deepEqual(clone(del.ops), [{ op: "group_delete", id: "g4-1" }]);
  const back = h.plan(doc(5), created.changes, "redo");
  assert.equal(back.ops[0].op, "group_create");
  assert.deepEqual(clone(back.created), ["g4-1"]);
  const ids = h.createdIds(back.created, doc(6));
  assert.equal(ids.get("g4-1"), "g6-1", "l'identité que le serveur donne : g<révision>-<n>");
  let stack = h.push(h.push(h.emptyStack(), entry), created);
  const said = (labels) => ({ undo: labels.undo && h.labelText(labels.undo), redo: labels.redo && h.labelText(labels.redo) });
  assert.deepEqual(said(h.labels(stack)), { undo: "création du groupe Cœur", redo: null });
  assert.deepEqual(clone(h.labels(stack).undo), { key: "groupCreated", name: "Cœur" }, "rangé sans langue : une clé et ses valeurs");
  stack = h.moved(stack, "undo", new Map(), del.applied);
  assert.deepEqual(said(h.labels(stack)), { undo: "déplacement de 2 équipements", redo: "création du groupe Cœur" });
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
  assert.equal(h.labelText(made.label), "création d'une annotation");
  assert.deepEqual(clone(h.plan(withNote, made.changes, "undo").ops), [{ op: "annotation_delete", id: "a7-1" }]);
  const again = h.plan(doc(8), made.changes, "redo");
  assert.equal(again.ops[0].op, "annotation_create");
  assert.equal(again.ops[0].content.text, "Baie 12");
  assert.deepEqual(clone(again.created), ["a7-1"]);
  assert.equal(h.createdIds(["g4-1", "a7-1", "a7-2"], doc(9)).get("a7-2"), "a9-2", "les annotations sont numérotées à part des groupes");
  assert.equal(h.createdIds(["g4-1", "a7-1"], doc(9)).get("g4-1"), "g9-1");
  const movedNote = doc(8, { annotations: [{ ...note, x: 50, w: 300 }] });
  const dragged = h.record([{ op: "annotation_update", id: "a7-1", x: 50, w: 300 }], withNote, movedNote);
  assert.equal(h.labelText(dragged.label), "modification d'une annotation");
  const back2 = h.plan(movedNote, dragged.changes, "undo").ops[0];
  assert.equal(back2.op, "annotation_update");
  assert.deepEqual([back2.x, back2.w], [10, 220], "annuler rend la boîte d'avant");
  assert.deepEqual(clone(h.plan(doc(9), h.record([{ op: "annotation_delete", id: "a7-1" }], movedNote, doc(9)).changes, "undo").ops.map((op) => op.op)), ["annotation_create"], "annuler une suppression recrée");
  // Les connecteurs (1.4.0) : même pile, identités `c…` numérotées à part.
  const line = { id: "c8-1", start: { kind: "free", x: 0, y: 0 }, end: { kind: "device", ref: "sw-core-01" }, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", locked: false, style: { hue: "slate" }, author: "o", at: "t" };
  const withLine = doc(8, { connectors: [line] });
  const drawn = h.record([{ op: "connector_create", start: line.start, end: line.end }], doc(7), withLine);
  assert.equal(h.labelText(drawn.label), "création d'un connecteur");
  assert.deepEqual(clone(h.plan(withLine, drawn.changes, "undo").ops), [{ op: "connector_delete", id: "c8-1" }]);
  const bent = doc(9, { connectors: [{ ...line, route: "curve", bend: 40 }] });
  const curved = h.record([{ op: "connector_update", id: "c8-1", route: "curve", bend: 40 }], withLine, bent);
  assert.equal(h.labelText(curved.label), "modification d'un connecteur");
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
  assert.deepEqual(ids(c.menuItems({ kind: "pane" }, model, rw)), ["clip:paste", "clip:pasteCode", "insert:note", "insert:rectangle", "insert:ellipse", "insert:connector", "insert:table", "insert:code", "insert:image", "fit"]);
  assert.deepEqual(ids(c.menuItems({ kind: "pane" }, model, { ...ro, hasSelection: true })), ["fit", "clear"], "en lecture seule, rien à insérer");
  assert.deepEqual(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, pinned: () => true })), ["center", "hide", "isolate", "clip:copy", "clip:paste", "note", "connect", "unpin"]);
  assert.deepEqual(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, selectedHosts: ["sw-core-01", "sw-core-02"] })), ["center", "hide", "isolate", "clip:copy", "clip:paste", "align:horizontal", "align:vertical", "group"], "dans une sélection multiple : aligner, grouper");
  assert.deepEqual(ids(c.menuItems({ kind: "group", id: "g1-1" }, model, ro)), ["center", "members", "hide", "isolate"]);
  const cell = ids(c.menuItems({ kind: "annotation", id: "a1-1", cell: [0, 0], range: { r0: 0, c0: 0, r1: 0, c1: 1 } }, model, rw));
  assert.deepEqual(cell, ["cell:edit", "cell:split", "row:above", "row:below", "row:delete", "col:left", "col:right", "col:delete", "header", "center", "clip:copy", "clip:cut", "clip:paste", "clip:duplicate", "lock", "detach", "connect", "delete"], "une cellule fusionnée se sépare ; une plage d'une seule cellule visible ne se fusionne pas ; attachée, pas de « mettre dessous » (lot 1)");
  const range = ids(c.menuItems({ kind: "annotation", id: "a1-1", cell: [1, 0], range: { r0: 1, c0: 0, r1: 1, c1: 1 } }, model, rw));
  assert.equal(range.includes("cell:merge") && !range.includes("cell:split"), true, "une plage se fusionne");
  assert.deepEqual(ids(c.menuItems({ kind: "annotation", id: "a1-2" }, model, rw)), ["text", "center", "clip:copy", "clip:cut", "clip:paste", "clip:duplicate", "lock", "plane", "connect", "delete"], "une note libre : son texte, pas de détacher");
  assert.deepEqual(ids(c.menuItems({ kind: "annotation", id: "a1-2" }, model, ro)), ["center", "clip:copy"], "en lecture seule, copier seulement (lot 3)");
  // attachée, elle se dessine au-dessus de son ancre : « mettre dessous » n'est jamais proposé ; un document qui dit
  // encore « dessous » garde « mettre dessus » (lot 1 de docs/11)
  const attachedBack = { ...model, annotationById: new Map([["a1-3", { id: "a1-3", anchor: { kind: "group", ref: "g1-1" }, z: "back", locked: false, content: { kind: "note", text: "x" } }]]) };
  const backItems = c.menuItems({ kind: "annotation", id: "a1-3" }, attachedBack, rw);
  assert.equal(backItems.find((i) => i.id === "plane").label, "mettre dessus");
  const line = c.menuItems({ kind: "connector", id: "c1-1" }, model, rw);
  assert.deepEqual(ids(line), ["center", "clip:copy", "clip:cut", "clip:paste", "clip:duplicate", "reverse", "heads:none/arrow", "heads:arrow/none", "heads:arrow/arrow", "heads:none/none", "route:straight", "route:elbow", "route:curve", "straighten", "detach", "lock", "plane", "delete"]);
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

test("les poignées (handles.ts) : taille d'écran constante, coins carrés, barres de côté, Maj garde le rapport, Alt part du centre, bornes", () => {
  const { handles: h } = loadApp();
  const box = { x: 100, y: 50, w: 200, h: 100 };
  // à l'écran, un coin fait 8 px et une barre 14 × 5 quel que soit le zoom : dans le plan, × 1 / zoom
  for (const zoom of [0.4, 1, 2]) {
    const shapes = clone(h.handleShapes(box, zoom));
    const corner = shapes.find((s) => s.id === "se"), bar = shapes.find((s) => s.id === "n"), side = shapes.find((s) => s.id === "e");
    assert.deepEqual([corner.kind, +(corner.box.w * zoom).toFixed(6), +(corner.box.h * zoom).toFixed(6)], ["corner", 8, 8], `coin à ${zoom}`);
    assert.deepEqual([bar.kind, +(bar.box.w * zoom).toFixed(6), +(bar.box.h * zoom).toFixed(6)], ["bar", 14, 5], `barre haute à ${zoom}`);
    assert.deepEqual([+(side.box.w * zoom).toFixed(6), +(side.box.h * zoom).toFixed(6)], [5, 14], `barre de côté, debout, à ${zoom}`);
    assert.equal(corner.box.x + corner.box.w / 2, 200, "centré sur le coin (coordonnées de la boîte)");
    assert.equal(bar.box.y + bar.box.h / 2, 0, "posée sur le bord");
  }
  const cursors = Object.fromEntries(clone(h.handleShapes(box, 1)).map((s) => [s.id, s.cursor]));
  assert.deepEqual(cursors, { n: "ns-resize", e: "ew-resize", s: "ns-resize", w: "ew-resize", nw: "nwse-resize", ne: "nesw-resize", se: "nwse-resize", sw: "nesw-resize" });
  assert.deepEqual(clone(h.handleShapes(box, 1)).map((s) => s.kind), ["bar", "bar", "bar", "bar", "corner", "corner", "corner", "corner"], "les coins dessinés en dernier : ils gagnent");
  assert.deepEqual(clone(h.handleShapes({ w: 60, h: 30 }, 0.5)).map((s) => s.id), ["nw", "ne", "se", "sw"], "côtés de 30 et 15 px à l'écran : pas de barre");
  // le redimensionnement : le côté opposé reste, Alt garde le centre, Maj garde le rapport (coins), bornes 20 / 4 000
  assert.deepEqual(clone(h.resized(box, "e", 40, 999)), { x: 100, y: 50, w: 240, h: 100 }, "une barre ne bouge qu'un axe");
  assert.deepEqual(clone(h.resized(box, "nw", 20, 10)), { x: 120, y: 60, w: 180, h: 90 });
  assert.deepEqual(clone(h.resized(box, "e", 40, 0, { center: true })), { x: 60, y: 50, w: 280, h: 100 }, "Alt : le côté opposé bouge d'autant, le centre reste");
  assert.deepEqual(clone(h.resized(box, "se", 20, 20, { center: true })), { x: 80, y: 30, w: 240, h: 140 });
  assert.deepEqual(clone(h.resized(box, "se", 100, 0, { ratio: true })), { x: 100, y: 50, w: 300, h: 150 }, "Maj : le rapport 2:1 gardé");
  assert.deepEqual(clone(h.resized(box, "n", 0, -20, { ratio: true })), { x: 100, y: 30, w: 200, h: 120 }, "Maj sur une barre : rien de plus");
  assert.deepEqual(clone(h.resized(box, "se", 50, 50, { ratio: true, center: true })), { x: 0, y: 0, w: 400, h: 200 }, "Maj et Alt ensemble");
  assert.deepEqual(clone(h.resized(box, "w", 500, 0)), { x: 280, y: 50, w: 20, h: 100 }, "jamais sous 20, le côté droit reste");
  assert.deepEqual(clone(h.resized(box, "s", 0, 9000)), { x: 100, y: 50, w: 200, h: 4000 }, "jamais au-delà de 4 000");
  assert.deepEqual(clone(h.resized(box, "e", 7, 0, { center: true })), { x: 93, y: 50, w: 214, h: 100 }, "entiers");
  // les pastilles : « L × H » collée à la poignée saisie, dehors ; « X, Y » au-dessus du coin ; à taille d'écran
  const se = clone(h.sizePill({ w: 240, h: 100 }, "se", 2));
  assert.deepEqual(se, { text: "240 × 100", x: 244, y: 104, scale: 0.5 }, "en bas à droite du coin, 8 px d'écart");
  const nw = clone(h.sizePill({ w: 240, h: 100 }, "nw", 1));
  assert.equal(nw.x + 76 + 8, 0, "à gauche du coin haut gauche (pastille de 76 px)");
  assert.equal(nw.y, -28, "au-dessus");
  const top = clone(h.sizePill({ w: 240, h: 100 }, "n", 1));
  assert.equal(top.x + 38, 120, "centrée sur la barre du haut");
  assert.deepEqual(clone(h.positionPill(40, -120, 0.5)), { text: "40, -120", x: 0, y: -56, scale: 2 });
});

test("l'outil connecteur (tool.ts) : appui, glissé, relâche ; un clic pose le départ, le second finit ; deux bouts libres confondus ne font rien", () => {
  const { tool: t } = loadApp();
  const card = { kind: "device", ref: "sw", frame: { x: 0, y: 0, w: 100, h: 50 }, shape: { kind: "rect", rx: 12 } };
  const onCard = (side) => ({ end: { kind: "device", ref: "sw", side }, place: { kind: "box", frame: card.frame, shape: card.shape, side }, target: card, anchors: [], snapped: null });
  const free = (x, y) => ({ end: { kind: "free", x, y }, place: { kind: "point", at: { x, y } }, target: null, anchors: [], snapped: null });
  // tirer depuis l'intérieur d'une carte : bout `auto` au départ, la relâche sur le fond crée
  let step = t.down(t.IDLE, onCard("auto"), { x: 50, y: 25 }, { x: 500, y: 300 });
  assert.equal(step.phase.kind, "press");
  assert.equal(t.draftOf(step.phase), null, "pas de brouillon tant qu'on n'a pas bougé");
  assert.equal(t.move(step.phase, { x: 503, y: 300 }).kind, "press", "3 px : toujours un appui");
  const dragged = t.move(step.phase, { x: 510, y: 300 });
  assert.equal(dragged.kind, "drag");
  assert.deepEqual(clone(t.draftOf(dragged).start), { kind: "device", ref: "sw", side: "auto" });
  step = t.up(dragged, free(300, 40), { x: 300, y: 40 });
  assert.deepEqual(clone(step), { phase: { kind: "idle" }, create: { start: { kind: "device", ref: "sw", side: "auto" }, end: { kind: "free", x: 300, y: 40 } } });
  // l'élément du départ ne peut pas être l'arrivée
  assert.equal(t.excludeStart(dragged)("device", "sw"), true);
  assert.equal(t.excludeStart(t.IDLE)("device", "sw"), false);
  // deux clics : le premier pose un bout libre, le second finit sur l'ancre « n » de la carte
  const pressed = t.down(t.IDLE, free(-200, -200), { x: -200, y: -200 }, { x: 10, y: 10 }).phase;
  const pending = t.up(pressed, free(-200, -200), { x: -200, y: -200 }).phase;
  assert.equal(pending.kind, "pending");
  assert.equal(t.draftOf(pending).from.x, -200, "le brouillon part du premier clic");
  assert.deepEqual(clone(t.excludeStart(pending)("device", "sw")), false, "un départ libre n'exclut rien");
  const done = t.down(pending, onCard("n"), { x: 50, y: 0 }, { x: 300, y: 100 });
  assert.deepEqual(clone(done.create), { start: { kind: "free", x: -200, y: -200 }, end: { kind: "device", ref: "sw", side: "n" } });
  assert.equal(done.phase.kind, "idle");
  // un second clic au même endroit (deux bouts libres à moins de 6) : on attend encore
  const same = t.down(pending, free(-197, -200), { x: -197, y: -200 }, { x: 13, y: 10 });
  assert.deepEqual([same.create, same.phase.kind], [null, "pending"]);
  const tiny = t.up(t.move(t.down(t.IDLE, free(0, 0), { x: 0, y: 0 }, { x: 0, y: 0 }).phase, { x: 9, y: 0 }), free(1, 0), { x: 1, y: 0 });
  assert.deepEqual([tiny.create, tiny.phase.kind], [null, "idle"], "un glissé trop court entre deux points libres ne crée rien");
  // rien ne bouge hors de propos
  assert.equal(t.up(t.IDLE, free(0, 0), { x: 0, y: 0 }).phase.kind, "idle");
  assert.equal(t.move(t.IDLE, { x: 99, y: 99 }).kind, "idle");
});

test("le survol (hover.ts) : marques de la cible (contour flottant, ancres, celle à portée) ; la bulle jamais sur la sélection ni pendant un geste", () => {
  const { hover: v, snap } = loadApp();
  const card = { kind: "device", ref: "sw", frame: { x: 0, y: 0, w: 100, h: 50 }, shape: { kind: "rect", rx: 12 } };
  assert.equal(v.marksOf(null), null);
  assert.equal(v.marksOf(snap.pickEnd([card], { x: 900, y: 900 }, 10)), null, "rien visé : aucune marque");
  const inside = clone(v.marksOf(snap.pickEnd([card], { x: 50, y: 20 }, 10)));
  assert.deepEqual([inside.floating, inside.near, inside.anchors.length, inside.target.ref], [true, null, 4, "sw"], "dedans : le contour (bout `auto`), quatre ancres");
  const onAnchor = clone(v.marksOf(snap.pickEnd([card], { x: 97, y: 27 }, 10)));
  assert.deepEqual([onAnchor.floating, onAnchor.near], [false, "e"], "à portée d'une ancre : bout fixe, l'ancre grossit");
  const near = clone(v.marksOf(snap.pickEnd([card], { x: 105, y: 45 }, 10)));
  assert.deepEqual([near.floating, near.near, near.anchors.length], [false, null, 4], "à portée sans ancre : les ancres se montrent, le contour n'est pas pris");
  assert.notEqual(v.marksKey(v.marksOf(snap.pickEnd([card], { x: 50, y: 20 }, 10))), v.marksKey(v.marksOf(snap.pickEnd([card], { x: 97, y: 27 }, 10))));
  assert.equal(v.marksKey(v.marksOf(snap.pickEnd([card], { x: 50, y: 20 }, 10))), v.marksKey(v.marksOf(snap.pickEnd([card], { x: 52, y: 22 }, 10))), "même cible, mêmes marques : rien à redessiner");
  assert.equal(v.marksKey(null), "");
  const selected = v.selectedTipKeys([{ kind: "annotation", id: "a1-1" }, { kind: "node", id: "sw" }]);
  assert.equal(v.tipAllowed("annotation:a1-1", selected, false), false, "jamais sur l'élément sélectionné");
  assert.equal(v.tipAllowed("node:sw", selected, false), false);
  assert.equal(v.tipAllowed("node:fw", selected, false), true);
  assert.equal(v.tipAllowed("node:fw", selected, true), false, "jamais pendant un geste");
  assert.equal(v.tipAllowed("node:sw", v.selectedTipKeys([]), false), true, "la sélection vidée, elle revient");
});

test("l'outil armé dans l'état : seulement en Diagramme, rangé par un changement de vue ou de run", () => {
  const { reducer, initialState } = loadApp();
  const start = initialState();
  assert.equal(start.tool, null);
  const armed = reducer(start, { type: "tool", tool: "connector" });
  assert.equal(armed.tool, "connector");
  assert.equal(reducer(armed, { type: "tool", tool: null }).tool, null);
  assert.equal(reducer(armed, { type: "view", patch: { mode: "control" } }).tool, null, "la vue Contrôle se lit : l'outil se range");
  assert.equal(reducer(armed, { type: "view", patch: { showPorts: true } }).tool, "connector", "une couche ne range rien");
  assert.equal(reducer(reducer(start, { type: "view", patch: { mode: "control" } }), { type: "tool", tool: "connector" }).tool, null, "en Contrôle, rien ne s'arme");
  assert.equal(reducer(armed, { type: "loading", infrastructure: "i", runId: "r" }).tool, null, "une autre run : rangé");
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

test("la sélection mixte (selection.ts) : quatre sortes triées, principal, rectangle, ordre de lecture, Suppr", () => {
  const { selecting: s } = loadApp();
  const node = (id) => ({ kind: "node", id }), note = (id) => ({ kind: "annotation", id }), line = (id) => ({ kind: "connector", id }), group = (id) => ({ kind: "group", id });
  const m = s.multiOf([note("a2"), node("sw-b"), node("sw-a"), note("a1"), node("sw-a"), group("g1"), line("c1")]);
  assert.deepEqual(clone(m), { hosts: ["sw-a", "sw-b"], annotations: ["a1", "a2"], connectors: ["c1"], groups: ["g1"] }, "triée, sans doublon");
  assert.equal(s.size(m), 6);
  assert.deepEqual(clone(s.counts(m)), { node: 2, annotation: 2, connector: 1, group: 1 });
  assert.deepEqual(clone(s.kindsOf(s.multiOf([line("c"), node("n")]))), ["node", "connector"], "les sortes dans l'ordre : équipements d'abord");
  assert.deepEqual(clone(s.single(s.multiOf([note("a1")]))), note("a1"));
  assert.equal(s.single(m), null);
  assert.equal(s.itemOf({ kind: "link", id: "x" }), null, "un câble ne se mêle pas à une sélection mixte");
  assert.deepEqual(clone(s.itemOf({ kind: "group", id: "g" })), group("g"));
  // Maj / Ctrl + clic : ajoute, puis retire
  const plus = s.toggle(m, note("a3"));
  assert.deepEqual(clone(plus.annotations), ["a1", "a2", "a3"]);
  assert.deepEqual(clone(s.toggle(plus, node("sw-a")).hosts), ["sw-b"]);
  assert.equal(s.same(s.toggle(plus, note("a3")), m), true, "ajouter puis retirer : la même sélection");
  // le principal : le dernier entré, sinon l'ancien s'il reste, sinon le premier
  const before = s.multiOf([node("sw-a")]);
  assert.deepEqual(clone(s.primaryOf(before, node("sw-a"), s.multiOf([node("sw-a"), note("a1")]), [node("sw-a"), note("a1")])), note("a1"));
  assert.deepEqual(clone(s.primaryOf(m, note("a2"), s.multiOf([note("a2"), node("sw-a")]))), note("a2"), "rien n'est entré : le principal reste");
  assert.deepEqual(clone(s.primaryOf(m, note("zz"), s.multiOf([note("a2"), node("sw-a")]))), node("sw-a"), "le principal parti : le premier");
  assert.equal(s.primaryOf(m, null, s.empty()), null);
  // le rectangle : nu, il remplace ; avec Maj, il ajoute
  assert.deepEqual(clone(s.itemsOf(s.afterRectangle(before, [note("a1")], false))), [note("a1")]);
  assert.deepEqual(clone(s.itemsOf(s.afterRectangle(before, [note("a1")], true))), [node("sw-a"), note("a1")]);
  // ce qu'il couvre : en mode « touche » tout ce qu'il effleure, en mode « englobe » ce qu'il contient ; jamais un verrou
  const shapes = [
    { item: node("sw-a"), box: { x: 0, y: 0, w: 100, h: 40 } },
    { item: note("a1"), box: { x: 90, y: 30, w: 50, h: 50 } },
    { item: note("lock"), box: { x: 10, y: 10, w: 10, h: 10 }, locked: true },
    { item: line("diag"), line: [{ x: -50, y: 120 }, { x: 250, y: 120 }] }, // traverse le rectangle sans y avoir de bout
    { item: line("far"), line: [{ x: 500, y: 500 }, { x: 600, y: 600 }] },
  ];
  const r = s.rectOf({ x: 120, y: 150 }, { x: 50, y: 20 });
  assert.deepEqual(clone(r), { x: 50, y: 20, w: 70, h: 130 }, "dans n'importe quel sens");
  assert.deepEqual(clone(s.covered(r, shapes)), [node("sw-a"), note("a1"), line("diag")]);
  assert.deepEqual(clone(s.covered({ x: 0, y: 0, w: 200, h: 100 }, shapes, "inside")), [node("sw-a"), note("a1")], "englobés seulement ; le verrou jamais");
  assert.deepEqual(clone(s.covered({ x: 300, y: 0, w: 10, h: 10 }, shapes)), [], "rien dessous");
  // Tab : l'ordre de lecture, par rangées puis de gauche à droite ; en boucle
  const order = s.readingOrder([
    { item: note("b"), at: { x: 400, y: 12 } }, { item: node("c"), at: { x: 0, y: 200 } },
    { item: node("a"), at: { x: 10, y: 0 } }, { item: line("d"), at: { x: 500, y: 210 } },
  ]);
  assert.deepEqual(clone(order), [node("a"), note("b"), node("c"), line("d")], "même rangée à 12 unités près : de gauche à droite");
  assert.deepEqual(clone(s.cycle(order, note("b"), 1)), node("c"));
  assert.deepEqual(clone(s.cycle(order, line("d"), 1)), node("a"), "après le dernier : le premier");
  assert.deepEqual(clone(s.cycle(order, node("a"), -1)), line("d"), "Maj+Tab avant le premier : le dernier");
  assert.deepEqual(clone(s.cycle(order, null, -1)), line("d"));
  assert.equal(s.cycle([], null, 1), null);
  // Suppr : annotations, connecteurs, groupes ; jamais un équipement
  assert.deepEqual(clone(s.deleteOps(m)), [{ op: "annotation_delete", id: "a1" }, { op: "annotation_delete", id: "a2" }, { op: "connector_delete", id: "c1" }, { op: "group_delete", id: "g1" }]);
  assert.deepEqual(clone(s.deleteOps(s.multiOf([node("sw-a")]))), []);
});

test("l'alignement par les boîtes (align.ts) : bords, milieux, répartition à écarts égaux ; entier", () => {
  const { boxAlignment: b, alignment } = loadApp();
  const boxes = new Map([["card", { x: 0, y: 0, w: 240, h: 80 }], ["note", { x: 300, y: 100, w: 101, h: 40 }], ["small", { x: 50, y: 300, w: 20, h: 20 }]]);
  const run = (mode, ids = ["card", "note", "small"]) => clone(Object.fromEntries(b.alignBoxes(boxes, ids, mode)));
  assert.deepEqual(run("top"), { note: { x: 300, y: 0 }, small: { x: 50, y: 0 } }, "le bord le plus haut ; ce qui y est déjà ne bouge pas");
  assert.deepEqual(run("bottom"), { card: { x: 0, y: 240 }, note: { x: 300, y: 280 } }, "le bord le plus bas : 320");
  assert.deepEqual(run("left"), { note: { x: 0, y: 100 }, small: { x: 0, y: 300 } });
  assert.deepEqual(run("right"), { card: { x: 161, y: 0 }, small: { x: 381, y: 300 } }, "le bord le plus à droite : 401");
  assert.deepEqual(run("center"), { card: { x: 81, y: 0 }, note: { x: 150, y: 100 }, small: { x: 191, y: 300 } }, "le milieu de l'ensemble (200,5), arrondi");
  assert.deepEqual(run("middle"), { card: { x: 0, y: 120 }, note: { x: 300, y: 140 }, small: { x: 50, y: 150 } });
  // répartir : la première et la dernière ne bougent pas, les écarts entre boîtes sont égaux (ici 30)
  const row = new Map([["a", { x: 0, y: 0, w: 100, h: 10 }], ["b", { x: 110, y: 0, w: 50, h: 10 }], ["c", { x: 400, y: 0, w: 40, h: 10 }]]);
  assert.deepEqual(clone(Object.fromEntries(b.alignBoxes(row, ["c", "a", "b"], "distribute-horizontal"))), { b: { x: 225, y: 0 } }, "écarts de (440 − 190) / 2 = 125");
  assert.equal(b.alignBoxes(boxes, ["card", "note"], "distribute-vertical").size, 0, "répartir demande trois boîtes");
  assert.equal(b.alignBoxes(boxes, ["card", "ghost"], "top").size, 0, "une boîte inconnue est ignorée ; une seule ne s'aligne pas");
  assert.deepEqual(clone(b.BOX_MODES), ["left", "center", "right", "top", "middle", "bottom", "distribute-horizontal", "distribute-vertical"]);
  assert.deepEqual(clone(alignment.ALIGN_MODES), ["horizontal", "vertical", "distribute-horizontal", "distribute-vertical"], "la règle des cartes seules (et de /view) ne change pas");
});

test("annuler une sélection mixte : un geste, une entrée ; les liens d'un élément recréé le suivent", () => {
  const { history: h } = loadApp();
  const pin = { op: "pin", hostname: "sw-a", x: 20, y: 0 };
  const moved = h.labelOf([pin, { op: "annotation_update", id: "a1", x: 5, y: 5 }, { op: "connector_update", id: "c1", start: { kind: "free", x: 1, y: 1 } }]);
  assert.deepEqual(clone(moved), { key: "movedItems", count: 3 });
  assert.equal(h.labelText(moved), "déplacement de 3 éléments");
  assert.equal(h.labelText(h.labelOf([{ op: "annotation_delete", id: "a1" }, { op: "connector_delete", id: "c1" }])), "suppression de 2 éléments");
  assert.equal(h.labelText(h.labelOf([{ op: "annotation_delete", id: "a1" }])), "suppression d'une annotation", "un seul : son libellé d'avant");
  assert.equal(h.labelText(h.labelOf([pin])), "déplacement de sw-a", "des épingles seules : le libellé d'avant");
  assert.equal(h.labelOf([{ op: "annotation_update", id: "a1", x: 1 }]).key, "annotationChanged");
  // une note et le connecteur qui y tient, supprimés ensemble puis recréés : le connecteur reprend la note sous sa nouvelle identité
  const free = { kind: "free", x: 0, y: 0 };
  const style = { hue: "slate" };
  const note = { id: "a3-1", content: { kind: "note", text: "x" }, anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 10, h: 10, z: "front", locked: false, leader: false, style };
  const line = { id: "c3-1", start: free, end: { kind: "annotation", ref: "a3-1", side: "auto" }, heads: {}, route: "straight", bend: 0, label: "", z: "front", locked: false, style };
  const doc = (revision, annotations, connectors) => ({ intent_version: "1.5.0", infrastructure: "x", revision, updated_at: null, pins: [], type_colors: [], device_colors: [], groups: [], annotations, connectors });
  const before = doc(3, [note], [line]), after = doc(4, [], []);
  const entry = h.record([{ op: "annotation_delete", id: "a3-1" }, { op: "connector_delete", id: "c3-1" }], before, after);
  assert.equal(h.labelText(entry.label), "suppression de 2 éléments");
  const undo = h.plan(after, entry.changes, "undo");
  assert.deepEqual(clone(undo.ops.map((op) => op.op)), ["annotation_create", "connector_create"]);
  const recreated = doc(5, [{ ...note, id: "a5-1" }], [{ ...line, id: "c5-1" }]); // le serveur garde l'ancienne référence
  const ids = h.createdIds(undo.created, recreated);
  assert.deepEqual(clone(Object.fromEntries(ids)), { "a3-1": "a5-1", "c3-1": "c5-1" });
  assert.deepEqual(clone(h.relinkOps(recreated, ids)), [{ op: "connector_update", id: "c5-1", end: { kind: "annotation", ref: "a5-1", side: "auto" } }]);
  assert.deepEqual(clone(h.relinkOps(recreated, new Map())), []);
  const remapped = h.remap(entry, ids);
  const lineChange = remapped.changes.find((c) => c.key.startsWith("connector"));
  assert.equal(lineChange.key, "connector\u0000c5-1");
  assert.deepEqual(clone(lineChange.before.end), { kind: "annotation", ref: "a5-1", side: "auto" }, "la valeur gardée désigne la nouvelle note");
  assert.equal(entry.changes.find((c) => c.key.startsWith("connector")).before.end.ref, "a3-1", "l'entrée d'origine n'a pas été mutée");
  const created = { kind: "intent", label: { key: "connectorCreated" }, changes: [{ key: "connector\u0000c3-1", before: null, after: line }, { key: "annotation\u0000a9-1", before: null, after: { ...note, anchor: { kind: "group", ref: "g3-1" } } }] };
  const both = h.remap(created, new Map([["a3-1", "a5-1"], ["g3-1", "g5-1"]]));
  assert.equal(both.changes[0].after.end.ref, "a5-1", "les valeurs d'après aussi");
  assert.equal(both.changes[1].after.anchor.ref, "g5-1", "l'ancrage d'une annotation à un groupe recréé");
  // rétablir sur le document relié : rien n'est « modifié par quelqu'un d'autre »
  const relinked = doc(6, [{ ...note, id: "a5-1" }], [{ ...line, id: "c5-1", end: { kind: "annotation", ref: "a5-1", side: "auto" } }]);
  const redo = h.plan(relinked, remapped.changes, "redo");
  assert.equal(redo.skipped.length, 0);
  assert.deepEqual(clone(redo.ops), [{ op: "annotation_delete", id: "a5-1" }, { op: "connector_delete", id: "c5-1" }]);
});

test("la molette (wheel.ts) : Ctrl + un cran de souris zoome d'un pas doux, un pincement garde le sien ; le point sous le pointeur reste", () => {
  const { wheel } = loadApp();
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(close(wheel.wheelZoom(1, -100, 0, 0.05, 6), Math.pow(2, 0.2)), true, "un cran vers l'avant : ×1,15 (React Flow faisait ×4)");
  assert.equal(close(wheel.wheelZoom(1, 100, 0, 0.05, 6), Math.pow(2, -0.2)), true);
  assert.equal(close(wheel.wheelZoom(1, -3, 1, 0.05, 6), Math.pow(2, 0.15)), true, "en lignes (Firefox)");
  assert.equal(close(wheel.wheelZoom(1, -5, 0, 0.05, 6), Math.pow(2, 0.1)), true, "un pincement : petits pas, ×10");
  assert.equal(wheel.wheelZoom(5.9, -1000, 0, 0.05, 6), 6, "borné");
  assert.equal(wheel.wheelZoom(0.06, 1000, 0, 0.05, 6), 0.05);
  const view = wheel.zoomAround({ x: 100, y: 50, zoom: 1 }, 2, 300, 250);
  assert.deepEqual(clone(view), { zoom: 2, x: -100, y: -150 }, "le point (200, 200) du plan reste sous le pointeur");
});

test("le réducteur tient la sélection mixte : sans elle dite, celle des équipements ; une nouvelle run la vide", () => {
  const { reducer, initialState, selecting } = loadApp();
  const ready = reducer(initialState(), { type: "ready", model: {}, data: {}, warnings: [], runs: null, remembered: false });
  assert.deepEqual(clone(ready.picked), clone(selecting.empty()));
  const hosts = reducer(ready, { type: "select", selection: null, hosts: ["b", "a"] });
  assert.deepEqual(clone(hosts.picked.hosts), ["a", "b"], "les lecteurs d'avant : des équipements seuls");
  const picked = selecting.multiOf([{ kind: "node", id: "a" }, { kind: "annotation", id: "a1" }]);
  const mixed = reducer(ready, { type: "select", selection: null, hosts: ["a"], picked });
  assert.deepEqual(clone(mixed.picked), clone(picked));
  assert.equal(reducer(mixed, { type: "select", selection: null, hosts: ["a"], picked: selecting.multiOf([{ kind: "node", id: "a" }, { kind: "annotation", id: "a1" }]) }), mixed, "la même : aucun rendu");
  assert.notEqual(reducer(mixed, { type: "select", selection: null, hosts: ["a"], picked: selecting.multiOf([{ kind: "node", id: "a" }, { kind: "connector", id: "c1" }]) }), mixed, "mêmes équipements, autre annotation : un nouvel état");
  assert.deepEqual(clone(reducer(mixed, { type: "loading", infrastructure: "i", runId: "r" }).picked), clone(selecting.empty()));
  const offer = { kind: "hide", hosts: ["a"] };
  assert.deepEqual(clone(reducer(ready, { type: "note", text: "x", at: 1, offer }).note), { text: "x", busy: false, at: 1, offer });
});

// ——— Le presse-papiers (lot 3 de docs/11) ———
const STYLE = { hue: "slate" };
const noteA = (id, extra = {}) => ({ id, anchor: { kind: "free", ref: null }, x: 100, y: 50, w: 200, h: 80, z: "front", locked: true, leader: false, content: { kind: "note", text: "Baie " + id }, style: STYLE, author: "orhan", at: "2026-10-14T00:00:00Z", ...extra });
const lineC = (id, start, end, extra = {}) => ({ id, start, end, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, label: "", z: "front", locked: false, style: STYLE, author: "orhan", at: "2026-10-14T00:00:00Z", ...extra });
const frameOf = (a) => ({ x: a.x, y: a.y, w: a.w, h: a.h });
const target = (infrastructure, hosts = [], groups = [], annotations = []) => ({ infrastructure, hasHost: (h) => hosts.includes(h), hasGroup: (g) => groups.includes(g), hasAnnotation: (a) => annotations.includes(a) });

test("le presse-papiers (clipboard.ts) : la charge versionnée, son texte, sa relecture ; une charge étrangère ou inconnue n'est pas lue", () => {
  const { clipboard: c } = loadApp();
  const a1 = noteA("a1-1"), a2 = noteA("a1-2", { x: 400, y: 50 });
  const line = lineC("c1-1", { kind: "annotation", ref: "a1-1", side: "e" }, { kind: "annotation", ref: "a1-2", side: "auto" });
  const p = c.payloadOf({ infrastructure: "lab", annotations: [{ a: a1, frame: frameOf(a1) }, { a: a2, frame: frameOf(a2) }], connectors: [{ c: line, a: { x: 300.4, y: 90 }, b: { x: 399.6, y: 90 } }], hosts: ["sw-01"] });
  assert.equal(p["living-diagram"], 1, "versionnée");
  assert.equal(p.annotations[0].author, undefined, "ni auteur ni date : le collage les reçoit du serveur");
  assert.deepEqual(clone(p.connectors[0].a), { x: 300, y: 90 }, "les bouts dessinés, entiers");
  assert.equal(c.pastable(p), 3);
  // le texte : la charge en JSON, qui se relit à l'identique ; ou les noms des équipements seuls, un par ligne (D6)
  const text = c.textOf(p);
  assert.ok(text.startsWith('{"living-diagram":1'));
  const back = c.parse(text);
  assert.equal(back.kind, "payload");
  assert.deepEqual(clone(back.payload), clone(p), "aller-retour");
  assert.equal(c.parse("  " + text).kind, "payload", "des blancs devant");
  const names = c.payloadOf({ infrastructure: "lab", annotations: [], connectors: [], hosts: ["sw-01", "sw-02"] });
  assert.equal(c.textOf(names), "sw-01\nsw-02");
  assert.equal(c.pastable(names), 0);
  // étrangère, inconnue, abîmée
  assert.equal(c.parse("Baie 12, rangée 3").kind, "foreign", "un texte d'ailleurs : le comportement d'avant");
  assert.equal(c.parse('{"other": 1}').kind, "foreign");
  assert.equal(c.parse("").kind, "foreign");
  assert.equal(c.parse(text.replace('"living-diagram":1', '"living-diagram":2')).kind, "unknown", "une version inconnue n'est pas lue");
  assert.equal(c.parse(text.slice(0, -5)).kind, "unknown", "tronquée");
  assert.equal(c.parse(JSON.stringify({ ...p, annotations: [{ ...p.annotations[0], frame: null }] })).kind, "unknown", "une annotation sans boîte");
  assert.equal(c.parse(JSON.stringify({ ...p, annotations: [p.annotations[0], p.annotations[0]] })).kind, "unknown", "deux fois la même identité");
  assert.equal(c.parse(JSON.stringify({ ...p, connectors: [{ ...p.connectors[0], start: { kind: "free", x: "1", y: 2 } }] })).kind, "unknown", "une coordonnée en texte");
  assert.equal(c.parse(JSON.stringify({ ...p, hosts: [""] })).kind, "unknown");
  // une image se cite par son empreinte (elle part dans une adresse) : rien d'autre n'est lu
  const image = (asset) => JSON.stringify({ ...p, annotations: [{ ...p.annotations[0], content: { kind: "image", asset, alt: "" } }] });
  assert.equal(c.parse(image("a".repeat(64))).kind, "payload");
  assert.deepEqual(clone(c.assetsOf(c.parse(image("a".repeat(64))).payload)), ["a".repeat(64)]);
  assert.equal(c.parse(image("../intent?x=1")).kind, "unknown", "pas une empreinte");
  assert.equal(c.parse(image("A".repeat(64))).kind, "unknown");
  assert.equal(c.parse('{"living-diagram":1' + " ".repeat(2 * 1024 * 1024) + "}").kind, "unknown", "trop longue : pas lue");
});

test("coller (clipboard.ts) : décalage cumulé, au pointeur aimanté, ancres gardées ou libérées, connecteurs reliés en seconde requête", () => {
  const { clipboard: c } = loadApp();
  const free = noteA("a1-1"), onDevice = noteA("a1-2", { anchor: { kind: "device", ref: "sw-01" }, x: 60, y: -120, leader: true });
  const onGroup = noteA("a1-3", { anchor: { kind: "group", ref: "g1-1" }, x: 0, y: -100, leader: true });
  const devFrame = { x: 500, y: -80, w: 200, h: 80 }, grpFrame = { x: 800, y: 0, w: 200, h: 80 };
  const toNote = lineC("c1-1", { kind: "device", ref: "sw-01", side: "auto" }, { kind: "annotation", ref: "a1-1", side: "w" });
  const between = lineC("c1-2", { kind: "device", ref: "sw-01", side: "auto" }, { kind: "device", ref: "sw-02", side: "auto" });
  const loose = lineC("c1-3", { kind: "free", x: 10, y: 10 }, { kind: "annotation", ref: "a9-9", side: "auto" });
  const p = c.payloadOf({ infrastructure: "lab",
    annotations: [{ a: free, frame: frameOf(free) }, { a: onDevice, frame: devFrame }, { a: onGroup, frame: grpFrame }],
    connectors: [{ c: toNote, a: { x: 450, y: 0 }, b: { x: 100, y: 90 } }, { c: between, a: { x: 450, y: 0 }, b: { x: 700, y: 0 } }, { c: loose, a: { x: 10, y: 10 }, b: { x: 60, y: 60 } }],
    hosts: [] });
  // où : la boîte englobante ; sans pointeur, +20 / +20 cumulés ; au pointeur, le coin haut gauche dessous, aimanté
  const box = c.boundsOf(p);
  assert.deepEqual(clone(box), { x: 10, y: -80, w: 990, h: 210 });
  assert.deepEqual(clone(c.offsetFor(box, null, 1, true)), { x: 20, y: 20 });
  assert.deepEqual(clone(c.offsetFor(box, null, 3, true)), { x: 60, y: 60 }, "le troisième collage de suite : trois pas");
  assert.deepEqual(clone(c.offsetFor(box, { x: 1003, y: 29 }, 1, true)), { x: 990, y: 100 }, "au pointeur aimanté : (1000, 20)");
  assert.deepEqual(clone(c.offsetFor(box, { x: 1003, y: 29 }, 1, false)), { x: 993, y: 109 }, "sans l'aimant : au pixel");
  assert.deepEqual(clone(c.offsetFor(box, { x: 1003, y: 29 }, 2, true)), { x: 1010, y: 120 }, "au même endroit, le second décale encore");
  assert.equal(c.boundsOf(c.payloadOf({ infrastructure: "lab", annotations: [], connectors: [], hosts: ["x"] })), null);
  // dans la même infrastructure, l'équipement et le groupe existent : les ancrages tiennent, décalés comme le reste
  const same = c.pastePlan(p, target("lab", ["sw-01", "sw-02"], ["g1-1"], ["a1-1", "a1-2", "a1-3"]), { x: 20, y: 20 });
  assert.equal(same.ok, true);
  const plan = same.plan;
  assert.deepEqual(clone(plan.first.map((op) => op.op)), ["annotation_create", "annotation_create", "annotation_create", "connector_create", "connector_create"]);
  assert.deepEqual(clone(plan.annotations), ["a1-1", "a1-2", "a1-3"]);
  assert.deepEqual(clone(plan.connectors), ["c1-2", "c1-3"], "les connecteurs sans annotation collée partent avec la première requête");
  const [n1, n2, n3] = plan.first;
  assert.deepEqual(clone([n1.x, n1.y, n1.anchor, n1.locked]), [120, 70, { kind: "free", ref: null }, false], "décalée, déverrouillée");
  assert.deepEqual(clone([n2.x, n2.y, n2.anchor, n2.leader]), [80, -100, { kind: "device", ref: "sw-01" }, true], "attachée : l'écart à l'ancre décalé");
  assert.deepEqual(clone(n3.anchor), { kind: "group", ref: "g1-1" });
  assert.equal(n1.id, undefined, "l'identité vient du serveur");
  const [between2, loose2] = plan.first.slice(3);
  assert.deepEqual(clone([between2.start, between2.end]), [{ kind: "free", x: 470, y: 20 }, { kind: "free", x: 720, y: 20 }], "ses deux bouts restés en place : libérés et décalés, jamais collé sur l'original");
  assert.deepEqual(clone(loose2.start), { kind: "free", x: 30, y: 30 });
  assert.deepEqual(clone(loose2.end), { kind: "free", x: 80, y: 80 }, "une annotation absente : le bout devient libre, à sa dernière place décalée");
  assert.equal(plan.later.length, 1);
  assert.deepEqual(clone(plan.later[0].start), { kind: "device", ref: "sw-01", side: "auto" }, "attaché à ce qui existe : gardé");
  // la seconde requête : les identités que le serveur a données (a<révision>-<n>, dans l'ordre des créations)
  const ids = c.createdIds(plan.annotations, plan.connectors, 7);
  assert.deepEqual(clone(Object.fromEntries(ids)), { "a1-1": "a7-1", "a1-2": "a7-2", "a1-3": "a7-3", "c1-2": "c7-1", "c1-3": "c7-2" });
  assert.deepEqual(clone(c.resolve(plan.later, ids)[0].end), { kind: "annotation", ref: "a7-1", side: "w" });
  assert.equal(plan.later[0].end.ref, "a1-1", "le plan n'a pas été muté");
  // d'une autre infrastructure : l'équipement du même nom tient ; un id de groupe ne veut rien dire ailleurs
  const other = c.pastePlan(p, target("lab-2", ["sw-01"], ["g1-1"], ["a1-1"]), { x: 0, y: 0 });
  const [o1, o2, o3] = other.plan.first;
  assert.deepEqual(clone(o2.anchor), { kind: "device", ref: "sw-01" });
  assert.deepEqual(clone([o3.anchor, o3.x, o3.y, o3.leader]), [{ kind: "free", ref: null }, 800, 0, false], "groupe absent : libre, à sa place dans le plan, sans ligne de rappel");
  assert.deepEqual(clone(o1.anchor), { kind: "free", ref: null });
  assert.equal(other.plan.later[0].start.kind, "device");
  assert.deepEqual(clone(other.plan.first[3].end), { kind: "free", x: 700, y: 0 }, "sw-02 absent : libéré");
  assert.ok(other.plan.freed >= 2);
  // une image introuvable devient une note qui porte son texte de remplacement
  const img = noteA("a1-5", { content: { kind: "image", asset: "f".repeat(64), alt: "Baie 12" } });
  const imgs = c.payloadOf({ infrastructure: "lab", annotations: [{ a: img, frame: frameOf(img) }], connectors: [], hosts: [] });
  assert.deepEqual(clone(c.pastePlan(imgs, target("lab-2"), { x: 0, y: 0 }, new Set(["f".repeat(64)]), "?").plan.first[0].content), { kind: "note", text: "Baie 12" });
  assert.deepEqual(clone(c.pastePlan(imgs, target("lab-2"), { x: 0, y: 0 }).plan.first[0].content), clone(img.content), "trouvée : l'image");
  // rien, trop
  assert.deepEqual(clone(c.pastePlan(c.payloadOf({ infrastructure: "lab", annotations: [], connectors: [], hosts: ["sw-01"] }), target("lab"), { x: 0, y: 0 })), { ok: false, reason: "nothing" }, "des équipements seuls : rien ne se crée (D6)");
  const many = c.payloadOf({ infrastructure: "lab", annotations: Array.from({ length: 501 }, (_, i) => ({ a: noteA("a1-" + i), frame: frameOf(noteA("x")) })), connectors: [], hosts: [] });
  assert.equal(c.pastePlan(many, target("lab"), { x: 0, y: 0 }).reason, "too_many");
});

test("dupliquer et cloner (clipboard.ts) : Ctrl+D répète l'écart du dernier clone tant que la sélection est la copie ; le fantôme suit", () => {
  const { clipboard: c } = loadApp();
  assert.deepEqual(clone(c.duplicateStep(null, "a|b#")), { x: 20, y: 20 });
  const last = { key: c.keyOf(["a7-2", "a7-1"], ["c7-1"]), d: { x: 140, y: -60 } };
  assert.equal(last.key, "a7-1|a7-2#c7-1", "triée");
  assert.deepEqual(clone(c.duplicateStep(last, "a7-1|a7-2#c7-1")), { x: 140, y: -60 }, "la sélection est la copie : le même écart");
  assert.deepEqual(clone(c.duplicateStep(last, "a7-1#")), { x: 20, y: 20 }, "une autre sélection : un pas");
  const n = noteA("a1-1"), stay = lineC("c1-1", { kind: "device", ref: "sw-01", side: "auto" }, { kind: "annotation", ref: "a1-1", side: "auto" });
  const p = c.payloadOf({ infrastructure: "lab", annotations: [{ a: n, frame: frameOf(n) }], connectors: [{ c: stay, a: { x: 0, y: 0 }, b: { x: 100, y: 90 } }], hosts: [] });
  const g = c.ghostOf(p, target("lab", ["sw-01"]), { x: 40, y: 20 });
  assert.deepEqual(clone(g.annotations[0].frame), { x: 140, y: 70, w: 200, h: 80 });
  assert.deepEqual(clone([g.lines[0].a, g.lines[0].b]), [{ x: 0, y: 0 }, { x: 140, y: 110 }], "le bout sur l'équipement reste, celui sur la note collée suit");
});

test("un collage en deux requêtes : une seule entrée d'annulation, « ajout de n éléments »", () => {
  const { history: h } = loadApp();
  const creates = [{ op: "annotation_create", content: { kind: "note", text: "x" }, x: 0, y: 0 }, { op: "connector_create", start: { kind: "free", x: 0, y: 0 }, end: { kind: "free", x: 9, y: 9 } }];
  assert.deepEqual(clone(h.labelOf(creates)), { key: "createdItems", count: 2 });
  assert.equal(h.labelText(h.labelOf(creates)), "ajout de 2 éléments");
  assert.equal(h.labelOf([creates[0]]).key, "annotationCreated", "une seule création : le libellé d'avant");
  const first = { kind: "intent", label: { key: "annotationCreated" }, changes: [{ key: "annotation\u0000a7-1", before: null, after: { x: 0 } }] };
  const other = { kind: "intent", label: { key: "moved" }, changes: [{ key: "pin\u0000sw", before: null, after: { x: 1, y: 1 } }] };
  const second = { kind: "intent", label: { key: "connectorCreated" }, changes: [{ key: "connector\u0000c8-1", before: null, after: { x: 1 } }] };
  const stack = h.push(h.push(h.emptyStack(), first), other); // un autre geste s'est empilé entre les deux requêtes
  const joined = h.absorb(stack, first, second);
  assert.equal(joined.stack.undo.length, 2, "aucune entrée de plus");
  assert.equal(joined.stack.undo[0], joined.entry, "à la place de la première");
  assert.equal(joined.stack.undo[1], other);
  assert.equal(h.labelText(joined.entry.label), "ajout de 2 éléments");
  assert.deepEqual(clone(joined.entry.changes.map((x) => x.key)), ["annotation\u0000a7-1", "connector\u0000c8-1"]);
  const gone = h.absorb(h.push(h.emptyStack(), other), first, second);
  assert.equal(gone.stack.undo.length, 2, "la première sortie de la pile : la seconde entre seule");
  assert.equal(gone.entry, second);
});

test("le menu contextuel porte copier, couper, coller, dupliquer avec leurs raccourcis ; en lecture seule, copier seulement", () => {
  const { context } = loadApp();
  const model = { annotationById: new Map([["a1", { id: "a1", anchor: { kind: "free", ref: null }, z: "front", locked: false, content: { kind: "note", text: "x" } }]]), connectorById: new Map(), groupById: new Map() };
  const ctx = { editable: true, selectedHosts: [], hasSelection: false, pinned: () => false };
  const clip = (items) => items.filter((i) => i.id.startsWith("clip:")).map((i) => [i.id, i.label, i.keys, i.aria]);
  assert.deepEqual(clone(clip(context.menuItems({ kind: "annotation", id: "a1" }, model, ctx))), [
    ["clip:copy", "copier", "Ctrl+C", "Control+C"], ["clip:cut", "couper", "Ctrl+X", "Control+X"],
    ["clip:paste", "coller ici", "Ctrl+V", "Control+V"], ["clip:duplicate", "dupliquer", "Ctrl+D", "Control+D"]]);
  assert.deepEqual(clone(clip(context.menuItems({ kind: "annotation", id: "a1" }, model, { ...ctx, editable: false })).map((i) => i[0])), ["clip:copy"]);
  // le fond : coller, et coller comme bloc de code (Ctrl+Maj+V, Orhan, 2026-10-15)
  assert.deepEqual(clone(clip(context.menuItems({ kind: "pane" }, model, ctx))), [["clip:paste", "coller ici", "Ctrl+V", "Control+V"], ["clip:pasteCode", "coller comme bloc de code", "Ctrl+Maj+V", "Control+Shift+V"]]);
  assert.deepEqual(clone(clip(context.menuItems({ kind: "pane" }, model, { ...ctx, editable: false }))), [], "lecture seule : rien ne se colle");
  assert.equal(clip(context.menuItems({ kind: "node", id: "sw-01" }, model, ctx))[0][1], "copier le nom");
  assert.equal(clip(context.menuItems({ kind: "node", id: "sw-01" }, model, { ...ctx, selectedHosts: ["sw-01", "sw-02"], items: 2 }))[0][1], "copier les noms");
  assert.equal(clip(context.menuItems({ kind: "node", id: "sw-01" }, model, { ...ctx, selectedHosts: ["sw-01", "sw-02"], items: 3 }))[0][1], "copier la sélection");
  assert.equal(context.menuItems({ kind: "annotation", id: "a1" }, model, ctx).some((i) => i.id === "duplicate"), false, "l'ancienne entrée « dupliquer » est remplacée");
});

test("coller, après revue (clipboard.ts) : ancre d'ici (M5), identités vérifiées dans la réponse (M2), borne en octets (B4)", () => {
  const { clipboard: c } = loadApp();
  // M5 : l'équipement est ailleurs ici qu'à l'origine ; la boîte collée tombe quand même sous le pointeur
  const onDevice = noteA("a1-2", { anchor: { kind: "device", ref: "sw-01" }, x: 60, y: -120, leader: true });
  const frame = { x: 560, y: -80, w: 200, h: 80 }; // à l'origine, le centre de sw-01 est en (500, 40)
  const p = c.payloadOf({ infrastructure: "lab", annotations: [{ a: onDevice, frame }], connectors: [], hosts: [] });
  const here = { ...target("lab-2", ["sw-01"]), anchorAt: (kind, ref) => (kind === "device" && ref === "sw-01" ? { x: -300, y: 900 } : null) };
  const d = c.offsetFor(c.boundsOf(p), { x: 100, y: 100 }, 1, false);
  const op = c.pastePlan(p, here, d).plan.first[0];
  assert.deepEqual(clone(op.anchor), { kind: "device", ref: "sw-01" }, "l'ancre est gardée");
  assert.deepEqual(clone([-300 + op.x, 900 + op.y]), [100, 100], "centre d'ici (-300, 900) + écart écrit = le pointeur");
  const same = c.pastePlan(p, { ...target("lab", ["sw-01"]), anchorAt: () => ({ x: 500, y: 40 }) }, { x: 20, y: 20 }).plan.first[0];
  assert.deepEqual(clone([same.x, same.y]), [80, -100], "ici comme à l'origine : l'écart d'avant, décalé");
  const hidden = c.pastePlan(p, { ...target("lab", ["sw-01"]), anchorAt: () => null }, { x: 20, y: 20 }).plan.first[0];
  assert.deepEqual(clone([hidden.x, hidden.y]), [80, -100], "ancre non dessinée : l'écart d'origine");
  // M2 : chaque identité calculée doit être dans la réponse, de la sorte et à la place envoyées
  const n1 = noteA("a1-1"), line = lineC("c1-1", { kind: "free", x: 1, y: 2 }, { kind: "free", x: 3, y: 4 });
  const q = c.payloadOf({ infrastructure: "lab", annotations: [{ a: n1, frame: frameOf(n1) }], connectors: [{ c: line, a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }], hosts: [] });
  const plan = c.pastePlan(q, target("lab"), { x: 20, y: 20 }).plan;
  const ids = c.createdIds(plan.annotations, plan.connectors, 5);
  const sentNote = plan.first[0], sentLine = plan.first[1];
  const answer = { annotations: [{ id: "a5-1", x: sentNote.x, y: sentNote.y, content: { kind: "note" } }], connectors: [{ id: "c5-1", start: { y: 22, x: 21, kind: "free" }, end: { kind: "free", x: 23, y: 24 } }] };
  assert.deepEqual(clone(c.verifyCreated(answer, plan.first, ids, plan)), { ok: true, found: ["a5-1", "c5-1"] }, "l'ordre des clés d'un bout ne compte pas");
  assert.equal(sentLine.start.x, 21);
  const other = { ...answer, annotations: [{ id: "a5-1", x: 999, y: sentNote.y, content: { kind: "note" } }] };
  assert.deepEqual(clone(c.verifyCreated(other, plan.first, ids, plan)), { ok: false, found: ["c5-1"] }, "a5-1 est l'annotation d'un autre");
  assert.equal(c.verifyCreated({ annotations: [], connectors: [] }, plan.first, ids, plan).ok, false);
  // B4 : la borne en octets, celle de la requête (pas en caractères)
  assert.equal(c.bytesOf([{ op: "x", t: "é" }]), JSON.stringify([{ op: "x", t: "é" }]).length + 1);
  assert.equal(c.bytesOf([{ t: "😀" }]), JSON.stringify([{ t: "" }]).length + 4);
  const heavy = c.payloadOf({ infrastructure: "lab", annotations: Array.from({ length: 300 }, (_, i) => { const a = noteA("a1-" + i, { content: { kind: "note", text: "é".repeat(1990) } }); return { a, frame: frameOf(a) }; }), connectors: [], hosts: [] });
  assert.ok(JSON.stringify(heavy).length < 2 * 1024 * 1024, "admis par la garde de lecture");
  assert.equal(c.pastePlan(heavy, target("lab"), { x: 0, y: 0 }).reason, "too_big", "refusé avant l'envoi");
});

// ——— La barre contextuelle (lot 4 de docs/11) ———
function floatingModel() {
  const style = { hue: "amber", fill_opacity: 25, stroke_style: "solid", stroke_width: 1, radius: 6, opacity: 100, text_size: 13, text_weight: "regular", text_font: "sans", text_color: "ink", text_align: "left", text_valign: "top" };
  const note = { id: "a1-1", anchor: { kind: "free", ref: null }, x: 0, y: 0, w: 200, h: 80, z: "front", locked: false, leader: false, content: { kind: "note", text: "Baie" }, style };
  const attached = { ...note, id: "a1-2", anchor: { kind: "device", ref: "sw-core-01" } };
  const ellipse = { ...note, id: "a1-3", content: { kind: "shape", shape: "ellipse", label: "" } };
  const rect = { ...note, id: "a1-4", content: { kind: "shape", shape: "rectangle", label: "Baie 12" } };
  const table = { ...note, id: "a1-5", content: { kind: "table", header: true, rows: [["a", "b"]], widths: null, heights: null, merges: [] } };
  const image = { ...note, id: "a1-6", locked: true, content: { kind: "image", asset: "x".repeat(64), alt: "" } };
  const line = { id: "c1-1", start: { kind: "free", x: 0, y: 0 }, end: { kind: "annotation", ref: "a1-1", side: "auto" }, heads: { start: "none", end: "arrow" }, route: "straight", bend: 0, z: "front", locked: false, label: "", style: { hue: "slate", stroke_style: "solid", stroke_width: 2, opacity: 100 } };
  const group = { id: "g1-1", label: "Cœurs", members: ["sw-core-01", "sw-core-02"], style: { hue: "indigo", shape: "rectangle", label_position: "top_left" } };
  const node = (hostname, extra = {}) => [hostname, { hostname, kind: "device", type: "switch", ...extra }];
  return {
    annotationById: new Map([note, attached, ellipse, rect, table, image].map((a) => [a.id, a])), connectorById: new Map([[line.id, line]]), groupById: new Map([[group.id, group]]),
    nodeByHost: new Map([node("sw-core-01"), node("sw-core-02"), node("fw-01", { type: "firewall" }), node("phone-1", { kind: "stub", type: null }), node("old-sw", { ghost: true })]),
    colorByHost: new Map([["fw-01", { hue: "red" }]]), colorByType: new Map(), pinByHost: new Map([["sw-core-02", { x: 0, y: 0 }]]), groupsByHost: new Map([["sw-core-01", [group]]]),
  };
}

test("la barre contextuelle (floating.ts) : quelle sélection en a une, pour quel droit ; les boutons de chaque sorte", () => {
  const { floating: f, selecting: sel } = loadApp();
  const model = floatingModel();
  const none = sel.empty();
  const one = (kind, id) => f.targetOf(model, { kind, id }, sel.multiOf([{ kind: kind === "node" ? "node" : kind, id }]));
  assert.equal(one("annotation", "a1-1").kind, "annotation");
  assert.equal(one("connector", "c1-1").kind, "connector");
  assert.equal(one("group", "g1-1").kind, "group");
  assert.equal(one("node", "sw-core-01").kind, "device");
  assert.equal(one("node", "phone-1"), null, "un voisin inconnu n'a pas de barre");
  assert.equal(one("node", "old-sw"), null, "ni un fantôme du diff");
  assert.equal(f.targetOf(model, { kind: "link", id: "x" }, none), null, "ni un câble");
  assert.equal(f.targetOf(model, { kind: "cluster", id: "x" }, none), null, "ni un cluster");
  assert.equal(f.targetOf(model, null, sel.multiOf([{ kind: "node", id: "sw-core-01" }, { kind: "annotation", id: "a1-1" }])).kind, "multi");
  const ctx = { editable: true, control: false, tool: false, preferred: true, summoned: false };
  assert.equal(f.shows(ctx), true);
  assert.equal(f.shows({ ...ctx, control: true }), false, "en Contrôle : jamais");
  assert.equal(f.shows({ ...ctx, editable: false }), false, "sans nom : jamais");
  assert.equal(f.shows({ ...ctx, tool: true }), false, "l'outil connecteur armé prend la toile");
  assert.equal(f.shows({ ...ctx, preferred: false }), false, "masquée par préférence");
  assert.equal(f.shows({ ...ctx, preferred: false, summoned: true }), true, "Alt+T la rappelle");
  const ids = (target) => clone(f.entriesOf(model, target).map((e) => e.id));
  assert.deepEqual(ids(one("annotation", "a1-1")), ["hue", "sep", "text_size", "bold", "text_align", "sep", "plane", "lock", "sep", "duplicate", "delete"], "la note");
  assert.deepEqual(ids(one("annotation", "a1-2")), ["hue", "sep", "text_size", "bold", "text_align", "sep", "lock", "sep", "duplicate", "delete"], "attachée : pas de plan (lot 1)");
  assert.deepEqual(ids(one("annotation", "a1-3")), ["hue", "fill_opacity", "stroke_style", "sep", "edit_label", "sep", "plane", "lock", "sep", "duplicate", "delete"], "une ellipse n'a pas de coins");
  assert.deepEqual(ids(one("annotation", "a1-4")), ["hue", "fill_opacity", "stroke_style", "radius", "sep", "edit_label", "sep", "plane", "lock", "sep", "duplicate", "delete"], "la forme");
  assert.deepEqual(ids(one("annotation", "a1-5")), ["add_row", "add_column", "header", "sep", "hue", "sep", "plane", "sep", "delete"], "le tableau");
  assert.deepEqual(ids(one("annotation", "a1-6")), ["replace", "opacity", "sep", "plane", "lock", "sep", "delete"], "l'image");
  assert.deepEqual(ids(one("connector", "c1-1")), ["heads", "route", "sep", "hue", "stroke_width", "line_style", "sep", "reverse", "lock", "sep", "delete"], "le connecteur");
  assert.deepEqual(ids(one("group", "g1-1")), ["hue", "shape", "label_position", "sep", "select_members", "paint_members", "sep", "delete"], "le groupe");
  assert.deepEqual(ids(one("node", "sw-core-01")), ["hue", "sep", "pin", "group", "sep", "note", "connect", "sep", "hide", "isolate"], "l'équipement");
  const entries = (target) => f.entriesOf(model, target);
  const by = (target, id) => entries(target).find((e) => e.id === id);
  assert.equal(by(one("annotation", "a1-6"), "lock").pressed, true, "verrouillée : la bascule est enfoncée");
  assert.equal(by(one("annotation", "a1-1"), "text_size").volet.value, "13");
  assert.deepEqual(clone(by(one("annotation", "a1-1"), "text_size").volet.options.map((o) => o.value)), ["12", "13", "15"]);
  assert.equal(by(one("annotation", "a1-1"), "delete").keys, "Suppr");
  assert.equal(by(one("annotation", "a1-1"), "delete").aria, "Delete");
  assert.equal(by(one("annotation", "a1-1"), "duplicate").aria, "Control+D");
  assert.equal(by(one("node", "sw-core-02"), "pin").label, "retirer l'épingle", "épinglé : la bascule retire l'épingle");
  assert.equal(by(one("node", "sw-core-02"), "pin").pressed, true);
  assert.deepEqual(clone(by(one("node", "sw-core-01"), "group").volet.groups), [], "un groupe dont il est déjà membre n'est pas proposé");
  const fw = by(one("node", "fw-01"), "hue").volet;
  assert.deepEqual([fw.value, fw.inherited, fw.allowDefault], ["red", "violet", true], "sa teinte, celle du type en dessous, « défaut du type »");
  assert.equal(by(one("annotation", "a1-1"), "hue").label, "teinte : ambre", "le bouton teinte dit sa valeur");
  assert.equal(f.barLabel(one("annotation", "a1-1")), "actions rapides : note");
  assert.equal(f.barLabel(one("node", "fw-01")), "actions rapides : fw-01");
});

test("la barre contextuelle, sélection multiple : aligner et répartir, grouper, teinte ; dupliquer, supprimer, verrou ; ou masquer et isoler", () => {
  const { floating: f, selecting: sel } = loadApp();
  const model = floatingModel();
  const many = (items) => f.targetOf(model, null, sel.multiOf(items));
  const ids = (target) => clone(f.entriesOf(model, target).map((e) => e.id));
  const two = many([{ kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }]);
  assert.deepEqual(ids(two), ["align", "sep", "group", "hue", "sep", "hide", "isolate"], "des équipements seuls : ni dupliquer, ni supprimer, ni verrou");
  const align = f.entriesOf(model, two).find((e) => e.id === "align").volet;
  assert.deepEqual(clone(align.rows.map((r) => r.map((c) => c.mode))), [["left", "center", "right"], ["top", "middle", "bottom"]], "à deux, pas de répartition");
  const mixed = many([{ kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }, { kind: "annotation", id: "a1-1" }, { kind: "connector", id: "c1-1" }]);
  assert.deepEqual(ids(mixed), ["align", "sep", "group", "hue", "sep", "duplicate", "delete", "lock"], "mixte");
  const rows = f.entriesOf(model, mixed).find((e) => e.id === "align").volet.rows;
  assert.deepEqual(clone(rows.map((r) => r.map((c) => c.mode))), [["left", "center", "right", "distribute-horizontal"], ["top", "middle", "bottom", "distribute-vertical"]], "à trois, répartir");
  assert.deepEqual(clone(rows[0].map((c) => c.keys)), ["Alt+A", "Alt+H", "Alt+D", "Alt+Maj+H"]);
  assert.equal(rows[0][3].aria, "Alt+Shift+H");
  assert.equal(f.entriesOf(model, mixed).find((e) => e.id === "delete").label, "supprimer les annotations (les équipements restent)");
  assert.equal(f.movableCount(model, sel.multiOf([{ kind: "node", id: "old-sw" }, { kind: "annotation", id: "a1-6" }, { kind: "node", id: "sw-core-01" }])).count, 1, "ni un fantôme, ni une annotation verrouillée ne s'alignent");
  const notes = many([{ kind: "annotation", id: "a1-1" }, { kind: "annotation", id: "a1-4" }]);
  assert.deepEqual(ids(notes), ["align", "sep", "hue", "sep", "duplicate", "delete", "lock"], "des annotations seules : pas de groupe ; la teinte (prototype validé)");
  const locked = many([{ kind: "annotation", id: "a1-6" }, { kind: "group", id: "g1-1" }]);
  assert.deepEqual(ids(locked), ["hue", "sep", "duplicate", "delete", "lock"], "une image verrouillée et un groupe : rien ne s'aligne (le cadre n'est pas une boîte qui bouge seule)");
  assert.equal(f.entriesOf(model, locked).find((e) => e.id === "lock").label, "déverrouiller", "l'image verrouillée : le verrou propose de l'ouvrir");
  assert.deepEqual(ids(many([{ kind: "group", id: "g1-1" }, { kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }])), ["align", "sep", "group", "hue", "sep", "delete"], "un groupe avec ses membres : supprimer le groupe, les équipements restent");
  const lockedTwo = f.targetOf({ ...model, annotationById: new Map([...model.annotationById].map(([k, a]) => [k, { ...a, locked: true }])) }, null, sel.multiOf([{ kind: "annotation", id: "a1-1" }, { kind: "annotation", id: "a1-4" }]));
  const lockButton = f.entriesOf({ ...model, annotationById: new Map([...model.annotationById].map(([k, a]) => [k, { ...a, locked: true }])) }, lockedTwo).find((e) => e.id === "lock");
  assert.equal(lockButton.pressed, true, "toutes verrouillées : la bascule est enfoncée");
  assert.equal(lockButton.label, "déverrouiller");
  const half = f.entriesOf(model, many([{ kind: "annotation", id: "a1-1" }, { kind: "annotation", id: "a1-6" }])).find((e) => e.id === "lock");
  assert.deepEqual([half.pressed, half.label], [false, "verrouiller"], "une seule verrouillée sur deux : le verrou propose de tout verrouiller");
  const hues = f.entriesOf(model, many([{ kind: "node", id: "sw-core-01" }, { kind: "node", id: "fw-01" }])).find((e) => e.id === "hue");
  assert.deepEqual(clone(hues.face.hues), ["red", "blue"], "teintes mêlées : un disque coupé (dans l'ordre des équipements)");
  assert.equal(hues.volet.value, null, "pas de teinte commune posée");
  assert.equal(hues.label, "teinte : mixte");
  // la teinte d'une sélection mixte : tout ce qui en a une ; « défaut » pour des équipements seuls
  const mix = f.multiHues(model, sel.multiOf([{ kind: "node", id: "sw-core-01" }, { kind: "annotation", id: "a1-1" }, { kind: "group", id: "g1-1" }]), ["sw-core-01"]);
  assert.deepEqual(clone(mix), { effective: ["blue", "amber", "indigo"], value: null, inherited: null, devicesOnly: false });
  const same = f.multiHues(model, sel.multiOf([{ kind: "annotation", id: "a1-1" }, { kind: "annotation", id: "a1-4" }]), []);
  assert.deepEqual(clone(same), { effective: ["amber"], value: "amber", inherited: "amber", devicesOnly: false }, "deux notes ambre : la teinte posée commune");
  assert.equal(f.multiHues(model, sel.multiOf([{ kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }]), ["sw-core-01", "sw-core-02"]).devicesOnly, true);
  assert.equal(f.multiHues(model, sel.empty(), []), null, "rien qui se colore");
  // les raccourcis : la lettre lue, sinon la touche (Option sous macOS donne « å ») ; Maj pour répartir
  assert.equal(f.alignFromKey("a", "KeyQ", false), "left", "AZERTY : la lettre A");
  assert.equal(f.alignFromKey("å", "KeyA", false), "left");
  assert.equal(f.alignFromKey("H", "KeyH", true), "distribute-horizontal");
  assert.equal(f.alignFromKey("v", "KeyV", false), "middle");
  assert.equal(f.alignFromKey("t", "KeyT", false), null, "Alt+T est le focus de la barre");
  // une sélection de cartes seules garde la règle des centres (lot 2)
  assert.equal(f.alignCommand("center", true), "vertical");
  assert.equal(f.alignCommand("middle", true), "horizontal");
  assert.equal(f.alignCommand("center", false), "center");
  assert.equal(f.alignCommand("left", true), "left");
  // les cycles
  assert.deepEqual(clone(f.nextHeads({ heads: { start: "none", end: "arrow" } })), { start: "arrow", end: "none" });
  assert.deepEqual(clone(f.nextHeads({ heads: { start: "arrow", end: "arrow" } })), { start: "none", end: "none" });
  assert.equal(f.nextTextAlign("left"), "center");
  assert.equal(f.nextTextAlign("right"), "left");
  assert.equal(f.selectionKey(null, sel.empty()), "");
});

test("la barre contextuelle, où : au-dessus, sinon dessous, jamais hors de la zone ; elle évite une annotation ; un connecteur s'ancre au milieu", () => {
  const { floating: f, selecting: sel } = loadApp();
  const zone = { left: 8, top: 100, right: 1000, bottom: 800 };
  const anchor = { x: 400, y: 400, w: 200, h: 80 };
  const top = f.placeBar(anchor, 280, zone, []);
  assert.deepEqual(clone(top), { x: 360, y: 356, below: false, side: "above", covers: 0, caret: 140, caretY: 26 }, "centrée, 8 au-dessus (36 de haut)");
  const low = f.placeBar({ ...anchor, y: 120 }, 280, zone, []);
  assert.equal(low.below, true, "le haut manque : dessous");
  assert.equal(low.y, 120 + 80 + 8);
  assert.equal(f.placeBar({ ...anchor, y: 900 }, 280, zone, []), null, "l'ancre hors de la zone : pas de place");
  const tall = f.placeBar({ x: 400, y: 110, w: 200, h: 680 }, 280, zone, []);
  assert.deepEqual([tall.y, tall.below], [100, false], "ni dessus ni dessous : en haut de la zone");
  // une annotation au-dessus, centrée : la barre passe dessous (passer dessous coûte moins que la couvrir)
  const note = { box: { x: 420, y: 330, w: 160, h: 60 }, weight: 1 };
  const avoided = f.placeBar(anchor, 280, zone, [note]);
  assert.equal(avoided.below, true);
  assert.equal(avoided.covers, 0);
  // une petite carte qui déborde à peine : se décaler un peu coûte moins
  const card = { box: { x: 620, y: 350, w: 100, h: 20 }, weight: 0.5 };
  const shifted = f.placeBar(anchor, 280, zone, [card]);
  assert.deepEqual([shifted.below, shifted.covers], [false, 0]);
  assert.equal(shifted.x < 360 && shifted.x + 280 <= 612, true, "décalée juste assez à gauche");
  assert.equal(shifted.caret > 140, true, "l'ergot pointe toujours l'ancre");
  // un connecteur : son tracé est un obstacle fort ; vertical, la barre se pose à côté (jamais sur l'objet) ;
  // horizontal, au-dessus
  const mid = { x: 499, y: 389, w: 2, h: 22 };
  const vertical = Array.from({ length: 20 }, (_, i) => ({ box: { x: 497, y: 300 + 10 * i, w: 6, h: 6 }, weight: 40 }));
  const side = f.placeBar(mid, 280, zone, vertical, true);
  assert.deepEqual([side.side, side.covers, side.y, side.caretY], ["left", 0, 382, 18], "à gauche du tracé, centrée sur son milieu");
  assert.equal(side.x + 280 + 8, 499);
  const horizontal = Array.from({ length: 20 }, (_, i) => ({ box: { x: 400 + 10 * i, y: 397, w: 6, h: 6 }, weight: 40 }));
  assert.equal(f.placeBar(mid, 280, zone, horizontal, true).side, "above", "un tracé horizontal : au-dessus");
  assert.equal(f.placeBar(mid, 280, zone, vertical, false).side !== "left", true, "sans `beside`, jamais à côté");
  const edge = f.placeBar({ x: 10, y: 400, w: 20, h: 20 }, 280, zone, []);
  assert.deepEqual([edge.x, edge.caret], [8, 14], "contre le bord : la barre reste dans la zone, l'ergot à 14 au moins");
  // le volet : du côté opposé à la sélection, sinon au-delà de la sélection ; jamais sur l'objet
  const bar = { x: 360, y: 356, w: 280, h: 36 };
  const opener = { x: 380, y: 360, w: 28, h: 28 };
  assert.deepEqual(clone(f.placeVolet(bar, false, opener, 200, 100, zone, anchor)), { x: 372, y: 250, up: true, maxH: null, side: "above", caret: 22 }, "au-dessus de la barre, sa flèche sur son bouton");
  const cramped = { ...zone, top: 300 };
  const flipped = f.placeVolet(bar, false, opener, 200, 100, cramped, anchor);
  assert.deepEqual(clone(flipped), { x: 372, y: 486, up: false, maxH: null, side: "below", caret: 22 }, "pas de place au-dessus : sous la sélection, pas dessus");
  // une barre dans la sélection (une grande sélection, la barre en haut de la zone) : au-dessus, le volet couvrirait
  // l'objet ; il passe au-delà de la sélection
  const inside = f.placeVolet({ ...bar, y: 300 }, false, opener, 200, 100, { ...zone, top: 0 }, { x: 300, y: 150, w: 400, h: 300 });
  assert.deepEqual(clone(inside), { x: 372, y: 456, up: false, maxH: null, side: "below", caret: 22 }, "jamais sur l'objet");
  // une grande sélection qui sort par le haut, la barre dessous près de la bande : ni dessous, ni au-delà de la
  // sélection ; le volet se pose à côté de la barre, sur sa rangée, sans couvrir ni la barre ni la sélection
  const tallSel = { x: 300, y: -900, w: 400, h: 1620 };
  const nearBottom = { x: 360, y: 728, w: 280, h: 36 };
  assert.deepEqual(clone(f.placeVolet(nearBottom, true, opener, 200, 70, zone, tallSel)), { x: 646, y: 728, up: false, maxH: null, side: "right", caret: 18 }, "à droite de la barre, vers le bas (vers le haut, il couvrait la sélection), sa flèche vers la rangée");
  const below = f.placeVolet({ ...bar, y: 488 }, true, opener, 200, 100, zone, anchor);
  assert.deepEqual([below.y, below.up], [530, false], "barre dessous : volet dessous");
  // l'ancre : un connecteur seul au milieu de son tracé ; une sélection, la boîte de tout
  const geo = {
    node: (h) => (h === "a" ? { x: 0, y: 0, w: 100, h: 50 } : null), annotation: (id) => (id === "n" ? { x: 200, y: 100, w: 50, h: 50 } : null),
    connector: () => ({ a: { x: 0, y: 0 }, b: { x: 100, y: 200 }, mid: { x: 60, y: 90 } }), group: () => ({ x: -20, y: -20, w: 10, h: 10 }),
  };
  assert.deepEqual(clone(f.anchorOf(sel.multiOf([{ kind: "connector", id: "c" }]), geo)), { x: 59, y: 79, w: 2, h: 22 });
  assert.deepEqual(clone(f.anchorOf(sel.multiOf([{ kind: "node", id: "a" }, { kind: "annotation", id: "n" }, { kind: "group", id: "g" }]), geo)), { x: -20, y: -20, w: 270, h: 170 });
  assert.equal(f.anchorOf(sel.multiOf([{ kind: "node", id: "z" }]), geo), null, "rien de dessiné : pas d'ancre");
  assert.deepEqual(clone(f.toScreen({ x: 10, y: 20, w: 30, h: 40 }, { x: 5, y: 6, zoom: 2 })), { x: 25, y: 46, w: 60, h: 80 });
});

test("à la jauge (lot 13) : deux valeurs égales en profondeur bornée, par identité au-delà ; Map et Set par identité", () => {
  const { reusing: r } = loadApp();
  assert.equal(r.same(1, 1), true);
  assert.equal(r.same(NaN, NaN), true, "NaN égale NaN : une valeur non lue ne fabrique pas un changement");
  assert.equal(r.same(0, -0), true);
  assert.equal(r.same(1, "1"), false);
  assert.equal(r.same(null, {}), false);
  assert.equal(r.same(undefined, null), false);
  assert.equal(r.same({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true, "l'ordre des clés ne compte pas");
  assert.equal(r.same({ a: 1 }, { a: 1, b: 2 }), false, "une clé de plus");
  assert.equal(r.same({ a: undefined }, {}), false, "une clé absente n'est pas une clé à `undefined`");
  assert.equal(r.same({ a: 1 }, { b: 1 }), false, "pas les mêmes clés");
  assert.equal(r.same([1, 2], [1, 2, 3]), false);
  assert.equal(r.same([1, [2, 3]], [1, [2, 4]]), false);
  assert.equal(r.same([1], { 0: 1 }), false, "un tableau n'est pas un objet");
  const map = new Map([["a", 1]]);
  assert.equal(r.same(map, map), true);
  assert.equal(r.same(map, new Map([["a", 1]])), false, "une Map : l'identité seulement");
  const deep = (n) => (n === 0 ? { leaf: 1 } : { next: deep(n - 1) });
  assert.equal(r.same(deep(r.DEPTH - 1), deep(r.DEPTH - 1)), true, "jusqu'à la profondeur bornée");
  assert.equal(r.same(deep(r.DEPTH), deep(r.DEPTH)), false, "au-delà, l'identité seulement");
  const shared = deep(r.DEPTH);
  assert.equal(r.same({ x: shared }, { x: shared }), true, "une même référence, à toute profondeur");
  assert.equal(r.sameItems([1, map, "a"], [1, map, "a"]), true);
  assert.equal(r.sameItems([1, { a: 1 }], [1, { a: 1 }]), false, "un abonnement compare par identité");
  assert.equal(r.sameItems([1], [1, 2]), false);
  assert.equal(r.sameItems([NaN], [NaN]), true);
});

test("à la jauge (lot 13) : un élément montré ressert s'il ne diffère pas ; jamais pendant un glissé", () => {
  const { reusing: r } = loadApp();
  const next = { id: "a", position: { x: 1, y: 2 }, data: { classes: "x", plan: { w: 200, h: 80 } }, selected: false };
  const shown = { id: "a", position: { x: 1, y: 2 }, data: { classes: "x", plan: { w: 200, h: 80 } }, selected: false, measured: { width: 200, height: 80 } };
  assert.equal(r.unchanged(next, shown), true, "les mesures de React Flow ne comptent pas");
  assert.equal(r.unchanged(next, { ...shown, dragging: false }), true, "un glissé fini");
  assert.equal(r.unchanged(next, { ...shown, dragging: true }), false, "pendant un glissé, React Flow tient la place");
  assert.equal(r.unchanged(next, { ...shown, resizing: true }), false);
  assert.equal(r.unchanged(next, { ...shown, extra: 1 }), false, "une clé inconnue de la toile");
  assert.equal(r.unchanged(next, { ...shown, data: { ...shown.data, classes: "x selected" } }), false, "une classe change");
  assert.equal(r.unchanged(next, { ...shown, position: { x: 1, y: 3 } }), false, "une place change");
  assert.equal(r.unchanged({ ...next, width: 10 }, shown), false, "une taille déclarée qui manque");
});

test("à la jauge (lot 13) : une sélection ne redonne à React Flow que les éléments qui changent, avec leurs mesures", () => {
  const { reusing: r } = loadApp();
  const card = (id, classes) => ({ id, type: "card", position: { x: 0, y: 0 }, data: { classes, plan: { w: 200, h: 80, label: { x: 0, y: 0 } } } });
  const shown = Array.from({ length: 500 }, (_, i) => ({ ...card("n" + i, "node"), measured: { width: 200, height: 80 } }));
  // le même dessin reconstruit : la liste montrée elle-même, React Flow ne voit rien
  const same = r.reuse(shown.map((n) => card(n.id, "node")), shown);
  assert.equal(same, shown, "rien n'a changé : la même liste");
  // une sélection : deux classes changent (l'équipement choisi, son voisin éclairé)
  const next = shown.map((n) => card(n.id, n.id === "n7" ? "node selected" : n.id === "n8" ? "node related" : "node"));
  const out = r.reuse(next, shown);
  assert.notEqual(out, shown);
  assert.equal(out.filter((n, i) => n !== shown[i]).length, 2, "deux objets neufs, les 498 autres repris");
  assert.equal(out[7].data.classes, "node selected");
  assert.deepEqual(clone(out[7].measured), { width: 200, height: 80 }, "un élément reconstruit garde ses mesures (sinon caché et sans câbles)");
  assert.equal(out[6], shown[6]);
  // un élément neuf n'a pas de mesures ; une mesure incomplète ne se reprend pas
  const fresh = r.reuse([card("z", "node")], [{ ...card("z", "old"), measured: { width: 200 } }]);
  assert.equal(fresh[0].measured, undefined, "une mesure sans hauteur ne se reprend pas");
  const added = r.reuse(shown.concat([card("new", "node")]), shown);
  assert.equal(added.length, 501);
  assert.equal(added[500].measured, undefined);
  assert.equal(added[0], shown[0]);
  // un ordre qui change : une liste neuve, des objets repris
  const swapped = r.reuse([shown[1], shown[0]].map((n) => card(n.id, "node")), shown.slice(0, 2));
  assert.notEqual(swapped, shown);
  assert.deepEqual([swapped[0], swapped[1]], [shown[1], shown[0]], "l'ordre du neuf, les objets de l'ancien");
  const removed = r.reuse(shown.slice(1).map((n) => card(n.id, "node")), shown);
  assert.notEqual(removed, shown, "un élément de moins : une liste neuve");
  assert.equal(removed[0], shown[1]);
});


// ——— Lot 8 de docs/11 : les repères d'alignement, l'aimant aux objets, mettre en grille ———

const card = (id, x, y, w = 240, h = 80, spaced = true) => ({ id, box: { x, y, w, h }, spaced });

test("les repères (guides.ts) : centre avant bord, une ligne par axe, tolérance en unités du plan, rien hors de portée", () => {
  const { guides: g } = loadApp();
  const cands = [card("a", 0, 0), card("b", 600, 300)];
  // le centre passe avant un bord plus proche : bord gauche à 2, centre à 3
  let s = g.snapMove({ x: 2, y: 200, w: 230, h: 80 }, cands, 8);
  assert.equal(s.dx, 3);
  assert.deepEqual(clone(s.lines.map((l) => [l.axis, l.kind, l.at])), [["x", "center", 120]], "une ligne, sur l'axe pris, au centre de a");
  assert.deepEqual(clone(s.lines[0].hits), ["a"]);
  assert.equal(s.took.y, false, "rien à aligner en y");
  // un bord : le gauche de a, à 5 ; le centre est loin
  s = g.snapMove({ x: 5, y: 200, w: 200, h: 80 }, cands, 8);
  assert.equal(s.dx, -5);
  assert.equal(s.lines[0].kind, "edge");
  assert.deepEqual(clone([s.lines[0].from, s.lines[0].to]), [0, 280], "de l'objet le plus loin à l'autre");
  // jamais un centre sur un bord : le centre de la boîte à 5 du bord gauche de a ne colle à rien
  s = g.snapMove({ x: -95, y: 200, w: 200, h: 80 }, cands, 8);
  assert.equal(s.lines.length, 0, "centre ↔ centre et bord ↔ bord seulement");
  // hors de portée : rien
  s = g.snapMove({ x: 9, y: 200, w: 200, h: 80 }, cands, 8);
  assert.equal(s.lines.length + s.gaps.length, 0);
  assert.equal(s.dx, 0);
  // la tolérance est de 8 px d'écran : 16 unités du plan au zoom 0,5
  const raw = { x: 12, y: 207, w: 240, h: 80 };
  assert.equal(g.placeMove(raw, cands, { guides: true, free: false, grid: null, tol: g.TOLERANCE_PX / 0.5 }).box.x, 0, "au zoom 0,5, 12 unités sont 6 px : ça colle");
  assert.equal(g.placeMove(raw, cands, { guides: true, free: false, grid: null, tol: g.TOLERANCE_PX / 1 }).box.x, 12, "au zoom 1, 12 px : trop loin");
});

test("les repères : l'aimant de la grille après les repères, sur l'axe libre ; Ctrl tenu (free) ni l'un ni l'autre ; entier", () => {
  const { guides: g } = loadApp();
  const cands = [card("a", 0, 0)];
  const raw = { x: 3.4, y: 207.6, w: 240, h: 80 };
  const both = g.placeMove(raw, cands, { guides: true, free: false, grid: 20, tol: 8 });
  assert.deepEqual(clone(both.box), { x: 0, y: 200, w: 240, h: 80 }, "x pris par le repère (bord et centre de a), y aimanté à la grille");
  assert.deepEqual(clone(both.took), { x: true, y: false });
  const free = g.placeMove(raw, cands, { guides: true, free: true, grid: 20, tol: 8 });
  assert.deepEqual(clone(free.box), { x: 3, y: 208, w: 240, h: 80 }, "libre : ni repère ni grille, arrondi");
  assert.equal(free.lines.length, 0);
  const odd = g.placeMove(raw, [card("o", 7, 0)], { guides: true, free: false, grid: 20, tol: 8 });
  assert.deepEqual(clone([odd.box.x, odd.box.y]), [7, 200], "l'axe pris par un repère n'est pas remis sur la grille");
  const off = g.placeMove(raw, cands, { guides: false, free: false, grid: 20, tol: 8 });
  assert.deepEqual(clone([off.box.x, off.box.y]), [0, 200], "repères éteints : la grille seule, sur les deux axes");
});

test("les repères : l'espacement égal, entre deux voisins ou au bout d'une paire ; la chaîne des écarts", () => {
  const { guides: g } = loadApp();
  const row = [card("c1", 0, 0), card("c2", 300, 0)];
  const s = g.snapMove({ x: 597, y: 0, w: 240, h: 80 }, row, 8);
  assert.equal(s.dx, 3, "au bout d'une paire espacée de 60 : le même écart");
  assert.equal(s.gaps.length, 1);
  assert.equal(s.gaps[0].gap, 60);
  assert.equal(s.gaps[0].segs.length, 2, "les deux écarts de 60 se cotent");
  assert.deepEqual(clone(s.gaps[0].hits).sort(), ["c1", "c2"]);
  assert.equal(s.lines.find((l) => l.axis === "y").kind, "center", "en y, le centre de la rangée");
  const between = g.snapMove({ x: 305, y: 0, w: 240, h: 80 }, [card("l", 0, 0), card("r", 600, 0)], 8);
  assert.equal(between.dx, -5, "entre deux : au milieu");
  assert.equal(between.gaps[0].gap, 60);
  // un cadre ne compte pas pour l'espacement
  const framed = g.snapMove({ x: 597, y: 0, w: 240, h: 80 }, [card("c1", 0, 0, 240, 80, false), card("c2", 300, 0, 240, 80, false)], 8);
  assert.equal(framed.gaps.length, 0);
});

test("les repères : un redimensionnement aligne le bord tiré, puis la grille ; jamais sous la taille minimale", () => {
  const { guides: g } = loadApp();
  const cands = [card("a", 0, 0)];
  const start = { x: 0, y: 200, w: 200, h: 80 };
  const opts = { guides: true, free: false, grid: null, tol: 8, min: 20 };
  const right = g.placeResize(start, { ...start, w: 237 }, g.edgesOf("e"), cands, opts);
  assert.deepEqual(clone(right.box), { x: 0, y: 200, w: 240, h: 80 }, "le bord droit sur celui de a");
  assert.deepEqual(clone(right.lines.map((l) => [l.axis, l.kind, l.at])), [["x", "edge", 240]]);
  assert.equal(g.placeResize(start, { ...start, w: 237 }, g.edgesOf("e"), cands, { ...opts, free: true }).box.w, 237, "Ctrl : libre");
  const corner = g.placeResize(start, { ...start, w: 237, h: 87 }, g.edgesOf("se"), cands, { ...opts, grid: 20 });
  assert.deepEqual(clone([corner.box.w, corner.box.h]), [240, 80], "le bas, que rien n'aligne, va à la grille (280)");
  assert.equal(g.placeResize(start, { ...start, w: 5 }, g.edgesOf("e"), [], opts).box.w, 20, "le bord droit non plus : jamais sous 20");
  const left = g.placeResize(start, { x: 196, y: 200, w: 4, h: 80 }, g.edgesOf("w"), [], opts);
  assert.deepEqual(clone([left.box.x, left.box.w]), [180, 20], "jamais sous 20 : le côté opposé reste");
  assert.deepEqual(clone(g.edgesOf("nw")), [["x", 0], ["y", 0]]);
});

test("les repères : les candidates de la vue élargie, les plus proches d'abord, 400 au plus ; le calcul tient sous 2 ms", () => {
  const { guides: g } = loadApp();
  const zone = g.viewZone({ x: -100, y: -50, zoom: 2 }, { width: 800, height: 600 });
  assert.deepEqual(clone(zone), { x: -50, y: -50, w: 600, h: 450 }, "la vue (50, 25, 400 × 300) élargie de moitié");
  const all = [];
  for (let i = 0; i < 30; i += 1) for (let j = 0; j < 30; j += 1) all.push(card(`n${String(i).padStart(2, "0")}-${String(j).padStart(2, "0")}`, i * 300, j * 140));
  all.push(card("far", 1e6, 1e6));
  const picked = g.pickCandidates(all, { x: -1000, y: -1000, w: 20000, h: 20000 }, { x: 0, y: 0, w: 240, h: 80 });
  assert.equal(picked.length, 400);
  assert.equal(picked[0].id, "n00-00", "la plus proche d'abord");
  assert.equal(picked.some((c) => c.id === "far"), false, "hors de la zone : jamais");
  assert.deepEqual(clone(g.pickCandidates(all.slice().reverse(), { x: -1000, y: -1000, w: 20000, h: 20000 }, { x: 0, y: 0, w: 240, h: 80 }).map((c) => c.id)), clone(picked.map((c) => c.id)), "l'ordre d'entrée ne change rien");
  // au milieu du parc, au plus près de tout : les 400 candidates qui l'entourent, alignements et écarts partout
  const box = { x: 4503, y: 2103, w: 240, h: 80 };
  const around = g.pickCandidates(all, { x: -1000, y: -1000, w: 20000, h: 20000 }, box);
  assert.ok(g.snapMove(box, around, 8).lines.length > 0);
  // le temps se mesure dans le contexte principal, comme dans la page : un contexte `vm` à part rend les fonctions
  // natives (Math.min, Math.max) une vingtaine de fois plus lentes depuis le code chargé, sans rapport avec la page
  vm.runInThisContext(fs.readFileSync(APP, "utf8"), { filename: "app.js" });
  const main = globalThis.LDApp.guides, near = main.pickCandidates(all, { x: -1000, y: -1000, w: 20000, h: 20000 }, box);
  for (let k = 0; k < 50; k += 1) main.placeMove(box, near, { guides: true, free: false, grid: 20, tol: 8 });
  const t0 = process.hrtime.bigint();
  const N = 200;
  for (let k = 0; k < N; k += 1) main.placeMove({ ...box, x: box.x + (k % 7) }, near, { guides: true, free: false, grid: 20, tol: 8 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  assert.ok(ms < 2, `un pas de glissé avec 400 candidates : ${ms.toFixed(3)} ms`);
});

test("les repères : un trait interrompu sur les boîtes qu'il traverse ; la pastille à la première place libre ; un nom raccourci", () => {
  const { guides: g } = loadApp();
  const line = { axis: "x", kind: "center", at: 100, from: 0, to: 300, boxes: [], hits: [] };
  assert.deepEqual(clone(g.runs(line, [{ x: 50, y: 100, w: 100, h: 50 }, { x: 400, y: 0, w: 10, h: 10 }], 10)), [[-10, 100], [150, 310]]);
  const edge = { ...line, at: 50 };
  assert.deepEqual(clone(g.runs(edge, [{ x: 50, y: 100, w: 100, h: 50 }], 0)), [[0, 300]], "un repère de bord longe la boîte qu'il aligne : elle ne le coupe pas");
  const zone = { left: 0, top: 0, right: 1000, bottom: 800 };
  const box = { x: 100, y: 100, w: 200, h: 80 };
  assert.deepEqual(clone(g.pillSpot(box, 60, 20, zone, [])), { x: 170, y: 188, w: 60, h: 20 }, "dessous d'abord");
  assert.deepEqual(clone(g.pillSpot(box, 60, 20, zone, [{ x: 100, y: 180, w: 200, h: 40 }])), { x: 170, y: 72, w: 60, h: 20 }, "dessous pris : dessus");
  assert.equal(g.fitName("DC01-ACC-04", 60, 11), "DC01-AC…");
  assert.equal(g.fitName("DC01", 60, 11), "DC01");
});

test("la couleur des repères : chartreuse par défaut, les teintes nommées qui tiennent 3:1 sur la toile dans les deux thèmes, celles-là seulement", () => {
  const { guides: g } = loadApp();
  const css = fs.readFileSync(path.resolve(__dirname, "../../../engine/src/app/styles/tokens.css"), "utf8");
  const block = (selector) => { const at = css.indexOf(selector); const open = css.indexOf("{", at); return css.slice(open, css.indexOf("}", open)); };
  const tokens = (text) => Object.fromEntries(Array.from(text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g), (m) => [m[1], m[2]]));
  const dark = tokens(block(":root {")), light = tokens(block(':root[data-theme="light"] {'));
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const holds = (name) => ratio(dark[name], dark.bg) >= 3 && ratio(light[name], light.bg) >= 3;
  assert.ok(holds("guide-default"), "le chartreuse (#c6f03a, #4f7a00) tient sur la toile");
  assert.equal(dark["guide-default"].toLowerCase(), "#c6f03a");
  assert.equal(light["guide-default"].toLowerCase(), "#4f7a00");
  const hues = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"];
  const ok = hues.filter((h) => holds("hue-" + h));
  assert.deepEqual(clone(g.GUIDE_HUES), ok, "proposées exactement : celles qui tiennent 3:1 dans les deux thèmes");
  assert.ok(ok.length >= 8 && !ok.includes("orange"), ok.join(","));
  assert.equal(g.guideColor("teal"), "var(--hue-teal)");
  assert.equal(g.guideColor(null), null);
  assert.equal(g.guideColor("orange"), null, "une teinte non proposée ne se pose pas");
});

test("mettre en grille (align.ts) : colonnes par défaut au moins de cases vides, ordre par nom ou à l'écran, places entières centrées", () => {
  const { gridding: grid } = loadApp();
  assert.deepEqual([1, 2, 3, 12, 20].map(grid.gridColumns), [1, 2, 3, 4, 5], "12 → 4 × 3, 20 → 5 × 4");
  assert.equal(grid.gridColumns(144), 16, "à égalité de cases vides (12 × 12 ou 16 × 9), la plus large");
  for (let n = 2; n <= 80; n += 1) { // la règle, exactement : entre ⌈√n⌉ et ⌈√(1,6 n)⌉, le moins de cases vides, à égalité la plus large
    const lo = Math.ceil(Math.sqrt(n)), hi = Math.ceil(Math.sqrt(n * 1.6)), holes = (c) => Math.ceil(n / c) * c - n;
    let want = hi;
    for (let c = hi; c >= lo; c -= 1) if (holes(c) < holes(want)) want = c;
    assert.equal(grid.gridColumns(n), want, `n = ${n}`);
  }
  assert.deepEqual(["dc01-acc-10", "dc01-acc-2", "DC01-acc-1", "dc01-acc-02"].sort(grid.naturalCompare), ["DC01-acc-1", "dc01-acc-02", "dc01-acc-2", "dc01-acc-10"], "les chiffres comme des nombres, sans la casse");
  const items = [7, 3, 12, 1, 5, 9, 2, 11, 4, 6, 10, 8].map((k, i) => ({ id: "node\u0000acc-" + k, name: "acc-" + k, box: { x: 37 + (i % 5) * 310 + (i * 13) % 40, y: 600 + Math.floor(i / 5) * 170 - (i * 7) % 30, w: 240, h: 80 } }));
  const plan = grid.gridBoxes(items, {});
  assert.equal(plan.cols, 4);
  assert.equal(plan.rows, 3);
  assert.deepEqual(clone(plan.ordered.map((g) => g.name)), ["acc-1", "acc-2", "acc-3", "acc-4", "acc-5", "acc-6", "acc-7", "acc-8", "acc-9", "acc-10", "acc-11", "acc-12"], "par nom par défaut");
  const ox = Math.min(...items.map((g) => g.box.x)), oy = Math.min(...items.map((g) => g.box.y));
  assert.deepEqual(clone(plan.places.get("node\u0000acc-1")), { x: ox, y: oy }, "la grille part du coin haut gauche de la sélection");
  assert.deepEqual(clone(plan.places.get("node\u0000acc-6")), { x: ox + 300, y: oy + 140 }, "case = la plus grande boîte + 60");
  assert.ok(Array.from(plan.places.values()).every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)));
  const snapped = grid.gridBoxes(items, { snap: 20 });
  assert.ok(Array.from(snapped.places.values()).every((p) => p.x % 20 === 0 && p.y % 20 === 0), "aimantées à la grille");
  assert.equal(grid.gridBoxes(items, { cols: 99 }).cols, 12, "jamais plus de colonnes que d'éléments");
  assert.equal(grid.gridBoxes(items, { cols: 6 }).rows, 2);
  const screen = grid.gridBoxes(items, { order: "screen" });
  assert.deepEqual(clone(screen.ordered.slice(0, 5).map((g) => g.name)), ["acc-7", "acc-3", "acc-12", "acc-1", "acc-5"], "à l'écran : la première rangée de gauche à droite");
  const mixed = grid.gridBoxes([{ id: "a", name: "a", box: { x: 0, y: 0, w: 240, h: 80 } }, { id: "b", name: "b", box: { x: 0, y: 0, w: 120, h: 40 } }, { id: "c", name: "c", box: { x: 0, y: 0, w: 240, h: 80 } }], { cols: 3 });
  assert.deepEqual(clone(mixed.places.get("b")), { x: 360, y: 20 }, "une boîte plus petite est centrée dans sa case");
  assert.equal(grid.gridBoxes([], {}), null);
});

test("mettre en grille : le volet « aligner et répartir » la propose à partir de trois éléments ; Alt+G ; le menu d'une sélection", () => {
  const { floating: f, selecting: sel, context: c } = loadApp();
  const model = floatingModel();
  const many = (items) => f.targetOf(model, null, sel.multiOf(items));
  const voletOf = (target) => f.entriesOf(model, target).find((e) => e.id === "align").volet;
  assert.equal(voletOf(many([{ kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }])).grid, false, "à deux : non");
  assert.equal(voletOf(many([{ kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }, { kind: "annotation", id: "a1-1" }])).grid, true, "à trois : oui");
  assert.equal(f.isGridKey("g", "KeyG") && f.isGridKey("©", "KeyG") && f.isGridKey("G", ""), true, "la lettre, ou sa place (Option sous macOS)");
  assert.equal(f.isGridKey("h", "KeyH"), false);
  const ids = (items) => clone(items.filter((i) => !i.sep).map((i) => i.id));
  const rw = { editable: true, selectedHosts: ["sw-core-01", "sw-core-02"], hasSelection: true, pinned: () => false };
  assert.deepEqual(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, grid: true })), ["center", "hide", "isolate", "clip:copy", "clip:paste", "align:horizontal", "align:vertical", "grid", "group"]);
  const entry = c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, grid: true }).find((i) => i.id === "grid");
  assert.deepEqual([entry.label, entry.keys, entry.aria], ["mettre en grille", "Alt+G", "Alt+G"]);
  assert.equal(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, rw)).includes("grid"), false, "sans trois éléments qui se rangent : non");
  assert.equal(ids(c.menuItems({ kind: "annotation", id: "a1-1" }, model, { ...rw, grid: true })).includes("grid"), true, "depuis une annotation de la sélection aussi");
  assert.equal(ids(c.menuItems({ kind: "node", id: "sw-core-01" }, model, { ...rw, editable: false, grid: true })).includes("grid"), false, "en lecture seule : jamais");
});

// ——— La toile, sans DOM ni React (revue de session du 2026-10-15, D2) : ses gestes sur la fixture et l'intention de
// démonstration (`intent-skeleton.json` : a6-1 attachée à sw-core-01, groupe g5-1 = les deux cœurs).
const FIXTURES = path.resolve(__dirname, "../../../contracts/fixtures");
const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
const NOTE_STYLE = () => clone(readFixture("intent-skeleton.json").annotations[0].style);
const noteOf = (id, anchor, x, y, extra = {}) => ({ id, anchor, x, y, w: 160, h: 60, z: "front", locked: false, leader: false, at: "2026-10-15T08:00:00Z", author: "orhan", content: { kind: "note", text: id }, style: NOTE_STYLE(), ...extra });

function toileOf(LDApp, change = (intent) => intent, hooks = {}) {
  const intent = change(readFixture("intent-skeleton.json"));
  const model = LDApp.model.build({ snapshot: readFixture("snapshot-minimal.json"), ingest: null, origin: "file", catalogue: {}, intent });
  const blocks = [];
  const toile = LDApp.toile.createToile(model, { onSelect() {}, canWrite: () => true, onPin() {}, onPins() {},
    onBlock: (pins, ops, cause) => blocks.push({ pins: Object.fromEntries(pins), ops: clone(ops), cause }), ...hooks });
  toile.render(true);
  // ce que Flow.tsx pose à chaque dessin : les boîtes des cartes, les boîtes des annotations dans le plan
  model.nodes.forEach((n) => toile.boxes.set(n.hostname, { w: 200, h: 80 }));
  const frame = (id) => {
    const a = model.annotationById.get(id), p = toile.pending.get(id) || {};
    const x = p.x === undefined ? a.x : p.x, y = p.y === undefined ? a.y : p.y;
    const ref = a.anchor.kind === "free" ? { x: 0, y: 0 } : toile.anchorAt(a.anchor.kind, a.anchor.ref);
    return { x: ref.x + x, y: ref.y + y, w: a.w, h: a.h };
  };
  const draw = () => model.annotationById.forEach((a, id) => toile.frames.set(id, frame(id)));
  draw();
  return { model, toile, blocks, frame, draw };
}
const opOf = (block, id) => block.ops.find((op) => op.id === id);

test("la toile : une annotation dont l'ancre bouge dans le même geste ne bouge pas deux fois (flèches, revue H1)", () => {
  const LDApp = loadApp();
  const { toile, blocks, frame } = toileOf(LDApp, (intent) => ({ ...intent, annotations: intent.annotations.concat([noteOf("a7-1", { kind: "group", ref: "g5-1" }, 10, -90), noteOf("a7-2", { kind: "free", ref: null }, 500, 500)]) }));
  const card = clone(toile.state.positions.get("sw-core-01")), before = frame("a6-1");
  toile.selectItems([{ kind: "node", id: "sw-core-01" }, { kind: "annotation", id: "a6-1" }, { kind: "annotation", id: "a7-2" }]);
  assert.equal(toile.nudge(20, 0), true);
  const block = blocks.pop();
  assert.deepEqual(clone(block.pins["sw-core-01"]), { x: card.x + 20, y: card.y });
  assert.deepEqual([opOf(block, "a6-1").x, opOf(block, "a6-1").y], [-110, -150], "attachée à la carte poussée : son écart ne change pas");
  assert.deepEqual(clone(frame("a6-1")), { ...before, x: before.x + 20 }, "dans le plan, elle avance d'un carreau, pas de deux");
  assert.deepEqual([opOf(block, "a7-2").x, opOf(block, "a7-2").y], [520, 500], "une note libre avance d'un carreau");
  // le cadre d'un groupe sélectionné entraîne ses membres : une note attachée au groupe garde son écart
  const group = frame("a7-1");
  toile.selectItems([{ kind: "group", id: "g5-1" }, { kind: "annotation", id: "a7-1" }]);
  toile.nudge(0, 20);
  const second = blocks.pop();
  assert.deepEqual(Object.keys(second.pins).sort(), ["sw-core-01", "sw-core-02"]);
  assert.deepEqual([opOf(second, "a7-1").x, opOf(second, "a7-1").y], [10, -90]);
  assert.deepEqual(clone(frame("a7-1")), { ...group, y: group.y + 20 });
});

test("la toile : aligner et mettre en grille posent une annotation attachée là où le geste la vise (revue H1)", () => {
  const LDApp = loadApp();
  const code = { kind: "code", text: "hostname x", language: "plain", title: "Config cœur", highlight: false, line_numbers: false, font: "jetbrains_mono" };
  const { toile, blocks, frame, draw } = toileOf(LDApp, (intent) => ({ ...intent, annotations: intent.annotations.concat([noteOf("a7-3", { kind: "free", ref: null }, 900, 900, { content: code })]) }));
  const items = [{ kind: "node", id: "fw-edge-01" }, { kind: "node", id: "sw-core-01" }, { kind: "node", id: "sw-core-02" }, { kind: "annotation", id: "a6-1" }];
  toile.selectItems(items);
  const lefts = ["fw-edge-01", "sw-core-01", "sw-core-02"].map((h) => toile.state.positions.get(h).x - 100).concat(frame("a6-1").x);
  toile.alignSelected("left");
  const target = Math.min(...lefts);
  assert.equal(frame("a6-1").x, target, "le bord gauche de la note sur le bord commun");
  ["fw-edge-01", "sw-core-01", "sw-core-02"].forEach((h) => assert.equal(toile.state.positions.get(h).x - 100, target));
  assert.equal(blocks.pop().cause, "aligned");
  draw();
  toile.selectItems(items.concat([{ kind: "annotation", id: "a7-3" }]));
  const shape = toile.gridSelected({ cols: 2, order: "name", snap: null });
  const place = shape.places.find((p) => p.key === "annotation\u0000a6-1");
  assert.deepEqual(clone(frame("a6-1")), clone(place.box), "dans sa case de la grille, pas décalée du déplacement de sa carte");
  const grid = blocks.pop();
  assert.equal(grid.cause, "gridded");
  const note = opOf(grid, "a6-1"), center = toile.state.positions.get("sw-core-01");
  assert.deepEqual([note.x + center.x, note.y + center.y], [place.box.x, place.box.y], "l'écart écrit part de la carte à sa nouvelle place");
  // le nom d'une annotation dans la grille : son résumé (un bloc de code par son titre, revue B7)
  assert.equal(place.name, "Baie 12, rangée B");
  assert.equal(shape.places.find((p) => p.key === "annotation\u0000a7-3").name, "Config cœur");
});

test("la toile : une rafale de flèches interrompue par une suppression n'écrit rien sur l'identité morte (revue M1)", () => {
  const LDApp = loadApp();
  let timer = null;
  const pins = [];
  const { model, toile, blocks } = toileOf(LDApp, (intent) => intent, { later: (run) => { timer = run; return () => { timer = null; }; }, onPin: (host, point) => pins.push([host, clone(point)]) });
  const line = model.connectorById.keys().next().value;
  toile.ends.set(line, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } });
  toile.pendingEnds.set(line, { start: { kind: "free", x: 0, y: 0 } });
  const card = clone(toile.state.positions.get("fw-edge-02"));
  toile.selectItems([{ kind: "node", id: "fw-edge-02" }, { kind: "annotation", id: "a6-1" }, { kind: "connector", id: line }]);
  toile.nudge(20, 0);
  assert.equal(typeof timer, "function", "la rafale attend");
  model.annotationById.delete("a6-1"); // la réponse du Suppr
  model.connectorById.delete(line);
  assert.doesNotThrow(() => timer());
  assert.equal(blocks.length, 0, "aucune mise à jour d'une annotation ou d'un connecteur supprimés");
  assert.deepEqual(pins, [["fw-edge-02", { x: card.x + 20, y: card.y }]], "l'épingle de la rafale part seule");
});

test("un geste de plus de 500 opérations : une entrée d'annulation, défait en entier si une suite est refusée (revue M2)", async () => {
  const LDApp = loadApp();
  const hosts = Array.from({ length: 520 }, (_, i) => "sw-" + String(i).padStart(3, "0"));
  const model = { nodeByHost: new Map(hosts.map((h) => [h, { hostname: h, kind: "device", ghost: false }])), intent: null };
  const doc = (revision, pins) => ({ intent_version: "1.6.0", infrastructure: "lab", revision, updated_at: "2026-10-15T08:00:00Z", pins, type_colors: [], device_colors: [], groups: [], annotations: [], connectors: [] });
  let current = doc(1, []), refuse = null;
  const outcomes = new WeakMap(), requests = [];
  const writer = {
    author: "orhan", locked: false, observer: null, setAuthor() {}, outcomeOf: (op) => outcomes.get(op),
    save: async (ops) => {
      requests.push(ops.length);
      if (refuse && refuse(requests.length)) { const r = { ok: false, message: "refusé" }; outcomes.set(ops[0], r); return r; }
      const before = writer.observer ? writer.observer.before() : null;
      const pins = new Map(current.pins.map((p) => [p.hostname, p]));
      ops.forEach((op) => { if (op.op === "pin") pins.set(op.hostname, { hostname: op.hostname, x: op.x, y: op.y, author: "orhan", at: "2026-10-15T08:00:00Z" }); else if (op.op === "unpin") pins.delete(op.hostname); });
      current = doc(current.revision + 1, Array.from(pins.values()).sort((a, b) => (a.hostname < b.hostname ? -1 : 1)));
      if (writer.observer) writer.observer.after(ops, before, current);
      const r = { ok: true, intent: current };
      outcomes.set(ops[0], r);
      return r;
    },
  };
  const notes = [];
  let stack = LDApp.history.emptyStack(), undo = null;
  const graph = { state: { pinned: new Map() }, unpin() {}, syncPins() {}, resetPins() {}, recolor() {} };
  const intents = LDApp.intentHost.createIntentHost(model, writer, { graph: () => graph, openInGraph() {}, refreshPage() {}, note: (text) => notes.push(text), mounted: () => false, container: () => null,
    parts: (ops) => (undo && !undo.replays(ops) ? undo : null) });
  undo = LDApp.undoing.createUndo(model, writer, intents, () => ({ flush() {}, restore() {} }), { get: () => stack, set: (next) => { stack = next; } }, (text) => notes.push(text));
  const moves = new Map(hosts.map((h, i) => [h, { x: i, y: 0 }]));
  intents.onPins(moves, "dragged");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(requests, [500, 20], "deux requêtes");
  assert.equal(stack.undo.length, 1, "une seule entrée d'annulation pour le geste");
  assert.equal(current.pins.length, 520);
  await undo.undo();
  assert.equal(current.pins.length, 0, "Ctrl+Z défait les deux morceaux");
  // une suite refusée : le premier morceau est défait, la pile ne garde rien, la page le dit
  stack = LDApp.history.emptyStack(); requests.length = 0;
  refuse = (n) => n === 2;
  intents.onPins(moves, "dragged");
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  refuse = null;
  assert.equal(current.pins.length, 0, "rien du geste ne reste écrit");
  assert.equal(stack.undo.length, 0);
  assert.match(notes[notes.length - 1], /refusé/);
  assert.match(notes[notes.length - 1], /défait/);
});

// ---------------------------------------------------------------- passe de finition (critique et audit du 2026-10-15)

test("finition : un volet sans place entière au-dessus reste sur son bouton, raccourci, avec sa flèche ; à côté de la barre, sans flèche", () => {
  const { floating: f } = loadApp();
  const bar = { x: 360, y: 356, w: 280, h: 36 }, opener = { x: 380, y: 360, w: 28, h: 28 }, anchor = { x: 400, y: 400, w: 200, h: 80 };
  const zone = { left: 8, top: 100, right: 1000, bottom: 700 };
  // 300 de haut : ni au-dessus (250 de place) ni sous la sélection (la zone s'arrête à 700) ; raccourci au-dessus
  assert.deepEqual(clone(f.placeVolet(bar, false, opener, 200, 300, zone, anchor)), { x: 372, y: 100, up: true, maxH: 250, side: "above", caret: 22 });
  // dessous, de même
  const under = f.placeVolet({ ...bar, y: 300 }, true, opener, 200, 400, { ...zone, top: 0 }, { x: 400, y: 0, w: 200, h: 290 });
  assert.deepEqual([under.up, under.maxH, under.y], [false, 700 - 342, 342], "dessous, jusqu'au bas de la zone");
  // moins de VOLET_MIN_H : pas de volet raccourci, il se pose ailleurs
  const cramped = f.placeVolet(bar, false, opener, 200, 300, { ...zone, top: 250 }, anchor);
  assert.equal(cramped.maxH, null);
  assert.deepEqual([cramped.side, cramped.x, cramped.caret], ["right", 646, 18], "à côté de la barre, sur la rangée (le bloc dessous reste libre), sa flèche vers la rangée");
  assert.equal(f.VOLET_MIN_H, 160);
  // la flèche reste sur le bouton quand le volet est poussé par le bord de la zone
  const pushed = f.placeVolet(bar, false, { x: 950, y: 360, w: 28, h: 28 }, 200, 100, zone, anchor);
  assert.deepEqual([pushed.x, pushed.caret], [800, 164], "le volet contre le bord droit, la flèche sous le bouton");
});

test("finition : le clavier d'un volet fait le tour de ses groupes ; le focus entre par le premier groupe de choix", () => {
  const { floating: f } = loadApp();
  assert.deepEqual([0, 1, 2, 3].map((at) => f.nextGroup(4, at, false)), [1, 2, 3, 0], "Tab : le suivant, en boucle");
  assert.deepEqual([0, 1, 2, 3].map((at) => f.nextGroup(4, at, true)), [3, 0, 1, 2], "Maj+Tab : le précédent, en boucle");
  assert.equal(f.nextGroup(4, -1, false), 0, "hors du volet : le premier");
  assert.equal(f.nextGroup(4, -1, true), 3, "hors du volet, en arrière : le dernier");
  assert.equal(f.nextGroup(1, 0, false), 0, "un seul groupe : il garde le focus");
  assert.equal(f.nextGroup(0, -1, false), -1);
  // le volet du langage avec une suggestion : « appliquer » (une action seule) puis la liste ; on entre par la liste
  assert.equal(f.startGroup([{ grouped: false }, { grouped: true }]), 1);
  assert.equal(f.startGroup([{ grouped: true }, { grouped: true }, { grouped: false }]), 0, "aligner : la grille d'abord");
  assert.equal(f.startGroup([{ grouped: false }]), 0, "rien de groupé : le premier");
});

test("finition : les repères ne posent pas de croix sur une poignée ni une épingle ; la pastille du geste se tient à 8 px d'un repère", () => {
  const { guides: g } = loadApp();
  const line = { axis: "x", kind: "edge", at: 100, from: 0, to: 300, boxes: [{ x: 100, y: 0, w: 50, h: 40 }, { x: 100, y: 200, w: 80, h: 60 }], hits: [] };
  assert.deepEqual(clone(g.crossPoints(line, [], 1)), [{ x: 100, y: 0 }, { x: 100, y: 40 }, { x: 100, y: 200 }, { x: 100, y: 260 }]);
  const handled = g.cornersOf({ x: 100, y: 0, w: 50, h: 40 });
  assert.deepEqual(clone(g.crossPoints(line, handled, 1)), [{ x: 100, y: 200 }, { x: 100, y: 260 }], "la boîte qui porte ses poignées : pas de croix");
  assert.deepEqual(clone(g.crossPoints(line, [{ x: 101, y: 199 }], 2)), [{ x: 100, y: 0 }, { x: 100, y: 40 }, { x: 100, y: 260 }], "une épingle au coin : pas de croix");
  assert.deepEqual(clone(g.crossPoints({ ...line, kind: "center" }, [], 1)), [], "un repère de centre n'en porte aucune");
  const horizontal = { ...line, axis: "y", at: 40, boxes: [{ x: 10, y: 0, w: 30, h: 40 }] };
  assert.deepEqual(clone(g.crossPoints(horizontal, [], 1)), [{ x: 10, y: 40 }, { x: 40, y: 40 }]);
  assert.equal(g.PILL_CLEAR, 8);
  assert.deepEqual(clone(g.lineBands([{ axis: "x", at: 300 }])[0]).x, 292);
  // la pastille sous la boîte touchait un repère horizontal à 2 px ; à 8 px, elle passe dessus
  const box = { x: 100, y: 100, w: 200, h: 80 }, zone = { left: 0, top: 0, right: 1000, bottom: 800 };
  const spot = g.pillSpot(box, 60, 20, zone, g.lineBands([{ axis: "y", at: 214 }]));
  assert.equal(spot.y, 72, "au-dessus : le dessous est à moins de 8 px du repère");
  assert.ok(Math.min(Math.abs(spot.y - 214), Math.abs(spot.y + 20 - 214)) >= 8);
});

test("finition : la cote d'un écart égal tient 4,5:1 sur son fond, pour chaque teinte proposée, dans les deux thèmes", () => {
  const { guides: g } = loadApp();
  const css = fs.readFileSync(path.resolve(__dirname, "../../../engine/src/app/styles/tokens.css"), "utf8");
  const block = (selector) => { const at = css.indexOf(selector); const open = css.indexOf("{", at); return css.slice(open, css.indexOf("}", open)); };
  const tokens = (text) => Object.fromEntries(Array.from(text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g), (m) => [m[1], m[2]]));
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const theme of [tokens(block(":root {")), tokens(block(':root[data-theme="light"] {'))]) {
    assert.ok(ratio(theme["guide-ink"], theme["guide-default"]) >= 4.5, "le chartreuse");
    for (const hue of g.GUIDE_HUES) {
      const fill = theme["hue-" + hue + "-ink"];
      assert.ok(fill, "l'encre de " + hue);
      assert.ok(ratio(theme["guide-ink"], fill) >= 4.5, `cote sur ${hue} : ${ratio(theme["guide-ink"], fill).toFixed(2)}`);
    }
  }
  assert.equal(g.guideFill("teal"), "var(--hue-teal-ink)");
  assert.equal(g.guideFill(null), null);
  assert.equal(g.guideFill("orange"), null, "une teinte non proposée ne se pose pas");
});

test("finition : la pastille « X, Y » d'une annotation glissée se tient à 8 px au moins d'un repère (critique du 2026-10-15)", () => {
  const { handles: h } = loadApp();
  const box = { w: 160, h: 90 };
  const plain = h.positionPill(2360, -640, 1, [], box);
  assert.deepEqual([plain.x, plain.y], [0, -28], "sans repère : au-dessus, à gauche");
  const w = Math.round((plain.text.length * 6.82 + 14) * 1); // la largeur d'une pastille (canvas/pill.ts)
  const left = h.positionPill(2360, -640, 1, [{ axis: "x", at: 0 }], box);
  assert.ok(left.x > 0 && left.y === -28, "le bord gauche aligné : au-dessus, à droite");
  assert.ok(left.x - 8 >= 0, "à 8 px du repère au moins");
  const both = h.positionPill(2360, -640, 1, [{ axis: "x", at: 0 }, { axis: "x", at: 160 }], box);
  assert.deepEqual([both.y > 90, both.x], [false, 0], "rien de libre (deux repères verticaux encadrent) : la place d'origine");
  const top = h.positionPill(2360, -640, 1, [{ axis: "y", at: -10 }], box);
  assert.equal(top.y, 98, "un repère horizontal juste au-dessus : dessous");
  const zoomed = h.positionPill(1, 2, 0.5, [{ axis: "x", at: 0 }], box);
  assert.equal(zoomed.scale, 2);
  assert.ok(w > 0);
});
