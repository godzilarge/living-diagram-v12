// Sondes de la revue (page). Lancer : node --test probe_page.test.js (depuis ce dossier).
// Chaque assertion décrit le comportement CONSTATÉ (le défaut).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const APP = "/home/otosun/development/applications/demo/living-diagram-v12-biturbo/backend/src/ld_backend/render/assets/app/app.js";
const load = () => { const c = vm.createContext({ console, URLSearchParams }); vm.runInContext(fs.readFileSync(APP, "utf8"), c); return c.LDApp; };
const entry = (ops, extra = {}) => ({ infrastructure: "lab", revision: 7, at: "2026-10-09T10:00:00Z", author: "orhan", categories: ["groups"], created: [], subjects: [{ id: "g3-1", kind: "group", label: "Cœur", form: "" }], ops, ...extra });

test("P8 accents : le serveur trouve « supprime », la ligne dit « trouvé dans le détail » et ne surligne rien", () => {
  const { journal } = load();
  const e = entry([{ op: "group_delete", id: "g3-1" }]);
  const s = journal.headline(e);
  assert.equal(journal.textOf(s), "a supprimé le groupe Cœur");
  assert.equal(journal.visibleMatch(s, "orhan", ["supprime"]), false, "pourtant visible dans la phrase");
  assert.equal(journal.hiddenHit(e, ["supprime"]), null, "=> « trouvé dans le détail »");
  assert.equal(JSON.stringify(journal.marks("a supprimé", ["supprime"])), JSON.stringify([{ text: "a supprimé", hit: false }]));
});

test("P9 un lien vers une entrée d'une autre infrastructure ou « Toutes » : rev sans start", () => {
  const { journal } = load();
  const f = { ...JSON.parse(JSON.stringify(journal.defaultFilters())), infrastructure: "*", rev: 12 };
  assert.deepEqual(JSON.parse(JSON.stringify(journal.queryOf(f, "lab", Date.now()))), [], "rev ignoré en silence : la page part des plus récentes mais la bande dit « Lien vers la révision r12 »");
});

test("P10 l'export CSV lit avec `start` : les entrées plus récentes que le lien sont omises", () => {
  const { journal } = load();
  const f = { ...JSON.parse(JSON.stringify(journal.defaultFilters())), rev: 12 };
  const q = JSON.parse(JSON.stringify(journal.queryOf(f, "lab", Date.now(), null, 500)));
  assert.deepEqual(q, [["infrastructure", "lab"], ["start", "12"], ["limit", "500"]], "exportJournal appelle queryOf ainsi (journal-commands.ts:298)");
});
