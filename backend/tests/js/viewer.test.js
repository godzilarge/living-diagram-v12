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
  assert.equal(LD.shellApp, undefined, "la coquille servie ne démarre pas dans une page qui embarque son snapshot");
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
  assert.deepEqual(clone(load(page).LD.geometry.beamBand(model.beams[2])), { band: 32, hit: 48, offset: 0 }, "la bande couvre l'éventail de ses deux câbles, centrée sur la paire");
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

const twobeams = process.env.LD_PAGE_TWOBEAMS ? readPage(process.env.LD_PAGE_TWOBEAMS) : null;

test("deux faisceaux entre les mêmes équipements ont chacun leur bande et leur étiquette (bug du 2026-10-06)", { skip: !twobeams }, () => {
  const { LD, document } = load(twobeams, twobeams.data);
  const model = LD.app.model;
  const between = (x) => x.a.hostname === "sw-core-01" && x.b.hostname === "sw-core-02";
  const pair = model.links.filter(between);
  assert.equal(pair.length, 4, "quatre câbles entre les cœurs");
  const beams = model.beams.filter(between);
  assert.deepEqual(clone(beams.map((b) => [b.a.aggregate, b.b.aggregate, b.links.length])), [["port-channel10", "port-channel10", 2], ["port-channel11", "port-channel11", 2]],
    "le modèle a toujours eu les deux faisceaux : c'est le tracé qui n'en montrait qu'un");
  const fan = pair.slice().sort((x, y) => x.indexInPair - y.indexInPair).map((l) => l.a.interface);
  assert.deepEqual(clone(fan), ["Ethernet1/1", "Ethernet1/6", "Ethernet1/2", "Ethernet1/7"], "les câbles d'un faisceau sont contigus dans l'éventail, jamais entrelacés");
  assert.deepEqual(clone(beams.map((b) => LD.geometry.beamBand(b))), [{ band: 32, hit: 48, offset: -14 }, { band: 32, hit: 48, offset: 14 }],
    "chaque bande couvre ses deux câbles, de part et d'autre de l'axe de la paire");
  const canvas = document.getElementById("canvas");
  const bands = canvas.withClass("beam-band").map((el) => el.getAttribute("d"));
  assert.equal(bands.length, 4, "quatre faisceaux dessinés : les deux des cœurs, les deux du vPC 20");
  assert.equal(new Set(bands).size, bands.length, "aucune bande n'en recouvre une autre");
  const tags = canvas.withClass("beam-tag").map((el) => el.getAttribute("transform"));
  assert.equal(new Set(tags).size, tags.length, "aucune étiquette n'est posée sur une autre");
  for (const path of bands) assert.doesNotMatch(path, /NaN|undefined/);
  assert.equal(canvas.withClass("beam-label").map((el) => el.textContent).filter((t) => t === "").length, 1,
    "le faisceau des Po11, ni peer-link ni MLAG, n'a pas d'étiquette courte : son nom vit dans la bulle et l'inspecteur");
});

// ---------------------------------------------------------------- la coquille servie par le backend (2026-09-26)

const shell = process.env.LD_SHELL ? readPage(process.env.LD_SHELL) : null;
const RUN_ID = "66db3f0e9a1c2b0012f4a7d1";

const EMPTY_INTENT = { intent_version: "1.0.0", infrastructure: "infra-lab", revision: 0, updated_at: null, pins: [] };
const EMPTY_PLACEMENT = { infrastructure: "infra-lab", revision: 0, updated_at: null, places: [] };
const mapStorage = (map) => ({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) });

function fakeApi(page, answers) {
  const calls = [], requests = [];
  const bodies = {
    "/api/ingest/bundles": { status: 200, body: { infrastructure: "infra-lab", runs: [{ run_id: RUN_ID, run_start: "2026-09-10T02:00:00Z", run_end: null, run_status: "completed", produced_at: "x", stored_at: "2026-09-10T03:00:00Z", sha256: "0" }] } },
    "/api/snapshot": { status: 200, body: page.data.snapshot },
    "/api/ingest/report": { status: 200, body: { summary: page.data.ingest.summary, findings: [] } },
    "/api/intent": { status: 200, body: EMPTY_INTENT },
    "/api/placement": { status: 200, body: EMPTY_PLACEMENT },
    ...(answers || {}),
  };
  const store = new Map(), local = new Map();
  return {
    calls, requests, store, local,
    fetch: (url, init) => {
      calls.push([url, init.headers.Authorization]);
      requests.push([url, init]);
      let answer = bodies[url.split("?")[0]] || { status: 500, body: null };
      // POST /api/placement : la règle de l'API, sur le document que le GET sert (première place reste, révision + 1).
      if (url.startsWith("/api/placement") && init.method === "POST" && answer.status === 200) {
        const write = JSON.parse(init.body), doc = answer.body;
        const places = new Map((write.replace ? [] : doc.places).map((p) => [p.hostname, p]));
        write.places.forEach((p) => { if (!places.has(p.hostname)) places.set(p.hostname, p); });
        answer = write.base_revision === doc.revision
          ? { status: 200, body: { ...doc, revision: doc.revision + 1, places: Array.from(places.values()).sort((a, b) => (a.hostname < b.hostname ? -1 : 1)) } }
          : { status: 409, body: doc };
      }
      return Promise.resolve({ status: answer.status, json: () => Promise.resolve(answer.body) });
    },
    sessionStorage: mapStorage(store),
    localStorage: mapStorage(local),
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
  assert.equal(api.requests.filter(([, init]) => init.method !== "POST").length, 6, "runs, puis snapshot, rapport, intention, placement et la liste des runs (bande)");
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
test("une vitesse s'écrit en Gb/s ou en Mb/s ; non lue, elle ne s'écrit pas", () => {
  const { LD } = load(page);
  assert.deepEqual(clone([10000, 2500, 1000, 100, 20000, null].map(LD.dom.speedText)), ["10 Gb/s", "2,5 Gb/s", "1 Gb/s", "100 Mb/s", "20 Gb/s", null]);
  assert.deepEqual(clone(["TenGigabitEthernet1/0/1", "GigabitEthernet0", "Ethernet1/49", "port-channel10", "Port-channel20", "Ethernet", "EthernetX", "mgmt0", "x1", null].map(LD.dom.shortPort)),
    ["Te1/0/1", "Gi0", "Eth1/49", "Po10", "Po20", "Ethernet", "EthernetX", "mgmt0", "x1", ""], "forme courte seulement devant un chiffre");
});

test("la bulle d'un câble donne, par bout, vitesse, duplex, média et état, tels que lus", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const core = LD.tip.text(LD.tip.linkLines(model, model.linkById.get(CORE_LINK)));
  assert.match(core, /^sw-core-01 · Ethernet1\/2 \| sw-core-02 · Ethernet1\/2\nvitesse /, "un bout par colonne, puis le tableau");
  assert.match(core, /\nconfirmé · down · LLDP \+ Description\n/, "le verdict en pied : statut, lien down en pastille, sources");
  assert.match(core, /\nvitesse 10 Gb\/s 10 Gb\/s\nduplex full full\nmédia 10Gbase-SR 10Gbase-SR\nétat up down · suspended by LACP\n/);
  assert.match(core, /\nwarning · aggregate_member_not_bundled\nwarning · description_disagrees_with_observed\nwarning · link_oper_mismatch$/, "un contrôle par ligne, les plus graves d'abord");
  const stub = LD.tip.text(LD.tip.linkLines(model, model.linkById.get(STUB_LINK)));
  assert.match(stub, /\nvitesse — 10 Gb\/s\n/, "un bout absent de interfaces[] n'a pas de valeur : un tiret, jamais une valeur inventée");
  assert.match(stub, /\nmédia — 10Gbase-SR\n/);
  assert.match(stub, /\nsrv-hyp-07 · 3c:ec:ef:12:34:56 : absent de interfaces\[\]\n/, "un bout absent est nommé comme tel, le tiret n'affirme rien");
});

test("en vue Diagramme (control: false), la bulle ne dit que ce que les équipements disent : ni statut, ni source, ni contrôle", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const link = model.linkById.get(CORE_LINK);
  const facts = LD.tip.text(LD.tip.linkLines(model, link, { control: false }));
  assert.match(facts, /^sw-core-01 · Ethernet1\/2 \| sw-core-02 · Ethernet1\/2\nvitesse 10 Gb\/s 10 Gb\/s\n/, "les bouts, puis le tableau : aucun verdict");
  assert.doesNotMatch(facts, /confirmé|LLDP|Description/, "aucun statut ni source");
  assert.doesNotMatch(facts, /warning|aggregate_member_not_bundled/, "aucun contrôle");
  assert.match(facts, /\nvitesse 10 Gb\/s 10 Gb\/s\n/, "les faits des ports restent");
  assert.match(facts, /\nétat up down · suspended by LACP$/, "l'état d'un port est un fait, il reste");
  assert.equal(LD.tip.text(LD.tip.linkLines(model, link)), LD.tip.text(LD.tip.linkLines(model, link, { control: true })), "sans option, tout se dit : `/view` ne change pas");
  const node = model.nodeByHost.get("sw-core-02");
  const nodeFacts = LD.tip.text(LD.tip.nodeLines(model, node, { control: false }));
  assert.doesNotMatch(nodeFacts, /collecte|warning|error/, "ni état de collecte ni contrôle en vue Diagramme");
  assert.notEqual(LD.tip.text(LD.tip.nodeLines(model, node)), nodeFacts, "en vue Contrôle, les contrôles se lisent");
  const cluster = model.clusters[0];
  if (cluster && cluster.checks.length) assert.ok(LD.tip.clusterLines(cluster, { control: false }).length < LD.tip.clusterLines(cluster).length);
});

test("la table LLDP / CDP d'un équipement (neighbors.ts) : ce qu'il annonce, brut, une ligne par (port, voisin, port), protocoles réunis, dans l'ordre de ses interfaces", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const rows = clone(LD.neighbors.neighborsOf(model, "sw-core-01"));
  assert.deepEqual(rows.map((r) => [r.port, r.neighbor, r.neighborPort, r.sources.join("+"), r.resolved]), [
    ["Ethernet1/1", "sw-core-02", "Ethernet1/1", "cdp+lldp", "sw-core-02"],
    ["Ethernet1/2", "sw-core-02", "Ethernet1/2", "lldp", "sw-core-02"],
    ["Ethernet1/4", "rt-wan-01", "Gi0/0/0", "lldp", "rt-wan-01"],
    ["Ethernet1/4", "rt-wan-01", "GigabitEthernet0/0/0", "cdp", "rt-wan-01"],
  ], "LLDP annonce la forme courte, CDP la longue : deux lignes, brutes, jamais normalisées ici");
  assert.deepEqual(clone(LD.neighbors.neighborsOf(model, "srv-hyp-07")), [], "un voisin inconnu n'annonce rien : il n'est pas collecté");
  assert.deepEqual(clone([0, 59, 60, 3600, 3660, 86400, 90000 + 7200, null].map(LD.dom.durationText)), ["0 s", "59 s", "1 min", "1 h", "1 h 1 min", "1 j", "1 j 3 h", null]);
});

test("un câble dont aucun bout n'a de caractéristique le dit sans inventer de raison", () => {
  const data = clone(page.data);
  Object.assign(data.snapshot.interfaces.find((i) => i.hostname === "sw-core-01" && i.name === "Ethernet1/4"), { speed_mbps: null, duplex: null, media: null });
  const { LD } = load(page, data);
  const model = LD.app.model;
  const text = LD.tip.text(LD.tip.linkLines(model, model.linkById.get(WAN_LINK)));
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
  assert.match(tip.textContent, /fw-edge-01FIREWALL/, "le nom, puis la pastille du type");
  assert.match(tip.textContent, /EDGE-CLUSTER.*primary.*priorité 200/);
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
  const titles = model.beams.map((beam) => LD.tip.text(LD.tip.beamLines(beam)).split("\n")[0]);
  assert.equal(new Set(titles).size, model.beams.length, "deux faisceaux d'un même agrégat vers deux voisins ont deux bulles distinctes (revue, M2)");
  const peer = LD.tip.text(LD.tip.beamLines(model.beams.find((b) => b.peerLink)));
  assert.match(peer, /^sw-core-01 · port-channel10 \| sw-core-02 · port-channel10 · peer-link\ncâbles 2\n[\s\S]*?un agrégat dégradé\n/);
  assert.match(peer, /aggregate_member_not_bundled/);
  const cluster = LD.tip.text(LD.tip.clusterLines(model.clusterById.get(CLUSTER_ID)));
  assert.match(cluster, /^EDGE-CLUSTER · HA\nactif-passif\nfw-edge-01 primary up priorité 200\nfw-edge-02 secondary down priorité 100\nerror · ha_member_down(\n|$)/);
});

