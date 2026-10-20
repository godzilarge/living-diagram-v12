// The Log view's effects around its pure rules (`journal.ts`, `journal-load.ts`): the pages read from the API for
// the filters the address carries, the next page, a re-read as long as what was shown, the CSV export (every entry
// of the filters, page after page, nothing kept), and what the view remembers across a trip to the Diagram (the rows
// unfolded, the active row, the scroll). One read per set of filters; an answer that comes after another set is
// dropped. A 401 forgets the token (`onRefused`). The period counts from the first read of a set of filters.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadJournalPage } from "../api/journal";
import type { JournalEntry, JournalPage } from "../api/journal";
import { readToken } from "../api/http";
import type { Answer } from "../api/http";
import type { JournalFilters } from "./journal";
import { queryOf, sameFilters } from "./journal";
import { csvName, csvOf } from "./journal-csv";
import { EXPORT_MAX, merged, PAGE, RELOAD_MAX, reloadLimit } from "./journal-load";
import type { Cause, TokenState } from "./useHome";

export type JournalLoad =
  | Readonly<{ kind: "idle" }>
  /** Reading; `page`: what was shown meanwhile (the count of before stays: a read lasts milliseconds). */
  | Readonly<{ kind: "loading"; page: JournalPage | null }>
  /** `more`: the next page is being read. */
  | Readonly<{ kind: "ready"; page: JournalPage; more: boolean }>
  | Readonly<{ kind: "failed"; cause: Cause; page: JournalPage | null }>;

/** What the view remembers while the Diagram shows: the rows unfolded, the active row (its key), the scroll. */
export type JournalUi = Readonly<{ open: readonly string[]; active: string | null; scroll: number }>;
export const INITIAL_UI: JournalUi = Object.freeze({ open: [], active: null, scroll: 0 });

export type JournalExport = Readonly<{ ok: true; csv: string; name: string; count: number; truncated: boolean }> | Readonly<{ ok: false; cause: Cause }>;

export type JournalArgs = Readonly<{
  token: TokenState;
  filters: JournalFilters;
  /** The infrastructure open in the Diagram (the filters' `""`). */
  infrastructure: string;
  /** The view is on screen: its pages are read; off screen, what was read stays. */
  shown: boolean;
  onRefused: () => void;
}>;

export type JournalHook = Readonly<{
  load: JournalLoad;
  /** The last page read, whatever the load's state: its facets stay on screen during a read or after a failure. */
  facets: JournalPage | null;
  reload: () => void;
  loadMore: () => void;
  exportCsv: () => Promise<JournalExport>;
  ui: JournalUi;
  setUi: (patch: Partial<JournalUi>) => void;
}>;

const causeOf = (answer: Exclude<Answer<unknown>, { kind: "ok" } | { kind: "unauthorized" }>): Cause => (answer.kind === "failed" ? answer.status : answer.kind);
const pageOf = (load: JournalLoad): JournalPage | null => (load.kind === "idle" ? null : load.page);

export function useJournal({ token, filters, infrastructure, shown, onRefused }: JournalArgs): JournalHook {
  const [load, setLoad] = useState<JournalLoad>({ kind: "idle" });
  const [ui, setUiState] = useState<JournalUi>(INITIAL_UI);
  const facets = useRef<JournalPage | null>(null);
  const turn = useRef(0);
  // the filters the current pages answer, and the "now" their period counts from
  const read = useRef<{ filters: JournalFilters; infrastructure: string; at: number } | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  if (pageOf(load)) facets.current = pageOf(load);

  const fetchPage = useCallback(
    async (more: boolean): Promise<void> => {
      const was = loadRef.current;
      const current = read.current;
      const same = !!current && current.infrastructure === infrastructure && sameFilters(current.filters, filters);
      const cached = same && was.kind === "ready" ? was.page : null;
      const before = more && cached ? cached.next : null;
      if (more && !before) return;
      const n = ++turn.current;
      const at = more && current ? current.at : Date.now();
      read.current = { filters, infrastructure, at };
      const limit = !more && cached ? reloadLimit(cached.entries.length) : PAGE;
      setLoad(more && cached ? { kind: "ready", page: cached, more: true } : { kind: "loading", page: pageOf(was) });
      const answer = await loadJournalPage(readToken(), queryOf(filters, infrastructure, at, before, limit));
      if (n !== turn.current) return;
      if (answer.kind === "unauthorized") return onRefused();
      if (answer.kind !== "ok") return setLoad({ kind: "failed", cause: causeOf(answer), page: pageOf(loadRef.current) });
      setLoad({ kind: "ready", page: merged(answer.data, cached, more), more: false });
    },
    [filters, infrastructure, onRefused],
  );

  // the pages follow the filters while the view shows; coming back to the same filters re-reads as long as shown
  useEffect(() => {
    if (!shown || token !== "present" || !infrastructure) return;
    void fetchPage(false);
  }, [shown, token, infrastructure, fetchPage]);

  const exportCsv = useCallback(async (): Promise<JournalExport> => {
    const at = Date.now();
    const entries: JournalEntry[] = [];
    let before: string | null = null;
    do {
      // a link to an entry is not a filter: the export takes the latest too
      const answer: Answer<JournalPage> = await loadJournalPage(readToken(), queryOf({ ...filters, rev: null }, infrastructure, at, before, RELOAD_MAX));
      if (answer.kind === "unauthorized") {
        onRefused();
        return { ok: false, cause: 401 };
      }
      if (answer.kind !== "ok") return { ok: false, cause: causeOf(answer) };
      entries.push(...answer.data.entries);
      before = answer.data.next;
    } while (before && entries.length < EXPORT_MAX);
    const scope = filters.infrastructure === "*" ? "" : filters.infrastructure || infrastructure;
    return { ok: true, csv: csvOf(entries), name: csvName(scope, new Date(at)), count: entries.length, truncated: !!before };
  }, [filters, infrastructure, onRefused]);

  const setUi = useCallback((patch: Partial<JournalUi>) => setUiState((current) => ({ ...current, ...patch })), []);
  const reload = useCallback(() => void fetchPage(false), [fetchPage]);
  const loadMore = useCallback(() => void fetchPage(true), [fetchPage]);
  return useMemo(() => ({ load, facets: facets.current, reload, loadMore, exportCsv, ui, setUi }), [load, reload, loadMore, exportCsv, ui, setUi]);
}
