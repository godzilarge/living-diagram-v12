// Les commandes de la vue Journal (2026-10-09), sorties du store : poser un filtre, lire une page (ou la suivante),
// montrer dans le Diagramme un objet qu'une entrée cite, revenir au Journal. Le contexte d'une enquête survit à
// l'aller-retour (revue Impeccable : l'auditeur perdait sa place) : les pages lues, les entrées dépliées et le
// défilement restent dans le store ; une relecture recharge autant d'entrées qu'on en voyait ; « montrer » ajoute une
// entrée à l'historique du navigateur, et Retour ramène au Journal.
import { fetchJournal } from "../api/client";
import type { Session } from "../api/client";
import { newer, queryOf } from "./journal";
import { csvName, csvOf } from "./journal-csv";
import type { JournalEntry, JournalFilters, JournalPage } from "./journal";
import type { Action, AppState, JournalUi, ViewState } from "./types";

export interface JournalDeps {
  dispatch: (action: Action) => void;
  current: () => AppState;
  session: () => Session;
  setView: (patch: Partial<ViewState>) => void;
  /** Le jeton refusé (401) : oublié, et l'accueil s'ouvre. */
  dropToken: () => void;
  /** La prochaine écriture de l'adresse ajoute une entrée à l'historique (au lieu de remplacer la courante). */
  pushNext: () => void;
  connect: (fields: { token: string; infrastructure: string; author: string }) => void;
}

export interface JournalCommands {
  setJournal: (patch: Partial<JournalFilters>) => void;
  loadJournal: (more: boolean) => void;
  showFromJournal: (infrastructure: string, kind: string, id: string) => void;
  backToJournal: () => void;
  journalUi: (patch: Partial<JournalUi>) => void;
  /** Toutes les entrées des filtres posés, page après page, en CSV (rien n'est affiché ni gardé). */
  exportJournal: () => Promise<JournalExport>;
}

export type JournalExport = { ok: true; csv: string; name: string; count: number; truncated: boolean } | { ok: false; message: string };

export const RELOAD_MAX = 500; // la borne de l'API : au-delà, la queue déjà lue est gardée telle quelle
export const EXPORT_MAX = 100_000; // entrées au plus dans un export (200 lectures) : au-delà, le fichier le dit

export function journalCommands(deps: JournalDeps): JournalCommands {
  const { dispatch, current, session, setView } = deps;
  const turn = { n: 0 };
  // Une lecture par jeu de filtres ; une réponse arrivée après un autre jeu ne s'écrit pas. Revenir sur les mêmes
  // filtres relit autant d'entrées qu'on en voyait (le journal a pu grandir entre-temps, la place reste).
  async function loadJournal(more: boolean): Promise<void> {
    const state = current(), filters = state.view.journal, infra = session().infrastructure;
    const key = JSON.stringify([filters, infra]);
    const was = state.journal;
    const cached = was.kind === "ready" && was.key === key ? was.page : null;
    const before = more && cached ? cached.next : null;
    if (more && !before) return;
    const n = ++turn.n;
    const at = more && was.kind === "ready" ? was.at : Date.now(); // la période se compte depuis la première page
    const limit = !more && cached ? Math.min(RELOAD_MAX, Math.max(100, cached.entries.length)) : undefined;
    const shown = was.kind === "ready" || was.kind === "loading" ? was.page : null;
    dispatch({ type: "journal", journal: more && cached ? { kind: "ready", key, at, page: cached, more: true } : { kind: "loading", key, at, page: shown } });
    const result = await fetchJournal(session().token, queryOf(filters, infra, at, before, limit));
    if (n !== turn.n) return;
    if (!result.ok) {
      dispatch({ type: "journal", journal: { kind: "failed", key, message: result.message } });
      if (result.status === 401) deps.dropToken();
      return;
    }
    dispatch({ type: "journal", journal: { kind: "ready", key, at, page: merged(result.page, cached, more), more: false } });
  }
  async function exportJournal(): Promise<JournalExport> {
    const filters = current().view.journal, infra = session().infrastructure, at = Date.now();
    const entries: JournalEntry[] = [];
    let before: string | null = null;
    do {
      const result = await fetchJournal(session().token, queryOf(filters, infra, at, before, RELOAD_MAX));
      if (!result.ok) { if (result.status === 401) deps.dropToken(); return { ok: false, message: result.message }; }
      entries.push(...result.page.entries);
      before = result.page.next;
    } while (before && entries.length < EXPORT_MAX);
    const scope = filters.infrastructure === "*" ? "toutes" : filters.infrastructure || infra;
    return { ok: true, csv: csvOf(entries), name: csvName(scope, new Date(at)), count: entries.length, truncated: !!before };
  }
  return {
    exportJournal,
    setJournal: (patch) => setView({ journal: { ...current().view.journal, ...patch } }),
    loadJournal: (more) => { void loadJournal(more); },
    showFromJournal: (infrastructure, kind, id) => {
      const state = current();
      deps.pushNext();
      dispatch({ type: "journalUi", patch: { back: true } });
      setView({ mode: "diagram" });
      dispatch({ type: "want", wanted: { kind, token: id } });
      if (infrastructure !== session().infrastructure) deps.connect({ token: session().token, infrastructure, author: state.author });
    },
    backToJournal: () => { dispatch({ type: "journalUi", patch: { back: false } }); setView({ mode: "journal" }); },
    journalUi: (patch) => dispatch({ type: "journalUi", patch }),
  };
}

/** La page lue, rangée avec ce qu'on avait : la suivante s'ajoute ; une relecture plus courte que ce qu'on voyait
 *  garde la queue déjà lue (plus ancienne que sa dernière entrée) et son curseur. */
function merged(page: JournalPage, cached: JournalPage | null, more: boolean): JournalPage {
  if (!cached) return page;
  if (more) return { ...page, entries: cached.entries.concat(page.entries) };
  const last = page.entries[page.entries.length - 1];
  if (!last || !page.next || cached.entries.length <= page.entries.length) return page;
  const tail = cached.entries.filter((e) => newer(last, e));
  return { ...page, entries: page.entries.concat(tail), next: cached.next };
}
