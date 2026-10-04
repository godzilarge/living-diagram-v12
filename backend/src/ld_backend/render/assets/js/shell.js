// La coquille servie par le backend (`GET /view`) : le visualiseur sans données, qui lit une run par l'API.
// Le jeton se saisit ici, jamais dans l'adresse ; il est gardé dans sessionStorage (l'onglet, pas le disque) et
// voyage en Authorization. L'adresse porte la run (?infrastructure=&run_id=) et l'état de vue (#view=…).
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { h, clear, pill, table } = LD.dom;
  const TOKEN_KEY = "ld-api-token";
  const ROUTES = { runs: "/api/ingest/bundles", snapshot: "/api/snapshot", report: "/api/ingest/report", diff: "/api/diff" };

  function storage() {
    try { return globalThis.sessionStorage || null; } catch (error) { return null; }
  }
  function readToken() {
    try { const store = storage(); return (store && store.getItem(TOKEN_KEY)) || ""; } catch (error) { return ""; }
  }
  function writeToken(token) {
    try {
      const store = storage();
      if (store) { if (token) store.setItem(TOKEN_KEY, token); else store.removeItem(TOKEN_KEY); }
    } catch (error) { /* stockage indisponible : le jeton ne vit que le temps de la page */ }
  }

  const query = (name) => new URLSearchParams(location.search).get(name) || "";
  const withParams = (route, params) => route + "?" + new URLSearchParams(params).toString();

  async function call(route, params, token) {
    const response = await fetch(withParams(route, params), { headers: { Authorization: "Bearer " + token }, credentials: "omit" });
    let body = null;
    try { body = await response.json(); } catch (error) { body = null; }
    return { status: response.status, body };
  }

  function explain(status, body) {
    if (status === 401) return "jeton refusé par l'API";
    const detail = body && typeof body.detail === "string" ? body.detail : "";
    if (status === 404) return detail || "run inconnue pour cette infrastructure";
    return "l'API répond " + status + (detail ? " : " + detail : "");
  }

  function create(root, data) {
    const state = { token: readToken(), infrastructure: query("infrastructure"), runId: query("run_id"), from: query("from"), runs: null, message: null, busy: false, pending: null };
    const fields = {};

    const input = (id, label, type, value, placeholder) => h("label", { class: "field" }, label,
      fields[id] = h("input", { id, type, value, placeholder: placeholder || null, autocomplete: type === "password" ? "off" : null, spellcheck: "false" }));

    // La liste des runs est triée par début de collecte : « comparer avec la précédente » ouvre la run avec le diff
    // depuis celle d'avant (B3), la première n'en a pas.
    function runsTable() {
      if (!state.runs) return null;
      const compare = (run, index) => (index === 0 ? "—" : h("button", { type: "button", class: "linklike", onclick: (event) => {
        event.stopPropagation();
        state.runId = run.run_id; state.from = state.runs[index - 1].run_id; state.pending = open();
      } }, "avec la précédente"));
      return [h("h3", {}, "Runs archivées de " + state.infrastructure + " : " + state.runs.length),
        table(["run", "début de collecte", "statut", "ingérée le", "comparer"], state.runs.map((run, index) => ({
          onclick: () => { state.runId = run.run_id; state.from = ""; state.pending = open(); },
          cells: [h("code", {}, run.run_id), run.run_start, pill("run", run.run_status, run.run_status), run.stored_at, compare(run, index)] })),
          { empty: "aucune run archivée pour cette infrastructure" })];
    }

    // Tant que rien n'est chargé, seule la coquille est visible : les vues du visualiseur attendent leurs données.
    function siblings(hidden) {
      const parent = root.parentNode;
      (parent ? Array.from(parent.childNodes) : []).forEach((node) => {
        const id = node.getAttribute ? node.getAttribute("id") : null;
        if (node !== root && id && id.startsWith("view-")) node.hidden = hidden;
      });
    }

    function render() {
      root.hidden = false;
      siblings(true);
      clear(root).appendChild(h("div", { class: "page" },
        h("h2", {}, "Lire une run archivée"),
        h("p", { class: "lead" }, "Cette page lit le snapshot par l'API du backend. Le jeton d'API (LD_API_TOKEN) se saisit ici : il reste dans cet onglet et n'entre jamais dans l'adresse. L'adresse, elle, se partage : elle porte l'infrastructure, la run et l'état de vue."),
        h("form", { class: "shell-form", onsubmit: (event) => { event.preventDefault(); submit(); } },
          input("s-token", "jeton d'API", "password", state.token),
          input("s-infrastructure", "infrastructure", "text", state.infrastructure, "libellé de devices[].infrastructure"),
          input("s-run", "run (collector_run_id, vide = lister les runs)", "text", state.runId),
          input("s-from", "comparer à la run d'avant (collector_run_id, optionnel : la page embarque alors le diff)", "text", state.from),
          h("div", { class: "toolbar-row" },
            h("button", { type: "submit", disabled: state.busy || null }, state.busy ? "chargement…" : "ouvrir"),
            h("button", { type: "button", onclick: () => { state.token = ""; writeToken(""); state.message = "jeton oublié"; render(); } }, "oublier le jeton"))),
        state.message ? h("p", { class: "shell-message" }, state.message) : null,
        runsTable()));
    }

    function readForm() {
      state.token = fields["s-token"].value.trim();
      state.infrastructure = fields["s-infrastructure"].value.trim();
      state.runId = fields["s-run"].value.trim();
      state.from = fields["s-from"].value.trim();
      writeToken(state.token);
    }

    function submit() {
      readForm();
      if (!state.token || !state.infrastructure) { state.message = "le jeton et l'infrastructure sont nécessaires"; render(); return; }
      state.pending = state.runId ? open() : list();
    }

    async function list() {
      state.busy = true; state.message = null; state.runs = null; render();
      const found = await call(ROUTES.runs, { infrastructure: state.infrastructure }, state.token);
      state.busy = false;
      if (found.status === 200 && found.body && Array.isArray(found.body.runs)) state.runs = found.body.runs;
      else failed(found);
      render();
    }

    function failed(response) {
      state.message = explain(response.status, response.body);
      if (response.status === 401) { state.token = ""; writeToken(""); }
    }

    // Le diff (B3) se lit en même temps que le snapshot quand une run d'avant est donnée ; s'il manque (run inconnue,
    // sans snapshot), la run s'ouvre quand même et l'en-tête dit pourquoi le diff n'est pas là.
    async function open() {
      state.busy = true; state.message = null; render();
      const params = { infrastructure: state.infrastructure, run_id: state.runId };
      const diffParams = { infrastructure: state.infrastructure, from: state.from, to: state.runId };
      const [snapshot, report, diff] = await Promise.all([call(ROUTES.snapshot, params, state.token), call(ROUTES.report, params, state.token),
        state.from ? call(ROUTES.diff, diffParams, state.token) : Promise.resolve(null)]);
      state.busy = false;
      if (snapshot.status !== 200 || !snapshot.body || typeof snapshot.body !== "object") { failed(snapshot); render(); return; }
      data.snapshot = snapshot.body;
      data.ingest = report.status === 200 && report.body ? { summary: report.body.summary, findings: report.body.findings || [] } : null;
      data.origin = "api · " + state.infrastructure + " · " + state.runId;
      delete data.diff;
      if (diff) {
        if (diff.status === 200 && diff.body && typeof diff.body === "object") data.diff = diff.body;
        else data.origin += " · diff indisponible : " + explain(diff.status, diff.body);
      }
      root.hidden = true;
      clear(root);
      siblings(false);
      const address = state.from ? { ...params, from: state.from } : params;
      if (typeof history !== "undefined") history.replaceState(null, "", "?" + new URLSearchParams(address).toString() + (location.hash || ""));
      LD.app = LD.boot(data);
    }

    if (state.token && state.infrastructure && state.runId) state.pending = open();
    else render();
    return { state, render, submit, open, list };
  }

  LD.shell = { create, explain, TOKEN_KEY };
  if (typeof document !== "undefined" && document.getElementById("view-shell") && document.getElementById("ld-data")) {
    try {
      const data = JSON.parse(document.getElementById("ld-data").textContent);
      if (!data.snapshot) LD.shellApp = create(document.getElementById("view-shell"), data);
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu démarrer : " + error.message));
      throw error;
    }
  }
})();
