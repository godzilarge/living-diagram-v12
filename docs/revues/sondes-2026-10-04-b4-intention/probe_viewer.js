// Sonde C (Node, faux DOM des tests) : la couche d'intention dans la toile, cas que les tests ne couvrent pas.
// Lancée par probe_pages.py, qui construit les pages et pose LD_PAGE_* et LD_FAKEDOM dans l'environnement.
"use strict";

const { readPage, load } = require(process.env.LD_FAKEDOM);
const clone = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
const nodeOf = (canvas, host) => canvas.withClass("node").find((g) => g.getAttribute("data-node") === host);
const drag = (node, dx, dy) => { node.fire("pointerdown", { clientX: 10, clientY: 10 }); node.fire("pointermove", { clientX: 10 + dx, clientY: 10 + dy }); node.fire("pointerup", {}); };
const buttons = (root, re) => root.all((n) => n.tagName === "button" && re.test(n.textContent));
const pages = Object.fromEntries(["HOSTILE", "GHOST", "STUB", "MANY", "PLAIN"].map((k) => [k, readPage(process.env["LD_PAGE_" + k])]));

// Un écrivain dont on contrôle le serveur (ordre de traitement) et les réponses (ordre d'arrivée), séparément.
function deferredWriter(page, author) {
  const server = new Map(page.data.intent.pins.map((p) => [p.hostname, p]));
  let revision = page.data.intent.revision;
  const requests = [];
  const doc = () => ({ ...page.data.intent, revision, pins: Array.from(server.values()).sort((a, b) => (a.hostname < b.hostname ? -1 : 1)) });
  const writer = {
    author, requests, server, setAuthor(name) { writer.author = name; },
    save: (ops) => new Promise((resolve) => requests.push({ ops, resolve, answer: null })),
    process(i) { // le serveur applique la requête i
      requests[i].ops.forEach((op) => { if (op.op === "pin") server.set(op.hostname, { hostname: op.hostname, x: op.x, y: op.y, author, at: "2026-10-04T19:00:00Z" }); else server.delete(op.hostname); });
      revision += 1; requests[i].answer = { ok: true, intent: doc() };
    },
    answer(i) { requests[i].resolve(requests[i].answer); },
    fail(i, message) { requests[i].resolve({ ok: false, message }); },
    revision: () => revision,
  };
  return writer;
}

async function c1Hostile() {
  const page = pages.HOSTILE;
  const { LD, document } = load(page, page.data);
  LD.app.activate("intent");
  LD.app.graph.select({ kind: "node", id: "sw-core-01" });
  const foreign = document.body.all((n) => ["img", "b", "script"].includes(n.tagName) && !(n.getAttribute("id") || "").startsWith("ld-")).length; // hors les deux <script> propres de la page
  const host = page.data.intent.pins.find((p) => p.hostname.startsWith("</script")).hostname;
  const tab = document.getElementById("view-intent").textContent;
  const fiche = document.getElementById("inspector").textContent;
  console.log(`C1 chaînes hostiles : éléments img/b/script fabriqués ${foreign} · hostname verbatim dans l'onglet ${tab.includes(host)} · auteur verbatim dans l'onglet ${tab.includes("<b onclick=alert(2)>bob</b>")} et la fiche ${fiche.includes('"><script>alert(3)</script>')}`);
}

async function c2OutOfOrder() {
  const page = pages.PLAIN;
  const { LD, document } = load(page);
  const writer = deferredWriter(page, "alice");
  const app = LD.boot(clone(page.data), { writer });
  const canvas = document.getElementById("canvas");
  const node = nodeOf(canvas, "sw-core-02");
  drag(node, 80, 30);
  const p1 = clone(app.graph.state.positions.get("sw-core-02"));
  drag(node, 80, 30);
  const p2 = clone(app.graph.state.positions.get("sw-core-02"));
  writer.process(0); writer.process(1); // le serveur traite dans l'ordre d'envoi : son état final est p2
  writer.answer(1); await tick(); // la seconde réponse arrive la première
  writer.answer(0); await tick(); // puis la première (connexion plus lente)
  const shown = app.model.pinByHost.get("sw-core-02");
  const srv = writer.server.get("sw-core-02");
  const r = (p) => `(${Math.round(p.x)}, ${Math.round(p.y)})`;
  console.log(`C2 deux glissés, réponses dans le désordre : page pinByHost ${r(shown)} révision ${app.model.intent.revision} · serveur ${r(srv)} révision ${writer.revision()} · ligne d'état « ${document.getElementById("graph-status").textContent.split(" · ").pop()} »`);
  app.graph.resetPins();
  console.log(`C2 puis « replacer » : le nœud est placé à ${r(app.graph.state.positions.get("sw-core-02"))} (glissé 1 ${r(p1)}, glissé 2 ${r(p2)})`);
}

