// La barre : l'identité (infrastructure, run), les comptes qui agissent (statuts : bascules ; sévérités, diff :
// parcours des équipements concernés, WalkBar), les règles posées (retirables), et à droite les changements, le panneau
// Affichage (les couches de la toile, Display), le nom, le menu. La recherche flotte
// sur la toile (Search).
import { GitCompareArrows, KeyRound, LogOut, Palette, TriangleAlert, User, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { STATUS_LABEL } from "../../canvas/format";
import { label as runLabel } from "../../shell/timeline";
import { STATUSES } from "../state/address";
import { useModel, useStore } from "../state/store";
import { Button, Dialog, Toggle, plural } from "../ui";
import { Display } from "./Display";

function RuleChips() {
  const { state, commands } = useStore();
  const chips = state.view.hide.map((rule) => ({ kind: "masqué", rule, remove: () => commands.removeHide(rule) }));
  if (state.view.only) chips.push({ kind: "isolé", rule: state.view.only, remove: () => commands.setOnly("") });
  if (!chips.length) return null;
  return <>{chips.map((chip) => (
    <span key={chip.kind + chip.rule} className="rule-chip" title={chip.kind + " : " + chip.rule}>
      <span className="rule-kind">{chip.kind}</span><code>{chip.rule}</code>
      <button type="button" aria-label={"retirer la règle " + chip.rule} onClick={chip.remove}><X /></button>
    </span>
  ))}</>;
}

const SEVERITY_WORD: Record<string, string> = { error: "en erreur", warning: "en avertissement" };

// Ce qui n'a pas pu être lu avec la run : une pastille dans la barre, le détail au survol et pour le lecteur d'écran.
function Warnings() {
  const { state } = useStore();
  const warnings = state.run.kind === "ready" ? state.run.warnings : [];
  if (!warnings.length) return null;
  const text = warnings.length === 1 ? warnings[0].split(" : ")[0] : warnings.length + " lectures manquées";
  return <span className="bar-warn" role="status" title={warnings.join("\n")}><TriangleAlert aria-hidden="true" />{text}<span className="sr-only"> : {warnings.join(" ; ")}</span></span>;
}

function Counts() {
  const { state, commands } = useStore();
  const model = useModel();
  if (!model) return null;
  const count = (map: Map<string, number>, key: string): number => map.get(key) || 0;
  const diff = model.diff ? model.diff.summary.links : null;
  const devices = model.nodes.length - (model.kindCounts.get("stub") || 0);
  const walking = state.walk ? state.walk.kind : null;
  return (
    <div className="counts" aria-label="comptes de la run">
      <span className="count" title={plural(devices, "équipement") + " (collectés ou d'une autre infrastructure) · " + plural(model.links.length, "câble")}><b>{devices}</b> <span className="word">équipements</span></span>
      <span className="count-sep" aria-hidden="true" />
      {STATUSES.map((st) => (
        <button key={st} type="button" className={"count status-" + st} aria-pressed={state.view.hiddenStatuses.includes(st) ? "false" : "true"}
          title={count(model.statusCounts, st) + " câbles " + STATUS_LABEL[st] + " : afficher ou masquer"} aria-label={plural(count(model.statusCounts, st), "câble") + " " + STATUS_LABEL[st]} onClick={() => commands.toggleStatus(st)}>
          <span className={"dot " + st} /><b>{count(model.statusCounts, st)}</b>
        </button>
      ))}
      {count(model.severityCounts, "error") + count(model.severityCounts, "warning") ? <span className="count-sep" aria-hidden="true" /> : null}
      {(["error", "warning"] as const).map((sev) => (count(model.severityCounts, sev)
        ? <button key={sev} type="button" className={"count sev-" + sev} aria-pressed={walking === sev ? "true" : "false"} onClick={() => commands.startWalk(sev)}
          title={plural(count(model.severityCounts, sev), "contrôle") + " " + SEVERITY_WORD[sev] + " : parcourir les équipements concernés (↑↓, Échap)"}>
          <span className="dot" aria-hidden="true" /><b>{count(model.severityCounts, sev)}</b><span className="sr-only"> {plural(count(model.severityCounts, sev), "contrôle")} {SEVERITY_WORD[sev]} : parcourir</span>
        </button> : null))}
      {diff ? <><span className="count-sep" aria-hidden="true" />
        <button type="button" className="count diff" aria-pressed={walking === "diff" ? "true" : "false"} onClick={() => commands.startWalk("diff")}
          title={"câbles ajoutés, retirés, changés depuis la run comparée (" + model.diffCount + " changements en tout) : parcourir les équipements touchés (↑↓, Échap)"}>
          <b>+{diff.added} −{diff.removed} ~{diff.changed}</b><span className="sr-only"> : parcourir les changements</span>
        </button></> : null}
      <RuleChips />
    </div>
  );
}

function Menu() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const [name, setName] = useState(state.author);
  const submit = (event: FormEvent): void => { event.preventDefault(); commands.setAuthor(name); dispatch({ type: "menu", open: false }); };
  return (
    <Dialog label="nom et jeton" className="menu glass" modal={false} initial="input" onClose={() => dispatch({ type: "menu", open: false })}>
      <form onSubmit={submit} className="field">
        votre nom, écrit sur chaque épingle que vous posez
        <div className="form-row">
          <input value={name} maxLength={80} placeholder="prénom, trigramme…" spellCheck={false} onChange={(event) => setName(event.target.value)} aria-label="votre nom" />
          <Button variant="primary" type="submit">garder</Button>
        </div>
        <span className="hint">{state.author ? "vos glissés et alignements s'enregistrent pour tout le monde (dernier écrivain gagne, journalisé)" : "sans nom, vos déplacements restent dans cette page"}</span>
      </form>
      <div className="form-row wrap">
        {model ? <Button variant="ghost" onClick={() => dispatch({ type: "colors", open: true })} title="la teinte de chaque type, pour toute l'infrastructure (intention)"><Palette /> palette des types</Button> : null}
        <Button variant="ghost" onClick={() => { dispatch({ type: "menu", open: false }); dispatch({ type: "connect", open: true }); }}><KeyRound /> changer d'infrastructure</Button>
        <Button variant="ghost" onClick={commands.forgetToken}><LogOut /> oublier le jeton</Button>
      </div>
    </Dialog>
  );
}

