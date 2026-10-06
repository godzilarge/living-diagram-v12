// La bande des runs de la coquille servie (`/view`) : toutes les runs archivées de l'infrastructure dans l'ordre du
// début de collecte, la courante marquée, celle à laquelle elle est comparée en pointillé. Passer de run en run rouvre
// la run par l'API en gardant l'état de vue (le fragment : onglet, sélection par identité, bascules) ; le placement
// mémorisé fait le reste, chaque équipement reste à sa place. Le diff suit la navigation : → compare à la run qu'on
// quitte, ← et un clic comparent à la précédente de la run visée, « comparer à » choisit n'importe quelle run
// antérieure, ou aucune. L'adresse porte toujours `from` explicitement : une adresse sans `from` reste une run sans
// diff, comme avant la bande. La page autonome (`ld render`) n'a qu'une run embarquée : pas de bande.
import { clear, h } from "../canvas/dom";
import type { RunEntry } from "./apps";

export interface TimelineHost { runs: RunEntry[]; current: string; from: string; busy: boolean; open: (runId: string, from: string) => void }

export const indexOf = (runs: RunEntry[], runId: string): number => runs.findIndex((run) => run.run_id === runId);
export const previousOf = (runs: RunEntry[], runId: string): RunEntry | null => { const at = indexOf(runs, runId); return at > 0 ? runs[at - 1] : null; };
export const nextOf = (runs: RunEntry[], runId: string): RunEntry | null => { const at = indexOf(runs, runId); return at >= 0 && at + 1 < runs.length ? runs[at + 1] : null; };
const previousId = (runs: RunEntry[], runId: string): string => { const run = previousOf(runs, runId); return run ? run.run_id : ""; };
/** Le début de collecte, court : `2026-01-05 02:00` (UTC, tel que l'API l'écrit). */
export const label = (run: RunEntry): string => run.run_start.replace("T", " ").slice(0, 16);

let pendingFocus = false; // la bande se redessine deux fois par pas (chargement, puis la run) : le clavier garde sa place

export function render(container: HTMLElement, host: TimelineHost): void {
  const { runs, current, from, busy } = host;
  const at = indexOf(runs, current);
  const prev = previousOf(runs, current), next = nextOf(runs, current);
  const go = (run: RunEntry | null, fromId: string): void => { if (run && !busy) host.open(run.run_id, fromId); };
  const stepButton = (text: string, run: RunEntry | null, fromId: string, title: string): HTMLElement =>
    h("button", { type: "button", class: "timeline-step", title, "aria-label": title, disabled: !run || busy || null, onclick: () => go(run, fromId) }, text);
  const runButton = (run: RunEntry): HTMLElement => h("button", {
    type: "button", class: "timeline-run run-" + run.run_status + (run.run_id === from ? " compared" : ""), "data-run": run.run_id,
    "aria-current": run.run_id === current ? "true" : null, disabled: busy || null,
    title: "run " + run.run_id + " · " + run.run_status + " · ingérée le " + run.stored_at + (run.run_id === from ? " · run comparée" : ""),
    onclick: () => { if (run.run_id !== current) go(run, previousId(runs, run.run_id)); } }, label(run));
  const buttons = runs.map(runButton);
  const option = (run: RunEntry): HTMLElement => h("option", { value: run.run_id, selected: run.run_id === from || null },
    label(run) + (run.run_id === previousId(runs, current) ? " (précédente)" : ""));
  const compare = h("select", { id: "timeline-compare", "aria-label": "comparer à une run antérieure", disabled: busy || at <= 0 || null,
    onchange: (event: Event) => host.open(current, (event.target as HTMLSelectElement).value) },
    h("option", { value: "", selected: from === "" || null }, "aucune"), runs.slice(0, Math.max(at, 0)).map(option));
  // ← et → au clavier depuis la bande : les boutons en sont les cibles, l'événement remonte à la ligne.
  const keys = (event: Event): void => {
    const key = (event as KeyboardEvent).key;
    if (key === "ArrowLeft") { event.preventDefault(); go(prev, prev ? previousId(runs, prev.run_id) : ""); }
    else if (key === "ArrowRight") { event.preventDefault(); go(next, current); }
  };
  const active = typeof document !== "undefined" ? document.activeElement : null;
  if (active && typeof container.contains === "function" && container.contains(active)) pendingFocus = true;
  clear(container).appendChild(h("div", { class: "timeline-row", onkeydown: keys },
    stepButton("←", prev, prev ? previousId(runs, prev.run_id) : "", "run précédente"),
    h("ol", { class: "timeline-runs" }, buttons.map((button) => h("li", {}, button))),
    stepButton("→", next, current, "run suivante"),
    h("label", { class: "timeline-compare" }, "comparer à ", compare),
    h("span", { class: "muted timeline-count" }, busy ? "chargement…" : (at >= 0 ? at + 1 + " sur " : "") + runs.length + (runs.length > 1 ? " runs" : " run"))));
  container.hidden = false;
  const shown = at >= 0 ? buttons[at] : null;
  if (!shown) return;
  if (typeof shown.scrollIntoView === "function") shown.scrollIntoView({ inline: "center", block: "nearest" });
  if (pendingFocus && !busy && typeof shown.focus === "function") { pendingFocus = false; shown.focus(); }
}

export const timeline = { render, indexOf, previousOf, nextOf, label };