async function c3ResetWhilePending() {
  const page = pages.PLAIN;
  const { LD, document } = load(page);
  const writer = deferredWriter(page, "alice");
  const app = LD.boot(clone(page.data), { writer });
  const node = nodeOf(document.getElementById("canvas"), "sw-core-02");
  drag(node, 80, 30);
  app.graph.resetPins(); // « replacer » pendant l'enregistrement
  writer.process(0); writer.answer(0); await tick();
  const pin = app.model.pinByHost.get("sw-core-02"), pos = app.graph.state.positions.get("sw-core-02");
  const el = nodeOf(document.getElementById("canvas"), "sw-core-02");
  console.log(`C3 « replacer » pendant l'enregistrement : épingle enregistrée (${pin.x}, ${pin.y}) · nœud dessiné à (${Math.round(pos.x)}, ${Math.round(pos.y)}) · state.pinned ${app.graph.state.pinned.has("sw-core-02")} · classe pinned ${el.classList.contains("pinned")}`);
}

async function c4Failure() {
  const page = pages.PLAIN;
  const { LD, document } = load(page);
  const writer = deferredWriter(page, "alice");
  const app = LD.boot(clone(page.data), { writer });
  const canvas = document.getElementById("canvas");
  drag(nodeOf(canvas, "sw-core-02"), 80, 30);
  writer.fail(0, "l'API ne répond pas"); await tick();
  app.activate("intent");
  const text = document.getElementById("view-intent").textContent;
  console.log(`C4 enregistrement refusé : state.pinned garde le local ${app.graph.state.pinned.has("sw-core-02")} · ligne d'état « ${document.getElementById("graph-status").textContent.split(" · ").pop()} » · onglet « Déplacements locaux non enregistrés : ${(text.match(/Déplacements locaux non enregistrés : (\d+)/) || [])[1]} »`);
  // Un glissé pendant qu'un autre est en attente, puis la première réponse arrive : le second local survit-il ?
  const page2 = pages.PLAIN;
  const w2 = deferredWriter(page2, "alice");
  const two = load(page2);
  const app2 = two.LD.boot(clone(page2.data), { writer: w2 });
  const cv = two.document.getElementById("canvas");
  drag(nodeOf(cv, "sw-core-02"), 80, 30);
  drag(nodeOf(cv, "fw-edge-01"), 80, 30);
  w2.process(0); w2.answer(0); await tick();
  console.log(`C4bis réponse du 1er glissé pendant que le 2e attend : state.pinned a fw-edge-01 ${app2.graph.state.pinned.has("fw-edge-01")} · classe pinned ${nodeOf(cv, "fw-edge-01").classList.contains("pinned")}`);
  w2.fail(1, "l'API ne répond pas"); await tick();
  console.log(`C4bis puis le 2e échoue : state.pinned a fw-edge-01 ${app2.graph.state.pinned.has("fw-edge-01")} · onglet dit ${(two.document.getElementById("view-intent").textContent.match(/Déplacements locaux non enregistrés : (\d+)/) || ["", "(onglet non ouvert)"])[1]} local`);
}

