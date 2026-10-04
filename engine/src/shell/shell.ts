// La coquille servie par le backend (`GET /view`) : le visualiseur sans données, qui lit une run par l'API.
// Le jeton se saisit ici, jamais dans l'adresse ; il est gardé dans sessionStorage (l'onglet, pas le disque) et
// voyage en Authorization. L'adresse porte la run (?infrastructure=&run_id=) et l'état de vue (#view=…).
import { clear, h } from "../canvas/dom";
import type { Child } from "../canvas/dom";
import type { IngestData, PageData } from "../canvas/types";
import { pill, table } from "./widgets";
import type { Snapshot } from "../contracts/snapshot";
import { apps } from "./apps";
import type { Op, RunEntry, SaveResult, ShellApp, ShellState, Writer } from "./apps";
import type { Intent } from "../canvas/types";
import { boot } from "./main";

export const TOKEN_KEY = "ld-api-token";
export const AUTHOR_KEY = "ld-author"; // le nom, dans localStorage : une commodité, pas un secret
const ROUTES = { runs: "/api/ingest/bundles", snapshot: "/api/snapshot", report: "/api/ingest/report", diff: "/api/diff", intent: "/api/intent", patches: "/api/intent/patches" };
export type ShellData = Omit<PageData, "snapshot"> & { snapshot: Snapshot | null };
interface Answer { status: number; body: unknown }

function storage(): Storage | null {
  try { return globalThis.sessionStorage || null; } catch (error) { return null; }
}
function readToken(): string {
  try { const store = storage(); return (store && store.getItem(TOKEN_KEY)) || ""; } catch (error) { return ""; }
}
function writeToken(token: string): void {
  try {
    const store = storage();
    if (store) { if (token) store.setItem(TOKEN_KEY, token); else store.removeItem(TOKEN_KEY); }
  } catch (error) { /* stockage indisponible : le jeton ne vit que le temps de la page */ }
}

function readAuthor(): string {
  try { return (globalThis.localStorage && globalThis.localStorage.getItem(AUTHOR_KEY)) || ""; } catch (error) { return ""; }
}
function writeAuthor(name: string): void {
  try {
    const store = globalThis.localStorage;
    if (store) { if (name) store.setItem(AUTHOR_KEY, name); else store.removeItem(AUTHOR_KEY); }
  } catch (error) { /* stockage indisponible : le nom ne vit que le temps de la page */ }
}

const query = (name: string): string => new URLSearchParams(location.search).get(name) || "";
const withParams = (route: string, params: Record<string, string>): string => route + "?" + new URLSearchParams(params).toString();

async function call(route: string, params: Record<string, string>, token: string, payload?: unknown): Promise<Answer> {
  const init: RequestInit = { headers: { Authorization: "Bearer " + token }, credentials: "omit" };
  if (payload !== undefined) Object.assign(init, { method: "POST", headers: { ...init.headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const response = await fetch(withParams(route, params), init);
  let body: unknown = null;
  try { body = await response.json(); } catch (error) { body = null; }
  return { status: response.status, body };
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

export function explain(status: number, body: unknown): string {
  if (status === 401) return "jeton refusé par l'API";
  const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : "";
  if (status === 404) return detail || "run inconnue pour cette infrastructure";
  return "l'API répond " + status + (detail ? " : " + detail : "");
}

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

  function render(): void {
    root.hidden = false;
    siblings(true);
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

  // Le diff (B3) se lit en même temps que le snapshot quand une run d'avant est donnée ; s'il manque (run inconnue,
  // sans snapshot), la run s'ouvre quand même et l'en-tête dit pourquoi le diff n'est pas là. La couche d'intention
  // (B4) se lit aussi ; si elle manque, la run s'ouvre sans elle et l'en-tête le dit.
  async function open(): Promise<void> {
    state.busy = true; state.message = null; render();
    const params = { infrastructure: state.infrastructure, run_id: state.runId };
    const infra = { infrastructure: state.infrastructure };
    const diffParams = { infrastructure: state.infrastructure, from: state.from, to: state.runId };
    const [snapshot, report, diff, intent] = await Promise.all([call(ROUTES.snapshot, params, state.token), call(ROUTES.report, params, state.token),
      state.from ? call(ROUTES.diff, diffParams, state.token) : Promise.resolve(null), call(ROUTES.intent, infra, state.token)]);
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
    root.hidden = true;
    clear(root);
    siblings(false);
    const address = state.from ? { ...params, from: state.from } : params;
    if (typeof history !== "undefined") history.replaceState(null, "", "?" + new URLSearchParams(address).toString() + (location.hash || ""));
    apps.app = boot(data as PageData, { writer: writer() });
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
