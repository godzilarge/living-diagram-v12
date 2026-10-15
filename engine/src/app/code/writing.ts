// L'écriture en cours d'un bloc de code (lot 16 bis de docs/11), vue de la barre contextuelle : une seule écriture à
// la fois (un bloc ou un brouillon), ce qu'elle sait faire (enregistrer, abandonner, chercher, changer la taille, la
// police, le retour à la ligne) et ce que la barre en montre (la recherche, s'il y a des modifications, la taille…).
// La barre passe ainsi de « bloc sélectionné » à « écriture » à « recherche » sans second panneau. Un petit magasin à
// part, comme l'état de vue des blocs (view.ts) : écrire ne reconstruit pas la toile. Sans DOM ni minuterie.
import type { EditorSearch, SearchState } from "./search";

/** Ce que la barre peut demander à l'écriture. */
export interface WritingActions {
  save: () => void;
  /** Abandonner : les modifications du texte sont perdues (la barre demande deux clics s'il y en a). */
  abandon: () => void;
  setSize: (size: number) => void;
  setFont: (font: string) => void;
  setWrap: (wrap: boolean) => void;
  search: EditorSearch;
  /** Rendre le focus au texte (après un clic dans la barre). */
  focus: () => void;
  /** L'élément de l'écriture à l'écran : la barre se pose contre lui. */
  element: () => HTMLElement | null;
}
export interface Writing {
  /** « annotation:a3-1 » ou « draft:4 » : une écriture, une clé. */
  key: string;
  draft: boolean;
  size: number; font: string; wrap: boolean;
  dirty: boolean;
  search: SearchState;
  actions: WritingActions;
}

export interface WritingStore {
  get: () => Writing | null;
  /** Ouvrir (ou remplacer) l'écriture en cours. */
  open: (writing: Writing) => void;
  /** Ce qui change pendant l'écriture (recherche, modifications, taille…), pour la clé donnée seulement. */
  update: (key: string, patch: Partial<Omit<Writing, "key" | "actions">>) => void;
  /** Fermer l'écriture de cette clé (une autre, ouverte entre-temps, reste). */
  close: (key: string) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createWritingStore(): WritingStore {
  const listeners = new Set<() => void>();
  let current: Writing | null = null;
  const changed = (): void => listeners.forEach((listener) => listener());
  return {
    get: () => current,
    open: (writing) => { current = writing; changed(); },
    update: (key, patch) => {
      if (!current || current.key !== key) return;
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.every((k) => current && current[k] === patch[k])) return;
      current = { ...current, ...patch };
      changed();
    },
    close: (key) => { if (current && current.key === key) { current = null; changed(); } },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** L'écriture de la page : une seule, lue par la barre contextuelle et posée par le champ d'écriture. */
export const writing = createWritingStore();