async function c5Ghost() {
  const page = pages.GHOST;
  const { LD, document } = load(page, page.data);
  const state = LD.app.graph.state;
  state.showStubs = true; LD.app.graph.render(true);
  const el = nodeOf(document.getElementById("canvas"), "srv-hyp-07");
  const pos = state.positions.get("srv-hyp-07");
  LD.app.activate("intent");
  const row = document.getElementById("view-intent").textContent.includes("orpheline : équipement absent de cette run");
  LD.app.graph.select({ kind: "node", id: "srv-hyp-07" });
  const fiche = document.getElementById("inspector").textContent;
  console.log(`C5 fantôme du diff épinglé : orphanPins ${clone(LD.app.model.orphanPins.map((p) => p.hostname))} · dessiné ${!!el} avec classe pinned ${el && el.classList.contains("pinned")} à (${pos && Math.round(pos.x)}, ${pos && Math.round(pos.y)}) · onglet « orpheline » ${row} · fiche du fantôme : « place voulue » ${fiche.includes("place voulue")}, bouton « retirer l'épingle » ${buttons(document.getElementById("inspector"), /^retirer l'épingle$/).length}`);
}

async function c6Stub() {
  const page = pages.STUB;
  const { LD, document } = load(page, page.data);
  const state = LD.app.graph.state;
  const before = state.positions.has("srv-hyp-07");
  const box = document.getElementById("t-stubs");
  box.checked = true; box.fire("change", { target: box });
  const el = nodeOf(document.getElementById("canvas"), "srv-hyp-07");
  const pos = state.positions.get("srv-hyp-07");
  console.log(`C6 stub épinglé, masqué puis réaffiché : placé avant ${before} · après : dessiné ${!!el}, classe pinned ${el && el.classList.contains("pinned")}, à (${Math.round(pos.x)}, ${Math.round(pos.y)}) · orphelines ${LD.app.model.orphanPins.length}`);
}

async function c7Chips() {
  const page = pages.PLAIN;
  const { LD, document } = load(page);
  const writer = deferredWriter(page, "alice");
  const app = LD.boot(clone(page.data), { writer });
  document.getElementById("c-confirmed").fire("click", {});
  const before = document.getElementById("c-confirmed").getAttribute("aria-pressed");
  drag(nodeOf(document.getElementById("canvas"), "sw-core-02"), 80, 30);
  writer.process(0); writer.answer(0); await tick();
  const after = document.getElementById("c-confirmed").getAttribute("aria-pressed");
  console.log(`C7 statut « confirmé » masqué puis une épingle enregistrée : aria-pressed avant ${before}, après ${after} · hiddenStatuses ${clone(Array.from(app.graph.state.hiddenStatuses))}`);
}

async function c8Many() {
  const page = pages.MANY;
  const { LD, document } = load(page);
  const writer = deferredWriter(page, "alice");
  const app = LD.boot(clone(page.data), { writer });
  app.activate("intent");
  const view = document.getElementById("view-intent");
  buttons(view, /^retirer toutes les épingles \(501\)$/)[0].fire("click", {});
  buttons(view, /^confirmer : retirer toutes/)[0].fire("click", {});
  console.log(`C8 « retirer toutes » sur 501 épingles : ${writer.requests.length} requête(s) de ${writer.requests[0].ops.length} opérations (l'API en admet 500)`);
}

async function c9DoubleClick() {
  const page = pages.PLAIN;
  const { LD, document } = load(page);
  const writer = deferredWriter(page, "alice");
  const app = LD.boot(clone(page.data), { writer });
  app.activate("intent");
  const view = document.getElementById("view-intent");
  const remove = buttons(view, /^retirer$/);
  remove[0].fire("click", {}); remove[0].fire("click", {});
  console.log(`C9 « retirer » cliqué deux fois avant la réponse : ${writer.requests.length} requêtes ${JSON.stringify(writer.requests.map((r) => r.ops))}`);
  writer.setAuthor("x".repeat(100));
  drag(nodeOf(document.getElementById("canvas"), "sw-core-02"), 80, 30);
  console.log(`C9bis nom de 100 caractères : la page envoie quand même (${writer.requests.length} requêtes ; l'API refuse au-delà de 80)`);
}

(async () => {
  for (const probe of [c1Hostile, c2OutOfOrder, c3ResetWhilePending, c4Failure, c5Ghost, c6Stub, c7Chips, c8Many, c9DoubleClick]) {
    try { await probe(); } catch (error) { console.log(`${probe.name} : exception ${error && error.stack ? error.stack.split("\n").slice(0, 3).join(" | ") : error}`); }
  }
})();
