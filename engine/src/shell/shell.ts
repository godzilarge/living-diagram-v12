// La coquille servie par le backend (`GET /view`) : le visualiseur sans données, qui lit une run par l'API.
// Le jeton se saisit ici, jamais dans l'adresse ; il est gardé dans sessionStorage (l'onglet, pas le disque) et
// voyage en Authorization. L'adresse porte la run (?infrastructure=&run_id=) et l'état de vue (#view=…).
import { clear, h } from "../canvas/dom";
import { AUTHOR_KEY, call, explain, isRecord, readAuthor, readToken, ROUTES, TOKEN_KEY, writeAuthor, writeToken } from "./http";
import type { Answer } from "./http";
import type { Child } from "../canvas/dom";
import type { IngestData, PageData } from "../canvas/types";
import { pill, table } from "./widgets";
import type { Snapshot } from "../contracts/snapshot";
import { apps } from "./apps";
import type { Op, PlaceResult, Placer, PlacementWrite, RunEntry, SaveResult, ShellApp, ShellState, Writer } from "./apps";
import type { Intent, Placement } from "../canvas/types";
import { boot } from "./main";
import { render as renderTimeline } from "./timeline";

export type ShellData = Omit<PageData, "snapshot"> & { snapshot: Snapshot | null };

const query = (name: string): string => new URLSearchParams(location.search).get(name) || "";

