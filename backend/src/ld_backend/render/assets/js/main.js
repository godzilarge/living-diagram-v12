// Démarrage : lit les données embarquées, monte l'en-tête, les onglets, la barre d'outils, le graphe.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { h, s, clear } = LD.dom;
  const TABS = [["graph", "Graphe"], ["structures", "Structures"], ["checks", "Contrôles"], ["quality", "Qualité des données"], ["sources", "Sources"]];
  const STATUSES = ["confirmed", "observed_only", "documented_only"];

  function toggleStatus(graph, status, st) {
    const hidden = graph.state.hiddenStatuses;
    if (hidden.has(st)) hidden.delete(st); else hidden.add(st);
    status(graph.render(true));
  }

  // L'en-tête : l'identité de la run sur une ligne, ses métadonnées sur une seconde ; puis les comptes en trois groupes,
  // dont les statuts (bascules, comme la légende) et les sévérités (ouvrent les contrôles filtrés). Rien n'y est inerte.
  function header(model, graph, status, openChecks) {
    const run = model.source.run, source = model.source;
    const meta = clear(document.getElementById("run-meta"));
    meta.appendChild(h("div", { class: "run-line" }, h("strong", {}, source.infrastructure), " · run ", h("code", {}, source.collector_run_id)));
    meta.appendChild(h("div", { class: "run-detail" }, "collecte du " + run.start_datetime + (run.end_datetime ? " au " + run.end_datetime : "") + " (" + run.status + ")",
      " · bundle ", h("code", {}, source.bundle_sha256.slice(0, 12)), " · ", h("span", { class: "file" }, model.origin)));
    const count = (map, key) => map.get(key) || 0;
    const statusChip = (st) => h("button", { type: "button", id: "c-" + st, class: "chip pill status-" + st, "aria-pressed": "true", title: "afficher ou masquer ces câbles",
      onclick: () => toggleStatus(graph, status, st) }, count(model.statusCounts, st) + " " + LD.dom.STATUS_LABEL[st]);
    const severityChip = (sev) => h("button", { type: "button", id: "c-" + sev, class: "chip pill severity-" + sev, title: "ouvrir les contrôles " + sev,
      onclick: () => openChecks(sev) }, count(model.severityCounts, sev) + " " + sev);
    clear(document.getElementById("run-counts")).appendChild(h("div", { class: "chips" },
      h("span", { class: "chip-group" }, h("span", { class: "chip" }, model.nodes.length + " nœuds"), h("span", { class: "chip" }, model.links.length + " câbles")),
      h("span", { class: "chip-group" }, STATUSES.map(statusChip)),
      h("span", { class: "chip-group" }, ["error", "warning", "info"].map(severityChip))));
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
      h("button", { type: "button", id: "t-legend", "aria-pressed": "true", title: "afficher ou masquer la légende", onclick: (e) => {
        const legend = document.getElementById("graph-legend");
        legend.hidden = !legend.hidden;
        e.target.setAttribute("aria-pressed", legend.hidden ? "false" : "true");
      } }, "légende"),
      h("button", { type: "button", title: "oublie les déplacements faits à la main", onclick: () => status(graph.resetPins()) }, "replacer"),
      h("span", { class: "muted", id: "graph-status" })));
  }

  // La légende, en groupes nommés : chaque entrée a son nuancier, rien n'y est de la prose (l'aide est dans la vue d'ensemble).
  function legend(model, graph, status) {
    const item = (st) => h("button", { type: "button", id: "l-" + st, class: "legend-item status-" + st, "aria-pressed": "true", title: "afficher ou masquer ces câbles",
      onclick: () => toggleStatus(graph, status, st) }, h("span", { class: "swatch" }), LD.dom.STATUS_LABEL[st]);
    const span = (cls) => h("span", { class: cls });
    const note = (swatch, text, title) => h("span", { class: "legend-note", title: title || null }, swatch, text);
    const group = (name, ...items) => h("span", { class: "legend-group" }, h("span", { class: "group-name" }, name), items);
    const icon = (type) => s("svg", { class: "legend-icon", viewBox: "0 0 16 16", "aria-hidden": "true" }, s("path", { d: LD.icons.path(type) }));
    clear(document.getElementById("graph-legend")).appendChild(h("div", { class: "legend-row" },
      group("câbles", STATUSES.map(item), note(span("swatch down"), "down (estompé)")),
      group("contrôles", note(span("dot severity-warning"), "warning"), note(span("dot severity-error"), "error")),
      group("structures", note(span("band"), "faisceau"), note(span("band degraded"), "dégradé"), note(span("frame"), "cluster HA"),
        note(span("halo"), "heartbeat"), note(span("role-swatch lead"), "forwarde", "rôle HA active, ou primary en active_passive"),
        note(span("role-swatch follow"), "en attente", "rôle HA standby, ou secondary en active_passive")),
      group("équipements", note(span("box external"), "autre infra"), note(span("box unreachable"), "injoignable"),
        note(span("box partial"), "collecte partielle"), note(span("box not_collected"), "non collecté"), note(span("box stub"), "voisin inconnu")),
      group("types", LD.icons.TYPES.map((type) => note(icon(type), LD.icons.LABEL[type])))));
  }

  // Les onglets portent leurs comptes : on sait ce qu'il y a derrière sans les ouvrir.
  function tabs(activate, model) {
    const counts = { structures: model.aggregates.length, checks: model.checks.length, sources: model.links.length };
    const bar = clear(document.getElementById("tabs"));
    TABS.forEach(([id, label]) => bar.appendChild(h("button", { type: "button", role: "tab", id: "tab-" + id, "aria-selected": "false", "aria-controls": "view-" + id,
      onclick: () => activate(id) }, label, id in counts ? h("span", { class: "tab-count" }, " · " + counts[id]) : null)));
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
    const token = LD.model.tokenOf(model, graph.state.selection);
    if (token) parts.push(token[0] + "=" + encodeURIComponent(token[1]));
    history.replaceState(null, "", "#" + parts.join("&"));
  }

  function boot(data) {
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
      const live = document.getElementById("live");
      if (live) live.textContent = LD.inspect.describe(model, selection);
      if (graph) writeHash(view, graph, model);
    };
    const status = (counts) => {
      const shown = counts || { nodes: graph.state.nodeEls.size, links: graph.state.linkEls.size };
      const hidden = []; // dire ce qui est masqué et pourquoi : l'en-tête annonce le total, le graphe peut en montrer moins
      const stubs = model.nodes.length - shown.nodes;
      if (stubs > 0) hidden.push(stubs + (stubs > 1 ? " voisins inconnus masqués" : " voisin inconnu masqué"));
      if (graph.state.hiddenStatuses.size) hidden.push("statuts masqués : " + Array.from(graph.state.hiddenStatuses).map((st) => LD.dom.STATUS_LABEL[st]).join(", "));
      document.getElementById("graph-status").textContent = shown.nodes + " nœuds sur " + model.nodes.length + " et " + shown.links + " câbles sur "
        + model.links.length + " affichés" + (hidden.length ? " · " + hidden.join(" · ") : "");
      const box = document.getElementById("t-stubs");
      if (box) box.checked = graph.state.showStubs; // un élément ouvert depuis une table peut avoir rallumé un filtre
      STATUSES.forEach((st) => ["l-", "c-"].forEach((prefix) => {
        const el = document.getElementById(prefix + st);
        if (el) el.setAttribute("aria-pressed", graph.state.hiddenStatuses.has(st) ? "false" : "true");
      }));
      const ports = document.getElementById("t-ports");
      if (ports) ports.checked = graph.state.showPorts;
      writeHash(view, graph, model);
    };

    graph = LD.graph.create(document.getElementById("canvas"), model, onSelect);
    const openChecks = (severity) => { activate("checks"); if (LD.tables.setChecksSeverity) LD.tables.setChecksSeverity(severity); };
    header(model, graph, status, openChecks);
    tabs(activate, model);
    toolbar(model, graph, status);
    legend(model, graph, status);
    // Sur une toile étroite, la carte de légende recouvrirait le graphe : masquée par défaut, le bouton la rappelle.
    if (typeof matchMedia === "function" && matchMedia("(max-width: 1199px)").matches) {
      document.getElementById("graph-legend").hidden = true;
      document.getElementById("t-legend").setAttribute("aria-pressed", "false");
    }
    // Applique l'adresse : au démarrage, puis chaque fois qu'elle est modifiée à la main dans une page ouverte.
    const applyHash = (first) => {
      const wanted = readHash();
      const stubs = wanted.get("stubs") === "1";
      const redraw = first || stubs !== graph.state.showStubs;
      graph.state.showStubs = stubs;
      graph.state.showPorts = wanted.get("ports") === "1";
      if (redraw) graph.render(!first);
      const kind = LD.model.SELECTION_KINDS.find((name) => wanted.has(name) && LD.model.selectionFromToken(model, name, wanted.get(name)));
      if (kind) graph.reveal(LD.model.selectionFromToken(model, kind, wanted.get(kind)));
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
      const data = JSON.parse(document.getElementById("ld-data").textContent);
      if (data.snapshot) LD.app = boot(data); // page autonome ; la coquille servie démarre depuis shell.js
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + error.message));
      throw error;
    }
  }
})();
