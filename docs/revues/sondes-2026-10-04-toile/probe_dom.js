// Sonde B : équivalence du DOM produit par l'ancien script et par la toile construite, sous le faux DOM des tests.
// Pour chaque paire `<variante>-old.html` / `<variante>-new.html` de la sonde A, la même suite d'interactions est
// jouée des deux côtés (démarrage, chaque onglet, sélection d'un élément de chaque sorte, bascules, survol, clavier,
// adresse), puis l'arbre entier (balises, attributs, texte, dans l'ordre) est sérialisé et comparé ; les lignes de la
// bulle de chaque câble, équipement, faisceau et cluster sont comparées aussi, ainsi que les positions du placement.
// Lancer depuis la racine du dépôt, après la sonde A :
//     node docs/revues/sondes-2026-10-04-toile/probe_dom.js docs/revues/sondes-2026-10-04-toile/tmp
"use strict";

const path = require("node:path");
const { readPage, load } = require(path.resolve(__dirname, "../../../backend/tests/js/fakedom.js"));

const dir = process.argv[2] || path.join(__dirname, "tmp");
const VARIANTS = ["page", "hub", "aggstop", "unread", "diff", "unreachable"];

function serialize(node, depth = 0) {
  const attrs = Array.from(node.attributes).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ` ${k}="${v}"`).join("");
  const own = node.tagName === "#text" ? JSON.stringify(node.text) : `<${node.tagName}${attrs}${node.hidden ? " [hidden]" : ""}${node.checked ? " [checked]" : ""}>`;
  return [" ".repeat(depth) + own, ...node.childNodes.map((c) => serialize(c, depth + 1))].join("\n");
}

const joined = (lines) => lines.map((cells) => cells.map((cell) => (cell.cls || "") + ":" + cell.text).join("|")).join("\n");

function scenario(page, hash) {
  const { LD, document, location, go } = load(page, page.data, hash);
  const steps = [];
  const snap = (label) => steps.push(`=== ${label} · ${location.hash}\n${serialize(document.body)}`);
  snap("démarrage");
  const model = LD.app.model;
  ["structures", "checks", "quality", "sources", ...(model.diff ? ["diff"] : [])].forEach((id) => { LD.app.activate(id); snap("onglet " + id); });
  LD.app.activate("graph");
  const canvas = document.getElementById("canvas");
  const stubs = document.getElementById("t-stubs");
  stubs.checked = true; stubs.fire("change", { target: stubs }); snap("stubs");
  const ports = document.getElementById("t-ports");
  ports.checked = true; ports.fire("change", { target: ports }); snap("ports");
  const picks = [
    model.links[0] && { kind: "link", id: model.links[0].id },
    model.nodes[0] && { kind: "node", id: model.nodes[0].hostname },
    model.aggregates[0] && { kind: "aggregate", id: model.aggregates[0].key },
    model.beams[0] && { kind: "beam", id: model.beams[0].id },
    model.clusters[0] && { kind: "cluster", id: model.clusters[0].id },
    model.ghostLinks[0] && { kind: "link", id: model.ghostLinks[0].id },
    model.ghostNodes[0] && { kind: "node", id: model.ghostNodes[0].hostname },
  ].filter(Boolean);
  picks.forEach((sel) => { LD.app.graph.reveal(sel); snap("reveal " + sel.kind); });
  model.nodes.forEach((n) => { LD.app.graph.select({ kind: "node", id: n.hostname }); snap("node " + n.hostname); });
  model.links.forEach((l) => { LD.app.graph.select({ kind: "link", id: l.id }); snap("link " + l.id.replace(/\0/g, "/")); });
  document.getElementById("c-error").fire("click", {}); snap("chip error");
  document.getElementById("c-documented_only").fire("click", {}); snap("chip documented_only");
  const search = document.getElementById("t-search");
  search.value = "sw-"; search.fire("input", { target: search }); snap("recherche");
  const hit = canvas.withClass("link-hit")[0];
  if (hit) { canvas.fire("pointermove", { target: hit, clientX: 120, clientY: 90 }); snap("survol câble"); }
  const node = canvas.withClass("node")[0];
  if (node) {
    node.fire("pointerdown", { clientX: 10, clientY: 10 }); node.fire("pointermove", { clientX: 90, clientY: 40 }); node.fire("pointerup", {});
    snap("glissé");
    node.fire("focus", {}); snap("focus"); node.fire("blur", {}); snap("blur");
  }
  go("#view=graph&diff=0"); snap("adresse diff=0");
  go("#view=quality&node=" + encodeURIComponent(model.nodes[0].hostname)); snap("adresse node");
  // Les bulles de tout ce qui en a une, et le placement.
  const tips = [
    ...model.links.concat(model.ghostLinks).map((l) => "link " + l.id + "\n" + joined(LD.tip.linkLines(model, l))),
    ...model.nodes.concat(model.ghostNodes).map((n) => "node " + n.hostname + "\n" + joined(LD.tip.nodeLines(model, n))),
    ...model.beams.map((b) => "beam " + b.id + "\n" + joined(LD.tip.beamLines(b))),
    ...model.clusters.map((c) => "cluster " + c.id + "\n" + joined(LD.tip.clusterLines(c))),
  ].join("\n");
  const positions = JSON.stringify(Array.from(LD.app.graph.state.positions).sort());
  const summary = JSON.stringify({
    combos: model.combos, kinds: Array.from(model.kindCounts), statuses: Array.from(model.statusCounts), severities: Array.from(model.severityCounts),
    diffCount: model.diffCount, links: model.links.map((l) => [l.id, l.status, l.sources, l.checks.map((c) => c.code), l.portChecks.map((c) => c.code), l.worst, l.indexInPair, l.pairCount, l.heartbeat, !!l.beam]),
    beams: model.beams.map((b) => [b.id, b.peerLink, b.degraded, b.links.length, b.checks.map((c) => c.code)]),
    aggregates: model.aggregates.map((a) => [a.key, a.cables.length, a.checks.map((c) => c.code), a.worst]),
    clusters: model.clusters.map((c) => [c.id, c.checks.map((c) => c.code), c.heartbeats.map((h) => !!h.link)]),
  });
  return { dom: steps.join("\n"), tips, positions, summary };
}

function firstDifference(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) if (la[i] !== lb[i]) return `ligne ${i + 1}\n  old: ${la[i]}\n  new: ${lb[i]}`;
  return null;
}

let failed = 0;
for (const name of VARIANTS) {
  const oldPage = readPage(path.join(dir, `${name}-old.html`)), newPage = readPage(path.join(dir, `${name}-new.html`));
  for (const hash of ["", "#stubs=1&view=sources"]) {
    const a = scenario(oldPage, hash), b = scenario(newPage, hash);
    for (const part of ["dom", "tips", "positions", "summary"]) {
      const diff = firstDifference(a[part], b[part]);
      if (diff) { failed += 1; console.log(`DIFFÉRENT ${name} ${hash || "(sans adresse)"} ${part} : ${diff}`); }
    }
    console.log(`${name} ${hash || "(sans adresse)"} : DOM ${a.dom.split("\n").length} lignes, bulles ${a.tips.split("\n").length} lignes, positions ${a.positions.length} car.`);
  }
}
console.log(failed ? `${failed} différence(s)` : "ancien script et toile construite : DOM, bulles, placement et modèle identiques sur toutes les variantes");
process.exit(failed ? 1 : 0);
