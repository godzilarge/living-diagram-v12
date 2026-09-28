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
  assert.deepEqual(clone(load(page).LD.graph.beamWidths(model.beams[2])), { band: 32, hit: 48 }, "la bande couvre l'éventail de ses deux câbles");
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
  assert.match(canvas.withClass("beam-label")[2].textContent, /port-channel10 ⇄ port-channel10 · peer-link/, "forme complète quand éclairé");
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