export function TopBar() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const run = state.runs ? state.runs.find((entry) => entry.run_id === state.address.runId) : null;
  return (
    <>
      <header className="bar glass">
        <div className="bar-left">
          <span className="mark"><span className="mark-dot" aria-hidden="true" />Living Diagram</span>
          {state.address.infrastructure ? <><span className="crumb">/</span><span className="infra">{state.address.infrastructure}</span></> : null}
          {run ? <span className={"pill tone-neutral run-pill run-" + run.run_status} title={"run " + run.run_id + " · " + run.run_status}><span className="pill-dot" />{runLabel(run)}</span>
            : model ? <span className="pill tone-neutral run-pill"><span className="pill-dot" />{model.source.collector_run_id}</span> : null}
          <Warnings />
        </div>
        <div className="bar-center"><Counts /></div>
        <div className="bar-right">
          {model && model.diff ? <Toggle pressed={state.view.showDiff} onClick={() => commands.setView({ showDiff: !state.view.showDiff })} title={"changements depuis la run comparée (" + model.diffCount + ")"}><GitCompareArrows /><span className="word">changements</span></Toggle> : null}
          <Display />
          <Toggle pressed={state.menuOpen} onClick={() => dispatch({ type: "menu", open: !state.menuOpen })} title={state.author ? "vous écrivez sous ce nom" : "donnez votre nom pour enregistrer vos épingles"} aria-haspopup="dialog">
            <User /><span className="writer-name">{state.author || "votre nom ?"}</span>
          </Toggle>
        </div>
      </header>
      {state.menuOpen ? <Menu /> : null}
    </>
  );
}
