// The diagram shell's effects around the pure reducer (`diagram.ts`): the token, the address read at start and kept
// in step with the state (the run in `?`, the view and the selection in `#`, never the token), the API (`api/run.ts`),
// the canvas handle (`Canvas` sets it: the only component that mounts the canvas) and the commands the islands send.
// A 401 anywhere forgets the token and asks for it again. An opening started later makes the earlier one mute.
// A run named by the address without its compared run (`from`) opens compared with the run before it, which the v1
// did not (there, an address without `from` opened without a diff): to judge in use, docs/a-juger-a-l-usage.md.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { build, tokenOf } from "@engine/canvas/model";
import type { Selection } from "@engine/canvas/types";
import type { StackHolder } from "@engine/app/canvas/undo";
import { emptyStack } from "@engine/app/state/history";
import type { Stack } from "@engine/app/state/history";
import { loadRun, loadRuns } from "../api/run";
import type { RunEntry, Session } from "../api/run";
import { readToken, writeToken } from "../api/http";
import { formatHash, formatSearch, parseHash, parseSearch, sameView } from "./address";
import type { Address, SelectionToken, ViewState } from "./address";
import { initialState, reducer, selectionTokenOf, shownView } from "./diagram";
import type { ContextMenuState, DiagramState, Tool } from "./diagram";
import { makeEditCommands } from "./edit-commands";
import type { EditCommands, EditHandle, Note } from "./edit-commands";
import { latestTarget, openTarget } from "./runs";
import type { Target } from "./runs";
import { DEFAULT_FILTERS } from "./journal";
import type { JournalFilters } from "./journal";
import type { RefKind } from "./journal-text";
import { zoomIn, zoomOut, zoomTo } from "./zoom";
import type { Insets } from "./zoom";
import type { Cause } from "./useHome";

/** What the shell holds of the mounted canvas: its toile, the size of its viewport, and the v1's hosts the editing
 *  goes through (`edit-commands.ts`). */
export type CanvasHandle = EditHandle;

export type DiagramCommands = Readonly<{
  connect: (token: string) => void;
  /** A 401 met elsewhere (the Log's reads): the token is forgotten and asked for again. */
  refuse: () => void;
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
  /** From Check: the Diagram view, the element awaited by the canvas that mounts (shown and centred). */
  showInDiagram: (selection: Selection | null) => void;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  /** Edit mode (brick 6): enters or leaves it; the tool, the context menu; an intent write accepted. */
  setEditing: (editing: boolean) => void;
  toggleEdit: () => void;
  setTool: (tool: Tool | null) => void;
  openContext: (menu: ContextMenuState) => void;
  closeContext: () => void;
  touched: () => void;
  /** The editing commands against the mounted canvas. */
  edit: EditCommands;
  /** The Log view (brick 7): a filter set (a link to an entry is left; another infrastructure leaves an object's
   *  history: an identity is unique in its infrastructure only); the history of one object (a hostname, an identity)
   *  from the context menu, the browser's Back coming back here; an object cited by an entry shown in the Diagram. */
  setJournal: (patch: Partial<JournalFilters>) => void;
  openHistory: (objects: readonly string[]) => void;
  showFromJournal: (kind: RefKind, id: string) => void;
}>;

const causeOf = (kind: "failed" | "invalid" | "unreachable", status?: number): Cause => (kind === "failed" ? (status ?? 0) : kind);

function startState(): DiagramState {
  const address = parseSearch(typeof location === "undefined" ? "" : location.search);
  const parsed = parseHash(typeof location === "undefined" ? "" : location.hash);
  return initialState(readToken() ? "present" : "missing", address, shownView(parsed.view), parsed.selection);
}

/** `insetsOf` says what the shell lays over the canvas at the moment a command runs (the panel comes and goes);
 *  `notify` shows what a command says (a toast, with its offer when it has one). */
export function useDiagram(insetsOf: () => Insets, notify: (note: Note | null) => void): Readonly<{ state: DiagramState; session: () => Session; commands: DiagramCommands; handle: CanvasHandle | null; history: StackHolder }> {
  const [state, dispatch] = useReducer(reducer, undefined, startState);
  const [handle, setHandleState] = useState<CanvasHandle | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const handleRef = useRef<CanvasHandle | null>(null);
  const opening = useRef(0);
  // the undo stack: one per infrastructure (the intent is), it crosses the runs; the canvas's undo controller reads it
  // its writes re-render the page: the palette's undo and redo buttons read the stack
  const stackRef = useRef<Stack>(emptyStack());
  const [, setStackVersion] = useState(0);
  const undoStack = useMemo<StackHolder>(() => ({ owner: () => stateRef.current.address.infrastructure, get: () => stackRef.current, set: (stack) => { stackRef.current = stack; setStackVersion((n) => n + 1); } }), []);
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
    const edit = makeEditCommands({
      dispatch, current: () => stateRef.current, session, handle: () => handleRef.current,
      setView: (patch) => dispatch({ type: "view", patch }), note: notify,
    });
    // the next write of the address adds an entry to the browser's history: Back comes back to the view left
    const pushNext = (): void => {
      if (typeof history !== "undefined") history.pushState(null, "", location.href);
    };
    return {
      edit,
      refuse,
      setJournal: (patch) => {
        const was = stateRef.current.view.journal;
        const moved = patch.infrastructure !== undefined && patch.infrastructure !== was.infrastructure && patch.objects === undefined;
        dispatch({ type: "view", patch: { journal: { ...was, rev: null, ...(moved ? { objects: [] } : {}), ...patch } } });
      },
      openHistory: (objects) => {
        if (!objects.length) return;
        pushNext();
        dispatch({ type: "view", patch: { mode: "journal", journal: { ...DEFAULT_FILTERS, objects: [...objects] } } });
      },
      showFromJournal: (kind, id) => {
        pushNext();
        dispatch({ type: "view", patch: { mode: "diagram" } });
        dispatch({ type: "want", wanted: { kind, token: id } });
      },
      setEditing: (editing) => dispatch({ type: "edit", editing }),
      toggleEdit: () => dispatch({ type: "edit", editing: !stateRef.current.editing }),
      setTool: (tool) => edit.setTool(tool),
      openContext: (menu) => dispatch({ type: "context", menu }),
      closeContext: () => { if (stateRef.current.context) dispatch({ type: "context", menu: null }); },
      touched: () => dispatch({ type: "touched" }),
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
      showInDiagram: (selection) => {
        const { run } = stateRef.current;
        const token = run.kind === "ready" && selection ? tokenOf(run.model, selection) : null;
        dispatch({ type: "view", patch: { mode: "diagram" } });
        if (token) dispatch({ type: "want", wanted: { kind: token[0], token: token[1] } });
      },
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
  }, [open, insetsOf, session, notify, refuse]);

  return { state, session, commands, handle, history: undoStack };
}

export type { Address, SelectionToken };
