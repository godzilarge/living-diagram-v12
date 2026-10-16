// The diagram shell's effects around the pure reducer (`diagram.ts`): the token, the address read at start and kept
// in step with the state (the run in `?`, the view and the selection in `#`, never the token), the API (`api/run.ts`),
// the canvas handle (`Canvas` sets it: the only component that mounts the canvas) and the commands the islands send.
// A 401 anywhere forgets the token and asks for it again. An opening started later makes the earlier one mute.
// A run named by the address without its compared run (`from`) opens compared with the run before it, which the v1
// did not (there, an address without `from` opened without a diff): to judge in use, docs/a-juger-a-l-usage.md.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { build } from "@engine/canvas/model";
import type { Selection } from "@engine/canvas/types";
import type { Toile } from "@engine/app/canvas/toile";
import { loadRun, loadRuns } from "../api/run";
import type { RunEntry, Session } from "../api/run";
import { readToken, writeToken } from "../api/http";
import { formatHash, formatSearch, parseHash, parseSearch, sameView } from "./address";
import type { Address, SelectionToken, ViewState } from "./address";
import { initialState, reducer, selectionTokenOf, shownView } from "./diagram";
import type { DiagramState } from "./diagram";
import { latestTarget, openTarget } from "./runs";
import type { Target } from "./runs";
import { zoomIn, zoomOut, zoomTo } from "./zoom";
import type { Insets } from "./zoom";
import type { Cause } from "./useHome";

/** What the shell needs of the mounted canvas: its toile and the size of its viewport. */
export type CanvasHandle = Readonly<{ toile: Toile; area: () => Readonly<{ width: number; height: number }> }>;

export type DiagramCommands = Readonly<{
  connect: (token: string) => void;
  openFromBand: (runId: string) => void;
  compareTo: (from: string) => void;
  setView: (patch: Partial<ViewState>) => void;
  /** The canvas reports its selection. */
  select: (selection: Selection | null, hosts: readonly string[]) => void;
  /** A selection asked by the address that the run does not hold: forgotten. */
  dropWanted: () => void;
  /** The canvas reports its viewport. */
  setZoom: (zoom: number) => void;
  setHandle: (handle: CanvasHandle | null) => void;
  /** Centres the canvas on the selected element (the panel's "centre the view"). */
  center: () => void;
  /** Selects an element chosen elsewhere (a search result): the panel opens, the view stays. */
  openElement: (selection: Selection) => void;
  /** Selects an element chosen elsewhere and centres the view on it (the canvas shows it whatever hides it). */
  reveal: (selection: Selection) => void;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}>;

const causeOf = (kind: "failed" | "invalid" | "unreachable", status?: number): Cause => (kind === "failed" ? (status ?? 0) : kind);

function startState(): DiagramState {
  const address = parseSearch(typeof location === "undefined" ? "" : location.search);
  const parsed = parseHash(typeof location === "undefined" ? "" : location.hash);
  return initialState(readToken() ? "present" : "missing", address, shownView(parsed.view), parsed.selection);
}

