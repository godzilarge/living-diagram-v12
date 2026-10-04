// Sonde E (2/2) : ce que la page dit des fantômes, sous le faux DOM des tests (`backend/tests/js/fakedom.js`).
// Usage : node docs/revues/sondes-2026-10-04-b3-diff/probe_viewer.js <dossier des pages écrites par probe_pages.py>
"use strict";

const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const { readPage, load } = require(path.join(ROOT, "backend", "tests", "js", "fakedom.js"));

const dir = process.argv[2];
const SEP = "\u0000";
const text = (node) => node.textContent.replace(/\s+/g, " ");
const first = (re, s) => { const m = re.exec(s); return m ? m[0] : null; };

// ---- Page 1 : câble et stub fantômes (la paire des tests du dépôt)
const p1 = readPage(path.join(dir, "diff-ghost-link.html"));
{
  const { LD, document } = load(p1, p1.data);
  const model = LD.app.model;
  console.log("--- E1 : page 1 au chargement (changements montrés, stubs masqués)");
  console.log("  barre d'outils :", first(/voisins inconnus \(\d+\)/, text(document.getElementById("graph-toolbar"))),
    "| état du graphe :", text(document.getElementById("graph-status")),
    "| en-tête :", first(/\d+ nœuds/, text(document.getElementById("run-counts"))));
  LD.app.graph.select({ kind: "node", id: "sw-core-02" });
  const live = model.linksByNode.get("sw-core-02").filter((l) => !l.ghost).length, ghosts = model.linksByNode.get("sw-core-02").length - live;
  console.log("  fiche sw-core-02 : câbles vivants", live, "+ fantômes", ghosts, "→ la fiche titre", first(/Câbles : \d+/, text(document.getElementById("inspector"))));

  const token = encodeURIComponent(JSON.stringify(["sw-core-02", "Ethernet1/3", "srv-hyp-07", "3c:ec:ef:12:34:56"]));
  const second = load(p1, p1.data, "#view=graph&link=" + token);
  const st2 = second.LD.app.graph.state;
  console.log("--- E2 : #link=<fantôme> à l'ouverture → sélection", JSON.stringify(st2.selection), "| showDiff", st2.showDiff, "| showStubs", st2.showStubs,
    "| éléments diff-removed dessinés", second.document.getElementById("canvas").withClass("diff-removed").length, "| adresse", second.location.hash);
  const third = load(p1, p1.data, "#view=graph&diff=0&link=" + token);
  const st3 = third.LD.app.graph.state;
  console.log("--- E3 : #diff=0&link=<fantôme> → sélection", JSON.stringify(st3.selection), "| showDiff", st3.showDiff,
    "| dessinés", third.document.getElementById("canvas").withClass("diff-removed").length, "| adresse", third.location.hash);

  LD.app.activate("diff");
  const rows = document.getElementById("view-diff").withClass("clickable").map(text);
  console.log("--- E4 : onglet Diff, ligne du câble retiré :", rows.find((r) => /retiré/.test(r) && /3c:ec:ef/.test(r)));
}

// ---- Page 2 : fw-edge-01 injoignable → ses interfaces sont des fantômes sur un nœud vivant
const p2 = readPage(path.join(dir, "diff-unreachable.html"));
{
  const { LD, document } = load(p2, p2.data);
  const model = LD.app.model;
  const key = ["fw-edge-01", "x1"].join(SEP);
  const itf = model.ifaceByKey.get(key);
  console.log("--- E5 : page 2, interfaces de fw-edge-01 dans cette run :", model.interfaces.filter((i) => i.hostname === "fw-edge-01").length,
    "| ifaceByKey(fw-edge-01, x1) →", itf ? { ghost: itf.ghost, oper_status: itf.oper_status, speed_mbps: itf.speed_mbps } : null);
  const link = model.links.find((l) => (l.a.hostname === "fw-edge-01" || l.b.hostname === "fw-edge-01") && !l.ghost);
  console.log("--- E6 : bulle du câble vivant", LD.model.endLabel(link.a), "↔", LD.model.endLabel(link.b), "(fantôme ?", link.ghost, ")");
  LD.tip.linkLines(model, link).forEach((line) => console.log("   ", line.map((c) => c.text).join(" | ")));
  LD.app.graph.select({ kind: "node", id: "fw-edge-01" });
  const sheet = text(document.getElementById("inspector"));
  console.log("--- E7 : fiche fw-edge-01 :", first(/collecte : \w+/, sheet), "|", first(/Interfaces : \d+/, sheet), "|", first(/ports physiques up sans câble \(\d+\)/, sheet),
    "| occurrences de « retiré » :", (sheet.match(/retiré/g) || []).length);
  const table = document.getElementById("inspector").all((n) => n.tagName === "tr").map(text).filter((r) => /^(x1|x2|ha1|agg-core)/.test(r));
  table.forEach((r) => console.log("    ligne :", r));
  LD.app.graph.select({ kind: "link", id: link.id });
  const linkSheet = text(document.getElementById("inspector"));
  console.log("--- E8 : fiche du câble vivant, carte du port fw-edge-01 :", first(/fw-edge-01 · x[12].{0,160}/, linkSheet));
}
