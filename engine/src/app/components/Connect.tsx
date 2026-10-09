// L'accueil : le jeton d'API (gardé dans l'onglet, jamais dans l'adresse), l'infrastructure, le nom (facultatif :
// sans lui, les déplacements restent locaux). Puis la dernière run s'ouvre, comparée à celle d'avant ; ou la liste
// des runs si la dernière n'a pas pu s'ouvrir. Un dialogue : le focus va au premier champ vide, et y revient quand
// le jeton est refusé ; l'infrastructure et le nom, lus de l'adresse et du navigateur, restent remplis.
import { KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { label, previousOf } from "../../shell/timeline";
import { useStore } from "../state/store";
import { Button, Dialog, Field } from "../ui";

export function Connect() {
  const { state, dispatch, commands } = useStore();
  const [token, setToken] = useState(state.token);
  const [infrastructure, setInfrastructure] = useState(state.address.infrastructure);
  const [author, setAuthor] = useState(state.author);
  // L'accueil s'ouvre avant que l'adresse et le navigateur soient lus : un champ resté vide prend la valeur arrivée
  // depuis (revue Impeccable du 2026-10-07 : un jeton refusé laissait l'infrastructure et le nom vides).
  useEffect(() => { if (state.address.infrastructure) setInfrastructure((was) => was || state.address.infrastructure); }, [state.address.infrastructure]);
  useEffect(() => { if (state.author) setAuthor((was) => was || state.author); }, [state.author]);
  useEffect(() => { if (!state.token) setToken(""); }, [state.token]); // refusé : le jeton s'efface, le reste demeure
  const ready = state.run.kind === "ready";
  const failed = state.run.kind === "failed" ? state.run.message : null;
  const refused = !!(failed || state.runsMessage) && !state.token;
  useEffect(() => {
    if (!refused) return;
    const input = document.querySelector<HTMLInputElement>(".sheet input[type=password]");
    if (input) input.focus();
  }, [refused, failed, state.runsMessage]);
  const submit = (event: FormEvent): void => { event.preventDefault(); commands.connect({ token: token.trim(), infrastructure: infrastructure.trim(), author: author.trim() }); };
  const runs = state.runs || [];
  const first = !token ? "input[type=password]" : !infrastructure ? "input[name=infrastructure]" : "button[type=submit]";
  const close = ready ? () => dispatch({ type: "connect", open: false }) : undefined;
  return (
    <div className="sheet">
      <Dialog label="Living Diagram : ouvrir une infrastructure" className="sheet-card glass" initial={first} onClose={close}>
        <form onSubmit={submit}>
          <h1><span className="mark-dot" aria-hidden="true" />Living Diagram</h1>
          {close ? <Button variant="ghost" icon className="panel-close" type="button" aria-label="fermer" onClick={close}><X /></Button> : null}
          <p className="lead">Le diagramme physique d'une infrastructure, run après run, tel que la collecte le voit. Le jeton reste dans cet onglet ; l'adresse, elle, se partage.</p>
          <Field label="jeton d'API" type="password" value={token} autoComplete="off" spellCheck={false} aria-invalid={refused ? "true" : undefined} onChange={(event) => setToken(event.target.value)} />
          <Field label="infrastructure" name="infrastructure" type="text" value={infrastructure} placeholder="son libellé, tel que la collecte l'écrit" spellCheck={false} onChange={(event) => setInfrastructure(event.target.value)} />
          <Field label="votre nom (facultatif)" type="text" value={author} maxLength={80} placeholder="prénom, trigramme…" spellCheck={false} hint="écrit sur les épingles que vous posez ; vide = déplacements locaux seulement" onChange={(event) => setAuthor(event.target.value)} />
          {failed ? <p className="error-text" role="alert">{failed}</p> : null}
          {state.runsMessage ? <p className="error-text" role="alert">{state.runsMessage}</p> : null}
          <div className="form-row">
            <Button variant="primary" type="submit" disabled={state.listing || state.run.kind === "loading"}><KeyRound /> {state.listing || state.run.kind === "loading" ? "ouverture…" : "ouvrir la dernière run"}</Button>
            {state.token ? <Button variant="ghost" type="button" onClick={commands.forgetToken}>oublier le jeton</Button> : null}
          </div>
          {runs.length ? (
            <div className="runs-list" aria-label="runs archivées">
              {runs.slice().reverse().map((run) => (
                <button key={run.run_id} type="button" onClick={() => { const before = previousOf(runs, run.run_id); commands.openRun(run.run_id, before ? before.run_id : ""); }}>
                  <span>{label(run)}</span><span className="st">{run.run_status}</span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