/** `insetsOf` says what the shell lays over the canvas at the moment a command runs (the panel comes and goes). */
export function useDiagram(insetsOf: () => Insets): Readonly<{ state: DiagramState; session: () => Session; commands: DiagramCommands; handle: CanvasHandle | null }> {
  const [state, dispatch] = useReducer(reducer, undefined, startState);
  const [handle, setHandleState] = useState<CanvasHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const handleRef = useRef<CanvasHandle | null>(null);
  const opening = useRef(0);
  const session = useCallback((): Session => ({ token: readToken(), infrastructure: stateRef.current.address.infrastructure }), []);

  const refuse = useCallback(() => {
    writeToken("");
    dispatch({ type: "token", token: "refused" });
  }, []);

  const open = useCallback(
    async (target: Target): Promise<void> => {
      const turn = ++opening.current;
      const where = session();
      if (handleRef.current) handleRef.current.toile.flush();
      dispatch({ type: "address", address: { infrastructure: where.infrastructure, runId: target.runId, from: target.from } });
      dispatch({ type: "loading", infrastructure: where.infrastructure, runId: target.runId });
      const answer = await loadRun(where, target.runId, target.from);
      if (turn !== opening.current) return;
      if (answer.kind === "unauthorized") return refuse();
      if (answer.kind !== "ok") return dispatch({ type: "failed", cause: causeOf(answer.kind, answer.kind === "failed" ? answer.status : undefined) });
      const { data, runs, missing, remembered } = answer.data;
      dispatch({ type: "ready", model: build(data), data, missing, remembered, runs });
    },
    [session, refuse],
  );

  /** Lists the runs, then opens `runId` compared with the run before it (a run the list does not know opens alone),
   *  or the latest when no run is named. */
  const openListed = useCallback(
    async (runId: string): Promise<void> => {
      const turn = ++opening.current;
      const answer = await loadRuns(session());
      if (turn !== opening.current) return;
      if (answer.kind === "unauthorized") return refuse();
      if (answer.kind !== "ok") return dispatch({ type: "runs", runs: null, cause: causeOf(answer.kind, answer.kind === "failed" ? answer.status : undefined) });
      dispatch({ type: "runs", runs: answer.data, cause: null });
      const target = runId ? (openTarget(answer.data, runId) ?? { runId, from: "" }) : latestTarget(answer.data);
      if (target) void open(target);
    },
    [session, refuse, open],
  );

  // At start, and again after a token is typed: the run the address names (compared as the address says; without a
  // compared run, with the one before it), else the latest.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const { address } = stateRef.current;
    if (!readToken() || !address.infrastructure) return;
    if (address.runId && address.from) void open({ runId: address.runId, from: address.from });
    else void openListed(address.runId);
  }, [generation, open, openListed]);

  // The address follows the state: the run, the view, the selection by identity. Never the token.
  useEffect(() => {
    if (typeof history === "undefined" || typeof location === "undefined") return;
    const wanted = location.pathname + formatSearch(state.address) + formatHash(state.view, selectionTokenOf(state));
    if (location.pathname + location.search + location.hash !== wanted) history.replaceState(null, "", wanted);
  }, [state]);

  // The address edited by hand, or the browser's back and forward: the run, the view and the selection follow.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = (): void => {
      const next = parseHash(location.hash);
      if (!sameView(stateRef.current.view, next.view)) dispatch({ type: "view", patch: shownView(next.view) });
      dispatch({ type: "want", wanted: next.selection });
    };
    const onPop = (): void => {
      const where = parseSearch(location.search);
      const now = stateRef.current.address;
      if (where.infrastructure !== now.infrastructure) location.reload();
      else if (where.runId && (where.runId !== now.runId || where.from !== now.from)) void open({ runId: where.runId, from: where.from });
      onHash();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onPop);
    };
  }, [open]);

  const commands = useMemo<DiagramCommands>(() => {
    const runsOf = (): readonly RunEntry[] => stateRef.current.runs ?? [];
    const viewOf = (): Readonly<{ x: number; y: number; zoom: number }> | null => handleRef.current?.toile.viewport() ?? null;
    const apply = (next: ReturnType<typeof zoomTo>): void => handleRef.current?.toile.restoreView(next);
    const area = (): Readonly<{ width: number; height: number }> => handleRef.current?.area() ?? { width: 0, height: 0 };
    return {
      connect: (token) => {
        if (!token.trim()) return;
        writeToken(token);
        dispatch({ type: "token", token: "present" });
        setGeneration((g) => g + 1);
      },
      openFromBand: (runId) => {
        const target = openTarget(runsOf(), runId);
        if (target && runId !== stateRef.current.address.runId) void open(target);
      },
      compareTo: (from) => void open({ runId: stateRef.current.address.runId, from }),
      setView: (patch) => dispatch({ type: "view", patch }),
      select: (selection, hosts) => dispatch({ type: "select", selection, hosts }),
      dropWanted: () => dispatch({ type: "want", wanted: null }),
      setZoom: (zoom) => dispatch({ type: "zoom", zoom }),
      setHandle: (next) => {
        handleRef.current = next;
        setHandleState(next);
      },
      center: () => {
        const { selection } = stateRef.current;
        if (selection) handleRef.current?.toile.reveal(selection);
      },
      openElement: (selection) => handleRef.current?.toile.select(selection),
      reveal: (selection) => void handleRef.current?.toile.reveal(selection),
      fit: () => handleRef.current?.toile.fit(),
      zoomIn: () => {
        const view = viewOf();
        if (view) apply(zoomIn(view, area(), insetsOf()));
      },
      zoomOut: () => {
        const view = viewOf();
        if (view) apply(zoomOut(view, area(), insetsOf()));
      },
      zoomReset: () => {
        const view = viewOf();
        if (view) apply(zoomTo(view, 1, area(), insetsOf()));
      },
    };
  }, [open, insetsOf]);

  return { state, session, commands, handle };
}

export type { Address, SelectionToken };
