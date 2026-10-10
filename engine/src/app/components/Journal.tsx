// La vue Journal (2026-10-09) : qui a modifié quoi dans l'intention (épingles, couleurs, groupes, annotations,
// connecteurs), quand, sur quelle infrastructure. Une page pleine à la place de la toile (montée dessous, inerte). Dans
// l'ordre du document (celui du clavier et du lecteur d'écran) : le lien d'évitement, le titre, la recherche et la
// période (figés en haut au défilement), le fil, puis les facettes, posées à gauche par la grille. Le fil : par jour,
// une ligne par entrée, les suites d'un même geste repliées (« ×8 »), les sessions de positions en une ligne, estompées
// (elles font l'essentiel du journal : une suppression doit ressortir). La suite se lit en arrivant au bas du fil.
// Au clavier : ↑↓ Origine Fin d'une ligne à l'autre (une seule étape de tabulation pour tout le fil), Entrée déplie,
// « o » montre l'objet cité ; le volet « ? » à côté du titre le dit. Le contexte (pages lues, lignes dépliées,
// défilement, ligne active) survit à l'aller-retour vers le Diagramme (journal-commands.ts), et le focus revient sur
// la ligne quittée. Lecture seule ; aucun appel réseau ici.
import { History, Info, Link, RotateCw, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ACTION_LABEL, byDay, CATEGORY_LABEL, entriesOf, isTrace, filtered, firstEntry, fold, PERIOD_LABEL, rangeLabel, zoneLabel } from "../state/journal";
import type { JournalFilters, JournalItem, JournalPage, RefKind } from "../state/journal";
import type { Model } from "../../canvas/types";
import { firstRef } from "../state/journal-text";
import { useModel, useStore } from "../state/store";
import { Button, plural } from "../ui";
import { Facets } from "./journal/Facets";
import { Row } from "./journal/Row";
import { goneWord } from "./journal/shared";
import type { Presence } from "./journal/shared";
import { Tools } from "./journal/Tools";

const NOTE = "Le journal garde ce qui a été posé, pas ce qu'il y avait avant ; une annulation (Ctrl+Z) s'y lit comme une modification. L'auteur est le nom saisi dans la page, pas un compte. Les heures sont locales.";
const totalText = (n: number, narrowed: boolean): string => (!n ? (narrowed ? "aucune modification ne correspond" : "aucune modification")
  : plural(n, "modification") + (narrowed ? (n > 1 ? " correspondent" : " correspond") : ""));

/** Ce qu'un objet cité est devenu : on ne le sait que pour l'infrastructure dont la run est ouverte. */
function usePresence(): Presence {
  const model = useModel();
  return useCallback((infrastructure: string, kind: RefKind, id: string) => {
    if (!model || infrastructure !== model.source.infrastructure) return true;
    if (kind === "node") return model.nodeByHost.has(id);
    if (kind === "group") return model.groupById.has(id);
    if (kind === "annotation") return model.annotationById.has(id);
    return model.connectorById.has(id);
  }, [model]);
}

/** Les filtres posés, en mots (l'état vide les rappelle : on sait ce qu'on cherchait). */
function filtersText(f: JournalFilters): string[] {
  const out: string[] = [];
  if (f.q.trim()) out.push("« " + f.q.trim() + " »");
  if (f.categories.length) out.push(f.categories.map((c) => CATEGORY_LABEL[c]).join(", "));
  if (f.actions.length) out.push(f.actions.map((a) => ACTION_LABEL[a]).join(", "));
  if (f.authors.length) out.push(f.authors.join(", "));
  if (f.period === "range") out.push(rangeLabel(f.from, f.to, Date.now()));
  else if (f.period !== "all") out.push(PERIOD_LABEL[f.period]);
  return out;
}

/** Le nom d'un objet dont on lit l'historique : celui que le journal lui connaît, sinon celui de la run, sinon lui. */
function objectName(object: string, page: JournalPage | null, model: Model | null): string {
  const cited = page ? page.entries.flatMap((e) => e.subjects).find((s) => s.id === object && s.label) : undefined;
  if (cited) return cited.label;
  const group = model ? model.groupById.get(object) : undefined;
  return group && group.label ? group.label : object;
}

