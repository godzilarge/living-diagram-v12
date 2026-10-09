// La bande des runs : toutes les runs archivées, dans l'ordre du début de collecte ; la courante en accent, la
// comparée en pointillé. Mêmes règles que `/view` : → compare à la run qu'on quitte, ← et un clic à la précédente
// de la run visée, « comparer à » choisit n'importe quelle run antérieure, ou aucune. ← → au clavier depuis la bande.
// Pendant un chargement, les boutons sont `aria-disabled`, jamais `disabled` : un bouton désactivé perd le focus, qui
// tombait sur la page ; la run ouverte, le focus passe sur elle (revue Impeccable du 2026-10-07).
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { label, previousOf } from "../../shell/timeline";
import { useStore } from "../state/store";
import { plural } from "../ui";

const off = (disabled: boolean): "true" | undefined => (disabled ? "true" : undefined);

export function Timeline() {
  const { state, commands } = useStore();
  const nav = useRef<HTMLElement>(null);
  const runs = state.runs || [];
  const current = state.address.runId, from = state.address.from;
  const at = runs.findIndex((run) => run.run_id === current);
  const busy = state.run.kind === "loading";
  const step = (direction: -1 | 1): void => { if (!busy) commands.stepRun(direction); };
  const keys = (event: KeyboardEvent): void => {
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
  };
  // La run courante reste en vue quand la bande défile (écran étroit) ; si le focus était sur une run, il la suit.
  useEffect(() => {
    const box = nav.current;
    if (!box || !current) return;
    const button = box.querySelector<HTMLElement>(`[data-run="${CSS.escape(current)}"]`);
    if (!button) return;
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (document.activeElement && document.activeElement.classList.contains("band-run") && box.contains(document.activeElement)) button.focus();
  }, [current]);
  return (
    <nav ref={nav} className="band glass" aria-label="runs archivées de l'infrastructure" aria-busy={busy ? "true" : undefined} onKeyDown={keys}>
      <button type="button" className="band-step" title="run précédente" aria-label="run précédente" aria-disabled={off(busy || at <= 0)} onClick={() => { if (at > 0) step(-1); }}><ChevronLeft /></button>
      <ol className="band-runs">
        {runs.map((run) => (
          <li key={run.run_id}>
            <button type="button" className={"band-run run-" + run.run_status + (run.run_id === from ? " compared" : "")} data-run={run.run_id}
              aria-current={run.run_id === current ? "true" : undefined} aria-disabled={off(busy)}
              title={"run " + run.run_id + " · " + run.run_status + (run.run_id === from ? " · run comparée" : "")}
              onClick={() => { if (!busy && run.run_id !== current) { const before = previousOf(runs, run.run_id); commands.openRun(run.run_id, before ? before.run_id : ""); } }}>
              <span className="dot" />{label(run)}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="band-step" title="run suivante" aria-label="run suivante" aria-disabled={off(busy || at < 0 || at + 1 >= runs.length)} onClick={() => { if (at >= 0 && at + 1 < runs.length) step(1); }}><ChevronRight /></button>
      <label className="band-compare">comparer à
        <select value={from} disabled={busy || at <= 0} aria-label="comparer à une run antérieure" onChange={(event) => commands.compareTo(event.target.value)}>
          <option value="">aucune</option>
          {runs.slice(0, Math.max(at, 0)).map((run) => <option key={run.run_id} value={run.run_id}>{label(run)}{run.run_id === (previousOf(runs, current) || { run_id: "" }).run_id ? " (précédente)" : ""}</option>)}
        </select>
      </label>
      <span className="band-count">{busy ? "chargement…" : (at >= 0 ? at + 1 + " sur " : "") + plural(runs.length, "run")}</span>
    </nav>
  );
}
