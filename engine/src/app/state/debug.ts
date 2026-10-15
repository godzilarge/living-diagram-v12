// Un regard sur l'état pour les tests dans Chromium (`LDApp.debug.state()`), posé par le Store à chaque rendu, et sur
// l'écriture ouverte d'un bloc de code (`LDApp.debug.editor()`, la vue CodeMirror, posée par le champ d'écriture).
// Jamais lu par un composant.
import type { AppState } from "./types";
import type { CanvasHandle } from "./store";

const seen: { state: AppState | null; handle: CanvasHandle | null; editor: unknown } = { state: null, handle: null, editor: null };
export const debug = {
  note: (state: AppState, handle: CanvasHandle | null): void => { seen.state = state; seen.handle = handle; },
  state: (): AppState | null => seen.state,
  handle: (): CanvasHandle | null => seen.handle,
  /** La vue CodeMirror de l'écriture en cours (`null` : aucune). */
  editor: (): unknown => seen.editor,
  noteEditor: (view: unknown): void => { seen.editor = view; },
};
