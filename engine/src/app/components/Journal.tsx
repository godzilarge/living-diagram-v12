// La vue Journal (2026-10-09) : qui a modifié quoi dans l'intention (épingles, couleurs, groupes, annotations,
// connecteurs), quand, sur quelle infrastructure. Une page pleine à la place de la toile (montée dessous, inerte). Dans
// l'ordre du document (celui du clavier et du lecteur d'écran) : le titre, la recherche et la période, le fil, puis les
// facettes, posées à gauche par la grille. Le fil : par jour, une ligne par entrée, les suites d'un même geste
// repliées (« ×8 »), les positions estompées (elles font l'essentiel du journal, une suppression doit ressortir).
// Au clavier : ↑↓ Origine Fin d'une ligne à l'autre (une seule étape de tabulation pour tout le fil), Entrée déplie,
// « o » montre l'objet cité. Le contexte (pages lues, lignes dépliées, défilement) survit à l'aller-retour vers le
// Diagramme (journal-commands.ts). Lecture seule ; aucun appel réseau ici.
import { RotateCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { byDay, entriesOf, filtered, firstEntry, fold, zoneLabel } from "../state/journal";
import type { JournalItem, RefKind } from "../state/journal";
import { firstRef } from "../state/journal-text";
import { useModel, useStore } from "../state/store";
import { Button, plural } from "../ui";
import { Facets } from "./journal/Facets";
import { Row } from "./journal/Row";
import type { Presence } from "./journal/shared";
import { Tools } from "./journal/Tools";

const NOTE = "Le journal garde ce qui a été posé, pas ce qu'il y avait avant ; une annulation (Ctrl+Z) s'y lit comme une modification. Les heures sont locales.";
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

function States({ narrowed }: { narrowed: boolean }) {
  const { state, commands } = useStore();
  const j = state.journal;
  if (j.kind === "failed") {
    return (
      <div className="j-state error" role="alert">
        <p className="j-state-title"><TriangleAlert aria-hidden="true" />Le journal n'a pas pu être lu.</p>
        <p className="j-state-detail">{j.message}. Réessayez ; si l'erreur revient, le journal du serveur est à vérifier.</p>
        <Button onClick={() => commands.loadJournal(false)}><RotateCw /> réessayer</Button>
      </div>
    );
  }
  if (j.kind !== "ready" || j.page.entries.length) return null;
  const reset = (): void => commands.setJournal({ q: "", authors: [], categories: [], period: "all" });
  return (
    <div className="j-state">{narrowed ? <><p>Aucune modification ne correspond à ces filtres.</p><Button onClick={reset}>effacer les filtres</Button></>
      : <p>Aucune modification enregistrée. Chaque épingle, couleur, groupe, annotation ou connecteur enregistré sous un nom s'inscrit ici.</p>}</div>
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
  const main = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const live = active && items.some((i) => i.key === active) ? active : items.length ? items[0].key : null;
  const openRef = useRef(ui.open);
  openRef.current = ui.open;
  const onToggle = useCallback((key: string) => {
    const open = openRef.current;
    commands.journalUi({ open: open.includes(key) ? open.filter((k) => k !== key) : open.concat(key) });
  }, [commands]);
  const show = useCallback((infrastructure: string, kind: RefKind, id: string) => commands.showFromJournal(infrastructure, kind, id), [commands]);
  // Le défilement : rendu à l'arrivée (une fois la page là), gardé au départ.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !page || !main.current) return;
    restored.current = true;
    main.current.scrollTop = ui.scroll;
  }, [page, ui.scroll]);
  useEffect(() => {
    const box = main.current;
    return () => { if (box) commands.journalUi({ scroll: box.scrollTop }); };
  }, [commands]);
  // « entrées plus anciennes » : le focus va à la première entrée arrivée (le bouton peut disparaître à la dernière page).
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const at = pending.current;
    if (at === null || !page || page.entries.length <= at) return;
    pending.current = null;
    const target = items.find((item) => entriesOf(item).includes(page.entries[at]));
    const head = target && main.current ? Array.from(main.current.querySelectorAll<HTMLElement>(".j-row-head")).find((el) => el.dataset.item === target.key) : null;
    if (target && head) { setActive(target.key); head.focus(); }
  }, [page, items]);
  const loadMore = (): void => { if (!page || more) return; pending.current = page.entries.length; commands.loadJournal(true); };
  // Le fil au clavier : une seule étape de tabulation (la ligne active), les flèches pour le reste.
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const el = event.target as HTMLElement;
    if (!el.classList.contains("j-row-head") || !main.current) return;
    const heads = Array.from(main.current.querySelectorAll<HTMLElement>(".j-row-head"));
    const at = heads.indexOf(el);
    const to = event.key === "ArrowDown" ? at + 1 : event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? heads.length - 1 : null;
    if (to !== null) { event.preventDefault(); const next = heads[Math.max(0, Math.min(heads.length - 1, to))]; if (next) next.focus(); return; }
    if (event.key.toLowerCase() === "o" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const item = items.find((i) => i.key === el.dataset.item);
      const ref = item ? firstRef(firstEntry(item)) : null;
      if (item && ref && presence(firstEntry(item).infrastructure, ref.ref, ref.id)) { event.preventDefault(); show(firstEntry(item).infrastructure, ref.ref, ref.id); }
    }
  };
  const toList = (): void => { const head = main.current?.querySelector<HTMLElement>('.j-row-head[tabindex="0"]'); if (head) head.focus(); };
  const narrowed = filtered(f);
  const scope = f.infrastructure === "*" ? "toutes les infrastructures" : f.infrastructure && f.infrastructure !== state.address.infrastructure ? f.infrastructure : "";
  // pendant une lecture, le compte d'avant reste (une lecture dure quelques millisecondes : « lecture… » clignotait)
  const status = j.kind === "failed" ? "lecture impossible" : !page ? "lecture…" : totalText(page.total, narrowed);
  return (
    <section className="journal" aria-label="journal des modifications">
      <div className="j-main" ref={main}>
        <header className="j-head">
          <div className="j-title">
            <h1>Journal</h1>
            <p aria-live="polite">{status}{scope ? <> · {scope}</> : null} · heures {zoneLabel(Date.now())}</p>
          </div>
          <Tools />
        </header>
        <button type="button" className="j-skip" onClick={toList}>aller aux entrées</button>
        {page && page.unreadable ? <p className="j-warn"><TriangleAlert aria-hidden="true" />{plural(page.unreadable, "ligne illisible sautée", "lignes illisibles sautées")} dans le journal du serveur</p> : null}
        <States narrowed={narrowed} />
        {page && page.entries.length ? (
          <div className={"j-list" + (busy ? " busy" : "") + (f.infrastructure === "*" ? " with-infra" : "")} aria-busy={busy ? "true" : "false"} onKeyDown={keys}>
            <div className="j-table">
              <div className="j-cols" aria-hidden="true">
                <span>Heure</span><span /><span>Auteur</span><span>Modification</span>{f.infrastructure === "*" ? <span className="j-col-infra">Infrastructure</span> : null}
                <span className="j-col-rev">Révision</span><span />
              </div>
              {days.map((group) => (
                <section key={group.day + firstEntry(group.items[0]).at} className="j-day" aria-label={group.day}>
                  <h2>{group.day}</h2>
                  <ol>{group.items.map((item: JournalItem) => (
                    <Row key={item.key} item={item} open={ui.open.includes(item.key)} active={item.key === live} showInfra={f.infrastructure === "*"} words={words}
                      presence={presence} show={show} onToggle={onToggle} onFocusRow={setActive} />
                  ))}</ol>
                </section>
              ))}
            </div>
            <div className="j-foot">
              {page.next ? <Button onClick={loadMore} aria-disabled={more ? "true" : undefined}>{more ? "lecture…" : "entrées plus anciennes"}</Button> : <span>début du journal</span>}
              <span className="j-shown">{page.entries.length} sur {page.total}</span>
            </div>
          </div>
        ) : null}
        <p className="j-note">{NOTE}</p>
      </div>
      <Facets />
    </section>
  );
}
