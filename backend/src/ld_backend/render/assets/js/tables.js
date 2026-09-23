// Les trois vues en tableaux : contrôles, qualité des données (la boucle de retour vers l'exportateur), sources.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { h, clear, severityPill, statusPill, sourcePill, pill, plain, definition, table } = LD.dom;
  const QUALITY_CODES = ["description_unparseable", "description_disagrees_with_observed", "neighbor_unknown", "neighbor_name_ambiguous",
    "neighbor_name_case_differs", "neighbor_resolved_by_reported_hostname", "neighbor_resolved_by_address", "remote_port_is_mac",
    "remote_port_is_aggregate", "one_way_observation", "multiple_observed_neighbors", "self_observation"];

  // Ce qu'un contrôle vise, sous une forme cliquable : un câble ou un équipement du graphe.
  function targetsOf(model, check) {
    return check.refs.map((ref) => {
      if (ref.kind === "link") return { label: LD.model.endLabel(ref.a) + " ↔ " + LD.model.endLabel(ref.b), selection: { kind: "link", id: LD.model.linkId(ref) } };
      if (ref.kind === "cluster") return { label: "cluster " + ref.members.join(" + "), selection: { kind: "node", id: ref.members[0] } };
      const label = ref.name ? ref.hostname + " · " + ref.name : ref.hostname;
      return { label, selection: { kind: "node", id: ref.hostname } };
    }).filter((target) => target.selection.kind === "node" ? model.nodeByHost.has(target.selection.id) : model.linkById.has(target.selection.id));
  }

  function targetCell(model, check, onSelect) {
    const targets = targetsOf(model, check);
    if (!targets.length) return plain(check.refs.map((r) => r.hostname || ""));
    return targets.map((t) => h("button", { class: "linklike", type: "button", onclick: () => onSelect(t.selection) }, t.label));
  }

  function checkRows(model, checks, onSelect) {
    return checks.map((check) => ({ cells: [severityPill(check.severity), h("code", {}, check.code), targetCell(model, check, onSelect),
      Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : "",
      check.origin === "bundle" ? "contrat d'entrée" : (model.catalogue[check.code] || {}).rule || ""] }));
  }

  function checksView(container, model, onSelect) {
    const state = { severity: "", code: "", text: "" };
    const codes = Array.from(new Set(model.checks.map((c) => c.code))).sort();
    const body = h("div", {});
    const draw = () => {
      const text = state.text.trim().toLowerCase();
      const rows = model.checks.filter((c) => (!state.severity || c.severity === state.severity) && (!state.code || c.code === state.code)
        && (!text || JSON.stringify([c.refs, c.details]).toLowerCase().includes(text)));
      clear(body).appendChild(h("p", { class: "muted" }, rows.length + " contrôle" + (rows.length > 1 ? "s" : "") + " sur " + model.checks.length));
      body.appendChild(table(["sévérité", "code", "vise", "détails", "règle"], checkRows(model, rows, onSelect), { empty: "aucun contrôle ne correspond" }));
    };
    const select = (id, label, values, key) => h("label", { class: "field" }, label,
      h("select", { id, onchange: (e) => { state[key] = e.target.value; draw(); } }, h("option", { value: "" }, "tous"), values.map((v) => h("option", { value: v }, v))));
    clear(container).appendChild(h("div", { class: "page" },
      h("h2", {}, "Contrôles"),
      h("p", { class: "lead" }, "Un désaccord n'est jamais résolu en silence : il devient un contrôle. Cliquer une cible l'ouvre dans le graphe."),
      h("div", { class: "filters" }, select("f-severity", "sévérité", ["error", "warning", "info"], "severity"), select("f-code", "code", codes, "code"),
        h("label", { class: "field" }, "contient", h("input", { id: "f-text", type: "search", placeholder: "hostname, port…", oninput: (e) => { state.text = e.target.value; draw(); } }))),
      glossary(model, codes), body));
    draw();
  }

  function glossary(model, codes) {
    if (!codes.length) return null;
    return h("details", { class: "glossary" }, h("summary", {}, "Sens des " + codes.length + " codes présents"),
      definition(codes.map((code) => [code, (model.catalogue[code] || {}).meaning || "(constat du contrat d'entrée)"])));
  }

  function coverageTable(model) {
    const topics = model.coverage.length ? Object.keys(model.coverage[0].topics) : [];
    return table(["équipement", "collecte", ...topics], model.coverage.map((c) => ({
      cells: [c.hostname, pill("collection", c.status, c.status), ...topics.map((t) => pill("topic", c.topics[t], c.topics[t]))] })), { empty: "aucun équipement dans le périmètre" });
  }

  function findingsTable(model) {
    if (!model.ingest) return h("p", { class: "muted" }, "Rapport d'ingestion non disponible pour cette page.");
    return table(["code", "équipement", "objet", "détails", "message"], model.ingest.findings.map((f) => ({
      cells: [h("code", {}, f.code), f.hostname || "", f.ref || "", plain(f.details), f.message] })), { empty: "aucun constat : la livraison respecte le contrat sans réserve" });
  }

  function counters(object, emptyText) {
    const entries = Object.entries(object || {});
    if (!entries.length) return h("p", { class: "muted" }, emptyText);
    return definition(entries.map(([k, v]) => [k, String(v)]));
  }

  function qualityView(container, model, onSelect) {
    const summary = model.ingest && model.ingest.summary;
    const dataChecks = model.checks.filter((c) => QUALITY_CODES.includes(c.code));
    const described = model.interfaces.filter((i) => i.description !== null && i.description !== "");
    clear(container).appendChild(h("div", { class: "page" },
      h("h2", {}, "Qualité des données"),
      h("p", { class: "lead" }, "Ce que la livraison dit d'elle-même et ce que B1 n'a pas su lire : de quoi corriger l'exportateur ou les descriptions d'interface."),
      h("h3", {}, "Couverture de la collecte, par équipement et par topic"), coverageTable(model),
      h("h3", {}, "La livraison"),
      summary ? definition(Object.entries(summary).filter(([k]) => k !== "residual_normalizations").map(([k, v]) => [k, String(v)])) : null,
      h("h3", {}, "Constats du contrat d'entrée"),
      h("p", { class: "muted" }, "Clés nullables oubliées (nullable_key_absent), interface locale inconnue, membre d'agrégat inconnu… Tout doit tendre vers zéro."),
      findingsTable(model),
      h("h3", {}, "Noms et descriptions que B1 a dû interpréter"),
      definition([["interfaces avec une description", described.length + " sur " + model.interfaces.length],
        ["descriptions non lues par la grammaire", String(model.report.unparseable_descriptions)],
        ["voisins finis en « inconnu »", model.report.unresolved_names.length ? model.report.unresolved_names.join(", ") : "aucun"]]),
      table(["sévérité", "code", "vise", "détails", "règle"], checkRows(model, dataChecks, onSelect), { empty: "aucun contrôle de nom ni de description" }),
      h("h3", {}, "Normalisations"),
      h("p", { class: "muted" }, "Résiduelles : ce que l'exportateur a dû normaliser lui-même (doit tendre vers zéro). Appliquées : ce que B1 a normalisé."),
      h("div", { class: "two" }, h("div", {}, h("h4", {}, "résiduelles (exportateur)"), counters(model.report.residual_normalizations, "aucune")),
        h("div", {}, h("h4", {}, "appliquées (B1)"), counters(model.report.applied_normalizations, "aucune")))));
  }

  function sourcesView(container, model, onSelect) {
    const state = { combo: null, text: "" };
    const body = h("div", {});
    const draw = () => {
      const text = state.text.trim().toLowerCase();
      const rows = model.links.filter((l) => (state.combo === null || (l.combo === state.combo.combo && l.status === state.combo.status))
        && (!text || (LD.model.endLabel(l.a) + " " + LD.model.endLabel(l.b)).toLowerCase().includes(text)));
      clear(body).appendChild(h("p", { class: "muted" }, rows.length + " câble" + (rows.length > 1 ? "s" : "") + (state.combo ? " · " + state.combo.combo + " · " : "")
        , state.combo ? h("button", { class: "linklike", type: "button", onclick: () => { state.combo = null; draw(); } }, "tout afficher") : null));
      body.appendChild(table(["bout a", "bout b", "statut", "sources", "état", "contrôles"], rows.map((link) => ({
        onclick: () => onSelect({ kind: "link", id: link.id }),
        cells: [LD.model.endLabel(link.a), LD.model.endLabel(link.b), statusPill(link.status), link.sources.map(sourcePill), link.raw.oper, link.checks.length ? String(link.checks.length) : ""] })), { empty: "aucun câble" }));
    };
    clear(container).appendChild(h("div", { class: "page" },
      h("h2", {}, "Sources des câbles"),
      h("p", { class: "lead" }, "Chaque câble est tracé par une ou plusieurs sources. LLDP et CDP observent, une description documente : l'observé dessine le lien, le documenté le commente."),
      table(["sources", "statut", "câbles"], model.combos.map((combo) => ({ onclick: () => { state.combo = combo; draw(); },
        cells: [combo.combo.split(" + ").map(sourcePill), statusPill(combo.status), String(combo.count)] })), { empty: "aucun câble" }),
      h("h3", {}, "Tous les câbles"),
      h("div", { class: "filters" }, h("label", { class: "field" }, "équipement ou port",
        h("input", { id: "s-text", type: "search", placeholder: "hostname, port…", oninput: (e) => { state.text = e.target.value; draw(); } }))),
      body));
    draw();
  }

  LD.tables = { checksView, qualityView, sourcesView, targetsOf };
})();
