// Démarrage : lit les données embarquées, monte l'en-tête, les onglets, la barre d'outils, le graphe.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { h, clear, pill } = LD.dom;
  const TABS = [["graph", "Graphe"], ["checks", "Contrôles"], ["quality", "Qualité des données"], ["sources", "Sources"]];
  const STATUSES = ["confirmed", "observed_only", "documented_only"];

  function header(model) {
    const run = model.source.run;
    clear(document.getElementById("run-meta")).appendChild(h("div", {},
      h("strong", {}, model.source.infrastructure), " · run ", h("code", {}, model.source.collector_run_id),
      h("span", { class: "muted" }, " · collecte du " + run.start_datetime + (run.end_datetime ? " au " + run.end_datetime : "") + " (" + run.status + ")"
        + " · bundle " + model.source.bundle_sha256.slice(0, 12) + " · " + model.origin)));
    const count = (map, key) => map.get(key) || 0;
    clear(document.getElementById("run-counts")).appendChild(h("div", { class: "chips" },
      h("span", { class: "chip" }, model.nodes.length + " nœuds"), h("span", { class: "chip" }, model.links.length + " câbles"),
      STATUSES.map((st) => pill("status", st, count(model.statusCounts, st) + " " + LD.dom.STATUS_LABEL[st])),
      ["error", "warning", "info"].map((sev) => pill("severity", sev, count(model.severityCounts, sev) + " " + sev))));
  }

  function toolbar(model, graph, status) {
    const stubs = model.kindCounts.get("stub") || 0;
    const toggle = (id, label, key) => h("label", { class: "check-field" },
      h("input", { id, type: "checkbox", onchange: (e) => { graph.state[key] = e.target.checked; status(key === "showStubs" ? graph.render(false) : (graph.repaint(), null)); } }), label);
    clear(document.getElementById("graph-toolbar")).appendChild(h("div", { class: "toolbar-row" },
      toggle("t-stubs", "voisins inconnus (" + stubs + ")", "showStubs"), toggle("t-ports", "noms des ports", "showPorts"),
      h("input", { id: "t-search", type: "search", placeholder: "chercher un équipement", "aria-label": "chercher un équipement",
        oninput: (e) => { graph.state.query = e.target.value; graph.repaint(); } }),
      h("button", { type: "button", onclick: () => graph.fit() }, "recentrer"),
      h("button", { type: "button", title: "oublie les déplacements faits à la main", onclick: () => status(graph.resetPins()) }, "replacer"),
      h("span", { class: "muted", id: "graph-status" })));
  }

  function legend(model, graph, status) {
    const item = (st) => h("button", { type: "button", id: "l-" + st, class: "legend-item status-" + st, "aria-pressed": "true", title: "afficher ou masquer ces câbles",
      onclick: () => {
        const hidden = graph.state.hiddenStatuses;
        if (hidden.has(st)) hidden.delete(st); else hidden.add(st);
        status(graph.render(true));
      } }, h("span", { class: "swatch" }), LD.dom.STATUS_LABEL[st]);
    clear(document.getElementById("graph-legend")).appendChild(h("div", { class: "legend-row" },
      STATUSES.map(item),
      h("span", { class: "legend-note" }, h("span", { class: "dot severity-warning" }), "contrôle warning"),
      h("span", { class: "legend-note" }, h("span", { class: "dot severity-error" }), "contrôle error"),
      h("span", { class: "legend-note" }, "contour pointillé : autre infra · contour rouge : injoignable · orange : collecte partielle")));
  }

  function tabs(activate) {
    const bar = clear(document.getElementById("tabs"));
    TABS.forEach(([id, label]) => bar.appendChild(h("button", { type: "button", role: "tab", id: "tab-" + id, "aria-selected": "false", onclick: () => activate(id) }, label)));
  }

  // L'état de vue vit dans le fragment d'URL (#view=checks&node=sw-core-01) : une page ouverte sur un élément
  // se partage par son adresse. Principe du projet : l'URL est l'état de vue.
  // Le fragment est une entrée non fiable (un lien recopié, tronqué au milieu d'un %XX) : un paramètre illisible est
  // ignoré, il ne doit jamais empêcher la page de s'afficher.
  function readHash() {
    const wanted = new Map();
    if (typeof location === "undefined" || !location.hash) return wanted;
    for (const part of location.hash.slice(1).split("&")) {
      const cut = part.indexOf("=");
      if (cut <= 0) continue;
      try {
        wanted.set(part.slice(0, cut), decodeURIComponent(part.slice(cut + 1)));
      } catch (error) {
        continue;
      }
    }
    return wanted;
  }

  function writeHash(view, graph, model) {
    if (typeof history === "undefined" || typeof location === "undefined") return;
    const parts = ["view=" + view];
    if (graph.state.showStubs) parts.push("stubs=1");
    if (graph.state.showPorts) parts.push("ports=1");
    const selection = graph.state.selection;
    if (selection && selection.kind === "node") parts.push("node=" + encodeURIComponent(selection.id));
    if (selection && selection.kind === "link") parts.push("link=" + encodeURIComponent(LD.model.linkToken(model.linkById.get(selection.id))));
    history.replaceState(null, "", "#" + parts.join("&"));
  }

  function boot() {
    const data = JSON.parse(document.getElementById("ld-data").textContent);
    const model = LD.model.build(data);
    const inspector = document.getElementById("inspector");
    let graph = null;
    let view = "graph";
    const built = new Set();

    const activate = (id) => {
      view = id;
      if (graph) writeHash(view, graph, model);
      TABS.forEach(([tab]) => {
        document.getElementById("view-" + tab).hidden = tab !== id;
        document.getElementById("tab-" + tab).setAttribute("aria-selected", tab === id ? "true" : "false");
      });
      if (id !== "graph" && !built.has(id)) {
        built.add(id);
        LD.tables[id + "View"](document.getElementById("view-" + id), model, openInGraph);
      }
    };
    const openInGraph = (selection) => { activate("graph"); graph.reveal(selection); status(); };
    const onSelect = (selection) => {
      LD.inspect.show(inspector, model, selection, (next) => { graph.reveal(next); status(); });
      if (graph) writeHash(view, graph, model);
    };
    const status = (counts) => {
      const shown = counts || { nodes: graph.state.nodeEls.size, links: graph.state.linkEls.size };
      const hidden = []; // dire ce qui est masqué et pourquoi : l'en-tête annonce le total, le graphe peut en montrer moins
      if (shown.nodes < model.nodes.length) hidden.push((model.nodes.length - shown.nodes) + " voisins inconnus masqués");
      if (graph.state.hiddenStatuses.size) hidden.push("statuts masqués : " + Array.from(graph.state.hiddenStatuses).map((st) => LD.dom.STATUS_LABEL[st]).join(", "));
      document.getElementById("graph-status").textContent = shown.nodes + " nœuds sur " + model.nodes.length + " et " + shown.links + " câbles sur "
        + model.links.length + " affichés" + (hidden.length ? " · " + hidden.join(" · ") : "");
      const box = document.getElementById("t-stubs");
      if (box) box.checked = graph.state.showStubs; // un élément ouvert depuis une table peut avoir rallumé un filtre
      STATUSES.forEach((st) => document.getElementById("l-" + st).setAttribute("aria-pressed", graph.state.hiddenStatuses.has(st) ? "false" : "true"));
      const ports = document.getElementById("t-ports");
      if (ports) ports.checked = graph.state.showPorts;
      writeHash(view, graph, model);
    };

    header(model);
    tabs(activate);
    graph = LD.graph.create(document.getElementById("canvas"), model, onSelect);
    toolbar(model, graph, status);
    legend(model, graph, status);
    // Applique l'adresse : au démarrage, puis chaque fois qu'elle est modifiée à la main dans une page ouverte.
    const applyHash = (first) => {
      const wanted = readHash();
      const stubs = wanted.get("stubs") === "1";
      const redraw = first || stubs !== graph.state.showStubs;
      graph.state.showStubs = stubs;
      graph.state.showPorts = wanted.get("ports") === "1";
      if (redraw) graph.render(!first);
      const link = wanted.has("link") ? LD.model.linkFromToken(model, wanted.get("link")) : null;
      if (wanted.has("node") && model.nodeByHost.has(wanted.get("node"))) graph.reveal({ kind: "node", id: wanted.get("node") });
      else if (link) graph.reveal({ kind: "link", id: link.id });
      else graph.select(null);
      activate(TABS.some(([id]) => id === wanted.get("view")) ? wanted.get("view") : "graph");
      graph.repaint();
      status();
    };
    applyHash(true); // avant toute réécriture de l'adresse : `activate` et `select` la réécrivent
    if (typeof window !== "undefined") window.addEventListener("hashchange", () => applyHash(false));
    return { model, graph, activate, applyHash };
  }

  LD.boot = boot;
  if (typeof document !== "undefined" && document.getElementById("ld-data")) {
    try {
      LD.app = boot();
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + error.message));
      throw error;
    }
  }
})();
