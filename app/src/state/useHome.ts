// The home's state: the token, the infrastructures (with the `homeRuns` latest collections of each) and the journal
// (its `homeChanges` latest entries), each read again when its count changes (the data shown stays until the new one
// comes); then the diffs of the collections the widget shows on screen, read one at a time in the order their rows
// came into view (`diff-queue.ts`). A 401 from any call forgets the token and asks for it again; any other refusal
// stays in its widget. `now` moves every minute, so "2 hr ago" stays true while the page is open. The only place of
// the home that calls the API; the components render this and report the rows they see.
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDiff, loadInfrastructures, loadJournal } from "../api/home";
import type { InfrastructureList, Journal } from "../api/home";
import { readToken, writeToken } from "../api/http";
import type { Answer } from "../api/http";
import { EMPTY_QUEUE, markAsked, nextToAsk, seeRows } from "./diff-queue";
import { latestRuns } from "./home";
import type { DiffOutcome, RunRow } from "./home";

const MINUTE_MS = 60_000;

/** Why a widget has no data: the API refused with a status, answered outside its contract, or did not answer. */
export type Cause = number | "invalid" | "unreachable";
/** A widget's data: still reading, there, or why not. */
export type Load<T> = Readonly<{ kind: "loading" }> | Readonly<{ kind: "ok"; data: T }> | Readonly<{ kind: "failed"; cause: Cause }>;
/** `missing`: no token stored; `refused`: the API said 401 to the one stored or typed. */
export type TokenState = "present" | "missing" | "refused";

export type HomeState = Readonly<{
  token: TokenState;
  infrastructures: Load<InfrastructureList>;
  journal: Load<Journal>;
  diffs: ReadonlyMap<string, DiffOutcome>;
  now: number;
}>;

/** How many rows the two widgets with a choice list (the browser's preferences). */
export type HomeCounts = Readonly<{ runs: number; changes: number }>;
/** Rows of "Latest collections" that came into view and that left it, by key. */
export type SeeRows = (shown: readonly string[], hidden: readonly string[]) => void;

const LOADING = { kind: "loading" } as const;

export function loadOf<T>(answer: Answer<T>): Load<T> {
  if (answer.kind === "ok") return { kind: "ok", data: answer.data };
  if (answer.kind === "failed") return { kind: "failed", cause: answer.status };
  return { kind: "failed", cause: answer.kind === "invalid" ? "invalid" : "unreachable" };
}

function initial(): HomeState {
  return { token: readToken() ? "present" : "missing", infrastructures: LOADING, journal: LOADING, diffs: new Map(), now: Date.now() };
}

/** The diffs read for the rows on screen: the queue, the request in flight, the rows by key. */
function useDiffQueue(setState: (update: (s: HomeState) => HomeState) => void, refuse: () => void) {
  const queue = useRef(EMPTY_QUEUE);
  const inFlight = useRef<string | null>(null);
  const runs = useRef<ReadonlyMap<string, RunRow>>(new Map());
  const epoch = useRef(0);

  const pump = useCallback(() => {
    const token = readToken();
    if (inFlight.current || !token) return;
    const key = nextToAsk(queue.current, (k) => !!runs.current.get(k)?.previous_run_id);
    const run = key ? runs.current.get(key) : undefined;
    if (!key || !run?.previous_run_id) return;
    queue.current = markAsked(queue.current, key);
    inFlight.current = key;
    const at = epoch.current;
    void loadDiff(token, run.infrastructure, run.previous_run_id, run.run_id).then((answer) => {
      if (at !== epoch.current) return; // the token changed meanwhile: the queue was reset
      inFlight.current = null;
      if (answer.kind === "unauthorized") return refuse();
      const outcome: DiffOutcome = answer.kind === "ok" ? { kind: "ok", facts: answer.data } : { kind: "failed" };
      setState((s) => ({ ...s, diffs: new Map(s.diffs).set(key, outcome) }));
      pump();
    });
  }, [refuse, setState]);

  const see: SeeRows = useCallback(
    (shown, hidden) => {
      queue.current = seeRows(queue.current, shown, hidden);
      pump();
    },
    [pump],
  );
  const setRuns = useCallback(
    (list: readonly RunRow[]) => {
      runs.current = new Map(list.map((run) => [run.key, run]));
      pump();
    },
    [pump],
  );
  const reset = useCallback(() => {
    epoch.current += 1;
    queue.current = EMPTY_QUEUE;
    inFlight.current = null;
  }, []);
  return { see, setRuns, reset };
}

export function useHome(counts: HomeCounts): Readonly<{ state: HomeState; connect: (token: string) => void; see: SeeRows }> {
  const [state, setState] = useState<HomeState>(initial);
  const [generation, setGeneration] = useState(0);
  const resetRef = useRef<() => void>(() => undefined);
  const refuse = useCallback(() => {
    writeToken("");
    resetRef.current();
    setState((s) => ({ ...s, token: "refused", infrastructures: LOADING, journal: LOADING, diffs: new Map() }));
  }, []);
  const diffs = useDiffQueue(setState, refuse);
  resetRef.current = diffs.reset;

  useEffect(() => {
    const timer = setInterval(() => setState((s) => ({ ...s, now: Date.now() })), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const { setRuns } = diffs;
  useEffect(() => {
    const token = readToken();
    if (!token) return undefined;
    let live = true;
    void loadInfrastructures(token, counts.runs).then((answer) => {
      if (!live) return;
      if (answer.kind === "unauthorized") return refuse();
      setState((s) => ({ ...s, token: "present", infrastructures: loadOf(answer), now: Date.now() }));
      if (answer.kind === "ok") setRuns(latestRuns(answer.data.infrastructures, counts.runs));
    });
    return () => {
      live = false;
    };
  }, [generation, counts.runs, refuse, setRuns]);

  useEffect(() => {
    const token = readToken();
    if (!token) return undefined;
    let live = true;
    void loadJournal(token, counts.changes).then((answer) => {
      if (!live) return;
      if (answer.kind === "unauthorized") return refuse();
      setState((s) => ({ ...s, journal: loadOf(answer) }));
    });
    return () => {
      live = false;
    };
  }, [generation, counts.changes, refuse]);

  const { reset } = diffs;
  const connect = useCallback(
    (token: string) => {
      if (!token.trim()) return;
      writeToken(token);
      reset();
      setState((s) => ({ ...s, token: "present", infrastructures: LOADING, journal: LOADING, diffs: new Map() }));
      setGeneration((g) => g + 1);
    },
    [reset],
  );

  return { state, connect, see: diffs.see };
}