export function create(root: HTMLElement, data: ShellData): ShellApp {
  const state: ShellState = { token: readToken(), author: readAuthor(), infrastructure: query("infrastructure"), runId: query("run_id"), from: query("from"), runs: null, message: null, busy: false, pending: null };
  const fields: Record<string, HTMLInputElement> = {};

  const input = (id: string, label: string, type: string, value: string, placeholder?: string, maxlength?: number): HTMLElement => h("label", { class: "field" }, label,
    fields[id] = h("input", { id, type, value, placeholder: placeholder || null, autocomplete: type === "password" ? "off" : null, spellcheck: "false", maxlength: maxlength || null }));

  // La liste des runs est triée par début de collecte : « comparer avec la précédente » ouvre la run avec le diff
  // depuis celle d'avant (B3), la première n'en a pas.
  function runsTable(): Child {
    const runs = state.runs;
    if (!runs) return null;
    const compare = (run: RunEntry, index: number): Child => (index === 0 ? "—" : h("button", { type: "button", class: "linklike", onclick: (event: Event) => {
      event.stopPropagation();
      state.runId = run.run_id; state.from = runs[index - 1].run_id; state.pending = open();
    } }, "avec la précédente"));
    return [h("h3", {}, "Runs archivées de " + state.infrastructure + " : " + runs.length),
      table(["run", "début de collecte", "statut", "ingérée le", "comparer"], runs.map((run, index) => ({
        onclick: () => { state.runId = run.run_id; state.from = ""; state.pending = open(); },
        cells: [h("code", {}, run.run_id), run.run_start, pill("run", run.run_status, run.run_status), run.stored_at, compare(run, index)] })),
        { empty: "aucune run archivée pour cette infrastructure" })];
  }

  // Tant que rien n'est chargé, seule la coquille est visible : les vues du visualiseur attendent leurs données.
  function siblings(hidden: boolean): void {
    const parent = root.parentNode;
    (parent ? Array.from(parent.childNodes) : []).forEach((node) => {
      const el = node as Element;
      const id = el.getAttribute ? el.getAttribute("id") : null;
      if (node !== root && id && id.startsWith("view-")) (el as HTMLElement).hidden = hidden;
    });
  }

  // La bande des runs, sous l'en-tête, dès qu'une run est ouverte et que la liste a pu être lue ; elle rouvre une run
  // par le même chemin que le formulaire. Cachée avec le formulaire.
  function timeline(): void {
    const container = document.getElementById("timeline");
    if (!container) return;
    if (!state.runs || !apps.app) { container.hidden = true; return; }
    renderTimeline(container as HTMLElement, { runs: state.runs, current: state.runId, from: state.from, busy: state.busy,
      open: (runId, from) => { state.runId = runId; state.from = from; state.pending = open(); } });
  }

  function render(): void {
    root.hidden = false;
    siblings(true);
    const strip = document.getElementById("timeline");
    if (strip) strip.hidden = true;
    clear(root).appendChild(h("div", { class: "page" },
      h("h2", {}, "Lire une run archivée"),
      h("p", { class: "lead" }, "Cette page lit le snapshot par l'API du backend. Le jeton d'API (LD_API_TOKEN) se saisit ici : il reste dans cet onglet et n'entre jamais dans l'adresse. L'adresse, elle, se partage : elle porte l'infrastructure, la run et l'état de vue."),
      h("form", { class: "shell-form", onsubmit: (event: Event) => { event.preventDefault(); submit(); } },
        input("s-token", "jeton d'API", "password", state.token),
        input("s-author", "votre nom (écrit sur les épingles que vous posez ; vide = déplacements locaux seulement)", "text", state.author, "prénom, trigramme…", 80),
        input("s-infrastructure", "infrastructure", "text", state.infrastructure, "libellé de devices[].infrastructure"),
        input("s-run", "run (collector_run_id, vide = lister les runs)", "text", state.runId),
        input("s-from", "comparer à la run d'avant (collector_run_id, optionnel : la page embarque alors le diff)", "text", state.from),
        h("div", { class: "toolbar-row" },
          h("button", { type: "submit", disabled: state.busy || null }, state.busy ? "chargement…" : "ouvrir"),
          h("button", { type: "button", onclick: () => { state.token = ""; writeToken(""); state.message = "jeton oublié"; render(); } }, "oublier le jeton"))),
      state.message ? h("p", { class: "shell-message" }, state.message) : null,
      runsTable()));
  }

  function readForm(): void {
    state.token = fields["s-token"].value.trim();
    state.author = fields["s-author"].value.trim();
    writeAuthor(state.author);
    state.infrastructure = fields["s-infrastructure"].value.trim();
    state.runId = fields["s-run"].value.trim();
    state.from = fields["s-from"].value.trim();
    writeToken(state.token);
  }

  function submit(): void {
    readForm();
    if (!state.token || !state.infrastructure) { state.message = "le jeton et l'infrastructure sont nécessaires"; render(); return; }
    state.pending = state.runId ? open() : list();
  }

  async function list(): Promise<void> {
    state.busy = true; state.message = null; state.runs = null; render();
    const found = await call(ROUTES.runs, { infrastructure: state.infrastructure }, state.token);
    state.busy = false;
    if (found.status === 200 && isRecord(found.body) && Array.isArray(found.body.runs)) state.runs = found.body.runs as RunEntry[];
    else failed(found);
    render();
  }

  function failed(response: Answer): void {
    state.message = explain(response.status, response.body);
    if (response.status === 401) { state.token = ""; writeToken(""); }
  }

  // L'écrivain de la couche d'intention : les opérations partent vers l'API sous le nom saisi ; sans nom, la page
  // garde les déplacements locaux et le dit. Les envois sont **sérialisés** : deux glissés rapprochés partent l'un
  // après l'autre, et leurs réponses arrivent dans l'ordre (revue B4, H1).
  function writer(): Writer {
    let queue: Promise<unknown> = Promise.resolve();
    const send = async (ops: Op[]): Promise<SaveResult> => {
      if (!me.author) return { ok: false, message: "donnez votre nom dans l'onglet Intentions" };
      try {
        const done = await call(ROUTES.patches, { infrastructure: state.infrastructure }, state.token, { author: me.author, ops });
        if (done.status === 200 && isRecord(done.body)) return { ok: true, intent: done.body as unknown as Intent };
        return { ok: false, message: explain(done.status, done.body) };
      } catch (error) { return { ok: false, message: "l'API ne répond pas" }; }
    };
    const me: Writer = {
      author: state.author,
      setAuthor: (name) => { state.author = name; me.author = name; writeAuthor(name); },
      save: (ops) => {
        const turn = queue.then(() => send(ops));
        queue = turn.catch(() => undefined);
        return turn;
      },
    };
    return me;
  }

  // L'écrivain du placement mémorisé (docs/09) : ce que le graphe vient de placer part vers l'API, sans nom (c'est une
  // donnée calculée) ; l'ordre des envois est tenu par l'hôte de placement de la page. Un 409 rend le document courant.
  function placer(): Placer {
    const send = async (write: PlacementWrite): Promise<PlaceResult> => {
      try {
        const done = await call(ROUTES.placement, { infrastructure: state.infrastructure }, state.token, write);
        if (done.status === 200 && isRecord(done.body)) return { ok: true, placement: done.body as unknown as Placement };
        if (done.status === 409 && isRecord(done.body)) return { ok: false, stale: true, placement: done.body as unknown as Placement };
        return { ok: false, message: explain(done.status, done.body) };
      } catch (error) { return { ok: false, message: "l'API ne répond pas" }; }
    };
    return { save: send };
  }

  // Le diff (B3) se lit en même temps que le snapshot quand une run d'avant est donnée ; s'il manque (run inconnue,
  // sans snapshot), la run s'ouvre quand même et l'en-tête dit pourquoi le diff n'est pas là. La couche d'intention
  // (B4), le placement mémorisé (docs/09) et la liste des runs (bande) se lisent aussi ; s'ils manquent, la run s'ouvre
  // sans eux et l'en-tête le dit. Depuis une page déjà ouverte (bande des runs), la page reste visible pendant le
  // chargement, la bande dit « chargement… » ; le formulaire ne revient qu'en cas d'échec.
  async function open(): Promise<void> {
    state.busy = true; state.message = null;
    if (apps.app) timeline(); else render();
    const params = { infrastructure: state.infrastructure, run_id: state.runId };
    const infra = { infrastructure: state.infrastructure };
    const diffParams = { infrastructure: state.infrastructure, from: state.from, to: state.runId };
    const [snapshot, report, diff, intent, placement, runs] = await Promise.all([call(ROUTES.snapshot, params, state.token), call(ROUTES.report, params, state.token),
      state.from ? call(ROUTES.diff, diffParams, state.token) : Promise.resolve(null), call(ROUTES.intent, infra, state.token), call(ROUTES.placement, infra, state.token),
      call(ROUTES.runs, infra, state.token)]);
    state.busy = false;
    if (snapshot.status !== 200 || !isRecord(snapshot.body)) { failed(snapshot); render(); return; }
    data.snapshot = snapshot.body as unknown as Snapshot;
    const reportBody = report.status === 200 && isRecord(report.body) ? report.body : null;
    data.ingest = reportBody ? { summary: reportBody.summary as IngestData["summary"], findings: (reportBody.findings || []) as IngestData["findings"] } : null;
    data.origin = "api · " + state.infrastructure + " · " + state.runId;
    delete data.diff;
    if (diff) {
      if (diff.status === 200 && isRecord(diff.body)) data.diff = diff.body as unknown as PageData["diff"];
      else data.origin += " · diff indisponible : " + explain(diff.status, diff.body);
    }
    delete data.intent;
    if (intent.status === 200 && isRecord(intent.body)) data.intent = intent.body as unknown as Intent;
    else data.origin += " · intention indisponible : " + explain(intent.status, intent.body);
    delete data.placement;
    let remembered = false;
    if (placement.status === 200 && isRecord(placement.body)) { data.placement = placement.body as unknown as Placement; remembered = true; }
    else data.origin += " · placement mémorisé indisponible : " + explain(placement.status, placement.body);
    if (runs.status === 200 && isRecord(runs.body) && Array.isArray(runs.body.runs)) state.runs = runs.body.runs as RunEntry[];
    else { state.runs = null; data.origin += " · liste des runs indisponible : " + explain(runs.status, runs.body); }
    root.hidden = true;
    clear(root);
    siblings(false);
    const address = state.from ? { ...params, from: state.from } : params;
    if (typeof history !== "undefined") history.replaceState(null, "", "?" + new URLSearchParams(address).toString() + (location.hash || ""));
    if (apps.app) apps.app.dispose(); // la run d'avant lâche la page avant que la suivante la prenne
    apps.app = boot(data as PageData, { writer: writer(), placer: remembered ? placer() : null }); // sans document lu, rien ne s'écrit : la mémoire reste celle de la page
    timeline();
  }

  if (state.token && state.infrastructure && state.runId) state.pending = open();
  else render();
  return { state, render, submit, open, list };
}

// La coquille servie démarre sur une page sans snapshot embarqué (index.ts a déjà lu le bloc de données).
export function startShell(data: ShellData): void {
  const root = typeof document === "undefined" ? null : document.getElementById("view-shell");
  if (!root) return;
  try {
    apps.shellApp = create(root as HTMLElement, data);
  } catch (error) {
    document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu démarrer : " + (error as Error).message));
    throw error;
  }
}

export const shell = { create, explain, TOKEN_KEY, AUTHOR_KEY };
