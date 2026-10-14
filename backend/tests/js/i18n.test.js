// La langue de l'interface (2026-10-10) : les catalogues (`engine/src/i18n/locales/<langue>/<espace>.json`) se
// tiennent entre eux, et le fichier construit change de langue sans DOM. Les catégories de pluriel viennent de
// `Intl.PluralRules`, la source même qu'i18next consulte : le français a « many » (1 000 000), une clé `_many`
// oubliée rendrait la clé brute à l'écran. `_zero` est une forme facultative d'i18next (« aucun équipement ») : présente
// dans la référence, elle l'est dans chaque langue.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const LOCALES = process.env.LD_LOCALES || path.resolve(__dirname, "../../../engine/src/i18n/locales");
const APP = process.env.LD_APP || path.resolve(__dirname, "../../src/ld_backend/render/assets/app/app.js");
const SOURCE = "fr";
const PLURAL = /_(zero|one|two|few|many|other)$/;

const languages = () => fs.readdirSync(LOCALES).filter((name) => fs.statSync(path.join(LOCALES, name)).isDirectory()).sort();
const namespaces = (language) => fs.readdirSync(path.join(LOCALES, language)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
const read = (language, ns) => JSON.parse(fs.readFileSync(path.join(LOCALES, language, ns + ".json"), "utf8"));

/** Les feuilles d'un catalogue, à plat : `{ "a.b_one": "…" }`. Une feuille qui n'est pas un texte est une erreur. */
function flatten(tree, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(tree)) {
    const at = prefix ? prefix + "." + key : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, at, out);
    else out[at] = value;
  }
  return out;
}
/** Par clé de base (sans suffixe de pluriel) : ses formes (`one`, `other`… ou `""` hors pluriel) et ses textes. */
function grouped(flat) {
  const out = new Map();
  for (const [key, text] of Object.entries(flat)) {
    const match = key.match(PLURAL);
    const base = match ? key.slice(0, -match[0].length) : key;
    if (!out.has(base)) out.set(base, new Map());
    out.get(base).set(match ? match[1] : "", text);
  }
  return out;
}
const variables = (text) => new Set(Array.from(String(text).matchAll(/\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g), (m) => m[1]));
const union = (sets) => new Set(sets.flatMap((s) => Array.from(s)));
const sorted = (set) => Array.from(set).sort();

test("chaque langue a les mêmes espaces de noms que la référence", () => {
  const all = languages();
  assert.ok(all.includes(SOURCE) && all.includes("en"), "français et anglais présents : " + all.join(", "));
  for (const language of all) assert.deepEqual(namespaces(language), namespaces(SOURCE), language);
});

test("chaque langue a les mêmes clés, des textes non vides, les pluriels de sa langue et les mêmes variables", () => {
  for (const ns of namespaces(SOURCE)) {
    const reference = grouped(flatten(read(SOURCE, ns)));
    for (const language of languages()) {
      const flat = flatten(read(language, ns));
      for (const [key, text] of Object.entries(flat)) assert.ok(typeof text === "string" && text.trim() !== "", `${language}/${ns} : ${key} doit être un texte non vide`);
      const mine = grouped(flat);
      assert.deepEqual(sorted(new Set(mine.keys())), sorted(new Set(reference.keys())), `${language}/${ns} : mêmes clés que ${SOURCE}`);
      const categories = sorted(new Set(new Intl.PluralRules(language).resolvedOptions().pluralCategories));
      for (const [base, forms] of mine) {
        const plural = !forms.has("");
        assert.equal(plural, !reference.get(base).has(""), `${language}/${ns} : ${base} est un pluriel dans une langue, pas dans l'autre`);
        if (plural) {
          const want = reference.get(base).has("zero") ? sorted(new Set([...categories, "zero"])) : categories;
          assert.deepEqual(sorted(new Set(forms.keys())), want, `${language}/${ns} : ${base} doit avoir les formes ${want.join(", ")}`);
        }
        else {
          assert.equal(forms.size, 1, `${language}/${ns} : ${base} mêle une forme simple et des pluriels`);
          // `count` déclenche le pluriel d'i18next : une clé sans formes ne le porte pas (nommer la variable autrement)
          assert.ok(!variables(forms.get("")).has("count"), `${language}/${ns} : ${base} porte {{count}} sans être un pluriel`);
        }
        const vars = sorted(union(Array.from(forms.values(), variables)));
        const want = sorted(union(Array.from(reference.get(base).values(), variables)));
        assert.deepEqual(vars, want, `${language}/${ns} : ${base} doit porter les variables {{${want.join("}}, {{")}}}`);
      }
    }
  }
});

function loadApp() {
  const context = vm.createContext({ console, URLSearchParams });
  vm.runInContext(fs.readFileSync(APP, "utf8"), context, { filename: "app.js" });
  return context.LDApp;
}

