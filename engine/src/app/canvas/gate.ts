// Les gestes en cours sur la toile (glissé, rectangle, redimensionnement, bout de connecteur, outil, Alt + glissé,
// édition en place), vus de l'extérieur : la barre contextuelle (lot 4 de docs/11) s'efface tant qu'il y en a un et
// revient après. La toile React Flow (Flow.tsx) les déclare par raison ; la barre s'abonne. Sans minuterie (la page
// fournit le délai de retour), sans DOM ni React.
export interface Gate {
  /** Un geste commence (`on`) ou finit, sous une raison (« drag », « resize:a1-1 »…). */
  set: (reason: string, on: boolean) => void;
  busy: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

export function createGate(): Gate {
  const reasons = new Set<string>();
  const listeners = new Set<() => void>();
  let busy = false;
  return {
    set: (reason, on) => {
      if (on) reasons.add(reason); else reasons.delete(reason);
      const now = reasons.size > 0;
      if (now === busy) return;
      busy = now;
      listeners.forEach((listener) => listener());
    },
    busy: () => busy,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
