// Tests du visualiseur sous Node. La page testée est celle que `ld render` a produite (variable LD_PAGE),
// donc le script exécuté ici est exactement celui qui tournera dans le navigateur.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readPage, load } = require("./fakedom.js");

const page = readPage(process.env.LD_PAGE);
// Les objets du visualiseur naissent dans un autre contexte (vm) : on compare leur forme JSON, pas leurs prototypes.
const clone = (value) => JSON.parse(JSON.stringify(value));
const CORE_LINK = ["sw-core-01", "Ethernet1/2", "sw-core-02", "Ethernet1/2"].join("\u0000");

test("le modèle indexe le snapshot sans rien inventer", () => {
  const model = load(page).LD.model.build(page.data);
  assert.equal(model.nodes.length, 6);
  assert.equal(model.links.length, 6);
  assert.deepEqual(clone(Object.fromEntries(model.kindCounts)), { device: 4, external: 1, stub: 1 });
  assert.deepEqual(clone(Object.fromEntries(model.statusCounts)), { confirmed: 4, documented_only: 2 });
  assert.deepEqual(clone(model.combos.map((row) => [row.combo, row.status, row.count])), [
    ["cdp + description + lldp", "confirmed", 2], ["description", "documented_only", 2], ["description + lldp", "confirmed", 2]]);
  const core = model.linkById.get(CORE_LINK);
  assert.deepEqual(clone(core.sources), ["description", "lldp"]);
  assert.equal(core.status, "confirmed");
  assert.deepEqual(clone(core.checks.map((c) => c.code)), ["description_disagrees_with_observed"], "un contrôle sur un port remonte au câble");
  assert.equal(core.worst, "warning");
  assert.equal(model.checksByNode.get("sw-core-02").length >= 3, true);
});

test("deux câbles entre les mêmes équipements gardent chacun leur tracé", () => {
  const { LD } = load(page);
  const model = LD.model.build(page.data);
  const pair = model.links.filter((l) => l.a.hostname === "sw-core-01" && l.b.hostname === "sw-core-02");
  assert.equal(pair.length >= 2, true);
  assert.deepEqual(clone(pair.map((l) => l.pairCount)), clone(pair.map(() => pair.length)));
  const paths = pair.map((l) => LD.graph.curve({ x: 0, y: 0 }, { x: 200, y: 0 }, l).path);
  assert.equal(new Set(paths).size, pair.length);
  const loop = LD.graph.curve({ x: 5, y: 5 }, { x: 5, y: 5 }, { a: { hostname: "x" }, b: { hostname: "x" }, indexInPair: 0, pairCount: 1 });
  assert.match(loop.path, /^M.* C/);
  assert.equal(Number.isFinite(loop.mid.y), true);
});

test("le placement est déterministe, fini, et respecte un nœud déplacé à la main", () => {
  const { LD } = load(page);
  const ids = ["d", "a", "c", "b", "e", "isolé"];
  const edges = [["a", "b"], ["b", "c"], ["c", "a"], ["c", "d"], ["d", "e"], ["a", "b"], ["a", "a"], ["a", "fantôme"]];
  const first = LD.layout.run(ids, edges);
  const again = LD.layout.run(clone(ids).reverse(), clone(edges).reverse());
  assert.deepEqual(clone(Array.from(first).sort()), clone(Array.from(again).sort()), "ni l'ordre des nœuds ni celui des arêtes ne change le résultat");
  const points = Array.from(first.values());
  assert.equal(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), true);
  assert.equal(new Set(points.map((p) => Math.round(p.x) + ":" + Math.round(p.y))).size, ids.length, "aucune superposition");
  const pinned = LD.layout.run(ids, edges, new Map([["a", { x: 1234, y: -567 }]]));
  assert.deepEqual(clone(pinned.get("a")), { x: 1234, y: -567 });
  assert.deepEqual(clone(LD.layout.bounds(new Map())), { x: 0, y: 0, width: 1, height: 1 });
});

test("la page démarre : en-tête, graphe sans les voisins inconnus, puis avec", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  assert.match(document.getElementById("run-meta").textContent, /infra-lab · run 66db3f0e9a1c2b0012f4a7d1/);
  assert.match(document.getElementById("run-counts").textContent, /6 nœuds.*6 câbles/);
  assert.equal(canvas.withClass("node").length, 5);
  assert.equal(canvas.withClass("link").length, 5);
  assert.match(document.getElementById("graph-status").textContent, /5 nœuds sur 6 et 5 câbles sur 6 affichés · 1 voisins inconnus masqués/);
  assert.equal(canvas.withClass("kind-external").length, 1);
  assert.equal(canvas.withClass("collection-unreachable").length, 1, "fw-edge-02 est injoignable");
  assert.equal(canvas.withClass("link-mark").length, 1, "un seul câble porte un contrôle warning");
  const stubs = document.getElementById("t-stubs");
  stubs.checked = true;
  stubs.fire("change", { target: stubs });
  assert.equal(canvas.withClass("node").length, 6);
  assert.equal(canvas.withClass("link").length, 6);
  for (const path of canvas.withClass("link-line")) assert.doesNotMatch(path.getAttribute("d"), /NaN|undefined/);
  assert.equal(LD.app.graph.state.positions.size, 6);
});

