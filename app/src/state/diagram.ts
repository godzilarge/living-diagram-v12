// The diagram shell's state and the actions that change it (the v1's reducer, reduced to what brick 2 carries): the
// token, the address, the archived runs, the run being read or shown, the view (what the address carries), the
// selection the canvas reports, the selection asked by the address and not yet resolved, the zoom the canvas reports.
// Pure, tested under Node; the address is a projection of it (`address.ts`); `useDiagram` runs the effects.
import { tokenOf } from "@engine/canvas/model";
import type { Model, PageData, Selection } from "@engine/canvas/types";
import type { Missing, RunEntry } from "../api/run";
import { DEFAULT_VIEW } from "./address";
import type { Address, SelectionToken, ViewState } from "./address";
import type { Cause, TokenState } from "./useHome";

export type RunState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading"; infrastructure: string; runId: string }>
  | Readonly<{ kind: "failed"; cause: Cause }>
  | Readonly<{ kind: "ready"; model: Model; data: PageData; missing: readonly Missing[]; remembered: boolean }>;

export type DiagramState = Readonly<{
  token: TokenState;
  address: Address;
  /** The archived runs of the infrastructure, null until read or when the API refused (`runsCause` says why). */
  runs: readonly RunEntry[] | null;
  runsCause: Cause | null;
  run: RunState;
  view: ViewState;
  /** What the canvas says is selected: the element read when there is one, the devices of the selection. */
  selection: Selection | null;
  hosts: readonly string[];
  /** A selection asked by the address or carried from the previous run, to be resolved by the canvas once mounted. */
  wanted: SelectionToken | null;
  zoom: number;
}>;

export type Action =
  | Readonly<{ type: "token"; token: TokenState }>
  | Readonly<{ type: "address"; address: Address }>
  | Readonly<{ type: "runs"; runs: readonly RunEntry[] | null; cause: Cause | null }>
  | Readonly<{ type: "loading"; infrastructure: string; runId: string }>
  | Readonly<{ type: "failed"; cause: Cause }>
  | Readonly<{ type: "ready"; model: Model; data: PageData; missing: readonly Missing[]; remembered: boolean; runs: readonly RunEntry[] | null }>
  | Readonly<{ type: "view"; patch: Partial<ViewState> }>
  | Readonly<{ type: "select"; selection: Selection | null; hosts: readonly string[] }>
  | Readonly<{ type: "want"; wanted: SelectionToken | null }>
  | Readonly<{ type: "zoom"; zoom: number }>;

/** The modes the shell can show: Check and Log come with brick 7; until then an address naming them reads as the
 *  Diagram, and the address is rewritten so it says what the page shows. */
export const SHOWN_MODES: readonly ViewState["mode"][] = ["diagram"];
export const shownView = (view: ViewState): ViewState => (SHOWN_MODES.includes(view.mode) ? view : { ...view, mode: "diagram" });

export function initialState(token: TokenState, address: Address, view: ViewState = DEFAULT_VIEW, wanted: SelectionToken | null = null): DiagramState {
  return Object.freeze({ token, address, runs: null, runsCause: null, run: { kind: "idle" as const }, view, selection: null, hosts: [], wanted, zoom: 1 });
}

const sameSelection = (a: Selection | null, b: Selection | null): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);
const sameHosts = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((host, i) => host === b[i]);

/** The selected element as the address names it (by identity), or the one still awaited. */
export function selectionTokenOf(state: DiagramState): SelectionToken | null {
  if (state.selection && state.run.kind === "ready") {
    const token = tokenOf(state.run.model, state.selection);
    return token ? { kind: token[0], token: token[1] } : null;
  }
  return state.wanted;
}

export function reducer(state: DiagramState, action: Action): DiagramState {
  switch (action.type) {
    case "token":
      // a token refused while a run was being read: the run is not being read any more
      return { ...state, token: action.token, run: action.token === "present" ? state.run : { kind: "idle" as const } };
    case "address":
      return { ...state, address: action.address };
    case "runs":
      return { ...state, runs: action.runs, runsCause: action.cause };
    case "loading": {
      // the selection crosses runs by its identity: the element read becomes a selection awaited from the next canvas
      const carried = state.wanted ?? selectionTokenOf(state);
      return { ...state, run: { kind: "loading", infrastructure: action.infrastructure, runId: action.runId }, wanted: carried, selection: null, hosts: [] };
    }
    case "failed":
      return { ...state, run: { kind: "failed", cause: action.cause } };
    case "ready":
      return {
        ...state,
        run: { kind: "ready", model: action.model, data: action.data, missing: action.missing, remembered: action.remembered },
        runs: action.runs ?? state.runs,
        runsCause: action.runs ? null : state.runsCause,
        hosts: [],
      };
    case "view":
      return { ...state, view: { ...state.view, ...action.patch } };
    case "select": {
      const same = sameSelection(state.selection, action.selection) && sameHosts(state.hosts, action.hosts);
      if (same) return state.wanted ? { ...state, wanted: null } : state; // the canvas answered, even without a change
      return { ...state, selection: action.selection, hosts: action.hosts, wanted: null };
    }
    case "want":
      return { ...state, wanted: action.wanted };
    case "zoom":
      return state.zoom === action.zoom ? state : { ...state, zoom: action.zoom };
  }
}
