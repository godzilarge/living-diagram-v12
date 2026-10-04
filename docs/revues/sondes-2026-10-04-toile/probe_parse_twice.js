// Sonde D : combien de fois la page autonome analyse-t-elle son bloc JSON au démarrage, et ce que cela coûte.
// Le script de la page est exécuté dans un contexte où `JSON.parse` est compté ; puis le bloc de données de la page
// est analysé seul, chronométré, pour mesurer le prix d'une analyse de trop sur une page à la jauge.
// Lancer depuis la racine du dépôt : node docs/revues/sondes-2026-10-04-toile/probe_parse_twice.js <page.html> [...]
"use strict";

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { readPage, load } = require(path.resolve(__dirname, "../../../backend/tests/js/fakedom.js"));

for (const file of process.argv.slice(2)) {
  const page = readPage(file);
  const data = /<script type="application\/json" id="ld-data">([\s\S]*?)<\/script>/.exec(page.html)[1];
  // Le même chargement que les tests, mais `JSON.parse` du contexte compte ses appels et leur taille.
  let calls = 0, bytes = 0;
  const realParse = JSON.parse;
  const CountingJSON = { parse: (text, reviver) => { calls += 1; bytes += text.length; return realParse(text, reviver); }, stringify: JSON.stringify };
  const { document } = load(page, page.data, ""); // un premier chargement, pour obtenir un document ; le compte porte sur le second
  document.getElementById("ld-data").text = data;
  const context = vm.createContext({ document, console, location: { hash: "", search: "" }, history: { replaceState() {} }, window: { addEventListener() {} }, URLSearchParams, JSON: CountingJSON });
  vm.runInContext(page.script, context, { filename: "viewer.js" });
  const started = process.hrtime.bigint();
  realParse(data);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`${path.basename(file)} : ${(data.length / 1e6).toFixed(1)} Mo de JSON · JSON.parse appelé ${calls} fois au démarrage (${(bytes / 1e6).toFixed(1)} Mo lus) · une analyse coûte ${ms.toFixed(0)} ms`);
}
