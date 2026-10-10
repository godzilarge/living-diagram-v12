// Le réducteur : pur, une action entre, un nouvel état sort (jamais de mutation). Testé sous Node.
import { tokenOf } from "../../canvas/model";
import { defaultView } from "./address";
import { defaultPrefs } from "./prefs";
import type { Action, AppState } from "./types";

export const initialState = (): AppState => ({
  token: "", author: "", address: { infrastructure: "", runId: "", from: "" }, runs: null, runsMessage: null, listing: false,
  run: { kind: "idle" }, view: defaultView(), prefs: defaultPrefs(), selection: null, hosts: [], wanted: null, palette: { open: false, text: "" },
  expanded: false, menuOpen: false, connectOpen: false, colorsOpen: false, note: null, history: { undo: null, redo: null }, revision: 0, walk: null,
  context: null, editRequest: null, journal: { kind: "idle" }, journalUi: { open: [], scroll: 0, back: false, active: null, refocus: false },
});

const sameHosts = (a: string[], b: string[]): boolean => a.length === b.length && a.every((host, i) => host === b[i]);

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "session":
      return { ...state, token: action.token === undefined ? state.token : action.token, author: action.author === undefined ? state.author : action.author };
    case "address":
      return { ...state, address: action.address };
    case "listing":
      return { ...state, listing: true, runsMessage: null };
    case "runs":
      return { ...state, listing: false, runs: action.runs, runsMessage: action.message };
    case "loading": {
      // La sélection traverse les runs par son identité (comme le fragment de `/view`) : l'élément lu devient une
      // sélection attendue, que la toile de la run suivante résoudra ; la sélection multiple, non.
      const token = state.run.kind === "ready" && state.selection ? tokenOf(state.run.model, state.selection) : null;
      const carried = state.wanted || (token ? { kind: token[0], token: token[1] } : null);
      return { ...state, run: { kind: "loading", infrastructure: action.infrastructure, runId: action.runId }, wanted: carried, selection: null, hosts: [],
        connectOpen: false, menuOpen: false, colorsOpen: false, walk: null, context: null, editRequest: null };
    }
    case "failed":
      return { ...state, run: { kind: "failed", message: action.message }, connectOpen: true };
    case "ready":
      // Une autre run : la sélection par identité traverse (la toile la résout), la sélection multiple non.
      return { ...state, run: { kind: "ready", model: action.model, data: action.data, warnings: action.warnings, remembered: action.remembered }, runs: action.runs === null ? state.runs : action.runs,
        hosts: [], expanded: false, connectOpen: false, palette: { ...state.palette, open: false } };
    case "view":
      return { ...state, view: { ...state.view, ...action.patch } };
    case "prefs":
      return { ...state, prefs: { ...state.prefs, ...action.patch } };
    case "select": {
      const same = state.selection === action.selection || (!!state.selection && !!action.selection && state.selection.kind === action.selection.kind && state.selection.id === action.selection.id);
      if (same && sameHosts(state.hosts, action.hosts)) return state.wanted ? { ...state, wanted: null } : state; // la toile a répondu, même sans changer
      return { ...state, selection: action.selection, hosts: action.hosts, expanded: same ? state.expanded : false, wanted: null };
    }
    case "want":
      return { ...state, wanted: action.wanted };
    case "palette":
      return { ...state, palette: { open: action.open === undefined ? state.palette.open : action.open, text: action.text === undefined ? state.palette.text : action.text }, menuOpen: false };
    case "expand":
      return { ...state, expanded: action.expanded };
    case "menu":
      return { ...state, menuOpen: action.open };
    case "connect":
      return { ...state, connectOpen: action.open, menuOpen: false };
    case "colors":
      return { ...state, colorsOpen: action.open, menuOpen: false };
    case "note":
      return { ...state, note: action.text === null ? null : { text: action.text, busy: !!action.busy, at: action.at || 0 } };
    case "history":
      return { ...state, history: { undo: action.undo, redo: action.redo } };
    case "touched":
      return { ...state, revision: state.revision + 1 };
    case "walk":
      return { ...state, walk: action.walk };
    case "context":
      return { ...state, context: action.menu, menuOpen: action.menu ? false : state.menuOpen };
    case "editRequest":
      return { ...state, editRequest: action.request };
    case "journal":
      return { ...state, journal: action.journal };
    case "journalUi":
      return { ...state, journalUi: { ...state.journalUi, ...action.patch } };
    default:
      return state;
  }
}