test("cliquer un câble montre ses sources ; cliquer un équipement montre sa fiche", () => {
  const { LD, document } = load(page, page.data);
  const inspector = document.getElementById("inspector");
  assert.match(inspector.textContent, /vue d'ensemble/);
  LD.app.graph.select({ kind: "link", id: CORE_LINK });
  const text = inspector.textContent;
  assert.match(text, /confirmé/);
  assert.match(text, /Observé en LLDP depuis sw-core-01 · Ethernet1\/2, sw-core-02 · Ethernet1\/2\. Documenté par la description de sw-core-01 · Ethernet1\/2\./);
  assert.match(text, /Attention : une description ne concorde pas/);
  assert.doesNotMatch(text, /concordent/, "« confirmé » ne dit pas que toutes les descriptions concordent");
  assert.match(text, /Sources : 3 évidences/);
  assert.match(text, /LLDP.*témoin.*sw-core-01 · Ethernet1\/2/s);
  assert.match(text, /description_disagrees_with_observed/);
  assert.match(text, /description brute/);
  assert.equal(document.getElementById("canvas").withClass("selected").length, 1);
  LD.app.graph.select({ kind: "node", id: "fw-edge-02" });
  assert.match(inspector.textContent, /collecte : unreachable.*fw-edge-02/s);
  assert.match(inspector.textContent, /Couverture de la collecte/);
  LD.app.graph.select(null);
  assert.match(inspector.textContent, /vue d'ensemble/);
});

test("un appui relâché sur un tracé sélectionne le câble, sur le fond désélectionne", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const hit = canvas.withClass("link-hit")[0];
  canvas.fire("pointerdown", { target: hit });
  canvas.fire("pointerup", { target: hit });
  assert.equal(LD.app.graph.state.selection.kind, "link");
  canvas.fire("pointerdown", { target: canvas });
  canvas.fire("pointermove", { clientX: 60, clientY: 0 });
  canvas.fire("pointerup", {});
  assert.equal(LD.app.graph.state.selection.kind, "link", "un glissé déplace la vue sans désélectionner");
  canvas.fire("pointerdown", { target: canvas });
  canvas.fire("pointerup", {});
  assert.equal(LD.app.graph.state.selection, null);
  const node = canvas.withClass("node")[0];
  node.fire("pointerdown", { clientX: 10, clientY: 10 });
  node.fire("pointermove", { clientX: 90, clientY: 40 });
  node.fire("pointerup", {});
  assert.equal(LD.app.graph.state.pinned.size, 1, "un équipement glissé garde sa place");
  assert.equal(LD.app.graph.state.selection, null);
});

test("les trois vues en tableaux se montent, et une cible ramène au graphe", () => {
  const { LD, document } = load(page, page.data);
  LD.app.activate("checks");
  const checks = document.getElementById("view-checks");
  assert.match(checks.textContent, /5 contrôles sur 5/);
  assert.match(checks.textContent, /neighbor_unknown/);
  const target = checks.all((n) => n.tagName === "button" && /srv-hyp-07|sw-core-02 · Ethernet1\/3/.test(n.textContent))[0];
  target.fire("click", {});
  assert.equal(document.getElementById("view-graph").hidden, false);
  assert.equal(document.getElementById("view-checks").hidden, true);
  assert.equal(LD.app.graph.state.selection.id, "sw-core-02");
  LD.app.activate("quality");
  const quality = document.getElementById("view-quality").textContent;
  assert.match(quality, /Couverture de la collecte/);
  assert.match(quality, /aucun constat/);
  assert.match(quality, /srv-hyp-07/);
  assert.match(quality, /mac_dotted_to_colon/);
  LD.app.activate("sources");
  const sources = document.getElementById("view-sources");
  assert.match(sources.textContent, /Tous les câbles/);
  const row = sources.withClass("clickable").find((r) => /srv-hyp-07/.test(r.textContent));
  row.fire("click", {});
  assert.equal(LD.app.graph.state.showStubs, true, "ouvrir un câble vers un voisin inconnu rallume les voisins inconnus");
  assert.equal(document.getElementById("t-stubs").checked, true);
  assert.equal(LD.app.graph.state.selection.kind, "link");
});

test("une page sans rapport d'ingestion et un snapshot vide restent lisibles", () => {
  const data = clone(page.data);
  data.ingest = null;
  Object.assign(data.snapshot, { nodes: [], interfaces: [], links: [], checks: [], coverage: [] });
  const { LD, document } = load(page, data);
  ["checks", "quality", "sources"].forEach((id) => LD.app.activate(id));
  assert.match(document.getElementById("view-quality").textContent, /Rapport d'ingestion non disponible/);
  assert.match(document.getElementById("graph-status").textContent, /0 nœuds sur 0 et 0 câbles sur 0/);
});

test("une chaîne hostile reste du texte", () => {
  const data = clone(page.data);
  const hostile = "<b onmouseover=alert(1)>x</b>";
  data.snapshot.interfaces.find((i) => i.hostname === "sw-core-01" && i.name === "Ethernet1/2").description = hostile;
  const { LD, document } = load(page, data);
  LD.app.graph.select({ kind: "link", id: CORE_LINK });
  const inspector = document.getElementById("inspector");
  assert.equal(inspector.all((n) => n.tagName === "b").length, 0);
  assert.equal(inspector.all((n) => n.tagName === "#text" && n.text === hostile).length, 1);
});

// ---------------------------------------------------------------- revue des pages (2026-09-20)

const hub = process.env.LD_PAGE_HUB ? readPage(process.env.LD_PAGE_HUB) : null;
const HUB_PORT = "sw-core-01 · Ethernet1/5";

test("un contrôle posé sur un port à deux câbles ne va qu'au câble qu'il concerne", { skip: !hub }, () => {
  const model = load(hub).LD.model.build(hub.data);
  const onPort = model.links.filter((l) => [l.a, l.b].some((end) => LD_end(end) === HUB_PORT));
  assert.equal(onPort.length, 2);
  const toStub = onPort.find((l) => l.a.hostname === "srv-a" || l.b.hostname === "srv-a");
  const toCore = onPort.find((l) => l !== toStub);
  assert.deepEqual(clone(toStub.checks.map((c) => c.code)).sort(), ["multiple_observed_neighbors", "neighbor_unknown"]);
  assert.deepEqual(clone(toCore.checks.map((c) => c.code)).sort(), ["description_disagrees_with_observed", "multiple_observed_neighbors", "one_way_observation"],
    "ni le voisin inconnu de l'autre câble, ni le contrôle qui nomme l'autre câble");
  assert.equal(toCore.checks.every((c) => !(c.details.neighbor === "srv-a")), true);
  assert.equal(toCore.portChecks.length + toStub.portChecks.length, 0);
});

function LD_end(end) { return end.hostname + " · " + end.interface; }

test("l'adresse porte l'état de vue, et un câble s'y écrit par son identité", () => {
  const token = encodeURIComponent(JSON.stringify(["sw-core-01", "Ethernet1/2", "sw-core-02", "Ethernet1/2"]));
  const { LD, document, location, go } = load(page, page.data, "#view=graph&link=" + token);
  assert.equal(LD.app.graph.state.selection.id, CORE_LINK);
  assert.equal(location.hash, "#view=graph&link=" + token, "l'adresse réécrite est celle qu'on a lue");
  assert.equal(LD.app.graph.state.view.k >= 0.8, true, "un élément ouvert par son adresse est centré à un zoom lisible");
  go("#view=quality&node=fw-edge-02");
  assert.equal(document.getElementById("view-quality").hidden, false);
  assert.equal(LD.app.graph.state.selection.id, "fw-edge-02");
  go("#stubs=1");
  assert.equal(LD.app.graph.state.nodeEls.size, 6);
  assert.equal(LD.app.graph.state.selection, null);
});

test("un fragment illisible ou hors bornes n'empêche jamais la page de s'afficher", () => {
  for (const hash of ["#node=%E0%A4%A", "#link=", "#link=3", "#link=%5B1%2C2%5D", "#node=inconnu", "#view=zzz", "#=x&&a", "#__proto__=x"]) {
    const { LD, document } = load(page, page.data, hash);
    assert.equal(LD.app.graph.state.selection, null, hash);
    assert.equal(document.getElementById("canvas").withClass("node").length, 5, hash);
    assert.equal(document.getElementById("view-graph").hidden, false, hash);
  }
});

test("la fiche d'un équipement dit quels ports ont un câble, et lesquels sont up sans rien en face", () => {
  const { LD, document } = load(page, page.data);
  LD.app.graph.select({ kind: "node", id: "sw-core-01" });
  const inspector = document.getElementById("inspector");
  assert.match(inspector.textContent, /câble vers/);
  assert.match(inspector.textContent, /Ethernet1\/4.*rt-wan-01 · GigabitEthernet0\/0\/0/s);
  const filter = inspector.all((n) => n.tagName === "input" && n.getAttribute("type") === "checkbox")[0];
  filter.checked = true;
  filter.fire("change", { target: filter });
  assert.doesNotMatch(inspector.textContent, /rt-wan-01 · GigabitEthernet0\/0\/0.*up.*rt-wan-01/s);
});

test("la vue Sources se filtre par équipement", () => {
  const { LD, document } = load(page, page.data);
  LD.app.activate("sources");
  const view = document.getElementById("view-sources");
  const input = document.getElementById("s-text");
  input.value = "fw-edge";
  input.fire("input", { target: input });
  assert.match(view.textContent, /2 câbles/);
  assert.equal(view.withClass("clickable").filter((row) => /fw-edge-01/.test(row.textContent)).length, 2);
});
