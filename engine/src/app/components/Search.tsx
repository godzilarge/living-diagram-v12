// La recherche, toujours là, en haut à gauche de la toile (Orhan, 2026-10-07). On tape : la toile éclaire ce qui
// correspond et estompe le reste, la liste dessous range les résultats par sorte (équipements, ports, groupes et
// clusters). ↑↓ parcourent, Entrée ouvre le résultat (le centre, sa fiche), Maj+Entrée sélectionne les équipements
// trouvés ; masquer, isoler sont des actions, jamais un effet de la frappe. `/` ou Ctrl+K donnent le focus (Shell),
// Échap vide puis rend la main. Les champs (`type:`, `port:`…) se proposent pendant qu'on écrit. Pour un lecteur d'écran :
// un champ `combobox`, une liste d'options groupées par sorte, les actions hors de la liste, le compte annoncé.
import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { exactRule } from "../../canvas/query";
import { complete, searchCached as search, suggest } from "../state/search";
import type { Hit, Results } from "../state/search";
import { useModel, useStore } from "../state/store";
import { Button, Kbd, plural } from "../ui";

const SHOWN = 8; // par sorte ; le compte dit le reste
const SECTIONS: { key: "devices" | "ports" | "groups"; title: string }[] = [
  { key: "devices", title: "équipements" }, { key: "ports", title: "ports" }, { key: "groups", title: "groupes et clusters" },
];

function visible(results: Results): Hit[] {
  return SECTIONS.flatMap((s) => results[s.key].slice(0, SHOWN));
}

export function Search() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const input = useRef<HTMLInputElement>(null);
  const text = state.palette.text, open = state.palette.open;
  const results = useMemo(() => (model ? search(model, text) : null), [model, text]);
  const hits = useMemo(() => (results ? visible(results) : []), [results]);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [text]);
  useEffect(() => { if (open && input.current && document.activeElement !== input.current) input.current.focus(); }, [open]);
  if (!results) return null;
  const setText = (next: string): void => dispatch({ type: "palette", text: next, open: true });
  const close = (): void => { dispatch({ type: "palette", open: false }); if (input.current) input.current.blur(); };
  const openHit = (hit: Hit): void => { commands.reveal(hit.selection); close(); };
  const selectAll = (): void => { if (results.deviceHosts.length) { commands.selectHosts(results.deviceHosts); close(); } };
  const rule = (): string => (results.deviceRule ? text.trim() : exactRule(results.deviceHosts));
  const keys = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (hits.length) setActive((at) => (at + (event.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) selectAll(); else if (hits[active]) openHit(hits[active]);
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (text) setText(""); else close();
    }
  };
  // Le focus quitte la recherche (ni le champ, ni la liste) : la liste se ferme, le texte reste et éclaire encore.
  const blur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dispatch({ type: "palette", open: false });
  };
  const fields = open ? suggest(text) : [];
  const total = results.devices.length + results.ports.length + results.groups.length;
  const listed = open && !!text && !results.error;
  const said = !text ? "" : results.error ? "expression illisible" : total ? plural(total, "résultat") : "aucun résultat";
  let index = -1;
  return (
    <div className={"search glass" + (open ? " open" : "") + (text ? " has-text" : "")} role="search" onBlur={blur}>
      <div className="search-row">
        <SearchIcon aria-hidden="true" />
        <input ref={input} className="search-input" value={text} placeholder="chercher : nom, port, groupe…" spellCheck={false} autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-label="chercher dans la run" aria-expanded={listed ? "true" : "false"} aria-controls={listed ? "search-results" : undefined}
          aria-activedescendant={open && hits[active] ? "hit-" + active : undefined}
          onFocus={() => dispatch({ type: "palette", open: true })} onChange={(event) => setText(event.target.value)} onKeyDown={keys} />
        {text ? <span className={"search-count" + (results.error ? " err" : "")} aria-hidden="true">{results.error ? "regex illisible" : total}</span> : <Kbd>/</Kbd>}
        <span className="sr-only" aria-live="polite">{said}</span>
        {text ? <button type="button" className="search-clear" aria-label="effacer la recherche" onClick={() => { setText(""); if (input.current) input.current.focus(); }}><X /></button> : null}
      </div>
      {fields.length ? (
        <div className="search-fields" aria-label="champs">
          {fields.map((field) => <button key={field} type="button" className="field-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(complete(text, field)); if (input.current) input.current.focus(); }}>{field}</button>)}
        </div>
      ) : null}
      {listed ? (
        <div className="search-results">
          {total === 0 ? <p className="search-empty">rien dans cette run</p> : null}
          <div id="search-results" role="listbox" aria-label="résultats" className="search-list">
          {SECTIONS.map((section) => {
            const list = results[section.key];
            if (!list.length) return null;
            return (
              <div key={section.key} className="search-section" role="group" aria-labelledby={"search-head-" + section.key}>
                <div className="search-head" id={"search-head-" + section.key}><span>{section.title}</span><span className="n">{list.length}</span></div>
                {list.slice(0, SHOWN).map((hit) => {
                  index += 1;
                  const at = index;
                  return (
                    <button key={hit.key} id={"hit-" + at} type="button" role="option" aria-selected={at === active ? "true" : "false"}
                      className={"search-hit kind-" + hit.kind + (at === active ? " active" : "") + (hit.removed ? " removed" : "")}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(at)} onClick={() => openHit(hit)}>
                      <span className="hit-title">{hit.title}</span>
                      <span className="hit-detail">{hit.removed ? "retiré · " : ""}{hit.detail}</span>
                    </button>
                  );
                })}
                {list.length > SHOWN ? <p className="search-more" aria-hidden="true">… et {list.length - SHOWN} autres</p> : null}
              </div>
            );
          })}
          </div>
          <div className="search-actions">
            <Button variant="primary" disabled={!results.deviceHosts.length} onMouseDown={(e) => e.preventDefault()} onClick={selectAll}
              title="sélectionner les équipements trouvés">sélectionner {results.deviceHosts.length ? plural(results.deviceHosts.length, "équipement") : ""} <Kbd>⇧↵</Kbd></Button>
            <Button disabled={!results.deviceHosts.length} onMouseDown={(e) => e.preventDefault()} onClick={() => { commands.addHide(rule()); setText(""); close(); }}>masquer</Button>
            <Button disabled={!results.deviceHosts.length} onMouseDown={(e) => e.preventDefault()} onClick={() => { commands.setOnly(rule()); setText(""); close(); }}>isoler avec leurs voisins</Button>
            {state.view.hide.length || state.view.only ? <Button variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => { commands.clearRules(); close(); }}>tout afficher</Button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