test("la langue retenue : le choix de l'application, sinon la première langue du navigateur que l'on parle, sinon l'anglais", () => {
  const { i18n } = loadApp();
  assert.deepEqual(Array.from(i18n.LANGUAGES), ["fr", "en"]);
  assert.equal(i18n.detectLanguage(["fr-CA", "en-US"]), "fr");
  assert.equal(i18n.detectLanguage(["de-DE", "en_GB", "fr"]), "en", "la première parlée, dans l'ordre du navigateur");
  assert.equal(i18n.detectLanguage(["de-DE", "it"]), "en", "aucune parlée : l'anglais");
  assert.equal(i18n.detectLanguage([]), "en", "sous Node, aucune préférence : l'anglais");
  assert.equal(i18n.detectLanguage(["FR"]), "fr", "sans la casse");
  assert.equal(i18n.effectiveLanguage("fr", ["en-US"]), "fr", "le choix gagne sur le navigateur");
  assert.equal(i18n.effectiveLanguage(null, ["en-US"]), "en");
});

test("le fichier construit change de langue sans DOM : textes, pluriels (le « many » du français), repli", () => {
  const { i18n } = loadApp();
  assert.equal(i18n.language(), "fr", "la référence au chargement");
  assert.equal(i18n.t("modes.diagram"), "Diagramme");
  assert.equal(i18n.t("common:devices", { count: 1 }), "1 équipement");
  assert.equal(i18n.t("common:devices", { count: 0 }), "0 équipement", "le français met 0 au singulier");
  assert.equal(i18n.t("common:devices", { count: 1000000 }), "1000000 équipements", "la forme « many » existe");
  assert.equal(i18n.t("walk.diff", { count: 0 }), "aucun équipement changé", "la forme `_zero`, facultative, est lue");
  i18n.setLanguage("en");
  assert.equal(i18n.language(), "en", "synchrone : les catalogues sont embarqués");
  assert.equal(i18n.t("modes.diagram"), "Diagram");
  assert.equal(i18n.t("common:devices", { count: 0 }), "0 devices");
  assert.equal(i18n.t("counts.statusLabel", { links: "2 cables", status: "confirmed" }), "2 cables confirmed", "variables, sans échappement HTML");
  i18n.setLanguage("fr");
  assert.equal(i18n.t("modes.diagram"), "Diagramme");
});

test("la langue est une préférence du navigateur : absente = celle du navigateur, une valeur inconnue aussi", () => {
  const { prefs } = loadApp();
  assert.equal(prefs.defaultPrefs().language, null);
  assert.equal(prefs.parsePrefs('{"language":"en"}').language, "en");
  assert.equal(prefs.parsePrefs('{"language":"fr"}').language, "fr");
  assert.equal(prefs.parsePrefs('{"language":"de"}').language, null, "langue non parlée : celle du navigateur");
  assert.equal(prefs.parsePrefs('{"language":3}').language, null);
});

test("le Journal parle la langue de la page : phrases, auxiliaire, rafales, jours, objets sans nom, export", () => {
  const { i18n, journal, journalCsv } = loadApp();
  const entry = (revision, ops, subjects = []) => ({ infrastructure: "lab", revision, at: "2026-10-01T08:00:00Z", author: "orhan", categories: [], created: [], subjects, ops });
  const pin = entry(1, [{ op: "pin", hostname: "sw", x: 0, y: 0 }]);
  const burst = entry(2, [{ op: "pin", hostname: "a", x: 0, y: 0 }, { op: "pin", hostname: "b", x: 0, y: 0 }, { op: "color", hostname: "a", hue: "red" }]);
  const gone = entry(3, [{ op: "group_delete", id: "g1-1" }], [{ id: "g1-1", kind: "group", label: "Cœur", form: "" }]);
  const link = entry(4, [{ op: "connector_create", start: { kind: "free", x: 0, y: 0 }, end: { kind: "free", x: 1, y: 1 } }],
    [{ id: "c4-1", kind: "connector", label: "groupe sans nom → point libre", form: "", unnamed: "", parts: [{ text: null, unnamed: "group" }, { text: null, unnamed: "free" }] }]);
  // un nom saisi qui ressemble aux mots du serveur reste un nom (revue de l'interface bilingue, B3)
  const typed = entry(6, [{ op: "group_delete", id: "g1-1" }], [{ id: "g1-1", kind: "group", label: "point libre", form: "", unnamed: "", parts: [] }]);
  const purge = entry(5, [{ op: "journal_prune", removed: 3, before: "2026-10-07T00:00:00Z", categories: ["positions", "colors"] }]);
  const say = (e) => journal.textOf(journal.headline(e));
  assert.equal(say(pin), "a placé sw");
  assert.equal(say(burst), "a placé 2 équipements et 1 autre modification");
  assert.equal(journal.destroys(journal.headline(gone)), true, "une suppression ressort, quelle que soit la langue");
  assert.equal(say(link), "a tracé le connecteur groupe sans nom → point libre");
  i18n.setLanguage("en");
  try {
    assert.equal(say(pin), "placed sw", "l'anglais n'a pas d'auxiliaire");
    assert.equal(say(burst), "placed 2 devices and 1 other change");
    assert.equal(say(gone), "deleted the group Cœur", "le nom saisi ne se traduit jamais");
    assert.equal(journal.destroys(journal.headline(gone)), true);
    assert.equal(say(link), "drew the connector unnamed group → free point", "un objet sans nom, marqué par le serveur");
    assert.equal(say(typed), "deleted the group point libre", "un nom saisi ne se traduit jamais");
    assert.match(journalCsv.csvName("", new Date(2026, 9, 10, 9, 5)), /^log-all-20261010-0905\.csv$/, "toutes les infrastructures, en anglais");
    assert.equal(say(purge), "purged the log: 3 entries before 7 October 2026 (positions, colours)");
    assert.deepEqual(JSON.parse(JSON.stringify(journal.factsOf(purge.ops[0]))).map((f) => f.label), ["removed", "before", "categories"]);
    assert.match(journal.dayLabel("2026-10-01T12:00:00Z", Date.parse("2026-12-01")), /^Thursday,? 1 October 2026$/);
    assert.equal(journal.dayLabel(new Date().toISOString(), Date.now()), "today");
    assert.equal(journal.CATEGORY_LABEL.colors, "Colours");
    assert.equal(journal.rangeLabel("2026-09-01", "", Date.parse("2026-10-09")), "since 1 Sept");
    const csv = journalCsv.csvOf([pin]);
    assert.ok(csv.startsWith("﻿date (UTC),infrastructure,revision,author,category,change,"), "en-têtes et séparateur d'un tableur anglais");
    assert.equal(csv.split("\r\n")[1].split(",").slice(4, 6).join("|"), "Positions|placed sw");
  } finally {
    i18n.setLanguage("fr");
  }
  assert.equal(say(pin), "a placé sw");
  assert.match(journalCsv.csvName("", new Date(2026, 9, 10, 9, 5)), /^journal-toutes-20261010-0905\.csv$/);
});

