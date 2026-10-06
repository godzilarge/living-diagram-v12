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
