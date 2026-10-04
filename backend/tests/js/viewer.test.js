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
  assert.deepEqual(clone(core.checks.map((c) => c.code)).sort(), ["aggregate_member_not_bundled", "description_disagrees_with_observed", "link_oper_mismatch"],
    "un contrôle sur un port remonte au câble ; un contrôle d'état (R5) est porté par le câble");
  assert.equal(core.worst, "warning");
  assert.equal(model.checksByNode.get("sw-core-02").length >= 3, true);
});

test("deux câbles entre les mêmes équipements gardent chacun leur tracé", () => {
  const { LD } = load(page);
  const model = LD.model.build(page.data);
  const pair = model.links.filter((l) => l.a.hostname === "sw-core-01" && l.b.hostname === "sw-core-02");
  assert.equal(pair.length >= 2, true);
  assert.deepEqual(clone(pair.map((l) => l.pairCount)), clone(pair.map(() => pair.length)));
  const paths = pair.map((l) => LD.geometry.curve({ x: 0, y: 0 }, { x: 200, y: 0 }, l).path);
  assert.equal(new Set(paths).size, pair.length);
  const loop = LD.geometry.curve({ x: 5, y: 5 }, { x: 5, y: 5 }, { a: { hostname: "x" }, b: { hostname: "x" }, indexInPair: 0, pairCount: 1 });
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
  assert.match(document.getElementById("graph-status").textContent, /5 nœuds sur 6 et 5 câbles sur 6 affichés · 1 voisin inconnu masqué/);
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
  assert.match(checks.textContent, /11 contrôles sur 11/);
  assert.match(checks.textContent, /device_unreachable/);
  assert.match(checks.textContent, /sw-core-02 · Ethernet1\/2 \(oper_status down, oper_reason suspended by LACP\)/,
    "un bout porteur de faits (R5) montre ses faits, pas seulement son nom");
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
  assert.deepEqual(clone(toCore.checks.map((c) => c.code)).sort(),
    ["description_disagrees_with_observed", "link_oper_mismatch", "multiple_observed_neighbors", "one_way_observation"],
    "ni le voisin inconnu de l'autre câble, ni le contrôle qui nomme l'autre câble ; Eth1/5 est not_present, l'autre bout up");
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


// ---------------------------------------------------------------- incrément B : les structures (2026-09-26)

const CLUSTER_ID = ["fw-edge-01", "fw-edge-02"].join("\u0000");
const PO10_CORE_2 = ["sw-core-02", "port-channel10"].join("\u0000");

test("le modèle indexe les structures : agrégats, faisceaux, domaines MLAG, clusters", () => {
  const model = load(page).LD.model.build(page.data);
  assert.equal(model.aggregates.length, 5);
  assert.deepEqual(clone(model.beams.map((b) => [b.a.aggregate, b.b.aggregate, b.links.length, b.peerLink, b.mlags.map((d) => d.raw.mlag_id)])), [
    ["agg-core", "port-channel20", 1, false, [20]], ["agg-core", "port-channel20", 1, false, [20]], ["port-channel10", "port-channel10", 2, true, []]]);
  assert.deepEqual(clone(load(page).LD.geometry.beamWidths(model.beams[2])), { band: 32, hit: 48 }, "la bande couvre l'éventail de ses deux câbles");
  const po10 = model.aggregateByKey.get(PO10_CORE_2);
  assert.equal(po10.cables.length, 2);
  assert.deepEqual(clone(po10.checks.map((c) => c.code)), ["aggregate_member_not_bundled"]);
  assert.equal(po10.beams[0].degraded, true, "un membre suspendu dégrade le faisceau du peer-link");
  assert.equal(model.mlagDomains.length, 1);
  assert.equal(model.mlagDomains[0].peerLink.name, "port-channel10");
  const cluster = model.clusterById.get(CLUSTER_ID);
  assert.deepEqual(clone(cluster.hosts), ["fw-edge-01", "fw-edge-02"]);
  assert.equal(cluster.heartbeats[0].link, null, "aucun câble inventé pour ha1");
  assert.deepEqual(clone(cluster.checks.map((c) => c.code)), ["ha_member_down", "heartbeat_link_not_observed"]);
  assert.equal(model.clustersByHost.get("fw-edge-02")[0], cluster);
  assert.equal(model.linkById.get(CORE_LINK).beam.peerLink, true);
});

test("le graphe dessine une bande par faisceau et un cadre par cluster, cliquables", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  assert.equal(canvas.withClass("beam").length, 3);
  assert.equal(canvas.withClass("cluster").length, 1);
  assert.match(canvas.withClass("cluster-label")[0].textContent, /HA · EDGE-CLUSTER · active_passive/);
  const labels = canvas.withClass("beam-label").map((el) => el.textContent);
  assert.deepEqual(clone(labels), ["MLAG 20", "MLAG 20", "peer-link"], "forme courte par défaut");
  for (const tag of canvas.withClass("beam-tag")) assert.match(tag.getAttribute("transform"), /^rotate\(-?\d+(\.\d+)? /);
  assert.equal(canvas.withClass("beam-label-hit").length, 3, "chaque étiquette a sa zone de clic, au-dessus des câbles");
  const hit = canvas.withClass("beam-hit")[2];
  canvas.fire("pointerdown", { target: hit });
  canvas.fire("pointerup", { target: hit });
  assert.equal(LD.app.graph.state.selection.kind, "beam");
  assert.equal(canvas.withClass("beam-label")[2].textContent, "peer-link", "l'étiquette reste courte sur la toile : la complète est dans la bulle et l'inspecteur");
  assert.equal(canvas.withClass("beam-tag")[2].classList.contains("selected"), true);
  const inspector = document.getElementById("inspector");
  assert.match(inspector.textContent, /faisceau.*2 câbles entre les membres de port-channel10 et de port-channel10.*peer-link/s);
  assert.match(inspector.textContent, /aggregate_member_not_bundled/);
  const frame = canvas.withClass("cluster-hull")[0];
  canvas.fire("pointerdown", { target: frame });
  canvas.fire("pointerup", { target: frame });
  assert.equal(LD.app.graph.state.selection.kind, "cluster");
  assert.match(inspector.textContent, /cluster HA.*EDGE-CLUSTER.*2 membres en active_passive, décrits par le document ha de fw-edge-01\./s);
  assert.match(inspector.textContent, /aucun câble observé ni documenté : rien n'est inventé/);
  assert.match(inspector.textContent, /fw-edge-02 : aucun document ha \(collecte : unreachable\)/);
  assert.match(inspector.textContent, /ha_member_down/);
});

test("un agrégat a sa fiche, ses membres, ses sources ; la fiche d'un équipement mène à ses structures", () => {
  const { LD, document } = load(page, page.data);
  const inspector = document.getElementById("inspector");
  LD.app.graph.select({ kind: "aggregate", id: PO10_CORE_2 });
  const text = inspector.textContent;
  assert.match(text, /agrégat.*dégradé.*sw-core-02 · port-channel10/s);
  assert.match(text, /2 membres dont 1 bundled, lacp active, min_links 1\. 2 câbles tracés sur ses membres\. Cet agrégat est le peer-link/);
  assert.match(text, /Ethernet1\/2.*suspended.*sw-core-01 · Ethernet1\/2/s);
  assert.match(text, /Document du topic aggregates de sw-core-02.*topic aggregates : success/s);
  const canvas = document.getElementById("canvas");
  assert.equal(canvas.withClass("selected").length, 1, "l'équipement de l'agrégat est sélectionné");
  assert.equal(canvas.withClass("beam").filter((b) => b.classList.contains("related")).length, 1, "son faisceau est éclairé");
  assert.equal(canvas.withClass("link").filter((l) => l.classList.contains("related")).length, 2, "ses deux câbles aussi");
  LD.app.graph.select({ kind: "node", id: "fw-edge-01" });
  assert.match(inspector.textContent, /Cluster HA.*HA · EDGE-CLUSTER.*Agrégats : 1.*agg-core/s);
  LD.app.graph.select({ kind: "link", id: CORE_LINK });
  assert.match(inspector.textContent, /agrégats.*sw-core-01 · port-channel10 · sw-core-02 · port-channel10.*faisceau.*peer-link/s);
});

test("la vue Structures se monte et une ligne ouvre l'agrégat dans le graphe ; l'adresse porte la sélection", () => {
  const { LD, document, location, go } = load(page, page.data);
  LD.app.activate("structures");
  const view = document.getElementById("view-structures");
  assert.match(view.textContent, /Agrégats : 5.*Domaines MLAG : 1.*sw-core-01 · port-channel10.*fw-edge-01.*Clusters HA : 1.*ha1 \(sans câble\)/s);
  const row = view.withClass("clickable").find((r) => /port-channel20/.test(r.textContent));
  row.fire("click", {});
  assert.equal(document.getElementById("view-graph").hidden, false);
  assert.deepEqual(clone(LD.app.graph.state.selection), { kind: "aggregate", id: ["sw-core-01", "port-channel20"].join("\u0000") });
  assert.equal(location.hash, "#view=graph&aggregate=" + encodeURIComponent(JSON.stringify(["sw-core-01", "port-channel20"])));
  go("#view=graph&cluster=" + encodeURIComponent(JSON.stringify(["fw-edge-01", "fw-edge-02"])));
  assert.deepEqual(clone(LD.app.graph.state.selection), { kind: "cluster", id: CLUSTER_ID });
  go("#view=graph&beam=" + encodeURIComponent(JSON.stringify(["sw-core-01", "port-channel10", "sw-core-02", "port-channel10"])));
  assert.equal(LD.app.graph.state.selection.kind, "beam");
  go("#view=graph&aggregate=" + encodeURIComponent(JSON.stringify(["nope", "x"])));
  assert.equal(LD.app.graph.state.selection, null, "une adresse qui ne désigne rien n'empêche pas la page de s'afficher");
});

// ---------------------------------------------------------------- revue de l'incrément B (2026-09-26)

test("un faisceau dont un bout n'a pas de document aggregates ne parle pas de désaccord de protocole", () => {
  const data = clone(page.data);
  data.snapshot.aggregates = data.snapshot.aggregates.filter((a) => a.hostname !== "fw-edge-01");
  const { LD, document } = load(page, data);
  LD.app.graph.select({ kind: "beam", id: LD.app.model.beams[0].id });
  const text = document.getElementById("inspector").textContent;
  assert.match(text, /fw-edge-01 · agg-core n'a pas de document aggregates .* B1 ne compare pas les protocoles/);
  assert.doesNotMatch(text, /Protocoles différents/);
  assert.match(text, /Patte du domaine MLAG 20 \(vers fw-edge-01\)/);
});

test("un équipement décrit dans deux clusters montre les deux, et le graphe dessine deux cadres", () => {
  const data = clone(page.data);
  const member = (hostname, role) => ({ hostname, role, state: "up", priority: null, reported_by: ["fw-edge-01"] });
  data.snapshot.ha_clusters.push({ members: [member("fw-edge-01", "member"), member("sw-core-01", "member")], mode: "active_active", cluster_name: "ODD", heartbeat_interfaces: [] });
  const { LD, document } = load(page, data);
  assert.equal(LD.app.model.clustersByHost.get("fw-edge-01").length, 2);
  assert.equal(document.getElementById("canvas").withClass("cluster").length, 2);
  LD.app.graph.select({ kind: "node", id: "fw-edge-01" });
  assert.match(document.getElementById("inspector").textContent, /Clusters HA.*EDGE-CLUSTER.*ODD/s);
  assert.equal(document.getElementById("canvas").withClass("cluster").filter((c) => c.classList.contains("related")).length, 2);
});

test("une adresse aux bouts inversés désigne le même élément, et reveal(null) ne casse rien", () => {
  const { LD, go } = load(page, page.data, "");
  go("#view=graph&beam=" + encodeURIComponent(JSON.stringify(["sw-core-02", "port-channel10", "sw-core-01", "port-channel10"])));
  assert.equal(LD.app.graph.state.selection.kind, "beam");
  go("#view=graph&cluster=" + encodeURIComponent(JSON.stringify(["fw-edge-02", "fw-edge-01"])));
  assert.deepEqual(clone(LD.app.graph.state.selection), { kind: "cluster", id: CLUSTER_ID });
  go("#view=graph&link=" + encodeURIComponent(JSON.stringify(["sw-core-02", "Ethernet1/2", "sw-core-01", "Ethernet1/2"])));
  assert.equal(LD.app.graph.state.selection.id, CORE_LINK);
  assert.doesNotThrow(() => LD.app.graph.reveal(null));
  assert.equal(LD.app.graph.state.selection, null);
});

const aggstop = process.env.LD_PAGE_AGGSTOP ? readPage(process.env.LD_PAGE_AGGSTOP) : null;

test("les câbles arrêtés à l'agrégat lui-même se lisent depuis l'agrégat", { skip: !aggstop }, () => {
  const { LD, document } = load(aggstop, aggstop.data);
  LD.app.graph.select({ kind: "aggregate", id: ["fw-edge-01", "agg-core"].join("\u0000") });
  const text = document.getElementById("inspector").textContent;
  assert.match(text, /Aucun câble tracé sur ses membres\. 2 câbles arrêtés à l'agrégat lui-même/);
  assert.match(text, /Câbles arrêtés à l'agrégat lui-même : 2.*remote_port_is_aggregate.*sw-core-01 · Ethernet1\/3/s);
  assert.equal(LD.app.model.beams.length, 1, "un câble arrêté à l'agrégat n'est pas un faisceau : seul le peer-link en est un");
});

const unread = process.env.LD_PAGE_UNREAD ? readPage(process.env.LD_PAGE_UNREAD) : null;

test("un drapeau peer-link non lu se lit « non lu », jamais comme un peer-link (2026-10-02)", { skip: !unread }, () => {
  const { LD, document } = load(unread, unread.data);
  const po10 = LD.app.model.aggregateByKey.get(PO10_CORE_2);
  assert.equal(po10.raw.mlag_peer_link, null, "le snapshot garde le null");
  assert.equal(po10.beams[0].peerLink, false, "le faisceau des Po10 n'est pas un peer-link");
  LD.app.graph.select({ kind: "aggregate", id: PO10_CORE_2 });
  const text = document.getElementById("inspector").textContent;
  assert.match(text, /Peer-link non lu : la source MLAG du document aggregates n'a pas répondu/);
  assert.match(text, /min_links1peer-linknon lu/, "la fiche porte la ligne « peer-link : non lu » (pas de ligne MLAG id : il est null)");
  assert.doesNotMatch(text, /Cet agrégat est le peer-link/);
  const domain = LD.app.model.mlagDomains[0];
  assert.equal(domain.raw.mlag_id, 20);
  assert.equal(domain.raw.peer_link, null, "le domaine 20 est formé par le repli, sans peer-link");
  const container = document.getElementById("inspector");
  LD.tables.structuresView(container, LD.app.model, () => {});
  assert.match(container.textContent, /peer-link non lu/, "le tableau Structures le dit aussi");
});

// ---------------------------------------------------------------- la coquille servie par le backend (2026-09-26)

const shell = process.env.LD_SHELL ? readPage(process.env.LD_SHELL) : null;
const RUN_ID = "66db3f0e9a1c2b0012f4a7d1";

function fakeApi(page, answers) {
  const calls = [];
  const bodies = {
    "/api/ingest/bundles": { status: 200, body: { infrastructure: "infra-lab", runs: [{ run_id: RUN_ID, run_start: "2026-09-10T02:00:00Z", run_end: null, run_status: "completed", produced_at: "x", stored_at: "2026-09-10T03:00:00Z", sha256: "0" }] } },
    "/api/snapshot": { status: 200, body: page.data.snapshot },
    "/api/ingest/report": { status: 200, body: { summary: page.data.ingest.summary, findings: [] } },
    ...(answers || {}),
  };
  const store = new Map();
  return {
    calls, store,
    fetch: (url, init) => {
      calls.push([url, init.headers.Authorization]);
      const answer = bodies[url.split("?")[0]] || { status: 500, body: null };
      return Promise.resolve({ status: answer.status, json: () => Promise.resolve(answer.body) });
    },
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  };
}

test("la coquille demande le jeton, liste les runs, puis charge la run par l'API", { skip: !shell }, async () => {
  const api = fakeApi(page);
  const { LD, document, location } = load(shell, shell.data, "#view=checks", { fetch: api.fetch, sessionStorage: api.sessionStorage, search: "?infrastructure=infra-lab" });
  assert.equal(LD.app, undefined, "rien ne démarre sans snapshot");
  const view = document.getElementById("view-shell");
  assert.equal(view.hidden, false);
  assert.equal(document.getElementById("view-graph").hidden, true, "les vues attendent leurs données");
  assert.match(view.textContent, /jeton d'API.*n'entre jamais dans l'adresse/s);
  view.all((n) => n.getAttribute("type") === "password")[0].value = "secret";
  view.all((n) => n.tagName === "form")[0].fire("submit", {});
  await LD.shellApp.state.pending;
  assert.deepEqual(api.calls, [["/api/ingest/bundles?infrastructure=infra-lab", "Bearer secret"]]);
  assert.equal(api.store.get("ld-api-token"), "secret", "le jeton reste dans l'onglet");
  assert.match(view.textContent, /Runs archivées de infra-lab : 1.*66db3f0e9a1c2b0012f4a7d1.*completed/s);
  view.withClass("clickable")[0].fire("click", {});
  await LD.shellApp.state.pending;
  assert.equal(api.calls.length, 3);
  assert.equal(view.hidden, true);
  assert.ok(LD.app, "le visualiseur a démarré sur les données lues");
  assert.match(document.getElementById("run-meta").textContent, /infra-lab · run 66db3f0e9a1c2b0012f4a7d1.*api · infra-lab · 66db/s);
  assert.equal(location.search, "?infrastructure=infra-lab&run_id=" + RUN_ID, "l'adresse porte la run, jamais le jeton");
  assert.match(location.hash, /^#view=checks/);
  assert.equal(document.getElementById("view-checks").hidden, false);
});

test("un jeton connu et une run dans l'adresse chargent directement ; un jeton refusé est oublié", { skip: !shell }, async () => {
  const api = fakeApi(page);
  api.store.set("ld-api-token", "known");
  const { LD, document } = load(shell, shell.data, "", { fetch: api.fetch, sessionStorage: api.sessionStorage, search: "?infrastructure=infra-lab&run_id=" + RUN_ID });
  await LD.shellApp.state.pending;
  assert.ok(LD.app);
  assert.equal(api.calls[0][1], "Bearer known");
  const refused = fakeApi(page, { "/api/snapshot": { status: 401, body: { detail: "jeton d'API absent ou invalide" } }, "/api/ingest/report": { status: 401, body: null } });
  refused.store.set("ld-api-token", "stale");
  const second = load(shell, shell.data, "", { fetch: refused.fetch, sessionStorage: refused.sessionStorage, search: "?infrastructure=infra-lab&run_id=" + RUN_ID });
  await second.LD.shellApp.state.pending;
  assert.equal(second.LD.app, undefined);
  assert.match(second.document.getElementById("view-shell").textContent, /jeton refusé par l'API/);
  assert.equal(refused.store.has("ld-api-token"), false, "un jeton refusé n'est pas gardé");
  const missing = fakeApi(page, { "/api/snapshot": { status: 404, body: { detail: "run archivée sans snapshot : lancer `ld correlate`" } } });
  missing.store.set("ld-api-token", "ok");
  const third = load(shell, shell.data, "", { fetch: missing.fetch, sessionStorage: missing.sessionStorage, search: "?infrastructure=infra-lab&run_id=nope" });
  await third.LD.shellApp.state.pending;
  assert.match(third.document.getElementById("view-shell").textContent, /run archivée sans snapshot/);
  assert.equal(missing.store.get("ld-api-token"), "ok", "un 404 ne fait pas oublier le jeton");
});

// ---------------------------------------------------------------- forme HA des descriptions (2026-10-02)

test("une forme HA non résolue se lit dans la qualité des données, avec sa raison", () => {
  const data = clone(page.data);
  data.snapshot.checks.push({
    code: "description_ha_unresolved", severity: "warning", origin: "correlation",
    refs: [{ kind: "interface", hostname: "fw-edge-01", name: "x1" }],
    details: { reason: "priority_undecided", priorities: [{ hostname: "fw-edge-01", priority: 200 }, { hostname: "fw-edge-02", priority: 200 }] },
  });
  const { LD, document } = load(page, data);
  LD.app.activate("quality");
  const quality = document.getElementById("view-quality").textContent;
  assert.match(quality, /description_ha_unresolved/);
  assert.match(quality, /priority_undecided/);
  assert.match(quality, /fw-edge-01 · x1/);
});

// ---------------------------------------------------------------- démonstration : bulles au survol, rôle HA (2026-10-02)

const STUB_LINK = ["srv-hyp-07", "3c:ec:ef:12:34:56", "sw-core-02", "Ethernet1/3"].join("\u0000");
const WAN_LINK = ["rt-wan-01", "GigabitEthernet0/0/0", "sw-core-01", "Ethernet1/4"].join("\u0000");
const joined = (lines) => lines.map((cells) => cells.map((cell) => cell.text).join(" ")).join("\n");

test("une vitesse s'écrit en Gb/s ou en Mb/s ; non lue, elle ne s'écrit pas", () => {
  const { LD } = load(page);
  assert.deepEqual(clone([10000, 2500, 1000, 100, 20000, null].map(LD.dom.speedText)), ["10 Gb/s", "2,5 Gb/s", "1 Gb/s", "100 Mb/s", "20 Gb/s", null]);
});

test("la bulle d'un câble donne, par bout, vitesse, duplex, média et état, tels que lus", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const core = joined(LD.tip.linkLines(model, model.linkById.get(CORE_LINK)));
  assert.match(core, /^sw-core-01 · Ethernet1\/2 ↔ sw-core-02 · Ethernet1\/2\nconfirmé · LLDP \+ Description · down\n/);
  assert.match(core, /\nvitesse 10 Gb\/s 10 Gb\/s\nduplex full full\nmédia 10Gbase-SR 10Gbase-SR\nétat up down · suspended by LACP\n/);
  assert.match(core, /\nwarning · aggregate_member_not_bundled\nwarning · description_disagrees_with_observed\nwarning · link_oper_mismatch$/, "un contrôle par ligne, les plus graves d'abord");
  const stub = joined(LD.tip.linkLines(model, model.linkById.get(STUB_LINK)));
  assert.match(stub, /\nvitesse — 10 Gb\/s\n/, "un bout absent de interfaces[] n'a pas de valeur : un tiret, jamais une valeur inventée");
  assert.match(stub, /\nmédia — 10Gbase-SR\n/);
  assert.match(stub, /\nsrv-hyp-07 · 3c:ec:ef:12:34:56 : absent de interfaces\[\]\n/, "un bout absent est nommé comme tel, le tiret n'affirme rien");
});

test("un câble dont aucun bout n'a de caractéristique le dit sans inventer de raison", () => {
  const data = clone(page.data);
  Object.assign(data.snapshot.interfaces.find((i) => i.hostname === "sw-core-01" && i.name === "Ethernet1/4"), { speed_mbps: null, duplex: null, media: null });
  const { LD } = load(page, data);
  const model = LD.app.model;
  const text = joined(LD.tip.linkLines(model, model.linkById.get(WAN_LINK)));
  assert.match(text, /vitesse, duplex, média : aucune valeur/);
  assert.doesNotMatch(text, /non lu/, "null n'est pas une raison");
  assert.doesNotMatch(text, /\nvitesse /);
  assert.match(text, /\nétat — up(\n|$)/, "l'état reste connu du côté collecté");
});

test("survoler un tracé affiche la bulle, quitter la cache ; un appui la cache aussi", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const model = LD.app.model;
  const core = model.linkById.get(CORE_LINK);
  const group = canvas.withClass("link").find((g) => g.getAttribute("data-link") === String(core.index));
  const hit = group.withClass("link-hit")[0];
  const tip = canvas.withClass("tip")[0];
  assert.equal(tip.getAttribute("visibility"), "hidden");
  canvas.fire("pointermove", { target: hit, clientX: 120, clientY: 90 });
  assert.equal(tip.getAttribute("visibility"), "visible");
  assert.match(tip.textContent, /10Gbase-SR/);
  assert.match(tip.getAttribute("transform"), /^translate\(-?\d+(\.\d+)?,-?\d+(\.\d+)?\)$/);
  canvas.fire("pointermove", { target: canvas, clientX: 300, clientY: 300 });
  assert.equal(tip.getAttribute("visibility"), "hidden");
  const shape = canvas.withClass("node").find((g) => g.getAttribute("data-node") === "fw-edge-01").withClass("node-shape")[0];
  canvas.fire("pointermove", { target: shape, clientX: 10, clientY: 10 });
  assert.match(tip.textContent, /fw-edge-01 · équipement collecté · firewall/);
  assert.match(tip.textContent, /HA · EDGE-CLUSTER · active_passive · primary · up · priorité 200/);
  canvas.fire("pointerdown", { target: canvas });
  assert.equal(tip.getAttribute("visibility"), "hidden");
  canvas.fire("pointerup", {});
  canvas.fire("pointermove", { target: shape, clientX: 10, clientY: 10 });
  assert.equal(tip.getAttribute("visibility"), "visible");
  canvas.fire("pointerleave", {});
  assert.equal(tip.getAttribute("visibility"), "hidden");
  assert.equal(canvas.all((n) => n.tagName === "title").length, 0, "plus de <title> natif : une seule bulle");
});

test("un membre de cluster HA porte son rôle sur le graphe, tel qu'enregistré", () => {
  const { document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const node = (host) => canvas.withClass("node").find((g) => g.getAttribute("data-node") === host);
  assert.equal(node("fw-edge-01").classList.contains("ha-lead"), true);
  assert.equal(node("fw-edge-01").withClass("node-role")[0].textContent, "primary");
  assert.equal(node("fw-edge-02").classList.contains("ha-follow"), true);
  assert.equal(node("fw-edge-02").classList.contains("ha-state-down"), true);
  assert.equal(node("fw-edge-02").withClass("node-role")[0].textContent, "secondary");
  assert.equal(node("sw-core-01").withClass("node-role").length, 0, "un équipement hors cluster ne porte aucun rôle");
});

// ---------------------------------------------------------------- revue de la page de démonstration (2026-10-02)

test("la bulle d'un faisceau nomme ses deux équipements ; celle d'un cluster liste ses membres", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const titles = model.beams.map((beam) => LD.tip.beamLines(beam)[0][0].text);
  assert.equal(new Set(titles).size, model.beams.length, "deux faisceaux d'un même agrégat vers deux voisins ont deux bulles distinctes (revue, M2)");
  const peer = joined(LD.tip.beamLines(model.beams.find((b) => b.peerLink)));
  assert.match(peer, /^faisceau sw-core-01 · port-channel10 ⇄ sw-core-02 · port-channel10 · peer-link\n2 câbles · .*un agrégat dégradé\n/);
  assert.match(peer, /aggregate_member_not_bundled/);
  const cluster = joined(LD.tip.clusterLines(model.clusterById.get(CLUSTER_ID)));
  assert.match(cluster, /^HA · EDGE-CLUSTER · active_passive\nfw-edge-01 primary · up · priorité 200\nfw-edge-02 secondary · down · priorité 100\nerror · ha_member_down\n/);
});

test("les contrôles d'une bulle portent leur nombre par code ; le reste est compté en contrôles (revue, M3)", () => {
  const { LD } = load(page, page.data);
  const checks = Array.from({ length: 9 }, () => ({ severity: "warning", code: "neighbor_unknown" }))
    .concat([{ severity: "error", code: "link_oper_mismatch" }], Array.from({ length: 7 }, (_, i) => ({ severity: "info", code: "info_" + i })));
  const beam = { a: { hostname: "a", aggregate: "po1" }, b: { hostname: "b", aggregate: "po2" }, known: [], links: [1, 2], degraded: false, peerLink: false, mlags: [], checks };
  assert.match(joined(LD.tip.beamLines(beam)), /\nerror · link_oper_mismatch\nwarning · neighbor_unknown ×9\ninfo · info_0\ninfo · info_1\ninfo · info_2\ninfo · info_3\n… et 3 autres contrôles$/);
});

test("un appui annulé libère le glissé : le nœud ne suit plus la souris, la bulle revit (revue, H1)", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const state = LD.app.graph.state;
  const node = canvas.withClass("node").find((g) => g.getAttribute("data-node") === "sw-core-01");
  const tip = canvas.withClass("tip")[0];
  const before = clone(state.positions.get("sw-core-01"));
  node.fire("pointerdown", { clientX: 10, clientY: 10 });
  node.fire("pointercancel", {});
  node.fire("pointermove", { clientX: 90, clientY: 40 });
  assert.deepEqual(clone(state.positions.get("sw-core-01")), before, "sans appui, le nœud ne bouge pas");
  canvas.fire("pointermove", { target: node.withClass("node-shape")[0], clientX: 10, clientY: 10 });
  assert.equal(tip.getAttribute("visibility"), "visible", "la bulle n'est pas restée morte");
  node.fire("pointerdown", { clientX: 10, clientY: 10, button: 2 });
  node.fire("pointermove", { clientX: 90, clientY: 40 });
  assert.deepEqual(clone(state.positions.get("sw-core-01")), before, "le clic droit ne glisse rien");
  const tx = state.view.tx;
  canvas.fire("pointerdown", { target: canvas });
  canvas.fire("pointercancel", {});
  canvas.fire("pointermove", { target: canvas, clientX: 60, clientY: 0 });
  assert.equal(state.view.tx, tx, "un appui annulé sur le fond ne laisse pas la vue suivre la souris");
});

test("glisser puis relâcher rend le survol ; le focus montre la bulle et la rattache, la perte du focus la cache (revue, M5, B1, B7)", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const node = canvas.withClass("node").find((g) => g.getAttribute("data-node") === "sw-core-01");
  const shape = node.withClass("node-shape")[0];
  const tip = canvas.withClass("tip")[0];
  node.fire("pointerdown", { clientX: 10, clientY: 10 });
  node.fire("focus", {}); // le focus reçu à l'appui
  assert.equal(tip.getAttribute("visibility"), "hidden", "le focus de l'appui ne rallume pas la bulle");
  canvas.fire("pointermove", { target: shape, clientX: 50, clientY: 30 });
  assert.equal(tip.getAttribute("visibility"), "hidden", "pas de bulle pendant un glissé");
  node.fire("pointermove", { clientX: 90, clientY: 40 });
  node.fire("pointerup", {});
  canvas.fire("pointermove", { target: shape, clientX: 90, clientY: 40 });
  assert.equal(tip.getAttribute("visibility"), "visible", "après le relâchement, le survol revit");
  canvas.fire("pointerleave", {});
  node.fire("focus", {});
  assert.equal(tip.getAttribute("visibility"), "visible");
  assert.match(tip.textContent, /sw-core-01 · équipement collecté · switch/);
  assert.equal(node.getAttribute("aria-describedby"), "ld-tip");
  assert.equal(node.getAttribute("role"), "button");
  assert.equal(tip.getAttribute("role"), "tooltip");
  node.fire("blur", {});
  assert.equal(tip.getAttribute("visibility"), "hidden");
  assert.equal(node.getAttribute("aria-describedby"), null);
  assert.equal(LD.app.graph.state.pinned.size, 1, "le glissé a bien épinglé le nœud");
});

test("le fond du rôle ne dit forwarde / en attente que là où le snapshot le dit (revue, M1)", () => {
  const { LD } = load(page);
  const group = LD.model.haRoleGroup;
  assert.deepEqual([group("active_passive", "primary"), group("active_passive", "secondary"), group("active_active", "primary"), group("active_active", "secondary"),
    group("active_active", "active"), group("other", "standby"), group("active_passive", "member")], ["lead", "follow", "plain", "plain", "lead", "follow", "plain"]);
});

test("un équipement dans deux clusters porte le rôle du premier, l'état down de n'importe lequel, et la bulle liste les deux (revue, B4)", () => {
  const data = clone(page.data);
  data.snapshot.ha_clusters.push({ cluster_name: "ODD", mode: "active_active", heartbeat_interfaces: [], members: [
    { hostname: "fw-edge-01", role: "standby", state: "down", priority: null, reported_by: ["fw-edge-01"] },
    { hostname: "sw-core-02", role: "active", state: "up", priority: null, reported_by: ["fw-edge-01"] }] });
  const { LD, document } = load(page, data);
  const node = document.getElementById("canvas").withClass("node").find((g) => g.getAttribute("data-node") === "fw-edge-01");
  assert.equal(node.classList.contains("ha-lead"), true, "rôle du premier cluster, dans l'ordre canonique");
  assert.equal(node.classList.contains("ha-state-down"), true, "down dans le second cluster : visible sur le nœud");
  assert.match(joined(LD.tip.nodeLines(LD.app.model, LD.app.model.nodeByHost.get("fw-edge-01"))),
    /HA · EDGE-CLUSTER · active_passive · primary · up · priorité 200\nHA · ODD · active_active · standby · down\n/);
});


// ---------------------------------------------------------------- passe de finition après la critique design (2026-10-02)

test("l'en-tête n'est pas inerte : une sévérité ouvre les contrôles filtrés, un statut se bascule comme dans la légende", () => {
  const { LD, document } = load(page, page.data);
  document.getElementById("c-error").fire("click", {});
  assert.equal(document.getElementById("view-checks").hidden, false);
  assert.match(document.getElementById("view-checks").textContent, /2 contrôles sur 11/);
  assert.equal(document.getElementById("f-severity").value, "error");
  document.getElementById("c-documented_only").fire("click", {});
  assert.equal(LD.app.graph.state.hiddenStatuses.has("documented_only"), true);
  assert.equal(document.getElementById("c-documented_only").getAttribute("aria-pressed"), "false");
  assert.equal(document.getElementById("l-documented_only").getAttribute("aria-pressed"), "false", "la légende et l'en-tête disent la même chose");
  assert.match(document.getElementById("run-meta").textContent, /^infra-lab · run 66db3f0e9a1c2b0012f4a7d1collecte du/, "identité sur une ligne, métadonnées sur la suivante");
});

test("les contrôles sont triés par sévérité puis par code ; les onglets portent leurs comptes", () => {
  const { LD, document } = load(page, page.data);
  LD.app.activate("checks");
  const rows = document.getElementById("view-checks").all((n) => n.tagName === "tr").slice(1);
  const severities = rows.map((row) => row.withClass("pill")[0].textContent);
  assert.deepEqual(severities.slice(0, 2), ["error", "error"], "les erreurs d'abord");
  assert.equal(severities.join(","), severities.slice().sort((x, y) => LD.model.SEVERITY_RANK[x] - LD.model.SEVERITY_RANK[y]).join(","));
  assert.match(document.getElementById("tab-checks").textContent, /^Contrôles · 11$/);
  assert.match(document.getElementById("tab-sources").textContent, /^Sources · 6$/);
  assert.equal(document.getElementById("tab-checks").getAttribute("aria-controls"), "view-checks");
});

test("un nœud porte une icône de type dessinée et son nom raccourci au besoin ; la légende montre les types", () => {
  const data = clone(page.data);
  const long = "sw-distribution-building-b-floor-12-rack-07";
  data.snapshot.nodes.find((n) => n.hostname === "rt-wan-01").hostname = long;
  data.snapshot.links.forEach((l) => [l.a, l.b].forEach((end) => { if (end.hostname === "rt-wan-01") end.hostname = long; }));
  data.snapshot.links.forEach((l) => l.evidence.forEach((e) => { [e.witness, e.remote_resolved].forEach((end) => { if (end.hostname === "rt-wan-01") end.hostname = long; }); }));
  data.snapshot.checks.forEach((c) => c.refs.forEach((r) => { if (r.hostname === "rt-wan-01") r.hostname = long; if (r.a && r.a.hostname === "rt-wan-01") r.a.hostname = long; if (r.b && r.b.hostname === "rt-wan-01") r.b.hostname = long; }));
  const { document } = load(page, data);
  const canvas = document.getElementById("canvas");
  const node = (host) => canvas.withClass("node").find((g) => g.getAttribute("data-node") === host);
  assert.match(node("sw-core-01").withClass("node-icon")[0].getAttribute("d"), /^M/, "une icône dessinée, pas un glyphe");
  assert.equal(node("sw-core-01").withClass("node-tag").length, 0, "le type n'est plus un texte dans le nœud");
  assert.match(node("sw-core-01").getAttribute("aria-label"), /sw-core-01 · équipement collecté · switch/);
  const label = node(long).withClass("node-label")[0].textContent;
  assert.equal(label.length <= 23 && label.includes("…"), true, "nom raccourci au milieu sur la toile");
  assert.match(node(long).getAttribute("aria-label"), new RegExp("^" + long), "le nom complet reste accessible");
  assert.equal(document.getElementById("graph-legend").withClass("legend-icon").length, 7, "une icône par type du contrat");
  assert.equal(document.getElementById("graph-legend").withClass("legend-group").length, 5);
  const toggle = document.getElementById("t-legend");
  toggle.fire("click", { target: toggle });
  assert.equal(document.getElementById("graph-legend").hidden, true, "la légende se masque depuis la barre d'outils");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
});

test("un câble se sélectionne et se décrit au clavier ; la zone live dit ce qui est sélectionné", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const group = canvas.withClass("link").find((g) => g.getAttribute("data-link") === String(LD.app.model.linkById.get(CORE_LINK).index));
  assert.equal(group.getAttribute("tabindex"), "0");
  assert.equal(group.getAttribute("role"), "button");
  const tip = canvas.withClass("tip")[0];
  group.fire("focus", {});
  assert.equal(tip.getAttribute("visibility"), "visible");
  assert.match(tip.textContent, /10Gbase-SR/);
  group.fire("keydown", { key: "Enter" });
  assert.equal(LD.app.graph.state.selection.id, CORE_LINK);
  assert.equal(document.getElementById("live").textContent, "câble sw-core-01 · Ethernet1/2 ↔ sw-core-02 · Ethernet1/2 sélectionné");
  group.fire("blur", {});
  assert.equal(tip.getAttribute("visibility"), "hidden");
  assert.equal(canvas.withClass("beam").every((b) => b.getAttribute("tabindex") === "0"), true, "les faisceaux aussi");
  assert.equal(canvas.withClass("cluster")[0].getAttribute("tabindex"), "0", "et les clusters");
  LD.app.graph.select(null);
  assert.equal(document.getElementById("live").textContent, "");
});

test("le palier de zoom se lit sur le svg : de loin, les petites étiquettes sont masquées par la feuille de style", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  LD.app.graph.state.view.k = 0.5;
  LD.app.graph.repaint();
  assert.equal(canvas.classList.contains("zoom-far"), true);
  LD.app.graph.state.view.k = 1.5;
  LD.app.graph.repaint();
  assert.equal(canvas.classList.contains("zoom-near"), true);
  assert.equal(canvas.classList.contains("zoom-far"), false);
});

// ---------------------------------------------------------------- le diff (2026-10-04)

const diffPage = process.env.LD_PAGE_DIFF ? readPage(process.env.LD_PAGE_DIFF) : null;
const CORE1_LINK = ["sw-core-01", "Ethernet1/1", "sw-core-02", "Ethernet1/1"].join("\u0000");
const LATER_RUN_ID = "66e49a2d9a1c2b0012f4a8e2";

test("le modèle lit le diff : fantômes, index des changements, compte de l'onglet", { skip: !diffPage }, () => {
  const model = load(diffPage).LD.model.build(diffPage.data);
  assert.ok(model.diff);
  assert.equal(model.links.length, 5, "les câbles de cette run, sans les fantômes");
  assert.equal(model.ghostLinks.length, 1);
  assert.deepEqual(clone(model.ghostNodes.map((n) => [n.hostname, n.kind, n.ghost])), [["srv-hyp-07", "stub", true]]);
  const ghost = model.linkById.get(STUB_LINK);
  assert.equal(ghost.ghost, true);
  assert.equal(ghost.checks.length, 0, "un fantôme ne porte aucun contrôle de cette run");
  assert.equal(model.linksByNode.get("sw-core-02").includes(ghost), true, "il suit encore son équipement");
  assert.deepEqual(clone(model.changeOf("link", CORE1_LINK).fields.map((f) => f.path)), ["oper"]);
  assert.equal(model.changeOf("link", STUB_LINK).kind, "removed");
  assert.equal(model.changeOf("node", "srv-hyp-07").kind, "removed");
  assert.equal(model.changeOf("interface", ["sw-core-01", "Ethernet1/1"].join("\u0000")).kind, "changed");
  assert.equal(model.changeOf("link", WAN_LINK), null);
  const s = model.diff.summary;
  assert.equal(model.diffCount, 1 + 2 + 3 + s.checks.appeared + s.checks.resolved, "équipements, câbles, interfaces, contrôles");
  assert.equal(model.statusCounts.get("confirmed"), 3, "les totaux ne comptent pas les fantômes");
});

test("la page peint le diff : halos, fantômes avec les voisins inconnus, bascule et adresse", { skip: !diffPage }, () => {
  const { LD, document, location } = load(diffPage, diffPage.data);
  const canvas = document.getElementById("canvas");
  assert.match(document.getElementById("run-meta").textContent, /comparée à la run 66db3f0e9a1c2b0012f4a7d1 du 2026-09-10T02:00:00Z · 7 j plus tard/);
  assert.match(document.getElementById("run-counts").textContent, /diff · câbles \+0 −1 ~1/);
  assert.ok(document.getElementById("tab-diff"));
  assert.match(document.getElementById("tab-diff").textContent, /Diff · \d+/);
  assert.equal(canvas.withClass("diff-changed").length, 1);
  assert.equal(canvas.withClass("diff-halo").length, 1);
  assert.equal(canvas.withClass("node-ring").length, 0, "aucun équipement ajouté ni changé");
  assert.equal(canvas.withClass("diff-removed").length, 0, "le voisin retiré est un stub : masqué comme eux, son câble avec");
  const stubs = document.getElementById("t-stubs");
  stubs.checked = true;
  stubs.fire("change", { target: stubs });
  assert.equal(canvas.withClass("diff-removed").length, 2, "le câble et le voisin retirés, en fantômes");
  assert.match(document.getElementById("graph-status").textContent, /^5 nœuds sur 5 et 5 câbles sur 5 affichés · retirés depuis la run d'avant : 1 équipement et 1 câble en fantômes$/,
    "le même total que l'en-tête, les fantômes à part (revue, M4)");
  const toggle = document.getElementById("t-diff");
  toggle.checked = false;
  toggle.fire("change", { target: toggle });
  assert.equal(canvas.withClass("diff-removed").length + canvas.withClass("diff-changed").length, 0);
  assert.match(location.hash, /diff=0/);
  assert.match(document.getElementById("graph-status").textContent, /5 nœuds sur 5 et 5 câbles sur 5 affichés · changements masqués/);
  assert.match(document.getElementById("graph-legend").textContent, /changements.*ajouté.*changé.*retiré \(fantôme\)/s);
});

test("l'onglet Diff liste tout, et une ligne ouvre l'élément dans le graphe, retiré compris", { skip: !diffPage }, () => {
  const { LD, document } = load(diffPage, diffPage.data, "#view=graph&diff=0");
  assert.equal(LD.app.graph.state.showDiff, false, "l'adresse porte la bascule");
  LD.app.activate("diff");
  const view = document.getElementById("view-diff");
  const text = view.textContent;
  assert.match(text, /De la run 66db3f0e9a1c2b0012f4a7d1 \(2026-09-10T02:00:00Z\) à la run 66e49a2d9a1c2b0012f4a8e2 .* 7 j plus tard/);
  assert.match(text, /Équipements : 1.*retiré.*srv-hyp-07.*voisin inconnu/s);
  assert.match(text, /Câbles : 2.*retiré.*srv-hyp-07 · 3c:ec:ef:12:34:56.*changé.*sw-core-01 · Ethernet1\/1.*oper.*up → down/s);
  assert.match(text, /Interfaces : 3.*sw-core-01 · Ethernet1\/1.*oper_status.*up → down.*Ethernet1\/3.*description.*C3\|srv-hyp-07\|eno1\| → —/s);
  assert.match(text, /Contrôles apparus : 1.*link_down.*Contrôles résolus : 2 · persistants : 9.*neighbor_unknown.*remote_port_is_mac/s);
  assert.match(text, /Événements : 0.*aucun redémarrage/s);
  const row = view.withClass("clickable").find((r) => /retiré/.test(r.textContent) && /3c:ec:ef:12:34:56/.test(r.textContent));
  row.fire("click", {});
  assert.equal(document.getElementById("view-graph").hidden, false);
  assert.equal(LD.app.graph.state.showDiff, true, "ouvrir un fantôme rallume les changements");
  assert.equal(LD.app.graph.state.showStubs, true, "et les voisins inconnus, puisque c'en est un");
  assert.equal(LD.app.graph.state.selection.id, STUB_LINK);
  assert.equal(document.getElementById("t-diff").checked, true);
  const inspector = document.getElementById("inspector");
  assert.match(inspector.textContent, /câble.*retiré.*Retiré : ce câble était dans la run 66db3f0e9a1c2b0012f4a7d1 et n'est plus dans celle-ci/s);
  LD.app.graph.select({ kind: "link", id: CORE1_LINK });
  assert.match(inspector.textContent, /changé.*Changements depuis la run 66db3f0e9a1c2b0012f4a7d1.*oper.*up → down/s);
  LD.app.graph.select({ kind: "node", id: "srv-hyp-07" });
  assert.match(inspector.textContent, /voisin inconnu.*retiré.*tel qu'il était.*Câbles : 0 · 1 retiré/s, "un fantôme ne compte pas dans les câbles");
  LD.app.graph.select({ kind: "node", id: "sw-core-02" });
  assert.match(inspector.textContent, /Ethernet1\/3.*srv-hyp-07 · 3c:ec:ef:12:34:56 \(retiré\)/s, "la fiche d'un port dit que son câble est retiré");
});

test("la bulle dit le changement, en une ligne", { skip: !diffPage }, () => {
  const { LD } = load(diffPage, diffPage.data);
  const model = LD.app.model;
  assert.match(joined(LD.tip.linkLines(model, model.linkById.get(CORE1_LINK))), /\nchangé : oper\n/);
  assert.match(joined(LD.tip.linkLines(model, model.linkById.get(STUB_LINK))), /\nretiré depuis la run d'avant\n/);
  assert.match(joined(LD.tip.nodeLines(model, model.nodeByHost.get("srv-hyp-07"))), /\nretiré depuis la run d'avant\n/);
  assert.match(joined(LD.tip.nodeLines(model, model.nodeByHost.get("sw-core-02"))), /3 câbles · 1 câble retiré/, "les fantômes ne comptent pas dans les câbles");
  assert.doesNotMatch(joined(LD.tip.linkLines(model, model.linkById.get(WAN_LINK))), /ajouté|retiré|changé/);
});

const TWO_RUNS = { status: 200, body: { infrastructure: "infra-lab", runs: [
  { run_id: RUN_ID, run_start: "2026-09-10T02:00:00Z", run_end: null, run_status: "completed", produced_at: "x", stored_at: "s", sha256: "0" },
  { run_id: LATER_RUN_ID, run_start: "2026-09-17T02:00:00Z", run_end: null, run_status: "completed", produced_at: "x", stored_at: "s", sha256: "1" }] } };

test("la coquille lit ?from=, appelle /api/diff, et la liste des runs propose « avec la précédente »", { skip: !shell || !diffPage }, async () => {
  const api = fakeApi(diffPage, { "/api/diff": { status: 200, body: diffPage.data.diff }, "/api/ingest/bundles": TWO_RUNS });
  api.store.set("ld-api-token", "known");
  const search = "?infrastructure=infra-lab&run_id=" + LATER_RUN_ID + "&from=" + RUN_ID;
  const { LD, document, location } = load(shell, shell.data, "", { fetch: api.fetch, sessionStorage: api.sessionStorage, search });
  await LD.shellApp.state.pending;
  assert.ok(LD.app && LD.app.model.diff, "le diff est lu avec le snapshot");
  assert.ok(api.calls.some(([url]) => url.startsWith("/api/diff?") && url.includes("from=" + RUN_ID) && url.includes("to=" + LATER_RUN_ID)));
  assert.equal(location.search, "?infrastructure=infra-lab&run_id=" + LATER_RUN_ID + "&from=" + RUN_ID, "l'adresse garde la run d'avant");
  assert.ok(document.getElementById("tab-diff"));
  const listing = fakeApi(diffPage, { "/api/diff": { status: 200, body: diffPage.data.diff }, "/api/ingest/bundles": TWO_RUNS });
  const second = load(shell, shell.data, "", { fetch: listing.fetch, sessionStorage: listing.sessionStorage, search: "?infrastructure=infra-lab" });
  const view = second.document.getElementById("view-shell");
  view.all((n) => n.getAttribute("type") === "password")[0].value = "secret";
  view.all((n) => n.tagName === "form")[0].fire("submit", {});
  await second.LD.shellApp.state.pending;
  const buttons = view.all((n) => n.tagName === "button" && /avec la précédente/.test(n.textContent));
  assert.equal(buttons.length, 1, "la première run n'a pas de précédente");
  buttons[0].fire("click", {});
  await second.LD.shellApp.state.pending;
  assert.equal(second.LD.shellApp.state.from, RUN_ID);
  assert.equal(second.LD.shellApp.state.runId, LATER_RUN_ID);
  assert.ok(second.LD.app.model.diff);
  const missing = fakeApi(diffPage, { "/api/diff": { status: 404, body: { detail: "run `from` : run inconnue pour cette infrastructure" } } });
  missing.store.set("ld-api-token", "ok");
  const third = load(shell, shell.data, "", { fetch: missing.fetch, sessionStorage: missing.sessionStorage, search: "?infrastructure=infra-lab&run_id=" + LATER_RUN_ID + "&from=nope" });
  await third.LD.shellApp.state.pending;
  assert.ok(third.LD.app, "la run s'ouvre quand même");
  assert.equal(third.LD.app.model.diff, null);
  assert.match(third.document.getElementById("run-meta").textContent, /diff indisponible : run `from` : run inconnue/);
  assert.equal(third.document.getElementById("tab-diff"), null);
});

// ---------------------------------------------------------------- après la revue de B3 (2026-10-04 : H1, M4, B6)

const unreachablePage = process.env.LD_PAGE_UNREACHABLE ? readPage(process.env.LD_PAGE_UNREACHABLE) : null;
const FW_X1 = ["fw-edge-01", "x1"].join("\u0000");

test("un équipement injoignable ne montre jamais les faits de la run d'avant comme actuels (H1)", { skip: !unreachablePage }, () => {
  const { LD, document } = load(unreachablePage, unreachablePage.data);
  const model = LD.app.model;
  assert.equal(model.interfaces.filter((i) => i.hostname === "fw-edge-01").length, 0, "la run ne l'a pas collecté");
  assert.equal(model.ifaceByKey.has(FW_X1), false, "les interfaces retirées ne sont pas dans l'index de la run");
  assert.equal(model.ghostIfaceByKey.get(FW_X1).ghost, true, "elles ont le leur");
  assert.equal(LD.model.interfaceAt(model, "fw-edge-01", "x1", false), null, "un élément vivant ne les lit pas");
  assert.equal(LD.model.interfaceAt(model, "fw-edge-01", "x1", true).ghost, true, "un élément retiré les lit, en le disant");
  const link = model.links.find((l) => (l.a.hostname === "fw-edge-01" || l.b.hostname === "fw-edge-01") && !l.ghost);
  const bubble = joined(LD.tip.linkLines(model, link));
  assert.match(bubble, /fw-edge-01 · x\d : absent de interfaces\[\]/, "la bulle du câble vivant dit l'absence");
  assert.doesNotMatch(bubble, /run d'avant/);
  LD.app.graph.select({ kind: "node", id: "fw-edge-01" });
  const sheet = document.getElementById("inspector").textContent;
  assert.match(sheet, /collecte : unreachable/);
  assert.match(sheet, /Interfaces : 0/);
  assert.match(sheet, /seulement les ports physiques up sans câble \(0\)/, "aucun compte fabriqué sur la run d'avant");
  assert.match(sheet, /Interfaces retirées depuis la run d'avant : [1-9]\d*.*état \(run d'avant\).*x1.*retiré/s);
  LD.app.graph.select({ kind: "link", id: link.id });
  assert.match(document.getElementById("inspector").textContent, /Port absent de interfaces\[\]/, "la carte du port aussi");
});

test("les fantômes ne comptent nulle part et un câble retiré a son statut au passé (M4, B6)", { skip: !diffPage }, () => {
  const { LD, document } = load(diffPage, diffPage.data);
  assert.match(document.getElementById("graph-status").textContent,
    /^5 nœuds sur 5 et 5 câbles sur 5 affichés · retirés depuis la run d'avant : 1 équipement et 1 câble en fantômes, dont 2 masqués par le filtre des voisins inconnus$/);
  assert.match(document.getElementById("run-counts").textContent, /5 nœuds/, "l'en-tête et l'état du graphe disent le même total");
  assert.match(document.getElementById("graph-toolbar").textContent, /voisins inconnus \(0\)/, "le fantôme stub n'est pas un voisin inconnu de cette run");
  LD.app.graph.select({ kind: "node", id: "sw-core-02" });
  assert.match(document.getElementById("inspector").textContent, /Câbles : 3 · 1 retiré/);
  LD.app.activate("diff");
  const view = document.getElementById("view-diff");
  const headers = view.all((n) => n.tagName === "th").map((n) => n.textContent);
  assert.equal(headers.filter((t) => t === "").length, 0, "aucun en-tête vide pour un lecteur d'écran");
  assert.ok(headers.includes("changement"));
  const row = view.withClass("clickable").find((r) => /retiré/.test(r.textContent) && /3c:ec:ef:12:34:56/.test(r.textContent));
  assert.match(row.textContent, /était confirmé/, "le statut d'un câble retiré est celui de la run d'avant, dit comme tel");
  assert.equal(LD.dom.elapsedText(0), "même début de collecte");
  assert.equal(LD.dom.EVENT_LABEL.flapped, "flap");
});

test("l'adresse #link= d'un câble retiré l'ouvre, et rallume ce qu'il faut pour le voir", { skip: !diffPage }, () => {
  const token = encodeURIComponent(JSON.stringify(["sw-core-02", "Ethernet1/3", "srv-hyp-07", "3c:ec:ef:12:34:56"]));
  const { LD, document, location } = load(diffPage, diffPage.data, "#view=graph&diff=0&link=" + token);
  const state = LD.app.graph.state;
  assert.equal(state.selection && state.selection.id, STUB_LINK);
  assert.equal(state.showDiff, true, "l'adresse disait diff=0, le fantôme a rallumé les changements");
  assert.equal(state.showStubs, true);
  assert.equal(document.getElementById("canvas").withClass("diff-removed").length, 2);
  assert.doesNotMatch(location.hash, /diff=0/);
  assert.match(location.hash, /stubs=1/);
});