test("le sens des contrôles parle la langue de la page ; un code inconnu de la page garde le texte du serveur", () => {
  const { i18n, checkMeaning } = loadApp();
  const model = { catalogue: { link_down: { meaning: "texte du serveur", rule: "R5" }, future_code: { meaning: "sens venu du serveur", rule: "R9" } } };
  assert.equal(checkMeaning("link_down", model), "les deux bouts sont `down` ; le câble reste dessiné", "le catalogue de la page d'abord");
  assert.equal(checkMeaning("future_code", model), "sens venu du serveur", "un code plus récent que la page");
  assert.equal(checkMeaning("unknown", model), "");
  assert.equal(i18n.t("common:haMode.active_passive"), "actif-passif");
  i18n.setLanguage("en");
  try {
    assert.equal(checkMeaning("link_down", model), "both ends are `down`; the cable is still drawn");
    assert.equal(checkMeaning("future_code", model), "sens venu du serveur", "repli sur le serveur, en français");
    assert.equal(i18n.t("common:haMode.active_passive"), "active-passive");
  } finally {
    i18n.setLanguage("fr");
  }
});

test("un refus de l'API se dit dans la langue de la page d'après son code ; un code inconnu garde l'anglais du serveur", () => {
  const { i18n, http } = loadApp();
  const side = { code: "diff_run_unknown", detail: "run `from`: unknown run for this infrastructure", params: { side: "from" } };
  const field = { code: "invalid_body", detail: "invalid request body", params: { limit: 10000 }, errors: [{ path: "ops", code: "too_many_pins", message: "more than 10000 pins for one infrastructure" }] };
  const pydantic = { code: "invalid_body", detail: "invalid request body", errors: [{ path: "ops.0.x", code: "missing", message: "Field required" }] };
  const none = { code: "no_archived_run", detail: "no archived run for this infrastructure: nothing to place", params: { action: "place" } };
  const future = { code: "future_code", detail: "something new" };
  assert.equal(http.explain(404, side), "run `from` : run inconnue pour cette infrastructure");
  assert.equal(http.explain(422, field), "l'API répond 422 : plus de 10000 épingles pour une infrastructure", "le champ fautif d'abord");
  assert.equal(http.explain(422, pydantic), "l'API répond 422 : corps de requête invalide (ops.0.x)", "un code de Pydantic : le refus et le chemin");
  assert.equal(http.explain(404, none), "aucune run archivée pour cette infrastructure : rien à placer", "le mot de l'API traduit");
  assert.equal(http.explain(500, future), "l'API répond 500 : something new", "un code plus récent que la page");
  assert.equal(http.explain(401, side), "jeton refusé par l'API");
  i18n.setLanguage("en");
  try {
    assert.equal(http.explain(404, side), "run `from`: unknown run for this infrastructure");
    assert.equal(http.problemText(field), "more than 10000 pins for one infrastructure");
    assert.equal(http.explain(404, none), "no archived run for this infrastructure: nothing to place");
  } finally {
    i18n.setLanguage("fr");
  }
});