test("les contrôles d'une bulle portent leur nombre par code ; le reste est compté en contrôles (revue, M3)", () => {
  const { LD } = load(page, page.data);
  const checks = Array.from({ length: 9 }, () => ({ severity: "warning", code: "neighbor_unknown" }))
    .concat([{ severity: "error", code: "link_oper_mismatch" }], Array.from({ length: 7 }, (_, i) => ({ severity: "info", code: "info_" + i })));
  const beam = { a: { hostname: "a", aggregate: "po1" }, b: { hostname: "b", aggregate: "po2" }, known: [], links: [1, 2], degraded: false, peerLink: false, mlags: [], checks };
  assert.match(LD.tip.text(LD.tip.beamLines(beam)), /\nerror · link_oper_mismatch\nwarning · neighbor_unknown ×9\ninfo · info_0\ninfo · info_1\ninfo · info_2\ninfo · info_3\n… et 3 autres contrôles$/);
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
  assert.match(tip.textContent, /sw-core-01SWITCH/);
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
  assert.match(LD.tip.text(LD.tip.nodeLines(LD.app.model, LD.app.model.nodeByHost.get("fw-edge-01"))),
    /cluster HA EDGE-CLUSTER · actif-passif\nrôle primary · priorité 200\nétat up\ncluster HA ODD · actif-actif\nrôle standby\nétat down(\n|$)/);
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
  assert.match(node("sw-core-01").withClass("icon-body")[0].getAttribute("d"), /^M/, "une icône dessinée (silhouette pleine), pas un glyphe");
  assert.equal(node("sw-core-01").withClass("icon-mark").length, 1, "le symbole en réserve dans la silhouette");
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
  assert.match(LD.tip.text(LD.tip.linkLines(model, model.linkById.get(CORE1_LINK))), /\nchangé · oper(\n|$)/);
  assert.match(LD.tip.text(LD.tip.linkLines(model, model.linkById.get(STUB_LINK))), /\nretiré · depuis la run d'avant(\n|$)/);
  assert.match(LD.tip.text(LD.tip.nodeLines(model, model.nodeByHost.get("srv-hyp-07"))), /\nretiré · depuis la run d'avant(\n|$)/);
  assert.match(LD.tip.text(LD.tip.nodeLines(model, model.nodeByHost.get("sw-core-02"))), /\ncâbles 3 · 1 retiré\n/, "les fantômes ne comptent pas dans les câbles");
  assert.doesNotMatch(LD.tip.text(LD.tip.linkLines(model, model.linkById.get(WAN_LINK))), /ajouté|retiré|changé/);
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
  const bubble = LD.tip.text(LD.tip.linkLines(model, link));
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

// ---------------------------------------------------------------- la couche d'intention (2026-10-04, B4)

const intentPage = process.env.LD_PAGE_INTENT ? readPage(process.env.LD_PAGE_INTENT) : null;
const tick = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
const nodeOf = (canvas, host) => canvas.withClass("node").find((g) => g.getAttribute("data-node") === host);
const dragNode = (node) => {
  node.fire("pointerdown", { clientX: 10, clientY: 10 });
  node.fire("pointermove", { clientX: 90, clientY: 40 });
  node.fire("pointerup", {});
};

test("le modèle indexe les épingles et dit lesquelles sont orphelines", { skip: !intentPage }, () => {
  const model = load(intentPage).LD.model.build(intentPage.data);
  assert.equal(model.intent.revision, 2);
  assert.deepEqual(clone(Array.from(model.pinByHost.keys())), ["gone-host", "sw-core-01"]);
  assert.deepEqual(clone(model.orphanPins.map((p) => p.hostname)), ["gone-host"], "un hostname absent de la run : épingle orpheline, gardée");
  assert.equal(load(intentPage).LD.model.build({ ...intentPage.data, intent: undefined }).intent, null, "sans intention, rien n'est inventé");
});

test("la couleur d'intention (docs/10) : celle de l'équipement, sinon celle du type, sinon le défaut du moteur ; classes, légende, onglet", { skip: !intentPage }, () => {
  const { LD, document } = load(intentPage, intentPage.data);
  const model = LD.app.model;
  assert.deepEqual(clone(LD.hues.HUES.length), 12);
  assert.equal(LD.hues.DEFAULT_HUE.switch, "blue");
  assert.equal(LD.hues.hueOfNode(model, { hostname: "sw-core-01", type: "switch" }), "amber", "la teinte propre l'emporte");
  assert.equal(LD.hues.hueOfNode(model, { hostname: "fw-edge-01", type: "firewall" }), "red", "sinon celle du type, posée par l'intention");
  assert.equal(LD.hues.hueOfNode(model, { hostname: "sw-core-02", type: "switch" }), "blue", "sinon le défaut du moteur");
  assert.equal(LD.hues.hueOfNode(model, { hostname: "x", type: null }), "slate", "un type absent est ardoise");
  assert.deepEqual(clone(model.orphanColors.map((c) => c.hostname)), ["gone-host"], "une couleur sur un hostname absent de la run est orpheline, gardée");
  const canvas = document.getElementById("canvas");
  assert.equal(nodeOf(canvas, "sw-core-01").classList.contains("hue-amber"), true, "la carte porte sa teinte");
  assert.equal(nodeOf(canvas, "fw-edge-01").classList.contains("hue-red"), true);
  assert.equal(nodeOf(canvas, "sw-core-02").classList.contains("hue-blue") && nodeOf(canvas, "sw-core-02").classList.contains("type-switch"), true, "le type reste une classe, la teinte en est une autre");
  const legend = document.getElementById("graph-legend").withClass("legend-icon");
  assert.equal(legend.some((el) => el.classList.contains("hue-red")), true, "la légende suit la palette des types");
  assert.equal(legend.some((el) => el.classList.contains("hue-blue")), true);
  const without = load(intentPage).LD.model.build({ ...intentPage.data, intent: { ...intentPage.data.intent, type_colors: undefined, device_colors: undefined } });
  assert.equal(without.colorByType.size + without.colorByHost.size, 0, "un document d'avant 1.1.0 : aucune couleur, rien n'est inventé");
  LD.app.activate("intent");
  const text = document.getElementById("view-intent").textContent;
  assert.match(text, /Couleurs enregistrées : 3 · 1 orpheline/);
  assert.match(text, /type · firewall/);
  assert.equal(document.getElementById("view-intent").all((n) => n.tagName === "button" && n.textContent === "retirer la couleur").length, 0, "sans écrivain nommé, pas de bouton");
});

test("les groupes (docs/10 §5) : indexés par id et par membre, orphelins dits tels, cadre calculé depuis les membres, étiquette ancrée, sélection par identité, onglet", { skip: !intentPage }, () => {
  const { LD, document } = load(intentPage, intentPage.data);
  const model = LD.app.model;
  assert.deepEqual(clone(Array.from(model.groupById.keys())), ["g2-1", "g2-2"]);
  assert.deepEqual(clone((model.groupsByHost.get("sw-core-01") || []).map((g) => g.id)), ["g2-1"]);
  assert.deepEqual(clone(model.orphanGroups.map((g) => g.id)), ["g2-2"], "aucun membre dans la run : groupe orphelin, gardé");
  const core = model.groupById.get("g2-1");
  assert.deepEqual(clone(LD.groups.presentMembers(model, core)), ["sw-core-01", "sw-core-02"]);
  assert.deepEqual(clone(LD.groups.orphanMembers(model, core)), ["gone-host"]);
  // l'enveloppe (G0) : la boîte des cartes, élargie de la marge ; l'ellipse circonscrite ; entière
  const rect = LD.groups.frameOf([{ x: 0, y: 0 }, { x: 300, y: 100 }], [{ w: 200, h: 72 }, { w: 200, h: 72 }], { shape: "rectangle", padding: 24 });
  assert.deepEqual(clone(rect), { x: -124, y: -60, w: 548, h: 220 });
  const ellipse = LD.groups.frameOf([{ x: 0, y: 0 }], [{ w: 200, h: 100 }], { shape: "ellipse", padding: 0 });
  assert.equal(ellipse.w === Math.round(200 * Math.SQRT2) && ellipse.h === Math.round(100 * Math.SQRT2), true, "demi-axes × √2");
  assert.equal(LD.groups.frameOf([], [], { shape: "rectangle", padding: 24 }), null, "sans membre présent, pas de cadre");
  const frame = { x: 0, y: 0, w: 400, h: 200 };
  assert.deepEqual(clone(LD.groups.labelSlot(frame, { shape: "rectangle", label_position: "top_left", label_placement: "inside", label_size: 12 })), { x: 8, y: 8, anchor: "start", baseline: "hanging" });
  assert.deepEqual(clone(LD.groups.labelSlot(frame, { shape: "rectangle", label_position: "bottom", label_placement: "outside", label_size: 20 })), { x: 200, y: 212, anchor: "middle", baseline: "hanging" });
  assert.deepEqual(clone(LD.groups.labelSlot(frame, { shape: "rectangle", label_position: "right", label_placement: "outside", label_size: 12 })), { x: 408, y: 100, anchor: "start", baseline: "middle" });
  assert.equal(LD.groups.labelSlot(frame, { shape: "ellipse", label_position: "top_left", label_placement: "inside", label_size: 12 }).x > 8, true, "dans une ellipse, un coin rentre jusqu'à la courbe");
  assert.equal(LD.groups.dashArray({ stroke_style: "dashed", stroke_width: 2 }), "8 5");
  assert.equal(LD.groups.dashArray({ stroke_style: "solid", stroke_width: 2 }), null);
  // la sélection par identité (G3) : `#group=<id>`, ses membres présents
  const selection = LD.model.selectionFromToken(model, "group", "g2-1");
  assert.deepEqual(clone(selection), { kind: "group", id: "g2-1" });
  assert.deepEqual(clone(LD.model.hostsOf(model, selection)), ["sw-core-01", "sw-core-02"]);
  assert.deepEqual(clone(LD.model.tokenOf(model, selection)), ["group", "g2-1"]);
  assert.equal(LD.model.selectionFromToken(model, "group", "g9-9"), null);
  const related = LD.scene.relatedTo(model, selection);
  assert.deepEqual(clone(Array.from(related.hosts).sort()), ["sw-core-01", "sw-core-02"], "un groupe éclaire ses membres présents");
  assert.equal(related.groups.has("g2-1"), true);
  const visible = LD.scene.visible(model, { showStubs: false, showDiff: true, hiddenStatuses: new Set(), hide: [], only: null });
  assert.deepEqual(clone(visible.groups.map((g) => g.id)), ["g2-1"], "un groupe se dessine dès qu'un membre est visible (G4)");
  assert.match(LD.inspect.describe(model, selection), /^groupe Cœur sélectionné$/);
  LD.app.activate("intent");
  const text = document.getElementById("view-intent").textContent;
  assert.match(text, /Groupes enregistrés : 2 · 1 orphelin/);
  assert.match(text, /Cœur/);
});

test("le graphe part des épingles enregistrées, les marque, et « replacer » les garde", { skip: !intentPage }, () => {
  const { LD, document } = load(intentPage, intentPage.data);
  const state = LD.app.graph.state;
  const canvas = document.getElementById("canvas");
  assert.deepEqual(clone(state.positions.get("sw-core-01")), { x: 120, y: -40 }, "une épingle est une contrainte dure du placement");
  assert.equal(nodeOf(canvas, "sw-core-01").classList.contains("pinned"), true);
  assert.equal(nodeOf(canvas, "sw-core-01").withClass("node-pin").length, 1, "le glyphe est dessiné, la classe le montre");
  assert.equal(nodeOf(canvas, "sw-core-02").classList.contains("pinned"), false);
  assert.match(document.getElementById("tab-intent").textContent, /^Intentions · 2$/);
  assert.match(document.getElementById("run-counts").textContent, /2 épingles · 1 orpheline/);
  dragNode(nodeOf(canvas, "sw-core-02"));
  assert.equal(nodeOf(canvas, "sw-core-02").classList.contains("pinned"), true, "un glissé épingle localement");
  assert.match(document.getElementById("graph-status").textContent, /déplacement local de sw-core-02, non enregistré \(page sans serveur\)/);
  LD.app.graph.resetPins();
  assert.deepEqual(clone(Array.from(state.pinned.keys())), ["sw-core-01"], "replacer garde les épingles enregistrées, oublie le local ; une orpheline ne place rien");
  assert.deepEqual(clone(state.positions.get("sw-core-01")), { x: 120, y: -40 });
});

test("l'onglet Intentions liste les épingles, dit l'orpheline ; la page autonome se dit en lecture seule", { skip: !intentPage }, () => {
  const { LD, document } = load(intentPage, intentPage.data);
  LD.app.activate("intent");
  const view = document.getElementById("view-intent");
  assert.match(view.textContent, /Lecture seule : cette page a été générée sans serveur/);
  assert.match(view.textContent, /Épingles enregistrées : 2 · 1 orpheline/);
  assert.match(view.textContent, /gone-host.*orpheline : équipement absent de cette run/s);
  assert.match(view.textContent, /sw-core-01.*120.*-40.*orhan.*présente/s);
  assert.equal(view.all((n) => n.tagName === "button" && n.textContent === "retirer").length, 0, "sans écrivain, rien à retirer");
  LD.app.graph.select({ kind: "node", id: "sw-core-01" });
  assert.match(document.getElementById("inspector").textContent, /Épingle.*120, -40.*orhan/s);
  dragNode(nodeOf(document.getElementById("canvas"), "sw-core-02"));
  LD.app.graph.select({ kind: "node", id: "sw-core-02" });
  assert.match(document.getElementById("inspector").textContent, /déplacé dans cette page, non enregistré/);
});

function fakeWriter(page, author) {
  const saved = [];
  let revision = page.data.intent.revision;
  const current = () => {
    const pins = new Map(page.data.intent.pins.map((p) => [p.hostname, p]));
    saved.forEach((op) => { if (op.op === "pin") pins.set(op.hostname, { hostname: op.hostname, x: op.x, y: op.y, author, at: "2026-10-04T19:00:00Z" }); else pins.delete(op.hostname); });
    return { ...page.data.intent, revision, pins: Array.from(pins.values()).sort((a, b) => (a.hostname < b.hostname ? -1 : 1)) };
  };
  const writer = { author, saved, setAuthor(name) { writer.author = name; }, save: async (ops) => { saved.push(...ops); revision += 1; return { ok: true, intent: current() }; } };
  return writer;
}

test("avec un écrivain, un glissé relâché envoie pin et la page se réaligne ; retirer les orphelines envoie unpin après confirmation", { skip: !intentPage }, async () => {
  const { LD, document } = load(intentPage);
  const writer = fakeWriter(intentPage, "alice");
  const app = LD.boot(clone(intentPage.data), { writer });
  const canvas = document.getElementById("canvas");
  dragNode(nodeOf(canvas, "sw-core-02"));
  await tick();
  assert.equal(writer.saved.length, 1);
  assert.equal(writer.saved[0].op, "pin");
  assert.equal(writer.saved[0].hostname, "sw-core-02");
  assert.equal(Number.isInteger(writer.saved[0].x) && Number.isInteger(writer.saved[0].y), true, "coordonnées entières");
  assert.equal(app.model.pinByHost.get("sw-core-02").author, "alice");
  assert.equal(app.graph.state.pinned.has("sw-core-02"), true);
  assert.match(document.getElementById("graph-status").textContent, /épingle de sw-core-02 enregistrée \(alice\)/);
  assert.match(document.getElementById("tab-intent").textContent, /· 3$/);
  assert.match(document.getElementById("run-counts").textContent, /3 épingles · 1 orpheline/);
  app.activate("intent");
  const view = document.getElementById("view-intent");
  assert.match(view.textContent, /sous le nom « alice »/);
  assert.equal(view.all((n) => n.tagName === "button" && n.textContent === "retirer").length, 3);
  view.all((n) => n.tagName === "button" && /^retirer les épingles orphelines \(1\)$/.test(n.textContent))[0].fire("click", {});
  assert.equal(writer.saved.length, 1, "rien n'est envoyé avant la confirmation");
  view.all((n) => n.tagName === "button" && /^confirmer : retirer les épingles orphelines/.test(n.textContent))[0].fire("click", {});
  await tick();
  assert.deepEqual(clone(writer.saved[1]), { op: "unpin", hostname: "gone-host" });
  assert.equal(app.model.orphanPins.length, 0);
  assert.match(document.getElementById("view-intent").textContent, /Épingles enregistrées : 2\n|Épingles enregistrées : 2Une|Épingles enregistrées : 2[^·]/);
  assert.match(document.getElementById("graph-status").textContent, /1 épingle retirée/);
  app.graph.select({ kind: "node", id: "sw-core-01" });
  document.getElementById("inspector").all((n) => n.tagName === "button" && n.textContent === "retirer l'épingle")[0].fire("click", {});
  await tick();
  assert.deepEqual(clone(writer.saved[2]), { op: "unpin", hostname: "sw-core-01" });
  assert.equal(app.graph.state.pinned.has("sw-core-01"), false, "retirée : le nœud est replacé par le placement");
});

test("sans nom, rien ne s'enregistre et la page dit quoi faire ; donner son nom dans l'onglet débloque", { skip: !intentPage }, async () => {
  const { LD, document } = load(intentPage);
  const writer = fakeWriter(intentPage, "");
  const app = LD.boot(clone(intentPage.data), { writer });
  const canvas = document.getElementById("canvas");
  dragNode(nodeOf(canvas, "sw-core-02"));
  await tick();
  assert.equal(writer.saved.length, 0);
  assert.match(document.getElementById("graph-status").textContent, /donnez votre nom \(onglet Intentions\)/);
  app.activate("intent");
  const view = document.getElementById("view-intent");
  assert.match(view.textContent, /Sans nom, vos déplacements restent locaux/);
  assert.match(view.textContent, /Déplacements locaux non enregistrés : 1.*sw-core-02/s);
  const field = document.getElementById("i-author");
  field.value = " bob ";
  field.fire("change", { target: field });
  assert.equal(writer.author, "bob");
  assert.match(document.getElementById("view-intent").textContent, /sous le nom « bob »/);
  dragNode(nodeOf(canvas, "sw-core-02"));
  await tick();
  assert.equal(writer.saved.length, 1);
  assert.match(document.getElementById("graph-status").textContent, /enregistrée \(bob\)/);
});

test("la coquille lit /api/intent, garde le nom dans localStorage et envoie les opérations à l'API", { skip: !shell || !intentPage }, async () => {
  const api = fakeApi(intentPage, { "/api/intent": { status: 200, body: intentPage.data.intent }, "/api/intent/patches": { status: 200, body: { ...intentPage.data.intent, revision: 3 } } });
  api.store.set("ld-api-token", "known");
  api.local.set("ld-author", "orhan");
  const search = "?infrastructure=infra-lab&run_id=" + RUN_ID;
  const { LD, document } = load(shell, shell.data, "", { fetch: api.fetch, sessionStorage: api.sessionStorage, localStorage: api.localStorage, search });
  await LD.shellApp.state.pending;
  assert.ok(api.calls.some(([url, token]) => url === "/api/intent?infrastructure=infra-lab" && token === "Bearer known"));
  assert.equal(LD.app.model.intent.revision, 2);
  assert.equal(LD.app.writer.author, "orhan", "le nom vient de localStorage");
  assert.match(document.getElementById("run-counts").textContent, /2 épingles/);
  const outcome = await LD.app.writer.save([{ op: "pin", hostname: "sw-core-02", x: 1, y: 2 }]);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.intent.revision, 3);
  const post = api.requests.find(([url, init]) => url.startsWith("/api/intent/patches?infrastructure=infra-lab") && init.method === "POST");
  assert.ok(post);
  assert.deepEqual(JSON.parse(post[1].body), { author: "orhan", ops: [{ op: "pin", hostname: "sw-core-02", x: 1, y: 2 }] });
  assert.equal(post[1].headers["Content-Type"], "application/json");
  assert.equal(post[1].headers.Authorization, "Bearer known");
  LD.app.writer.setAuthor("bob");
  assert.equal(api.local.get("ld-author"), "bob");
  const refused = fakeApi(intentPage, { "/api/intent/patches": { status: 404, body: { detail: "aucune run archivée pour cette infrastructure : rien à épingler" } } });
  refused.store.set("ld-api-token", "known");
  refused.local.set("ld-author", "orhan");
  const second = load(shell, shell.data, "", { fetch: refused.fetch, sessionStorage: refused.sessionStorage, localStorage: refused.localStorage, search });
  await second.LD.shellApp.state.pending;
  const failed = await second.LD.app.writer.save([{ op: "unpin", hostname: "x" }]);
  assert.deepEqual(clone(failed), { ok: false, message: "aucune run archivée pour cette infrastructure : rien à épingler" });
  const form = load(shell, shell.data, "", { fetch: refused.fetch, sessionStorage: refused.sessionStorage, localStorage: refused.localStorage, search: "?infrastructure=infra-lab" });
  const view = form.document.getElementById("view-shell");
  assert.match(view.textContent, /votre nom/);
  assert.equal(view.all((n) => n.getAttribute("id") === "s-author")[0].value, "orhan", "le formulaire propose le nom gardé");
});

// ---------------------------------------------------------------- après les deux revues du 2026-10-04 (toile B5 ; B4 H1, M3, B3)

test("la page autonome n'appelle jamais fetch, même avec la coquille embarquée (revue de la toile, B5)", () => {
  const calls = [];
  const { LD } = load(page, page.data, "", { fetch: (url) => { calls.push(url); return Promise.resolve({ status: 500, json: () => Promise.resolve(null) }); } });
  assert.ok(LD.app);
  assert.equal(LD.shellApp, undefined);
  assert.deepEqual(calls, []);
});

// Un écrivain dont on contrôle les réponses : chaque `save` rend une promesse résolue par le test, dans l'ordre voulu.
function slowWriter(page, author) {
  const pending = [];
  let revision = page.data.intent.revision;
  const writer = { author, pending, setAuthor(name) { writer.author = name; },
    save: (ops) => new Promise((resolve) => pending.push({ ops, resolve, answer: (ok, extra) => {
      revision += 1;
      const pins = new Map(page.data.intent.pins.map((p) => [p.hostname, p]));
      ops.forEach((op) => { if (op.op === "pin") pins.set(op.hostname, { hostname: op.hostname, x: op.x, y: op.y, author, at: "2026-10-04T19:00:00Z" }); else pins.delete(op.hostname); });
      const intent = { ...page.data.intent, revision, ...(extra || {}), pins: Array.from(pins.values()).sort((a, b) => (a.hostname < b.hostname ? -1 : 1)) };
      resolve(ok ? { ok: true, intent } : { ok: false, message: "l'API répond 500" });
    } })) };
  return writer;
}

test("une réponse refusée garde l'épingle locale ; une réponse acceptée ne l'efface pas non plus (revue B4, M3)", { skip: !intentPage }, async () => {
  const { LD, document } = load(intentPage);
  const writer = slowWriter(intentPage, "alice");
  const app = LD.boot(clone(intentPage.data), { writer });
  const canvas = document.getElementById("canvas");
  dragNode(nodeOf(canvas, "sw-core-02"));
  dragNode(nodeOf(canvas, "rt-wan-01"));
  assert.equal(writer.pending.length, 2, "deux envois en attente");
  assert.equal(app.graph.state.pinned.has("sw-core-02") && app.graph.state.pinned.has("rt-wan-01"), true);
  writer.pending[0].answer(false);
  await tick();
  assert.equal(app.graph.state.pinned.has("sw-core-02"), true, "refusée : l'épingle reste locale, le nœud ne saute pas");
  assert.match(document.getElementById("graph-status").textContent, /épingle de sw-core-02 non enregistrée : l'API répond 500/);
  writer.pending[1].answer(true);
  await tick();
  assert.equal(app.model.pinByHost.has("rt-wan-01"), true);
  assert.equal(app.graph.state.pinned.has("sw-core-02"), true, "l'acceptation de rt-wan-01 n'efface pas l'épingle locale de sw-core-02");
  app.activate("intent");
  assert.match(document.getElementById("view-intent").textContent, /Déplacements locaux non enregistrés : 1.*sw-core-02/s);
});

test("une réponse plus ancienne que le document déjà lu est ignorée ; « replacer » pendant un envoi rejoint l'épingle (revue B4, H1, M3)", { skip: !intentPage }, async () => {
  const { LD, document } = load(intentPage);
  const writer = slowWriter(intentPage, "alice");
  const app = LD.boot(clone(intentPage.data), { writer });
  const canvas = document.getElementById("canvas");
  dragNode(nodeOf(canvas, "sw-core-02"));
  const sent = clone(writer.pending[0].ops[0]);
  app.graph.resetPins(); // « replacer » pendant l'envoi : le nœud retourne à sa place calculée
  assert.equal(app.graph.state.pinned.has("sw-core-02"), false);
  writer.pending[0].answer(true);
  await tick();
  const placed = app.graph.state.positions.get("sw-core-02");
  assert.deepEqual(clone(placed), { x: sent.x, y: sent.y }, "le nœud rejoint l'épingle enregistrée sans replacer le reste");
  assert.equal(nodeOf(canvas, "sw-core-02").classList.contains("pinned"), true);
  // Une réponse en retard (révision plus basse que celle déjà lue) n'écrase pas le modèle.
  const stale = { ...app.model.intent, revision: app.model.intent.revision - 1, pins: [] };
  writer.save = () => Promise.resolve({ ok: true, intent: stale });
  dragNode(nodeOf(canvas, "fw-edge-01"));
  await tick();
  assert.equal(app.model.pinByHost.has("sw-core-02"), true, "la réponse périmée est ignorée");
  assert.equal(app.model.intent.revision, stale.revision + 1);
});

test("la coquille envoie les opérations l'une après l'autre, dans l'ordre (revue B4, H1)", { skip: !shell || !intentPage }, async () => {
  const order = [];
  let release = null;
  const first = new Promise((resolve) => { release = resolve; });
  const api = fakeApi(intentPage, { "/api/intent": { status: 200, body: intentPage.data.intent } });
  const baseFetch = api.fetch;
  api.fetch = (url, init) => {
    if (url.startsWith("/api/intent/patches")) {
      const body = JSON.parse(init.body);
      order.push("start " + body.ops[0].hostname);
      const wait = order.length === 1 ? first : Promise.resolve();
      return wait.then(() => { order.push("end " + body.ops[0].hostname); return { status: 200, json: () => Promise.resolve({ ...intentPage.data.intent, revision: 2 + order.length }) }; });
    }
    return baseFetch(url, init);
  };
  api.store.set("ld-api-token", "known");
  api.local.set("ld-author", "orhan");
  const { LD } = load(shell, shell.data, "", { fetch: api.fetch, sessionStorage: api.sessionStorage, localStorage: api.localStorage, search: "?infrastructure=infra-lab&run_id=" + RUN_ID });
  await LD.shellApp.state.pending;
  const a = LD.app.writer.save([{ op: "pin", hostname: "a", x: 1, y: 1 }]);
  const b = LD.app.writer.save([{ op: "pin", hostname: "b", x: 2, y: 2 }]);
  await tick();
  assert.deepEqual(order, ["start a"], "b attend la fin de a");
  release();
  await Promise.all([a, b]);
  assert.deepEqual(order, ["start a", "end a", "start b", "end b"]);
});

test("« retirer toutes » envoie par paquets de 500 au plus, et « retirer » ne part qu'une fois (revue B4, B3)", { skip: !intentPage }, async () => {
  const { LD, document } = load(intentPage);
  const data = clone(intentPage.data);
  data.intent.pins = Array.from({ length: 1203 }, (_, i) => ({ hostname: "host-" + String(i).padStart(4, "0"), x: 0, y: 0, author: "orhan", at: "2026-10-04T18:30:00Z" }));
  const writer = fakeWriter({ data }, "alice");
  const app = LD.boot(data, { writer });
  app.activate("intent");
  const view = document.getElementById("view-intent");
  view.all((n) => n.tagName === "button" && /^retirer toutes les épingles \(1203\)$/.test(n.textContent))[0].fire("click", {});
  view.all((n) => n.tagName === "button" && /^confirmer : retirer toutes/.test(n.textContent))[0].fire("click", {});
  await tick();
  assert.equal(writer.saved.length, 1203);
  assert.equal(app.model.intent.pins.length, 0);
  const remove = document.getElementById("view-intent").all((n) => n.tagName === "button" && n.textContent === "retirer");
  assert.equal(remove.length, 0);
  // « retirer » se désactive au clic : un second clic ne renvoie rien.
  const again = LD.boot(clone(intentPage.data), { writer: fakeWriter(intentPage, "alice") });
  again.activate("intent");
  const button = document.getElementById("view-intent").all((n) => n.tagName === "button" && n.textContent === "retirer")[0];
  button.fire("click", {});
  assert.equal(button.getAttribute("disabled"), "", "désactivé dès le clic");
  assert.equal(document.getElementById("i-author").getAttribute("maxlength"), "80");
});

const intentDiffPage = process.env.LD_PAGE_INTENT_DIFF ? readPage(process.env.LD_PAGE_INTENT_DIFF) : null;

test("un fantôme du diff épinglé est orphelin : il n'est pas placé par l'épingle ni marqué (revue B4, B3)", { skip: !intentDiffPage }, () => {
  const { LD, document } = load(intentDiffPage, intentDiffPage.data, "#stubs=1");
  const model = LD.app.model;
  assert.deepEqual(clone(model.orphanPins.map((p) => p.hostname)), ["srv-hyp-07"]);
  const canvas = document.getElementById("canvas");
  const ghost = nodeOf(canvas, "srv-hyp-07");
  assert.ok(ghost && ghost.classList.contains("diff-removed"), "le fantôme est dessiné avec les changements et les voisins inconnus");
  assert.equal(ghost.classList.contains("pinned"), false);
  assert.notDeepEqual(clone(LD.app.graph.state.positions.get("srv-hyp-07")), { x: 400, y: 400 });
  assert.equal(nodeOf(canvas, "sw-core-01").classList.contains("pinned"), true, "l'épingle d'un nœud vivant s'applique");
  assert.match(document.getElementById("run-counts").textContent, /2 épingles · 1 orpheline/);
});

// ---------------------------------------------------------------- le placement mémorisé (2026-10-06, docs/09)

const placementPage = process.env.LD_PAGE_PLACEMENT ? readPage(process.env.LD_PAGE_PLACEMENT) : null;
const INFRA_KINDS = new Set(["device", "external"]);
const infraPositions = (app) => clone(Object.fromEntries(Array.from(app.graph.state.positions).filter(([host]) => INFRA_KINDS.has(app.model.nodeByHost.get(host).kind))));

// Un serveur de placement en mémoire, avec la règle de l'API : la première place reste, un envoi fait sur un document
// qui a changé depuis est refusé (409) avec le document courant, « replacer » remplace tout.
function fakePlacer(page, options) {
  const saved = [];
  let doc = clone(page.data.placement);
  const server = {
    doc: () => doc,
    write(write) {
      const places = new Map((write.replace ? [] : doc.places).map((p) => [p.hostname, p]));
      const fresh = write.places.filter((p) => !places.has(p.hostname));
      if (!write.replace && !fresh.length) return { ok: true, placement: clone(doc) };
      if (write.base_revision !== doc.revision) return { ok: false, stale: true, placement: clone(doc) };
      fresh.forEach((p) => places.set(p.hostname, p));
      doc = { ...doc, revision: doc.revision + 1, places: Array.from(places.values()).sort((a, b) => (a.hostname < b.hostname ? -1 : 1)) };
      return { ok: true, placement: clone(doc) };
    },
  };
  const placer = { saved, server, down: false, save: async (write) => {
    saved.push(clone(write));
    if (placer.down) return { ok: false, message: "l'API ne répond pas" };
    return (options && options.answer) ? options.answer(write, server) : server.write(write);
  } };
  return placer;
}

test("le placement complète un dessin existant : rien ne bouge, le nouveau se pose près de ses voisins, en entiers", () => {
  const { LD } = load(page);
  const ids = ["a", "b", "c", "d", "e", "seul"];
  const edges = [["a", "b"], ["b", "c"], ["c", "a"], ["c", "d"], ["d", "e"]];
  const first = LD.layout.run(ids, edges);
  for (const point of first.values()) assert.equal(Number.isInteger(point.x) && Number.isInteger(point.y), true, "ce qui est mémorisé est ce qui est dessiné");
  const fixed = new Map(Array.from(first).filter(([id]) => id !== "e" && id !== "seul"));
  const next = LD.layout.run(ids.concat(["f", "g"]), edges.concat([["d", "f"], ["f", "g"]]), fixed, { extend: true });
  fixed.forEach((point, id) => assert.deepEqual(clone(next.get(id)), clone(point), id + " garde sa place"));
  const d = next.get("d"), f = next.get("f"), g = next.get("g");
  assert.equal(Math.hypot(f.x - d.x, f.y - d.y) < LD.layout.IDEAL * 2.5, true, "f se pose près de d");
  assert.equal(Math.hypot(g.x - f.x, g.y - f.y) < LD.layout.IDEAL * 2.5, true, "g, de proche en proche, près de f");
  const points = Array.from(next.values()).map((p) => p.x + ":" + p.y);
  assert.equal(new Set(points).size, points.length, "aucune superposition");
  assert.deepEqual(clone(Array.from(LD.layout.wired(ids, edges)).sort()), ["a", "b", "c", "d", "e"], "« seul » n'a pas de câble : rangé, jamais mémorisé");
  const again = LD.layout.run(ids.concat(["g", "f"]).reverse(), edges.concat([["f", "g"], ["d", "f"]]), fixed, { extend: true });
  assert.deepEqual(clone(Array.from(next).sort()), clone(Array.from(again).sort()), "déterministe quel que soit l'ordre");
});

test("une page part des places mémorisées, place le reste, et afficher les voisins inconnus ne déplace aucun équipement", { skip: !placementPage }, () => {
  const { LD, document } = load(placementPage, placementPage.data);
  const app = LD.app, state = app.graph.state;
  assert.equal(app.model.placement.revision, 3);
  assert.deepEqual(clone(state.positions.get("sw-core-01")), { x: 100, y: 100 }, "une place mémorisée est une contrainte dure");
  assert.deepEqual(clone(state.positions.get("sw-core-02")), { x: 400, y: 100 });
  assert.equal(state.placed.has("gone-host"), true, "une place orpheline reste en mémoire, elle ne dessine rien");
  const edge = state.positions.get("fw-edge-01");
  assert.equal(Number.isInteger(edge.x) && Number.isInteger(edge.y), true);
  assert.equal(Math.hypot(edge.x - 100, edge.y - 100) < LD.layout.IDEAL * 3, true, "placé près des cœurs, auxquels il est câblé");
  assert.deepEqual(clone(state.placed.get("fw-edge-01")), clone(edge), "ce que la page a placé entre dans sa mémoire");
  assert.match(document.getElementById("graph-status").textContent, /\d équipements placés ici, non mémorisés \(page sans serveur\)/);
  const before = infraPositions(app);
  const stubs = document.getElementById("t-stubs");
  stubs.checked = true;
  stubs.fire("change", { target: stubs });
  assert.equal(document.getElementById("canvas").withClass("node").length, 6);
  assert.deepEqual(infraPositions(app), before, "les voisins inconnus se placent autour, l'infrastructure ne bouge pas");
  const stub = app.model.nodes.find((n) => n.kind === "stub").hostname;
  assert.equal(state.placed.has(stub), false, "un voisin inconnu n'est jamais mémorisé");
  app.graph.state.showDiff = false;
  app.graph.render(true);
  assert.deepEqual(infraPositions(app), before, "un nouveau dessin dans la même page ne bouge rien non plus");
  dragNode(nodeOf(document.getElementById("canvas"), "fw-edge-01"));
  assert.notDeepEqual(clone(state.positions.get("fw-edge-01")), clone(edge));
  app.graph.resetPins();
  assert.deepEqual(clone(state.positions.get("fw-edge-01")), clone(edge), "oublier un déplacement local rend sa place mémorisée");
  app.graph.replaceAll();
  assert.equal(state.placed.has("gone-host"), false, "replacer oublie toute la mémoire");
  assert.equal(state.placed.size >= 4 && state.placed.has("sw-core-01"), true, "et la remplit avec le nouveau dessin");
  assert.match(document.getElementById("graph-status").textContent, /placement recalculé ici, non mémorisé \(page sans serveur\)/);
  const fresh = LD.boot(clone(placementPage.data));
  assert.deepEqual(infraPositions(fresh), before, "même page, même dessin");
});

test("avec un écrivain de placement, ce qui vient d'être placé est mémorisé ; la place déjà enregistrée ailleurs gagne ; « replacer » confirme puis remplace", { skip: !placementPage }, async () => {
  const { LD, document } = load(placementPage);
  const placer = fakePlacer(placementPage);
  // Une autre page a dessiné fw-edge-01 la première, après la lecture du document par celle-ci (révision 3 → 4).
  placer.server.write({ base_revision: 3, replace: false, places: [{ hostname: "fw-edge-01", x: 777, y: 555 }] });
  const app = LD.boot(clone(placementPage.data), { placer });
  await tick();
  assert.equal(placer.saved[0].replace, false);
  assert.equal(placer.saved[0].base_revision, 3, "la révision lue avant de dessiner");
  const sent = placer.saved[0].places.map((p) => p.hostname);
  assert.ok(sent.includes("fw-edge-01") && !sent.includes("sw-core-01") && !sent.includes("gone-host"), "seuls les équipements placés sans mémoire partent");
  assert.ok(placer.saved[0].places.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)));
  assert.equal(placer.saved.length, 2, "refusé (le document avait changé), la page a adopté le document courant, replacé ses nouveaux venus et renvoyé");
  assert.equal(placer.saved[1].base_revision, 4);
  assert.ok(!placer.saved[1].places.some((p) => p.hostname === "fw-edge-01"), "fw-edge-01 a maintenant une place : elle n'est pas renvoyée");
  assert.deepEqual(clone(app.graph.state.positions.get("fw-edge-01")), { x: 777, y: 555 }, "la place de l'autre page gagne, le nœud la rejoint");
  assert.equal(app.model.placement.revision, 5);
  const stored = app.model.placeByHost.get("fw-edge-02");
  assert.deepEqual(clone(app.graph.state.placed.get("fw-edge-02")), { x: stored.x, y: stored.y }, "la mémoire de la page est le document");
  assert.match(document.getElementById("graph-status").textContent, /équipements placés et mémorisés/);
  const toolbar = document.getElementById("graph-toolbar");
  const first = toolbar.all((n) => n.tagName === "button" && n.textContent === "replacer");
  assert.equal(first.length, 1);
  assert.match(first[0].getAttribute("title"), /pour tout le monde/);
  first[0].fire("click", {});
  assert.equal(placer.saved.length, 2, "rien ne part avant la confirmation");
  const confirm = toolbar.all((n) => n.tagName === "button" && n.textContent === "confirmer : replacer");
  assert.equal(confirm.length, 1);
  confirm[0].fire("click", {});
  await tick();
  assert.equal(placer.saved.length, 3);
  assert.equal(placer.saved[2].replace, true);
  assert.equal(placer.saved[2].base_revision, 5);
  const all = placer.saved[2].places.map((p) => p.hostname);
  assert.ok(all.includes("sw-core-01") && all.includes("sw-core-02") && all.includes("fw-edge-01") && !all.includes("gone-host"), "tout le dessin, rien d'orphelin");
  assert.equal(app.model.placement.revision, 6);
  assert.match(document.getElementById("graph-status").textContent, /placement recalculé et mémorisé pour tout le monde/);
  assert.equal(toolbar.all((n) => n.tagName === "button" && n.textContent === "replacer").length, 1, "le bouton est revenu");
});

test("un envoi échoué est renvoyé au prochain dessin ; une réponse plus ancienne que le document lu est ignorée (revue M1, B4)", { skip: !placementPage }, async () => {
  const { LD, document } = load(placementPage);
  const placer = fakePlacer(placementPage);
  placer.down = true;
  const app = LD.boot(clone(placementPage.data), { placer });
  await tick();
  assert.equal(placer.saved.length, 1);
  assert.match(document.getElementById("graph-status").textContent, /non mémorisés : l'API ne répond pas \(renvoyé au prochain dessin\)/);
  assert.equal(app.graph.state.placed.has("fw-edge-01"), true, "la mémoire de la page reste : rien ne bouge");
  assert.equal(app.model.placement.revision, 3, "le document connu n'a pas changé");
  placer.down = false;
  app.graph.state.placed.delete("fw-edge-02"); // un prochain dessin qui place quelque chose
  app.graph.render(true);
  await tick();
  assert.equal(placer.saved.length, 2);
  const first = placer.saved[0].places.map((p) => p.hostname), second = placer.saved[1].places.map((p) => p.hostname);
  assert.ok(first.every((host) => second.includes(host)), "tout ce qui n'avait pas été accepté repart avec");
  assert.equal(app.model.placement.revision, 4);
  const old = { ...placer.server.doc(), revision: 1, places: [] };
  const stale = LD.boot(clone(placementPage.data), { placer: { save: async () => ({ ok: true, placement: old }) } });
  await tick();
  assert.equal(stale.model.placement.revision, 3, "une réponse plus ancienne que le document déjà lu est ignorée");
  assert.deepEqual(clone(stale.graph.state.positions.get("sw-core-01")), { x: 100, y: 100 });
});

test("deux premières pages sur deux runs : la seconde complète le dessin de la première au lieu de le mêler au sien (revue, H1)", { skip: !diffPage }, async () => {
  const empty = { infrastructure: "infra-lab", revision: 0, updated_at: null, places: [] };
  const first = load(page);
  const placer = fakePlacer({ data: { placement: empty } });
  const a = first.LD.boot({ ...clone(page.data), placement: clone(empty) }, { placer });
  const second = load(diffPage);
  const b = second.LD.boot({ ...clone(diffPage.data), placement: clone(empty) }, { placer });
  await tick();
  assert.equal(placer.saved[0].base_revision, 0);
  assert.equal(placer.saved[1].base_revision, 0, "B a lu le même document vide que A");
  const a1 = infraPositions(a), b1 = infraPositions(b);
  for (const [host, point] of Object.entries(a1)) assert.deepEqual(b1[host], point, host + " : B a adopté le dessin de A");
  const doc = placer.server.doc();
  assert.equal(doc.places.length, Object.keys(a1).length, "le document est le dessin de A, rien d'autre");
  assert.equal(doc.revision, 1, "l'envoi de B, refusé, n'a rien écrit ; B n'avait rien de nouveau à renvoyer");
  assert.equal(b.model.placement.revision, 1, "B a adopté le document de A");
});

test("un voisin inconnu qui a une place se dessine là où il était, sans jamais être mémorisé, et le réalignement ne redessine rien (revue, M2)", { skip: !placementPage }, async () => {
  const { LD, document } = load(placementPage);
  const stub = placementPage.data.snapshot.nodes.find((n) => n.kind === "stub").hostname;
  const placement = clone(placementPage.data.placement);
  placement.places = placement.places.concat([{ hostname: stub, x: -250, y: 300 }]).sort((a, b) => (a.hostname < b.hostname ? -1 : 1));
  const placer = fakePlacer({ data: { placement } });
  const app = LD.boot({ ...clone(placementPage.data), placement }, { placer });
  await tick();
  app.graph.state.showStubs = true;
  app.graph.render(true);
  assert.deepEqual(clone(app.graph.state.positions.get(stub)), { x: -250, y: 300 });
  const before = document.getElementById("canvas").withClass("node");
  app.graph.syncPlaces();
  const after = document.getElementById("canvas").withClass("node");
  assert.equal(before[0] === after[0] && before.length === after.length, true, "rien n'est redessiné");
  assert.ok(!placer.saved.some((w) => w.places.some((p) => p.hostname === stub)), "jamais mémorisé par la page");
});

test("un équipement épinglé n'est pas mémorisé à son épingle ; retirer l'épingle le place près de ses voisins et le mémorise alors (revue, B1)", { skip: !placementPage }, async () => {
  const { LD } = load(placementPage);
  const intent = { ...EMPTY_INTENT, revision: 1, updated_at: "2026-10-06T09:00:00Z", pins: [{ hostname: "fw-edge-01", x: -900, y: -900, author: "orhan", at: "2026-10-06T09:00:00Z" }] };
  const placer = fakePlacer(placementPage);
  const app = LD.boot({ ...clone(placementPage.data), intent }, { placer });
  await tick();
  assert.deepEqual(clone(app.graph.state.positions.get("fw-edge-01")), { x: -900, y: -900 }, "l'épingle gagne");
  assert.equal(app.graph.state.placed.has("fw-edge-01"), false, "la mémoire n'est pas une copie de l'intention");
  assert.ok(!placer.saved[0].places.some((p) => p.hostname === "fw-edge-01"));
  app.graph.unpin(["fw-edge-01"]);
  await tick();
  const point = app.graph.state.positions.get("fw-edge-01");
  assert.notDeepEqual(clone(point), { x: -900, y: -900 }, "placé par les forces, près de ses voisins (son pair HA a été attiré vers l'épingle : il y reste)");
  assert.deepEqual(clone(app.graph.state.placed.get("fw-edge-01")), clone(point), "et mémorisé à ce moment");
  assert.ok(placer.saved.at(-1).places.some((p) => p.hostname === "fw-edge-01"));
});

test("un équipement sans câble garde sa place mémorisée au lieu de l'étagère ; un fantôme d'équipement n'est jamais mémorisé (revue, B4)", { skip: !diffPage }, () => {
  const { LD } = load(page);
  const shelved = LD.layout.run(["a", "b", "c"], [["a", "b"]]);
  const kept = LD.layout.run(["a", "b", "c"], [["a", "b"]], new Map([["c", { x: 5, y: 7 }]]), { extend: true });
  assert.notDeepEqual(clone(shelved.get("c")), { x: 5, y: 7 }, "sans mémoire : rangé sous le graphe");
  assert.deepEqual(clone(kept.get("c")), { x: 5, y: 7 }, "avec : là où il était");
  const data = clone(diffPage.data);
  const template = data.snapshot.nodes.find((n) => n.kind === "device");
  const link = data.snapshot.links.find((l) => l.a.hostname === template.hostname || l.b.hostname === template.hostname);
  data.diff.nodes.removed.push({ ...template, hostname: "ghost-dev" });
  data.diff.links.removed.push({ ...link, a: { ...link.a, hostname: "ghost-dev" }, evidence: [] });
  const app = load(diffPage).LD.boot(data);
  assert.ok(app.model.ghostNodes.some((n) => n.hostname === "ghost-dev" && n.kind === "device"));
  assert.ok(app.graph.state.positions.has("ghost-dev"), "dessiné");
  assert.equal(app.graph.state.placed.has("ghost-dev"), false, "jamais mémorisé");
});

test("la coquille lit /api/placement, envoie ce qu'elle place, et sans document lu n'écrit rien", { skip: !shell || !placementPage }, async () => {
  const api = fakeApi(placementPage, { "/api/placement": { status: 200, body: placementPage.data.placement } });
  api.store.set("ld-api-token", "known");
  const search = "?infrastructure=infra-lab&run_id=" + RUN_ID;
  const { LD } = load(shell, shell.data, "", { fetch: api.fetch, sessionStorage: api.sessionStorage, search });
  await LD.shellApp.state.pending;
  assert.ok(api.calls.some(([url, token]) => url === "/api/placement?infrastructure=infra-lab" && token === "Bearer known"));
  assert.ok(LD.app.placer, "la page servie a un écrivain de placement");
  assert.deepEqual(clone(LD.app.graph.state.positions.get("sw-core-01")), { x: 100, y: 100 });
  await tick();
  const post = api.requests.find(([url, init]) => url === "/api/placement?infrastructure=infra-lab" && init.method === "POST");
  assert.ok(post, "ce que la page a placé part vers l'API");
  const body = JSON.parse(post[1].body);
  assert.equal(body.replace, false);
  assert.equal(body.base_revision, 3, "la révision du document lu");
  assert.ok(body.places.some((p) => p.hostname === "fw-edge-01") && !body.places.some((p) => p.hostname === "sw-core-01"));
  assert.equal(post[1].headers.Authorization, "Bearer known");
  const broken = fakeApi(placementPage, { "/api/placement": { status: 500, body: { detail: "document de placement corrompu : `ld placement --forget` le retire, le placement se recalcule" } } });
  broken.store.set("ld-api-token", "known");
  const second = load(shell, shell.data, "", { fetch: broken.fetch, sessionStorage: broken.sessionStorage, search });
  await second.LD.shellApp.state.pending;
  await tick();
  assert.ok(second.LD.app, "la run s'ouvre quand même");
  assert.equal(second.LD.app.placer, null);
  assert.match(second.document.getElementById("run-meta").textContent, /placement mémorisé indisponible : l'API répond 500 : document de placement corrompu/);
  assert.equal(broken.requests.some(([url, init]) => url.startsWith("/api/placement") && init.method === "POST"), false, "sans document lu, rien ne s'écrit");
});

test("d'une run à l'autre, un équipement non touché reste où il était", { skip: !diffPage }, () => {
  const earlier = load(page, page.data).LD.app;
  const places = Array.from(earlier.graph.state.placed, ([hostname, p]) => ({ hostname, x: p.x, y: p.y })).sort((a, b) => (a.hostname < b.hostname ? -1 : 1));
  const placement = { infrastructure: "infra-lab", revision: 1, updated_at: "2026-10-06T09:00:00Z", places };
  const later = load(diffPage, { ...diffPage.data, placement }).LD.app;
  const before = infraPositions(earlier), after = infraPositions(later);
  for (const [host, point] of Object.entries(before)) assert.deepEqual(after[host], point, host + " n'a pas bougé entre les deux runs");
  assert.equal(later.graph.state.placed.size, places.length, "rien de nouveau à mémoriser : la run d'après n'a pas de nouvel équipement");
});

test("une API qui dit oui sans retenir ce qu'on lui envoie ne fait pas tourner la page en rond", { skip: !placementPage }, async () => {
  const { LD, document } = load(placementPage);
  const placer = fakePlacer(placementPage, { answer: (write, server) => ({ ok: true, placement: server.doc() }) });
  const app = LD.boot(clone(placementPage.data), { placer });
  for (let i = 0; i < 8; i += 1) await tick();
  assert.equal(placer.saved.length, LD.placement.MAX_RETRIES + 1, "trois réalignements, puis la page s'arrête");
  assert.match(document.getElementById("graph-status").textContent, /non mémorisés : l'API ne retient pas 3 équipements/);
  assert.equal(app.graph.state.placed.has("fw-edge-01"), true, "la mémoire de la page reste la sienne");
});

// ---------------------------------------------------------------- la bande des runs (2026-10-06)

const RUN_2 = "66e49a2d9a1c2b0012f4a8e2", RUN_3 = "66ee0b1c9a1c2b0012f4a9f3";
const THREE_RUNS = [[RUN_ID, "2026-09-10T02:00:00Z"], [RUN_2, "2026-09-17T02:00:00Z"], [RUN_3, "2026-09-24T02:00:00Z"]].map(([run_id, run_start], i) => ({
  run_id, run_start, run_end: null, run_status: i === 1 ? "failed" : "completed", produced_at: "x", stored_at: run_start.replace("02:00", "03:00"), sha256: String(i) }));
const timelineApi = (answers) => fakeApi(page, { "/api/ingest/bundles": { status: 200, body: { infrastructure: "infra-lab", runs: THREE_RUNS } },
  "/api/diff": { status: 200, body: diffPage ? diffPage.data.diff : null }, ...(answers || {}) });
const strip = (document) => document.getElementById("timeline");
const runButtons = (document) => strip(document).withClass("timeline-run");
const currentRun = (document) => runButtons(document).find((b) => b.getAttribute("aria-current") === "true").getAttribute("data-run");
const diffCalls = (api) => api.calls.map(([url]) => url).filter((url) => url.startsWith("/api/diff"));

test("la bande des runs : les runs dans l'ordre, la courante marquée, rien avant la première", { skip: !shell || !diffPage }, async () => {
  const api = timelineApi();
  api.store.set("ld-api-token", "known");
  const { LD, document } = load(shell, shell.data, "#view=graph&node=sw-core-02", { fetch: api.fetch, sessionStorage: api.sessionStorage, search: "?infrastructure=infra-lab&run_id=" + RUN_ID });
  await LD.shellApp.state.pending;
  assert.equal(strip(document).hidden, false, "une run ouverte par l'API montre la bande");
  assert.deepEqual(runButtons(document).map((b) => b.textContent), ["2026-09-10 02:00", "2026-09-17 02:00", "2026-09-24 02:00"], "début de collecte, court");
  assert.equal(currentRun(document), RUN_ID);
  assert.equal(runButtons(document)[1].classList.contains("run-failed"), true, "le statut de la run colore son bouton");
  const [back, forward] = strip(document).withClass("timeline-step");
  assert.equal(back.getAttribute("disabled"), "", "pas de run avant la première");
  assert.equal(forward.getAttribute("disabled"), null);
  assert.equal(document.getElementById("timeline-compare").getAttribute("disabled"), "", "rien à quoi comparer la première");
  assert.match(strip(document).textContent, /1 sur 3 runs/);
  assert.deepEqual(diffCalls(api), [], "une adresse sans from ouvre la run sans diff");
  assert.deepEqual(clone(LD.timeline.previousOf(THREE_RUNS, RUN_2)).run_id, RUN_ID);
  assert.equal(LD.timeline.nextOf(THREE_RUNS, RUN_3), null);
  assert.equal(LD.timeline.previousOf(THREE_RUNS, "nope"), null);
});

test("→ ouvre la run suivante comparée à celle qu'on quitte, en gardant l'état de vue ; la page ne repasse pas par le formulaire", { skip: !shell || !diffPage }, async () => {
  const api = timelineApi();
  api.store.set("ld-api-token", "known");
  const { LD, document, location, window } = load(shell, shell.data, "#view=graph&node=sw-core-02", { fetch: api.fetch, sessionStorage: api.sessionStorage, search: "?infrastructure=infra-lab&run_id=" + RUN_ID });
  await LD.shellApp.state.pending;
  const first = LD.app;
  assert.equal(first.graph.state.selection.id, "sw-core-02");
  strip(document).withClass("timeline-step")[1].fire("click", {});
  assert.equal(document.getElementById("view-shell").hidden, true, "la page reste visible pendant le chargement");
  assert.match(strip(document).textContent, /chargement…/);
  assert.equal(runButtons(document)[0].getAttribute("disabled"), "", "la bande ne prend pas deux commandes à la fois");
  await LD.shellApp.state.pending;
  assert.deepEqual([LD.shellApp.state.runId, LD.shellApp.state.from], [RUN_2, RUN_ID]);
  assert.equal(location.search, "?infrastructure=infra-lab&run_id=" + RUN_2 + "&from=" + RUN_ID, "l'adresse porte la run et la run comparée, jamais le jeton");
  assert.deepEqual(diffCalls(api), ["/api/diff?infrastructure=infra-lab&from=" + RUN_ID + "&to=" + RUN_2]);
  assert.notEqual(LD.app, first, "un nouveau visualiseur a pris la page");
  assert.ok(LD.app.model.diff, "le diff est peint");
  assert.equal(LD.app.graph.state.selection.id, "sw-core-02", "la sélection par identité traverse les runs");
  assert.match(location.hash, /node=sw-core-02/);
  assert.equal(currentRun(document), RUN_2);
  assert.equal(runButtons(document)[0].classList.contains("compared"), true, "la run comparée est marquée");
  assert.match(strip(document).textContent, /2 sur 3 runs/);
  assert.equal(document.getElementById("canvas").withClass("viewport").length, 1, "une seule toile : l'ancienne est partie avec son visualiseur");
  assert.equal((window.listeners.get("hashchange") || []).length, 1, "un seul visualiseur écoute l'adresse");
  assert.equal(document.getElementById("timeline-compare").getAttribute("disabled"), null);
  // ← : la run d'avant, comparée à sa propre précédente (ici, la première : aucune).
  strip(document).withClass("timeline-row")[0].fire("keydown", { key: "ArrowLeft" });
  await LD.shellApp.state.pending;
  assert.deepEqual([LD.shellApp.state.runId, LD.shellApp.state.from], [RUN_ID, ""]);
  assert.equal(location.search, "?infrastructure=infra-lab&run_id=" + RUN_ID);
  assert.equal(LD.app.model.diff, null, "la première run n'a pas de diff");
  // → deux fois au clavier : la troisième, comparée à la deuxième.
  strip(document).withClass("timeline-row")[0].fire("keydown", { key: "ArrowRight" });
  await LD.shellApp.state.pending;
  strip(document).withClass("timeline-row")[0].fire("keydown", { key: "ArrowRight" });
  await LD.shellApp.state.pending;
  assert.deepEqual([LD.shellApp.state.runId, LD.shellApp.state.from], [RUN_3, RUN_2]);
  assert.equal(strip(document).withClass("timeline-step")[1].getAttribute("disabled"), "", "pas de run après la dernière");
  // « comparer à » : n'importe quelle run antérieure.
  const select = document.getElementById("timeline-compare");
  assert.deepEqual(select.all((n) => n.tagName === "option").map((o) => o.textContent), ["aucune", "2026-09-10 02:00", "2026-09-17 02:00 (précédente)"]);
  select.value = RUN_ID;
  select.fire("change", {});
  await LD.shellApp.state.pending;
  assert.deepEqual([LD.shellApp.state.runId, LD.shellApp.state.from], [RUN_3, RUN_ID]);
  assert.equal(diffCalls(api).pop(), "/api/diff?infrastructure=infra-lab&from=" + RUN_ID + "&to=" + RUN_3);
  // Un clic sur une run : comparée à sa précédente.
  runButtons(document)[1].fire("click", {});
  await LD.shellApp.state.pending;
  assert.deepEqual([LD.shellApp.state.runId, LD.shellApp.state.from], [RUN_2, RUN_ID]);
  assert.equal(document.getElementById("canvas").withClass("viewport").length, 1);
  assert.equal((window.listeners.get("hashchange") || []).length, 1);
});

test("sans liste des runs, la run s'ouvre sans bande et l'en-tête le dit ; le formulaire la cache", { skip: !shell }, async () => {
  const api = fakeApi(page, { "/api/ingest/bundles": { status: 500, body: null } });
  api.store.set("ld-api-token", "known");
  const { LD, document } = load(shell, shell.data, "", { fetch: api.fetch, sessionStorage: api.sessionStorage, search: "?infrastructure=infra-lab&run_id=" + RUN_ID });
  await LD.shellApp.state.pending;
  assert.ok(LD.app);
  assert.equal(strip(document).hidden, true);
  assert.match(document.getElementById("run-meta").textContent, /liste des runs indisponible : l'API répond 500/);
  LD.shellApp.render();
  assert.equal(strip(document).hidden, true);
});

// ---------------------------------------------------------------- la toile pour l'application (2026-10-07) : sélection
// multiple, rectangle, règles de masquage et d'isolement, alignement. La page `/view` n'en expose rien, la toile le sait.

test("Maj + clic ajoute à la sélection multiple ; un clic simple la remplace ; un seul reste une sélection simple", () => {
  const { LD, document } = load(page, page.data);
  const graph = LD.app.graph;
  const hosts = [];
  const nodeOf = (host) => document.getElementById("canvas").all((n) => n.getAttribute("data-node") === host)[0];
  const press = (host, extra) => { const el = nodeOf(host); el.fire("pointerdown", { clientX: 5, clientY: 5, ...extra }); el.fire("pointerup", {}); };
  press("sw-core-01", {});
  assert.deepEqual(clone(graph.state.selection), { kind: "node", id: "sw-core-01" });
  assert.deepEqual(clone(Array.from(graph.state.selected)), ["sw-core-01"], "un équipement sélectionné est le seul membre de la sélection multiple");
  press("sw-core-02", { shiftKey: true });
  assert.equal(graph.state.selection, null, "deux équipements : plus de sélection simple");
  assert.deepEqual(clone(Array.from(graph.state.selected).sort()), ["sw-core-01", "sw-core-02"]);
  assert.equal(document.getElementById("canvas").withClass("selected").length, 2);
  assert.match(document.getElementById("canvas").getAttribute("class"), /has-selection/);
  press("sw-core-02", { shiftKey: true });
  assert.deepEqual(clone(graph.state.selection), { kind: "node", id: "sw-core-01" }, "retirer le second rend une sélection simple");
  press("fw-edge-01", {});
  assert.deepEqual(clone(Array.from(graph.state.selected)), ["fw-edge-01"], "un clic simple remplace tout");
  graph.selectHosts(["sw-core-01", "sw-core-02", "inconnu"]);
  assert.deepEqual(clone(Array.from(graph.state.selected).sort()), ["sw-core-01", "sw-core-02"], "un nom inconnu de la run est ignoré");
  graph.selectHosts([]);
  assert.equal(graph.state.selection, null);
  assert.equal(graph.state.selected.size, 0);
  void hosts;
});

test("Maj + glissé sur le fond sélectionne les équipements du rectangle ; sans Maj, c'est un panoramique", () => {
  const { LD, document } = load(page, page.data);
  const graph = LD.app.graph;
  const canvas = document.getElementById("canvas");
  const screen = (host) => { const p = graph.state.positions.get(host), v = graph.state.view; return { x: p.x * v.k + v.tx, y: p.y * v.k + v.ty }; };
  const a = screen("sw-core-01"), b = screen("sw-core-02");
  const left = Math.min(a.x, b.x) - 5, right = Math.max(a.x, b.x) + 5, top = Math.min(a.y, b.y) - 5, bottom = Math.max(a.y, b.y) + 5;
  const before = { ...graph.state.view };
  canvas.fire("pointerdown", { target: canvas, clientX: left, clientY: top, shiftKey: true });
  canvas.fire("pointermove", { clientX: right, clientY: bottom, shiftKey: true });
  const marquee = canvas.withClass("marquee")[0];
  assert.equal(marquee.getAttribute("visibility"), "visible", "le rectangle se dessine pendant le glissé");
  canvas.fire("pointerup", { clientX: right, clientY: bottom, shiftKey: true });
  assert.equal(marquee.getAttribute("visibility"), "hidden");
  assert.deepEqual(clone(before), clone(graph.state.view), "la vue n'a pas bougé");
  assert.equal(graph.state.selected.has("sw-core-01") && graph.state.selected.has("sw-core-02"), true);
  const others = Array.from(graph.state.selected).filter((h) => !["sw-core-01", "sw-core-02"].includes(h));
  for (const host of others) { const p = screen(host); assert.equal(p.x >= left && p.x <= right && p.y >= top && p.y <= bottom, true, host + " est bien dans le rectangle"); }
  canvas.fire("pointerdown", { target: canvas, clientX: 10, clientY: 10 });
  canvas.fire("pointermove", { clientX: 70, clientY: 10 });
  canvas.fire("pointerup", { clientX: 70, clientY: 10 });
  assert.equal(graph.state.view.tx, before.tx + 60, "sans Maj, le fond se déplace");
});

test("les règles masquent et isolent ; une règle de recherche éclaire par champ", () => {
  const { LD, document } = load(page, page.data);
  const graph = LD.app.graph;
  const canvas = document.getElementById("canvas");
  const drawn = () => canvas.all((n) => n.getAttribute("data-node") !== null).map((n) => n.getAttribute("data-node")).sort();
  const all = drawn();
  assert.equal(all.length, 5);
  graph.state.hide = [LD.query.parseRule("fw-")];
  graph.render(true);
  assert.deepEqual(drawn(), all.filter((h) => !h.includes("fw-")), "masquer retire les équipements désignés et leurs câbles");
  assert.equal(canvas.withClass("link").every((l) => !/fw-/.test(l.getAttribute("aria-label"))), true);
  graph.state.hide = [];
  graph.state.only = LD.query.parseRule("^sw-core-01$");
  graph.render(true);
  const kept = drawn();
  assert.equal(kept.includes("sw-core-01"), true);
  assert.equal(kept.length < all.length, true, "isoler ne garde que l'équipement et ses voisins directs");
  for (const host of kept) {
    const neighbour = host === "sw-core-01" || LD.app.model.linksByNode.get(host).some((l) => l.a.hostname === "sw-core-01" || l.b.hostname === "sw-core-01");
    assert.equal(neighbour, true, host + " est un voisin direct");
  }
  graph.state.hide = [LD.query.parseRule("^sw-core-01$")];
  graph.render(true);
  assert.equal(drawn().includes("sw-core-01"), false, "masquer gagne sur isoler");
  graph.state.hide = []; graph.state.only = null; graph.render(true);
  assert.deepEqual(drawn(), all);
  graph.state.query = "type:firewall";
  graph.repaint();
  const lit = canvas.withClass("match").map((n) => n.getAttribute("data-node")).sort();
  assert.deepEqual(lit, all.filter((h) => (LD.app.model.nodeByHost.get(h).type === "firewall")));
  graph.state.query = "(";
  graph.repaint();
  assert.equal(canvas.withClass("match").length, 0, "une regex illisible n'éclaire rien et ne casse rien");
});

test("l'alignement est pur, entier, et la toile l'applique à la sélection multiple en le disant à la page", () => {
  const { LD, document } = load(page, page.data);
  const positions = new Map([["a", { x: 10.4, y: 100 }], ["b", { x: 50, y: 140 }], ["c", { x: 90, y: 180 }], ["d", { x: 200, y: 7 }]]);
  const row = LD.alignment.align(positions, ["c", "a", "b"], "horizontal");
  assert.deepEqual(clone(Object.fromEntries(row)), { a: { x: 10, y: 140 }, c: { x: 90, y: 140 } }, "même y moyen, arrondi ; b n'a pas bougé");
  const column = LD.alignment.align(positions, ["a", "b", "c"], "vertical");
  assert.deepEqual(clone(Object.fromEntries(column)), { a: { x: 50, y: 100 }, c: { x: 50, y: 180 } });
  const spread = LD.alignment.align(new Map([["a", { x: 0, y: 0 }], ["b", { x: 10, y: 0 }], ["c", { x: 100, y: 0 }]]), ["a", "b", "c"], "distribute-horizontal");
  assert.deepEqual(clone(Object.fromEntries(spread)), { b: { x: 50, y: 0 } }, "répartir ne bouge que les intermédiaires");
  assert.equal(LD.alignment.align(positions, ["a"], "horizontal").size, 0, "un seul : rien");
  assert.equal(LD.alignment.align(positions, ["a", "b"], "distribute-vertical").size, 0, "deux : rien à répartir");
  assert.equal(LD.alignment.align(positions, ["a", "zz"], "horizontal").size, 0, "un inconnu est ignoré");
  // Sur la toile : les deux cœurs alignés horizontalement, épinglés localement, la page prévenue.
  const pins = [];
  const graph = LD.graph.create(document.getElementById("canvas"), LD.app.model, () => {}, { onPins: (moves) => pins.push(clone(Object.fromEntries(moves))) });
  graph.render(false);
  graph.selectHosts(["sw-core-01", "sw-core-02"]);
  const moved = graph.alignSelected("horizontal");
  assert.equal(moved.size >= 1, true);
  assert.equal(graph.state.positions.get("sw-core-01").y, graph.state.positions.get("sw-core-02").y);
  assert.equal(pins.length, 1);
  for (const host of moved.keys()) assert.equal(graph.state.pinned.has(host), true, host + " porte une épingle locale");
  assert.equal(graph.alignSelected("distribute-vertical").size, 0, "deux équipements : rien à répartir, la page n'est pas prévenue");
  assert.equal(pins.length, 1);
});

test("glisser un équipement de la sélection multiple déplace toute la sélection d'un bloc ; la page reçoit un seul paquet d'épingles", () => {
  const { LD, document } = load(page, page.data);
  const canvas = document.getElementById("canvas");
  const pins = [], single = [];
  const graph = LD.graph.create(canvas, LD.app.model, () => {}, {
    onPin: (host, point) => single.push({ host, point: clone(point) }),
    onPins: (moves, cause) => pins.push({ cause, moves: clone(Object.fromEntries(moves)) }),
  });
  graph.render(false);
  const k = graph.state.view.k;
  const before = (host) => clone(graph.state.positions.get(host));
  const moved = (host, from) => { const p = graph.state.positions.get(host); return { dx: Math.round((p.x - from.x) * k), dy: Math.round((p.y - from.y) * k) }; };
  graph.selectHosts(["sw-core-01", "sw-core-02"]);
  const a = before("sw-core-01"), b = before("sw-core-02"), other = before("fw-edge-01");
  dragNode(nodeOf(canvas, "sw-core-01")); // de (10, 10) à (90, 40) à l'écran
  assert.deepEqual(moved("sw-core-01", a), { dx: 80, dy: 30 });
  assert.deepEqual(moved("sw-core-02", b), { dx: 80, dy: 30 }, "le second suit du même écart : le bloc garde sa forme");
  assert.deepEqual(moved("fw-edge-01", other), { dx: 0, dy: 0 }, "hors sélection, rien ne bouge");
  assert.equal(graph.state.pinned.has("sw-core-02"), true, "chacun porte une épingle locale");
  assert.equal(pins.length, 1, "un seul paquet pour la page");
  assert.equal(pins[0].cause, "dragged");
  assert.deepEqual(Object.keys(pins[0].moves).sort(), ["sw-core-01", "sw-core-02"]);
  assert.equal(single.length, 0, "pas d'épingle une à une");
  assert.deepEqual(clone(Array.from(graph.state.selected).sort()), ["sw-core-01", "sw-core-02"], "la sélection reste");
  dragNode(nodeOf(canvas, "fw-edge-01"));
  assert.deepEqual(moved("fw-edge-01", other), { dx: 80, dy: 30 }, "un équipement hors sélection se glisse seul");
  assert.deepEqual(moved("sw-core-01", a), { dx: 80, dy: 30 }, "la sélection n'a pas suivi");
  assert.equal(single.length, 1, "un seul équipement : son épingle part seule");
  assert.equal(pins.length, 1);
});

test("la carte d'un équipement : le nom dedans, l'icône pleine à gauche, les noms de port hors de la carte (card.ts)", () => {
  const { LD, document } = load(page, page.data);
  const card = LD.card.plan("DC01-CORE-01", { role: null, stack: null });
  assert.equal(card.h, LD.card.CARD_H);
  assert.equal(card.h >= 72, true, "une carte haute : l'icône pleine y tient à 40 px");
  assert.equal(card.label.anchor, "start");
  assert.equal(card.label.x + LD.card.monoWidth("DC01-CORE-01") <= card.w / 2, true, "le nom tient dans la carte, à droite du rail et de l'icône");
  assert.equal(card.icon.x + LD.icons.SIZE * card.icon.scale < card.label.x, true, "l'icône à gauche du nom");
  assert.equal(LD.icons.SIZE * card.icon.scale, 40, "l'icône à 40 px");
  assert.equal(card.rail.startsWith("M") && card.rail.endsWith("Z"), true, "le rail de couleur est un tracé fermé");
  assert.equal(LD.card.displayName("dc01-core-01"), "DC01-CORE-01", "la carte écrit le nom en capitales");
  assert.equal(LD.card.displayName("a-very-long-hostname-indeed-yes"), "A-VERY-LONG…INDEED-YES", "raccourci au milieu, puis en capitales");
  const withRole = LD.card.plan("DC01-CORE-01", { role: "primary", stack: 2 });
  assert.equal(withRole.role.anchor, "start");
  assert.equal(withRole.role.x === withRole.label.x && withRole.role.x < withRole.stack.x, true, "rôle puis compte de stack, alignés sous le nom");
  assert.equal(withRole.role.y > withRole.label.y, true, "la petite ligne sous le nom");
  assert.equal(withRole.h, card.h, "même hauteur avec ou sans ligne du dessous : les rangées restent alignées");
  assert.equal(LD.card.plan("A-VERY-LONG-HOSTNAME-INDEED", { role: null, stack: null }).w > card.w, true, "un nom long élargit la carte");
  assert.equal(LD.card.textWidth("WWWW") > LD.card.textWidth("iiii"), true, "les lettres larges comptent plus");
  assert.equal(LD.card.reach({ w: 100, h: 40 }, 1, 0), 50, "un câble horizontal sort au bord droit");
  assert.equal(LD.card.reach({ w: 100, h: 40 }, 0, -1), 20, "un câble vertical sort en haut");
  // Sur la toile de /view : une carte par équipement, un disque par voisin inconnu, le nom d'un port au-delà du bord.
  const canvas = document.getElementById("canvas");
  const node = (host) => canvas.withClass("node").find((g) => g.getAttribute("data-node") === host);
  assert.equal(node("sw-core-01").withClass("node-icon").length, 1, "une icône de type par carte");
  assert.equal(node("sw-core-01").withClass("icon-shade").length, 1, "en trois couches");
  assert.equal(node("sw-core-01").withClass("node-shape")[0].getAttribute("width") >= "1", true, "la carte est un rectangle");
  const graph = LD.app.graph;
  graph.state.showStubs = true;
  graph.render(true);
  const stub = canvas.withClass("node").find((g) => g.classList.contains("kind-stub"));
  assert.equal(!!stub, true, "la fixture a un voisin inconnu");
  assert.equal(stub.withClass("node-icon").length, 0, "un voisin inconnu reste un disque sans icône");
  assert.equal(stub.withClass("node-label")[0].getAttribute("text-anchor"), "middle");
  const horizontal = LD.geometry.chord({ x: 0, y: 0 }, { x: 400, y: 0 }, 0, [70, 70]);
  assert.equal(horizontal.ends[0].x >= 86 && horizontal.ends[1].x <= 314, true, "les noms de port à 16 unités du bord de la carte");
  assert.equal(LD.geometry.chord({ x: 0, y: 0 }, { x: 400, y: 0 }, 0).ends[0].x, 78, "sans boîte connue, comme avant");
});

test("une largeur de carte unique par run : la plus large, arrondie à deux carreaux de grille ; le placement la respecte", () => {
  const { LD, document } = load(page, page.data);
  const model = LD.app.model;
  const cards = model.nodes.filter((n) => n.kind !== "stub");
  const natural = cards.map((n) => LD.card.width(LD.card.displayName(n.hostname), LD.model.cardExtrasOf(model, n)));
  assert.equal(model.cardWidth % LD.card.WIDTH_STEP, 0, "un multiple de " + LD.card.WIDTH_STEP + " : les bords tombent sur la grille");
  assert.equal(model.cardWidth >= Math.max(...natural) && model.cardWidth < Math.max(...natural) + LD.card.WIDTH_STEP, true, "la plus large, arrondie au palier supérieur");
  assert.equal(LD.card.CARD_H % 20, 0, "la hauteur aussi est un multiple de la grille");
  assert.equal(LD.card.plan("SW", { role: null, stack: null }, 320).w, 320, "une largeur imposée est tenue");
  assert.equal(LD.card.plan("A-VERY-LONG…INDEED-YES", { role: null, stack: null }, 100).w > 100, true, "jamais plus étroite que son nom");
  assert.equal(LD.card.uniformWidth([]), LD.card.WIDTH_STEP * Math.ceil(LD.card.width("", { role: null, stack: null }) / LD.card.WIDTH_STEP), "une run sans carte : la carte minimale");
  const widths = new Set(document.getElementById("canvas").withClass("node").filter((g) => !g.classList.contains("kind-stub"))
    .map((g) => g.withClass("node-shape")[0].getAttribute("width")));
  assert.deepEqual(Array.from(widths).map(Number), [model.cardWidth], "toutes les cartes de /view ont la même largeur");
  // Deux cœurs tirés par les mêmes dix accès, cartes de 320 : aucun rectangle n'en recouvre un autre.
  const box = { w: 320, h: LD.card.CARD_H };
  const edges = [];
  for (let i = 0; i < 10; i += 1) edges.push(["core-a", "acc-" + i], ["core-b", "acc-" + i]);
  const placed = Array.from(LD.layout.run(["core-a", "core-b", ...Array.from({ length: 10 }, (_, i) => "acc-" + i)], edges, new Map(), { card: box }).values());
  for (let i = 0; i < placed.length; i += 1) for (let j = i + 1; j < placed.length; j += 1) {
    const dx = Math.abs(placed[i].x - placed[j].x), dy = Math.abs(placed[i].y - placed[j].y);
    assert.equal(dx >= box.w || dy >= box.h, true, `deux cartes se recouvrent : écart ${dx} × ${dy}`);
  }
});

test("le badge HA d'une carte : A ou P seulement là où le snapshot le dit (model.haBadge)", () => {
  const { LD } = load(page, page.data);
  const badge = LD.model.haBadge;
  assert.equal(badge("active_passive", "primary"), "A");
  assert.equal(badge("active_passive", "secondary"), "P");
  assert.equal(badge("other", "active"), "A");
  assert.equal(badge("other", "standby"), "P");
  assert.equal(badge("active_active", "primary"), "A", "en actif-actif, tous les membres transmettent");
  assert.equal(badge("active_active", "secondary"), "A");
  assert.equal(badge("other", "primary"), null, "primary hors actif-passif : on n'en déduit rien");
  assert.equal(badge("active_passive", "member"), null);
});

test("la scène (scene.ts) : visibles selon les filtres, placement en deux temps déterministe et sans chevauchement, ce qu'une sélection éclaire", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const base = { showStubs: false, showDiff: true, hiddenStatuses: new Set(), hide: [], only: null };
  const a = LD.scene.visible(model, base);
  assert.equal(a.nodes.every((n) => n.kind !== "stub"), true, "sans la bascule, aucun voisin inconnu");
  assert.equal(LD.scene.visible(model, { ...base, showStubs: true }).nodes.length > a.nodes.length, true, "les voisins inconnus s'ajoutent");
  assert.equal(LD.scene.visible(model, { ...base, hiddenStatuses: new Set(["confirmed"]) }).links.every((l) => l.status !== "confirmed"), true, "un statut masqué retire ses câbles");
  const first = LD.scene.placeScene(model, a.nodes, new Map(), new Map());
  const second = LD.scene.placeScene(model, a.nodes, new Map(), new Map());
  assert.deepEqual(clone(Object.fromEntries(first.positions)), clone(Object.fromEntries(second.positions)), "même dessin deux fois");
  assert.equal(first.fresh.size > 0, true, "un premier dessin a des places neuves");
  const memory = new Map();
  LD.scene.placeScene(model, a.nodes, new Map(), memory);
  assert.equal(LD.scene.placeScene(model, a.nodes, new Map(), memory).fresh.size, 0, "la mémoire tient : rien de neuf au second dessin");
  const points = Array.from(first.positions.values());
  let closest = Infinity;
  for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) closest = Math.min(closest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  assert.equal(closest >= LD.layout.IDEAL * 0.5, true, "deux équipements ne se chevauchent jamais : " + closest);
  const related = LD.scene.relatedTo(model, { kind: "node", id: "sw-core-01" });
  assert.equal(related.hosts.has("sw-core-01") && related.links.size > 0, true, "un équipement éclaire ses câbles");
  assert.equal(LD.scene.relatedToHosts(model, new Set(["sw-core-01", "sw-core-02"])).links.size >= 1, true, "deux cœurs éclairent les câbles entre eux");
  assert.equal(LD.scene.relatedTo(model, null).hosts.size, 0);
});

test("la pastille (pill.ts) : largeur à chasse fixe, jetons de vitesse, noms courts des port-channels, texte d'un faisceau", () => {
  const { LD } = load(page, page.data);
  const { pillWidth, speedToken, aggregateShort, beamPillText } = LD.pill;
  assert.equal(pillWidth("ACTIF"), 49);
  assert.equal(pillWidth("2", "icon"), 37, "icône + chiffre");
  assert.equal(pillWidth("10G", "dot"), 45);
  assert.deepEqual([100, 1000, 2500, 10000, 25000, 40000, 100000, 400000].map(speedToken), ["100M", "1G", "2.5G", "10G", "25G", "40G", "100G", "400G"]);
  assert.deepEqual(["port-channel10", "Port-channel1", "Po20", "Bundle-Ether3", "agg-core", "ae0"].map(aggregateShort), ["PO10", "PO1", "PO20", "BE3", "AGG-CORE", "AE0"]);
  const beam = (a, b, extra = {}) => ({ a: { aggregate: a }, b: { aggregate: b }, peerLink: false, mlags: [], ...extra });
  assert.equal(beamPillText(beam("port-channel10", "Port-channel10")), "PO10", "même numéro des deux côtés : un seul");
  assert.equal(beamPillText(beam("port-channel10", "port-channel20")), "PO10/PO20", "un numéro est local à son équipement : les deux");
  assert.equal(beamPillText(beam("Po20", "agg", { mlags: [{ raw: { mlag_id: 20 } }, { raw: { mlag_id: 21 } }] })), "MLAG 20+21");
  assert.equal(beamPillText(beam("Po10", "Po10", { peerLink: true })), "peer-link");
});

test("la vitesse (speed.ts) : une pastille par faisceau ou par paire, rien d'inventé, un désaccord en avertissement", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const groups = LD.speed.speedGroups(model, model.links);
  const byKey = new Map(groups.map((g) => [g.key.split("\u0000").join(" "), g]));
  assert.equal(byKey.get("beam:sw-core-01 port-channel10 sw-core-02 port-channel10").text, "2×10G", "le peer-link : deux câbles de 10G, une pastille");
  assert.equal(byKey.get("beam:fw-edge-01 agg-core sw-core-01 port-channel20").text, "10G");
  const wan = byKey.get("pair:rt-wan-01 sw-core-01");
  assert.equal(wan.text, "1G");
  assert.equal(wan.dashed, true, "un seul bout lu : pointillée");
  assert.equal(groups.every((g) => g.tone === "neutral"), true);
  assert.equal(groups.some((g) => g.links.some((l) => l.ghost)), false, "les fantômes n'ont pas de vitesse");
  // un modèle à la main : deux bouts qui diffèrent, un câble sans vitesse lue, un faisceau mixte, deux groupes sur une paire
  const itf = (hostname, name, speed, type = "physical") => [hostname + "\u0000" + name, { hostname, name, type, speed_mbps: speed }];
  const ends = (a, ia, b, ib) => ({ a: { hostname: a, interface: ia }, b: { hostname: b, interface: ib } });
  const beamX = { id: "bx", links: [] };
  const link = (id, e, extra = {}) => ({ id, pair: e.a.hostname + "|" + e.b.hostname, raw: { oper: "up" }, worst: null, beam: null, ghost: false, indexInPair: 0, pairCount: 1, ...e, ...extra });
  const links = [
    link("l1", ends("a", "e1", "b", "e1")),
    link("l2", ends("a", "e2", "c", "e2")),
    link("l3", ends("a", "e3", "d", "e3"), { beam: beamX, indexInPair: 0, pairCount: 3 }),
    link("l4", ends("a", "e4", "d", "e4"), { beam: beamX, indexInPair: 1, pairCount: 3 }),
    link("l5", ends("a", "e5", "d", "e5"), { indexInPair: 2, pairCount: 3, worst: "error" }),
  ];
  beamX.links = [links[2], links[3]];
  const hand = { ifaceByKey: new Map([itf("a", "e1", 10000), itf("b", "e1", 1000), itf("a", "e3", 10000), itf("d", "e3", 10000), itf("a", "e4", 1000), itf("d", "e4", 1000), itf("a", "e5", 10000), itf("d", "e5", 10000)]), ghostIfaceByKey: new Map() };
  const got = new Map(LD.speed.speedGroups(hand, links).map((g) => [g.key, g]));
  assert.equal(got.get("pair:a|b").text, "10G/1G", "les deux bouts, dans l'ordre du câble");
  assert.equal(got.get("pair:a|b").tone, "warning");
  assert.equal(got.has("pair:a|c"), false, "aucun bout lu : pas de pastille");
  assert.equal(got.get("beam:bx").text, "10G+1G", "un faisceau mixte, du plus rapide au plus lent");
  assert.equal(got.get("pair:a|d").worst, "error", "le point de gravité du câble entre dans sa pastille");
  assert.notEqual(got.get("beam:bx").t, got.get("pair:a|d").t, "deux groupes sur une paire : deux places le long de la courbe");
});

test("la place des pastilles de câble (tags.ts) : sur la courbe, ni sur une carte ni sur une autre pastille, déterministe", () => {
  const { LD } = load(page, page.data);
  const { placeTags, tagCenter, MIDDLE, NEAR_Q } = LD.tags;
  const p = { x: 0, y: 0 }, q = { x: 400, y: 0 };
  const card = (c) => ({ x: c.x - 80, y: c.y - 40, w: 160, h: 80 });
  const req = (id, prefer, w = 60) => ({ id, p, q, offset: 0, w, prefer });
  const got = placeTags([req("speed", MIDDLE), req("po", MIDDLE), req("mlag", NEAR_Q)], [card(p), card(q)]);
  assert.deepEqual({ ...got.get("speed") }, { t: 0.5, side: 0 }, "la première au milieu, sur la courbe");
  const po = got.get("po");
  assert.equal(po.side, 0, "la deuxième reste sur la courbe, à côté");
  assert.notEqual(po.t, 0.5);
  const rect = (id, w = 60) => { const c = tagCenter(p, q, 0, w, got.get(id)); return { x: c.x - w / 2, y: c.y - 10, w, h: 20 }; };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const all = ["speed", "po", "mlag"].map((id) => rect(id));
  all.forEach((a, i) => all.forEach((b, j) => { if (i < j) assert.equal(hit(a, b), false, "aucune pastille sur une autre"); }));
  all.forEach((a) => [card(p), card(q)].forEach((c) => assert.equal(hit(a, c), false, "aucune pastille sur une carte")));
  assert.ok(rect("mlag").x > 200, "une MLAG se lit près de l'équipement double-attaché");
  // un lien court : plus de place sur la courbe, la pastille se décale à côté
  const short = { x: 220, y: 0 };
  const crowded = placeTags([{ id: "a", p, q: short, offset: 0, w: 50, prefer: MIDDLE }, { id: "b", p, q: short, offset: 0, w: 50, prefer: MIDDLE }], [card(p), card(short)]);
  assert.equal(crowded.get("b").side !== 0, true, "à côté de la courbe quand elle est pleine");
  assert.ok(tagCenter(p, short, 0, 50, crowded.get("b")).y < 0, "vers le haut de l'écran");
  const twice = () => JSON.stringify(Array.from(placeTags([req("speed", MIDDLE), req("po", MIDDLE)], [card(p), card(q)])));
  assert.equal(twice(), twice(), "même entrée, mêmes places");
});

test("ce qu'un clic révèle (reveal.ts) : la patte, les autres pattes du même MLAG, le peer-link ; rien pour un équipement", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const ids = (set) => Array.from(set).map((id) => id.split("\u0000").join(" "));
  const leg = model.beams.find((b) => b.mlags.length && b.b.hostname === "sw-core-01");
  const shown = LD.reveal.reveal(model, { kind: "link", id: leg.links[0].id });
  assert.deepEqual(ids(shown.primary), ["fw-edge-01 agg-core sw-core-01 port-channel20"]);
  assert.deepEqual(ids(shown.sibling), ["fw-edge-01 agg-core sw-core-02 port-channel20"], "l'autre patte du vPC 20");
  assert.deepEqual(ids(shown.peer), ["sw-core-01 port-channel10 sw-core-02 port-channel10"]);
  const peer = model.beams.find((b) => b.peerLink);
  const alone = LD.reveal.reveal(model, { kind: "beam", id: peer.id });
  assert.deepEqual([alone.primary.size, alone.sibling.size, alone.peer.size], [1, 0, 0], "le peer-link ne révèle que lui");
  const node = LD.reveal.reveal(model, { kind: "node", id: "sw-core-01" });
  assert.equal(node.primary.size + node.sibling.size + node.peer.size, 0);
  const related = LD.scene.relatedTo(model, { kind: "link", id: leg.links[0].id });
  assert.equal(related.beams.has(shown.sibling.values().next().value), true, "la patte sœur ne s'estompe pas");
  assert.equal(related.hosts.has("sw-core-02"), true);
});

test("les annotations (annotations.ts) : boîte depuis l'ancre, écart inverse, retour à la ligne, grille, ligne de rappel, visibilité", () => {
  const { LD } = load(page);
  const A = LD.annotations;
  const style = A.DEFAULT_STYLE.note;
  const free = { id: "a1-1", anchor: { kind: "free", ref: null }, x: 100, y: 50, w: 220, h: 80, z: "front", locked: false, leader: false, content: { kind: "note", text: "x" }, style };
  assert.deepEqual(clone(A.frameOf(free, null)), { x: 100, y: 50, w: 220, h: 80 }, "libre : sa boîte");
  const onCard = { ...free, anchor: { kind: "device", ref: "sw-core-01" }, x: -110, y: -160 };
  const card = { kind: "device", center: { x: 400, y: 300 }, box: { w: 220, h: 80 } };
  assert.deepEqual(clone(A.frameOf(onCard, card)), { x: 290, y: 140, w: 220, h: 80 }, "attachée : relative au centre de la carte");
  assert.equal(A.frameOf(onCard, null), null, "sans ancre dessinée, pas de boîte");
  assert.deepEqual(clone(A.offsetOf(onCard, { x: 290, y: 140 }, card)), { x: -110, y: -160 }, "l'écart inverse");
  const onGroup = { ...free, anchor: { kind: "group", ref: "g2-1" }, x: 10, y: 10 };
  assert.deepEqual(clone(A.frameOf(onGroup, { kind: "group", frame: { x: 1000, y: 2000, w: 500, h: 300 } })), { x: 1010, y: 2010, w: 220, h: 80 }, "attachée à un groupe : relative à son coin");
  assert.deepEqual(clone(A.offsetOf(onGroup, { x: 1010, y: 2010 }, { kind: "group", frame: { x: 1000, y: 2000, w: 500, h: 300 } })), { x: 10, y: 10 });
  const lines = A.wrapText("Baie 12, rangée B, contact équipe réseau", 120, style);
  assert.equal(lines.length >= 2 && lines.every((l) => LD.card.textWidth(l, 13) <= 120), true, "chaque ligne tient dans la largeur : " + JSON.stringify(lines));
  assert.deepEqual(clone(A.wrapText("un\ndeux", 500, style)), ["un", "deux"], "un retour écrit est gardé");
  assert.equal(A.wrapText("abcdefghijklmnopqrstuvwxyz", 40, style).length > 1, true, "un mot trop long est coupé");
  const laid = A.layoutText("une ligne", { x: 0, y: 0, w: 220, h: 80 }, { ...style, text_align: "center", text_valign: "middle" });
  assert.equal(laid.anchor, "middle");
  assert.equal(laid.lines[0].x, 110);
  assert.equal(A.layoutText("a\nb\nc\nd\ne\nf\ng", { x: 0, y: 0, w: 220, h: 40 }, style).clipped, true, "ce qui dépasse est coupé, dit tel");
  assert.equal(A.fitCell("un texte vraiment trop long pour la colonne", 60, A.DEFAULT_STYLE.table).endsWith("…"), true);
  assert.deepEqual(clone(A.borderPoint({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 25 })), { x: 100, y: 25 }, "le bord d'une boîte vers un point");
  const leader = A.leaderOf({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 });
  assert.deepEqual(clone(leader), { x1: 100, y1: 25, x2: 300, y2: 25 }, "du bord de la boîte au bord de l'ancre");
  assert.equal(A.leaderOf({ x: 0, y: 0, w: 100, h: 50 }, { x: 50, y: 10, w: 100, h: 50 }), null, "qui se touchent : rien");
  assert.equal(A.shownWith(free, new Set(), new Set()), true, "libre : toujours");
  assert.equal(A.shownWith(onCard, new Set(["sw-core-01"]), new Set()), true);
  assert.equal(A.shownWith(onCard, new Set(), new Set()), false, "attachée à un équipement masqué : non dessinée");
  assert.equal(A.shownWith(onGroup, new Set(), new Set(["g2-1"])), true);
  assert.equal(A.summary({ ...free, content: { kind: "table", header: true, rows: [["VLAN", "nom"], ["10", "x"]] } }), "2 × 2 · VLAN | nom");
  assert.equal(A.summary({ ...free, content: { kind: "shape", shape: "ellipse", label: "WAN" } }), "ellipse · WAN");
});

test("le tableau (table.ts) : grille au prorata des poids, fusions, lignes et colonnes insérées ou retirées, frontières glissées", () => {
  const T = load(page).LD.table;
  const base = T.fresh([["a", "b", "c"], ["d", "e", "f"]]);
  assert.deepEqual(clone(T.grid(base, { w: 300, h: 60 })), { xs: [0, 100, 200, 300], ys: [0, 30, 60], columns: 3, rows: 2 }, "sans poids : égales");
  const weighted = { ...base, widths: [1, 1, 2], heights: [1, 3] };
  assert.deepEqual(clone(T.grid(weighted, { w: 400, h: 80 }).xs), [0, 100, 200, 400], "au prorata, la dernière frontière exactement au bout");
  assert.deepEqual(clone(T.grid(weighted, { w: 400, h: 80 }).ys), [0, 20, 80]);
  const merged = T.merge(base, { r0: 0, c0: 0, r1: 1, c1: 1 });
  assert.deepEqual(clone(merged.merges), [{ row: 0, col: 0, rows: 2, cols: 2 }]);
  const g = T.grid(merged, { w: 300, h: 60 });
  const visible = T.cells(merged, g);
  assert.deepEqual(clone(visible.map((c) => c.r + ":" + c.c)), ["0:0", "0:2", "1:2"], "les cellules couvertes ne se dessinent pas");
  assert.deepEqual([visible[0].w, visible[0].h, visible[0].text], [200, 60, "a"], "la fusion a la boîte de ses cellules, le texte du coin");
  assert.deepEqual(clone(T.cellAt(merged, g, 150, 45)), [0, 0], "un point dans la fusion désigne son coin");
  assert.deepEqual(clone(T.cellAt(merged, g, 250, 45)), [1, 2]);
  assert.equal(T.cellAt(merged, g, 350, 10), null, "hors du tableau : rien");
  assert.deepEqual(clone(T.rangeOf(merged, [1, 2], [0, 1])), { r0: 0, c0: 0, r1: 1, c1: 2 }, "une plage qui touche une fusion l'englobe");
  assert.equal(T.merge(base, { r0: 0, c0: 0, r1: 0, c1: 0 }), base, "une seule cellule ne se fusionne pas");
  assert.deepEqual(clone(T.split(merged, 1, 1).merges), [], "séparer depuis n'importe quelle cellule couverte");
  assert.equal(T.split(base, 0, 0), base);
  const grown = T.insertRow(merged, 1);
  assert.equal(grown.rows.length, 3);
  assert.deepEqual(clone(grown.rows[1]), ["", "", ""]);
  assert.deepEqual(clone(grown.merges), [{ row: 0, col: 0, rows: 3, cols: 2 }], "une fusion enjambée s'allonge");
  assert.deepEqual(clone(T.insertRow(merged, 0).merges), [{ row: 1, col: 0, rows: 2, cols: 2 }], "une fusion dessous se décale");
  assert.deepEqual(clone(T.insertRow(weighted, 2).heights), [1, 3, 2], "une ligne de plus prend le poids moyen");
  assert.deepEqual(clone(T.deleteRow(merged, 0).merges), [{ row: 0, col: 0, rows: 1, cols: 2 }], "une fusion réduite à une ligne de deux colonnes reste");
  assert.deepEqual(clone(T.deleteColumn(T.deleteRow(merged, 0), 1).merges), [], "réduite à une cellule, elle part");
  assert.deepEqual(clone(T.deleteRow(T.merge(base, { r0: 0, c0: 0, r1: 0, c1: 2 }), 1).merges), [{ row: 0, col: 0, rows: 1, cols: 3 }]);
  assert.equal(T.deleteRow(T.fresh([["x"]]), 0).rows.length, 1, "jamais la dernière ligne");
  const wider = T.insertColumn(weighted, 1);
  assert.deepEqual(clone(wider.rows[0]), ["a", "", "b", "c"]);
  assert.deepEqual(clone(wider.widths), [1, 1, 1, 2]);
  assert.deepEqual(clone(T.deleteColumn(wider, 1)), clone(weighted), "retirer ce qu'on a inséré rend le tableau d'avant");
  assert.equal(T.insertColumn(T.fresh([new Array(8).fill("")]), 0).rows[0].length, 8, "huit colonnes au plus");
  const resized = T.resizeColumn(base, T.grid(base, { w: 300, h: 60 }), 1, 50);
  assert.deepEqual(clone(resized.widths), [150, 50, 100], "les deux colonnes voisines se partagent, les poids deviennent les largeurs");
  assert.deepEqual(clone(T.resizeColumn(base, T.grid(base, { w: 300, h: 60 }), 1, 500).widths), [180, 20, 100], "jamais sous 20");
  assert.equal(T.resizeColumn(base, T.grid(base, { w: 300, h: 60 }), 0, 50), base, "le bord du tableau ne se glisse pas (les poignées le font)");
  assert.deepEqual(clone(T.resizeRow(base, T.grid(base, { w: 300, h: 60 }), 1, -5).heights), [25, 35]);
  assert.deepEqual(clone(T.grownBox(base, T.insertColumn(base, 3), { w: 300, h: 60 })), { w: 400, h: 60 }, "une colonne de plus : une piste moyenne de plus en largeur");
  assert.deepEqual(clone(T.grownBox(base, T.deleteRow(base, 0), { w: 300, h: 60 })), { w: 300, h: 30 }, "une ligne de moins : d'autant en hauteur");
  assert.deepEqual(clone(T.grownBox(base, T.setCell(base, 0, 0, "x"), { w: 300, h: 60 })), { w: 300, h: 60 }, "une cellule changée : rien");
  assert.equal(T.setCell(base, 1, 2, "z").rows[1][2], "z");
  assert.equal(base.rows[1][2], "f", "jamais de mutation");
});

test("les connecteurs (connectors.ts) : bouts résolus au bord des boîtes, tracés droit / coudé / courbe, courbure lue d'un glissé, pointes, orphelins, visibilité", () => {
  const { LD } = load(page);
  const C = LD.connectors;
  const boxA = { kind: "box", frame: { x: 0, y: 0, w: 100, h: 50 } }, boxB = { kind: "box", frame: { x: 300, y: 0, w: 100, h: 50 } };
  const straight = C.pathOf(boxA, boxB, "straight", 0);
  assert.deepEqual(clone([straight.a, straight.b]), [{ x: 100, y: 25 }, { x: 300, y: 25 }], "du bord d'une boîte au bord de l'autre");
  assert.equal(straight.d, "M100.0,25.0 L300.0,25.0");
  assert.deepEqual(clone(straight.mid), { x: 200, y: 25 });
  assert.deepEqual(clone(straight.dirB), { x: 1, y: 0 }, "la pointe d'arrivée regarde vers la droite");
  const point = { kind: "point", at: { x: 200, y: 200 } };
  const down = C.pathOf(boxA, point, "straight", 0);
  assert.equal(down.b.x === 200 && down.b.y === 200, true, "un bout libre est le point lui-même");
  assert.equal(down.a.y, 50, "le départ sort par le bas de la boîte vers un point dessous");
  const elbow = C.pathOf(boxA, boxB, "elbow", 0);
  assert.equal(elbow.d, "M100.0,25.0 L200.0,25.0 L200.0,25.0 L300.0,25.0", "coudé, à l'horizontale : deux coins sur le milieu");
  const elbowBent = C.pathOf(boxA, { kind: "point", at: { x: 300, y: 200 } }, "elbow", 30);
  assert.match(elbowBent.d, /^M100\.0,25\.0 L230\.0,25\.0 L230\.0,200\.0 L300\.0,200\.0$/, "la courbure décale le segment médian");
  assert.deepEqual(clone(elbowBent.mid), { x: 230, y: 112.5 });
  const curve = C.pathOf(boxA, boxB, "curve", 40);
  assert.match(curve.d, /^M97\.0,50\.0 Q200\.0,130\.0 303\.0,50\.0$/, "le tracé sort par le bas des boîtes (vers le contrôle) ; le contrôle est à deux fois la courbure de la corde");
  assert.deepEqual(clone(curve.mid), { x: 200, y: 90 }, "le milieu de l'arc s'écarte de la courbure");
  assert.equal(C.bendFrom(curve.a, curve.b, "curve", curve.mid), 40, "l'inverse sur le tracé lui-même");
  assert.equal(C.bendFrom({ x: 100, y: 25 }, { x: 300, y: 25 }, "curve", { x: 200, y: 65 }), 40, "l'inverse : la courbure depuis le milieu glissé");
  assert.equal(C.bendFrom({ x: 100, y: 25 }, { x: 300, y: 200 }, "elbow", { x: 230, y: 100 }), 30);
  assert.equal(C.pathOf(boxA, boxB, "curve", 0).d, straight.d, "une courbe sans courbure est droite");
  assert.equal(C.arrowHead({ x: 10, y: 0 }, { x: 1, y: 0 }, 10), "10.0,0.0 0.0,4.5 0.0,-4.5");
  assert.equal(C.headSize({ stroke_width: 2 }), 12);
  const model = { nodeByHost: new Map([["sw", { ghost: false }], ["old", { ghost: true }]]), groupById: new Map([["g1-1", { members: ["sw"] }], ["g1-2", { members: ["gone"] }]]), annotationById: new Map([["a1-1", {}], ["a1-2", {}]]), orphanAnnotations: [] };
  model.orphanAnnotations.push(model.annotationById.get("a1-2"));
  const line = (start, end) => ({ start, end });
  const free = { kind: "free", x: 0, y: 0 };
  assert.equal(C.isOrphan(model, line(free, { kind: "device", ref: "sw" })), false);
  assert.equal(C.isOrphan(model, line(free, { kind: "device", ref: "old" })), true, "un fantôme ne porte rien");
  assert.equal(C.isOrphan(model, line({ kind: "group", ref: "g1-2" }, free)), true, "un groupe sans membre présent");
  assert.equal(C.isOrphan(model, line({ kind: "annotation", ref: "a1-2" }, free)), true, "une annotation elle-même orpheline");
  assert.equal(C.isOrphan(model, line({ kind: "annotation", ref: "a1-1" }, { kind: "group", ref: "g1-1" })), false);
  assert.equal(C.shownWith(line({ kind: "device", ref: "sw" }, free), new Set(["sw"]), new Set(), new Set()), true);
  assert.equal(C.shownWith(line({ kind: "device", ref: "sw" }, { kind: "annotation", ref: "a1-1" }), new Set(["sw"]), new Set(), new Set()), false, "l'annotation du bout n'est pas dessinée");
  assert.deepEqual(clone(C.hostsOf(line({ kind: "device", ref: "sw" }, { kind: "device", ref: "fw" }))), ["sw", "fw"]);
  assert.equal(C.summary({ start: free, end: { kind: "device", ref: "sw" }, heads: { start: "none", end: "arrow" }, label: "WAN" }), "flèche · 0, 0 → équipement sw · WAN");
  assert.deepEqual(clone(C.reversed({ start: free, end: { kind: "device", ref: "sw" }, heads: { start: "none", end: "arrow" } })), { start: { kind: "device", ref: "sw" }, end: free, heads: { start: "arrow", end: "none" } });
  assert.deepEqual(clone(C.bbox([{ x: 10, y: 20 }, { x: -5, y: 40 }], 2)), { x: -7, y: 18, w: 19, h: 24 });
  // Les ancres (1.5.0) : le milieu de chaque côté ; la plus proche à portée d'un point ; le contour réel (coins arrondis,
  // ellipse) ; une ancre fixe sort perpendiculairement, et le coudé se décide entre les sorties (en équerre : un seul coin).
  const F = { x: 0, y: 0, w: 100, h: 50 };
  assert.deepEqual(clone(C.anchorsOf(F).map((a) => [a.side, a.at.x, a.at.y])), [["n", 50, 0], ["e", 100, 25], ["s", 50, 50], ["w", 0, 25]]);
  assert.deepEqual(clone(C.nearestAnchor(F, { x: 96, y: 28 }, 10)), { side: "e", at: { x: 100, y: 25 } });
  assert.equal(C.nearestAnchor(F, { x: 50, y: 20 }, 10), null, "trop loin de toute ancre");
  assert.deepEqual(clone(C.outlinePoint(F, { kind: "rect", rx: 0 }, { x: 200, y: 100 })), { x: 100, y: 50 }, "sans coin arrondi : le coin");
  assert.deepEqual(clone(C.outlinePoint(F, { kind: "rect", rx: 10 }, { x: 200, y: 100 })), { x: 96, y: 48 }, "coins arrondis : sur l'arc du coin, plus sur le coin fantôme");
  assert.deepEqual(clone(C.outlinePoint(F, { kind: "rect", rx: 10 }, { x: 200, y: 25 })), { x: 100, y: 25 }, "sur un côté plat, rien ne change");
  assert.deepEqual(clone(C.outlinePoint(F, { kind: "ellipse" }, { x: 200, y: 100 })), { x: 85, y: 43 }, "ellipse : sur la courbe");
  assert.deepEqual(clone(C.outlinePoint(F, { kind: "ellipse" }, { x: 50, y: 100 })), { x: 50, y: 50 });
  const east = { ...boxA, side: "e" }, west = { ...boxB, side: "w" };
  const anchored = C.pathOf(east, west, "elbow", 0);
  assert.equal(anchored.d, "M100.0,25.0 L124.0,25.0 L200.0,25.0 L200.0,25.0 L276.0,25.0 L300.0,25.0", "chaque ancre sort de 24, le coudé se décide entre les sorties");
  assert.deepEqual(clone([anchored.chord.a, anchored.chord.b, anchored.bendable]), [{ x: 124, y: 25 }, { x: 276, y: 25 }, true]);
  const square = C.pathOf(east, { kind: "box", frame: { x: 300, y: 200, w: 100, h: 50 }, side: "n" }, "elbow", 0);
  assert.equal(square.d, "M100.0,25.0 L124.0,25.0 L350.0,25.0 L350.0,176.0 L350.0,200.0", "en équerre : un seul coin, à l'aplomb de l'arrivée");
  assert.deepEqual(clone([square.mid, square.dirB, square.bendable]), [{ x: 350, y: 25 }, { x: 0, y: 1 }, false], "pas de segment médian : rien à courber ; la pointe arrive par le haut");
  const south = C.pathOf({ ...boxA, side: "s" }, boxB, "straight", 0);
  assert.deepEqual(clone(south.a), { x: 50, y: 50 }, "une ancre fixe est le point de départ, quel que soit le tracé");
  assert.deepEqual(clone(C.pathOf({ ...boxA, side: "auto" }, boxB, "straight", 0).a), { x: 100, y: 25 }, "auto = le contour vers l'autre bout");
  assert.equal(C.summary({ start: free, end: { kind: "device", ref: "sw", side: "e" }, heads: { start: "none", end: "arrow" }, label: "" }), "flèche · 0, 0 → équipement sw (droite)");
  assert.deepEqual(clone(C.attachedEnd("group", "g1-1")), { kind: "group", ref: "g1-1", side: "auto" }, "sans ancre dite : auto");
  assert.deepEqual(clone(C.SIDES), ["auto", "n", "e", "s", "w"]);
});

test("le modèle indexe les annotations et dit lesquelles sont orphelines ; la scène ne dessine que celles dont l'ancre est dessinée", { skip: !intentPage }, () => {
  const { LD } = load(intentPage, intentPage.data);
  const model = LD.app.model;
  assert.deepEqual(clone(Array.from(model.annotationById.keys())), ["a2-1", "a2-2", "a2-3"]);
  assert.deepEqual(clone(model.orphanAnnotations.map((a) => a.id)), ["a2-3"], "attachée à un hostname absent : orpheline, gardée");
  assert.deepEqual(clone((model.annotationsByHost.get("sw-core-01") || []).map((a) => a.id)), ["a2-2"]);
  const base = { showStubs: false, showDiff: true, hiddenStatuses: new Set(), hide: [], only: null };
  assert.deepEqual(clone(LD.scene.visible(model, base).annotations.map((a) => a.id)), ["a2-1", "a2-2"], "la libre et celle du cœur présent ; jamais l'orpheline");
  const hidden = LD.scene.visible(model, { ...base, hide: [LD.query.parseRule("^sw-core-01$")] });
  assert.deepEqual(clone(hidden.annotations.map((a) => a.id)), ["a2-1"], "l'équipement masqué emporte son annotation (A1)");
  assert.deepEqual(clone(LD.scene.visible(model, { ...base, showNotes: false }).annotations), [], "la couche éteinte");
  const related = LD.scene.relatedTo(model, { kind: "annotation", id: "a2-2" });
  assert.equal(related.hosts.has("sw-core-01") && related.annotations.has("a2-2"), true, "une annotation éclaire son ancre");
  assert.equal(LD.scene.relatedTo(model, { kind: "node", id: "sw-core-01" }).annotations.has("a2-2"), true, "et l'équipement, ses annotations");
  assert.deepEqual(clone(LD.model.tokenOf(model, { kind: "annotation", id: "a2-1" })), ["annotation", "a2-1"]);
  assert.deepEqual(clone(LD.model.selectionFromToken(model, "annotation", "a2-1")), { kind: "annotation", id: "a2-1" });
  assert.equal(LD.model.selectionFromToken(model, "annotation", "a9-9"), null);
  const lines = LD.tip.annotationLines(model.annotationById.get("a2-2"));
  assert.match(LD.tip.text(lines), /tableau · attachée à sw-core-01/);
  assert.match(LD.tip.text(lines), /annotation de alice/);
  // Les connecteurs (1.4.0) : indexés par bout, orphelin quand un bout vise un absent, dessinés avec leurs bouts, éclairés avec eux.
  assert.deepEqual(clone(Array.from(model.connectorById.keys())), ["c2-1", "c2-2"]);
  assert.deepEqual(clone((model.connectorsByRef.get("device\u0000sw-core-01") || []).map((c) => c.id)), ["c2-1"]);
  assert.deepEqual(clone(model.orphanConnectors.map((c) => c.id)), ["c2-2"], "un bout sur gone-host : orphelin");
  assert.deepEqual(clone(LD.scene.visible(model, base).connectors.map((c) => c.id)), ["c2-1"], "dessiné avec sa note et son cœur ; jamais l'orphelin");
  assert.deepEqual(clone(LD.scene.visible(model, { ...base, showNotes: false }).connectors), [], "la couche éteinte éteint aussi les connecteurs");
  assert.deepEqual(clone(hidden.connectors), [], "le cœur masqué emporte le connecteur qui y touche");
  assert.equal(LD.scene.relatedTo(model, { kind: "node", id: "sw-core-01" }).connectors.has("c2-1"), true, "l'équipement éclaire ses connecteurs");
  const fromLine = LD.scene.relatedTo(model, { kind: "connector", id: "c2-1" });
  assert.equal(fromLine.hosts.has("sw-core-01") && fromLine.annotations.has("a2-1") && fromLine.connectors.has("c2-1"), true, "un connecteur éclaire ses deux bouts");
  assert.deepEqual(clone(LD.model.tokenOf(model, { kind: "connector", id: "c2-1" })), ["connector", "c2-1"]);
  assert.deepEqual(clone(LD.model.selectionFromToken(model, "connector", "c2-1")), { kind: "connector", id: "c2-1" });
  assert.deepEqual(clone(LD.model.hostsOf(model, { kind: "connector", id: "c2-2" })), [], "l'équipement absent ne compte pas");
  assert.match(LD.tip.text(LD.tip.connectorLines(model.connectorById.get("c2-1"))), /flèche · annotation a2-1 → équipement sw-core-01 \(gauche\) · voir.*courbe.*connecteur de orhan/s);
  const tab = LD.app.model.intent.annotations.length;
  assert.equal(tab, 3);
});

// ---------------------------------------------------------------- le dessin de la bulle (critique du 2026-10-09, P2-7)

test("le dessin de la bulle (bubble.ts) : colonnes alignées, rythme, points et mots de gravité, taille, calage dans la zone visible, posée, dispose", () => {
  const { LD } = load(page, page.data);
  const model = LD.app.model;
  const svg = LD.dom.s("svg");
  const tip = LD.tip.create(svg);
  const blocks = LD.tip.linkLines(model, model.linkById.get(CORE_LINK));
  tip.show("k", () => blocks, 10, 10, { width: 1000, height: 700 });
  assert.equal(tip.group.getAttribute("class"), "tip on", "l'arrivée se joue à l'apparition");
  const box = tip.group.withClass("tip-box")[0];
  const w = Number(box.getAttribute("width")), h = Number(box.getAttribute("height"));
  assert.ok(w > 200 && h > 100, "une boîte mesurée");
  const labels = tip.group.withClass("tip-label");
  assert.deepEqual(clone(labels.map((t) => t.textContent)), ["vitesse", "duplex", "média", "état"]);
  const ys = labels.map((t) => Number(t.getAttribute("y")));
  assert.deepEqual(clone(ys.slice(1).map((y, i) => y - ys[i])), [23, 23, 23], "un rythme : 23 entre deux rangées");
  const plain = tip.group.withClass("tip-value").filter((t) => !["—", "up", "down"].includes(t.textContent)); // les états sont décalés par leur point
  assert.equal(new Set(plain.map((t) => Number(t.getAttribute("x")))).size, 2, "deux colonnes de valeurs, alignées sur deux x");
  assert.ok(tip.group.withClass("dot-ok").length >= 1 && tip.group.withClass("dot-danger").length >= 1, "l'état en point");
  assert.ok(tip.group.withClass("sev-warning").length >= 2, "la rangée visée par link_oper_mismatch teinte ses deux valeurs");
  assert.ok(tip.group.withClass("tip-sev").some((t) => t.textContent === "avertissement"), "la gravité d'un contrôle s'écrit");
  assert.ok(tip.group.withClass("tip-end-dot").length === 2 && tip.group.withClass("tip-end-dot").every((c) => /hue-/.test(c.getAttribute("class"))), "les deux points du câble ont une teinte");
  // le calage : en bas à droite d'une zone qui commence en (0,56), la bulle reste dedans
  tip.show("k2", () => blocks, 990, 690, { x: 0, y: 56, width: 1000, height: 644 });
  const [tx, ty] = tip.group.getAttribute("transform").match(/-?\d+/g).map(Number);
  assert.ok(tx >= 0 && tx + w <= 1000 && ty >= 56 && ty + h <= 700, "jamais hors de la zone visible : " + tip.group.getAttribute("transform"));
  // posée : le même élément, un autre point du pointeur, la bulle ne bouge pas
  tip.show("k2", () => blocks, 300, 300, { x: 0, y: 56, width: 1000, height: 644 });
  assert.equal(tip.group.getAttribute("transform"), `translate(${tx},${ty})`, "elle reste posée tant que l'élément ne change pas");
  tip.hide();
  assert.equal(tip.group.getAttribute("class"), "tip");
  tip.dispose();
  assert.equal(svg.childNodes.length, 0, "dispose retire la bulle du document");
  // la parité texte ↔ dessin : le premier mot de chaque ligne de `text()` est dessiné
  const tip2 = LD.tip.create(LD.dom.s("svg"));
  const nodeBlocks = LD.tip.nodeLines(model, model.nodeByHost.get("fw-edge-01"));
  tip2.show("n", () => nodeBlocks, 0, 0, { width: 1000, height: 700 });
  const drawn = tip2.group.all((n) => n.tagName === "text").map((t) => t.textContent.toLowerCase());
  LD.tip.text(nodeBlocks).split("\n").forEach((line) => { // `text()` écrit la gravité brute (`error`), le dessin son mot : on sonde le second jeton
    const probe = (line.includes(" · ") ? line.split(" · ")[1] : line).split(" ")[0].toLowerCase();
    assert.ok(drawn.some((t) => t.includes(probe)), "ligne dessinée : " + line);
  });
  assert.equal(LD.tip.clipName("a".repeat(40)).length, 36, "un nom trop long se raccourcit au milieu");
});
