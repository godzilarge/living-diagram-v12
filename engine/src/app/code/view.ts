// L'état de vue des blocs de code (lot 16 de docs/11) : la première ligne montrée de chaque bloc (le défilement), le
// bloc copié à l'instant (l'icône passe à la coche), et le brouillon d'un bloc pas encore enregistré (un collage ou une
// insertion : rien n'existe tant que les valeurs sensibles n'ont pas été vues). Ni dans le contrat, ni au journal, ni
// dans l'historique, ni dans l'adresse : chacun lit où il veut. Un petit magasin à part, comme le brouillon d'un
// connecteur (drawing.tsx) : faire défiler un bloc ne redessine que lui, jamais la toile. Sans DOM ni minuterie.
import type { LanguageId } from "./languages";

/** Un bloc pas encore enregistré : son texte, son langage, sa boîte dans le plan, et ce qu'on lit déjà de lui. */
export interface CodeDraft { key: number; text: string; language: LanguageId; sure: boolean; x: number; y: number; w: number; h: number; pasted: boolean }

export interface CodeView {
  first: (id: string) => number;
  setFirst: (id: string, first: number) => void;
  copied: () => string | null;
  setCopied: (id: string | null) => void;
  draft: () => CodeDraft | null;
  setDraft: (draft: CodeDraft | null) => void;
  /** Un abonnement : `version()` change à chaque écriture (un bloc relit sa ligne, la couche son brouillon). */
  subscribe: (listener: () => void) => () => void;
  version: () => number;
}

export function createCodeView(): CodeView {
  const firsts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let copied: string | null = null, draft: CodeDraft | null = null, version = 0;
  const changed = (): void => { version += 1; listeners.forEach((listener) => listener()); };
  return {
    first: (id) => firsts.get(id) || 0,
    setFirst: (id, first) => { if ((firsts.get(id) || 0) === first) return; if (first) firsts.set(id, first); else firsts.delete(id); changed(); },
    copied: () => copied,
    setCopied: (id) => { if (copied === id) return; copied = id; changed(); },
    draft: () => draft,
    setDraft: (next) => { if (draft === next) return; draft = next; changed(); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => version,
  };
}

/** L'état de vue de la page : un seul, partagé par la toile, la fiche et les commandes. */
export const codeView = createCodeView();
