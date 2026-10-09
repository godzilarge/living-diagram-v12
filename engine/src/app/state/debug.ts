// Un regard sur l'état pour les tests dans Chromium (`LDApp.debug.state()`), posé par le Store à chaque rendu.
// Jamais lu par un composant.
import type { AppState } from "./types";
import type { CanvasHandle } from "./store";

const seen: { state: AppState | null; handle: CanvasHandle | null } = { state: null, handle: null };
export const debug = {
  note: (state: AppState, handle: CanvasHandle | null): void => { seen.state = state; seen.handle = handle; },
  state: (): AppState | null => seen.state,
  handle: (): CanvasHandle | null => seen.handle,
};