/** Sous l'en-tête : l'historique d'un objet (retirable) et le lien vers une entrée (« voir les plus récentes »). */
function Context({ page }: { page: JournalPage | null }) {
  const { state, commands } = useStore();
  const model = useModel();
  const f = state.view.journal;
  if (!f.object && f.rev === null) return null;
  return (
    <div className="j-context">
      {f.object ? <span className="j-chip"><History aria-hidden="true" />Historique de <b>{objectName(f.object, page, model)}</b>
        <button type="button" className="j-chip-x" aria-label="quitter l'historique" title="quitter l'historique" onClick={() => commands.setJournal({ object: "" })}><X aria-hidden="true" /></button></span> : null}
      {f.rev !== null ? <span className="j-linked"><Link aria-hidden="true" />
        {!page || !page.start_missing ? <>Lien vers la révision r{f.rev}.</>
          : page.entries.length && isTrace(page.entries[0]) ? <>La révision r{f.rev} a été purgée du journal : voici la purge qui l'a retirée.</>
          : <>La révision r{f.rev} n'est pas dans le journal (purgée, ou hors des filtres) : voici les entrées les plus proches.</>}
        <button type="button" className="j-link-btn" onClick={() => commands.setJournal({})}>Voir les plus récentes</button></span> : null}
    </div>
  );
}

function States({ narrowed }: { narrowed: boolean }) {
  const { state, commands } = useStore();
  const j = state.journal;
  if (j.kind === "failed") {
    return (
      <div className="j-state error" role="alert">
        <p className="j-state-title"><TriangleAlert aria-hidden="true" />Le journal n'a pas pu être lu.</p>
        <p className="j-state-detail">{j.message}. Réessayez ; si l'erreur revient, le journal du serveur est à vérifier.</p>
        <Button onClick={() => commands.loadJournal(false)}><RotateCw /> Réessayer</Button>
      </div>
    );
  }
  if (j.kind !== "ready" || j.page.entries.length) return null;
  const reset = (): void => commands.setJournal({ q: "", authors: [], categories: [], actions: [], object: "", period: "all", from: "", to: "" });
  const posed = filtersText(state.view.journal);
  return (
    <div className="j-state">{narrowed ? <>
      <p className="j-state-title">Aucune modification ne correspond.</p>
      {posed.length ? <p className="j-state-detail">Filtres posés : {posed.join(" · ")}</p> : null}
      <Button onClick={reset}>Effacer les filtres</Button></>
      : <p>Aucune modification enregistrée. Chaque épingle, couleur, groupe, annotation ou connecteur enregistré sous un nom s'inscrit ici.</p>}</div>
  );
}

/** Le volet d'aide : les raccourcis et ce que le journal garde (il était sous cent lignes, en bas de page). */
function Help({ onClose, onLeave }: { onClose: () => void; onLeave: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const away = (event: PointerEvent): void => { if (box.current && !box.current.contains(event.target as Node) && !(event.target as HTMLElement).closest(".j-help-open")) onClose(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const keys: [string[], string][] = [[["/"], "chercher"], [["↑", "↓"], "entrée précédente, suivante"], [["Entrée"], "déplier le détail"],
    [["o"], "montrer l'objet cité dans le Diagramme"], [["Échap"], "vider la recherche"]];
  return (
    <div ref={box} className="j-help" role="dialog" aria-label="aide du journal" tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}
      onBlur={(event) => { const to = event.relatedTarget as Node | null; if (to && !event.currentTarget.contains(to) && !(to as HTMLElement).closest?.(".j-help-open")) onLeave(); }}>
      <div className="j-help-head"><h2>Lire le journal</h2><button type="button" className="j-help-close" aria-label="fermer l'aide" onClick={onClose}><X aria-hidden="true" /></button></div>
      <dl className="j-keys">{keys.map(([k, what]) => <div key={what}><dt>{k.map((key) => <kbd key={key}>{key}</kbd>)}</dt><dd>{what}</dd></div>)}</dl>
      <ul className="j-help-notes">
        <li>Une ligne est une requête acceptée ; la révision est celle de l'intention juste après.</li>
        <li>Le journal garde la valeur posée, pas celle d'avant ; une annulation (Ctrl+Z) s'y lit comme une modification.</li>
        <li>L'auteur est le nom saisi dans la page : il est déclaré, pas authentifié.</li>
        <li>Les heures sont locales ; l'export CSV les écrit en UTC.</li>
      </ul>
    </div>
  );
}

export function Journal() {
  const { state, commands } = useStore();
  const f = state.view.journal, j = state.journal, ui = state.journalUi;
  const page = j.kind === "ready" || j.kind === "loading" ? j.page : null;
  const busy = j.kind === "loading", more = j.kind === "ready" && j.more;
  const presence = usePresence();
  const words = useMemo(() => f.q.trim().split(/\s+/).filter(Boolean), [f.q]);
  const items = useMemo(() => (page ? fold(page.entries) : []), [page]);
  const days = useMemo(() => byDay(items, Date.now()), [items]);
  const main = useRef<HTMLDivElement>(null), head = useRef<HTMLElement>(null), foot = useRef<HTMLDivElement>(null);
  const scrolled = useRef(ui.scroll); // tenu à chaque défilement : au démontage, `.j-main` est déjà détaché (scrollTop = 0)
  const [active, setActive] = useState<string | null>(ui.active);
  const [help, setHelp] = useState(false);
  const [said, setSaid] = useState("");
  const live = active && items.some((i) => i.key === active) ? active : items.length ? items[0].key : null;
  const openRef = useRef(ui.open), activeRef = useRef(live);
  openRef.current = ui.open;
  activeRef.current = live;
  const onToggle = useCallback((key: string) => {
    const open = openRef.current;
    commands.journalUi({ open: open.includes(key) ? open.filter((k) => k !== key) : open.concat(key) });
  }, [commands]);
  const show = useCallback((infrastructure: string, kind: RefKind, id: string) => commands.showFromJournal(infrastructure, kind, id), [commands]);
  const history = useCallback((object: string, infrastructure: string) => commands.openHistory(object, infrastructure), [commands]);
  // le lien vers une entrée : la ligne visée est surlignée, focalisée et amenée en vue, une fois par lien
  // jamais une trace de purge (elle partage sa révision avec la dernière entrée : revue, M1) ; rien si la révision manque
  const target = f.rev === null || !page || page.start_missing ? null : items.find((i) => entriesOf(i).some((e) => e.revision === f.rev && !isTrace(e))) || null;
  const reached = useRef<string | null>(null);
  useEffect(() => {
    const goal = target ? target.key + "|" + f.rev : null;
    if (!target || !goal || reached.current === goal) return;
    const el = headOf(target.key);
    if (!el) return;
    reached.current = goal;
    setActive(target.key);
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center" });
  });
  const headOf = (key: string | null): HTMLElement | null =>
    (key && main.current ? Array.from(main.current.querySelectorAll<HTMLElement>(".j-row-head")).find((el) => el.dataset.item === key) || null : null);
  // L'en-tête figé : sa hauteur pose celle des en-têtes du tableau, figés dessous (elle change avec la largeur).
  useLayoutEffect(() => {
    const box = main.current, top = head.current;
    if (!box || !top || typeof ResizeObserver === "undefined") return undefined;
    const place = (): void => box.style.setProperty("--head-h", top.offsetHeight + "px");
    place();
    const watch = new ResizeObserver(place);
    watch.observe(top);
    return () => watch.disconnect();
  }, []);
  // Le défilement : rendu à l'arrivée (une fois la page là), gardé au départ ; au retour du Diagramme, le focus revient
  // sur la ligne quittée.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !page || !main.current) return;
    restored.current = true;
    main.current.scrollTop = ui.scroll;
    if (ui.refocus) {
      commands.journalUi({ refocus: false });
      const el = headOf(ui.active);
      if (el) {
        el.focus({ preventScroll: true });
        const box = main.current.getBoundingClientRect(), at = el.getBoundingClientRect();
        if (at.top < box.top + 100 || at.bottom > box.bottom) el.scrollIntoView({ block: "center" }); // jamais un focus caché
      }
    }
  }, [page, ui.scroll, ui.refocus, ui.active, commands]);
  useEffect(() => {
    const box = main.current;
    return () => { commands.journalUi({ scroll: box && box.isConnected ? box.scrollTop : scrolled.current, active: activeRef.current }); };
  }, [commands]);
  // « Entrées plus anciennes » : le focus va à la première entrée arrivée (le bouton peut disparaître à la dernière page).
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const at = pending.current;
    if (at === null || !page || page.entries.length <= at) return;
    pending.current = null;
    const target = items.find((item) => entriesOf(item).includes(page.entries[at]));
    const el = target ? headOf(target.key) : null;
    if (target && el) { setActive(target.key); el.focus(); }
  }, [page, items]);
  const loadMore = (): void => { if (!page || more) return; pending.current = page.entries.length; commands.loadJournal(true); };
  // La suite se lit en arrivant au bas du fil (sans déplacer le focus) ; l'observateur repart à chaque page arrivée, pour
  // lire encore si la page reçue est trop courte pour remplir l'écran.
  const next = page ? page.next : null, count = page ? page.entries.length : 0;
  useEffect(() => {
    const box = main.current, end = foot.current;
    if (!box || !end || !next || more || busy || typeof IntersectionObserver === "undefined") return undefined;
    const watch = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) commands.loadJournal(true); }, { root: box, rootMargin: "0px 0px 600px 0px" });
    watch.observe(end);
    return () => watch.disconnect();
  }, [next, count, more, busy, commands]);
  // Le fil au clavier : une seule étape de tabulation (la ligne active), les flèches pour le reste.
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const el = event.target as HTMLElement;
    if (!el.classList.contains("j-row-head") || !main.current) return;
    const heads = Array.from(main.current.querySelectorAll<HTMLElement>(".j-row-head"));
    const at = heads.indexOf(el);
    const to = event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? heads.length - 1 : null;
    if (to !== null) { event.preventDefault(); const target = heads[Math.max(0, Math.min(heads.length - 1, to))]; if (target) target.focus(); return; }
    if (event.key.toLowerCase() === "o" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const item = items.find((i) => i.key === el.dataset.item);
      const ref = item ? firstRef(firstEntry(item)) : null;
      if (!item || !ref) return;
      event.preventDefault();
      if (presence(firstEntry(item).infrastructure, ref.ref, ref.id)) show(firstEntry(item).infrastructure, ref.ref, ref.id);
      else setSaid(ref.text + " : " + goneWord(ref.ref) + ", rien à montrer"); // « o » ne faisait rien, sans le dire
    }
  };
  const toList = (): void => { const el = main.current?.querySelector<HTMLElement>('.j-row-head[tabindex="0"]'); if (el) el.focus(); };
  const closeHelp = useCallback(() => { setHelp(false); main.current?.querySelector<HTMLElement>(".j-help-open")?.focus(); }, []);
  const narrowed = filtered(f);
  const all = f.infrastructure === "*";
  const scope = all ? "toutes les infrastructures" : f.infrastructure && f.infrastructure !== state.address.infrastructure ? f.infrastructure : "";
  // pendant une lecture, le compte d'avant reste (une lecture dure quelques millisecondes : « lecture… » clignotait)
  const status = j.kind === "failed" ? "lecture impossible" : !page ? "lecture…" : totalText(page.total, narrowed);
  return (
    <section className="journal" aria-label="journal des modifications">
      <div className="j-main" ref={main} onScroll={(event) => { scrolled.current = event.currentTarget.scrollTop; }}>
        <button type="button" className="j-skip" onClick={toList}>Aller aux entrées</button>
        <header className="j-head" ref={head}>
          <div className="j-title">
            <div className="j-title-row">
              <h1>Journal</h1>
              <button type="button" className="j-help-open" aria-label="aide du journal : raccourcis et limites" aria-expanded={help ? "true" : "false"} aria-haspopup="dialog"
                title="raccourcis et limites du journal" onClick={() => setHelp((open) => !open)}><Info aria-hidden="true" /></button>
              {help ? <Help onClose={closeHelp} onLeave={() => setHelp(false)} /> : null}
            </div>
            <p><span aria-live="polite">{status}{scope ? <> · {scope}</> : null}</span> · heures {zoneLabel(Date.now())}</p>
          </div>
          <Tools />
          <Context page={page} />
        </header>
        <span className="sr-only" aria-live="polite">{said}</span>
        {page && page.unreadable ? <p className="j-warn"><TriangleAlert aria-hidden="true" />{plural(page.unreadable, "ligne illisible sautée", "lignes illisibles sautées")} dans le journal du serveur</p> : null}
        <States narrowed={narrowed} />
        {page && page.entries.length ? (
          <div className={"j-list" + (busy ? " busy" : "") + (all ? " with-infra" : "")} aria-busy={busy ? "true" : "false"} onKeyDown={keys}>
            <div className="j-table">
              <div className="j-cols" aria-hidden="true">
                <span>Heure</span><span /><span>Auteur</span><span>Modification</span>{all ? <span className="j-col-infra">Infrastructure</span> : null}
                <span className="j-col-rev">Révision</span><span />
              </div>
              {days.map((group) => (
                <section key={group.day + firstEntry(group.items[0]).at} className="j-day" aria-label={group.day}>
                  <h2>{group.day}</h2>
                  <ol>{group.items.map((item: JournalItem) => (
                    <Row key={item.key} item={item} open={ui.open.includes(item.key)} active={item.key === live} target={!!target && item.key === target.key} showInfra={all} words={words}
                      presence={presence} show={show} onToggle={onToggle} onFocusRow={setActive} history={history} />
                  ))}</ol>
                </section>
              ))}
            </div>
            <div className="j-foot" ref={foot}>
              {page.next ? <Button onClick={loadMore} aria-disabled={more ? "true" : undefined}>{more ? "Lecture…" : "Entrées plus anciennes"}</Button> : <span>Début du journal</span>}
              <span className="j-shown">{f.rev !== null ? page.entries.length + " lues à partir de r" + f.rev + " · " + page.total + " en tout" : page.entries.length + " sur " + page.total}</span>
            </div>
          </div>
        ) : null}
        {page || j.kind === "failed" ? <p className="j-note">{NOTE}</p> : null}
      </div>
      <Facets />
    </section>
  );
}
