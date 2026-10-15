// La bulle au survol de la toile de l'application (tip.ts dit quoi, bubble.ts dessine où) : quand la montrer. Elle
// attend 100 ms avant sa première apparition (balayer la toile ne fait plus « pop-corn »), mais passe d'un élément à
// l'autre sans attendre (cachée depuis moins de 250 ms) ; pendant l'attente, le dernier point du pointeur est retenu,
// jamais le premier (critique du 2026-10-09). Lot 1 de docs/11 : jamais sur ce qui est sélectionné, jamais pendant un
// geste ni une édition en place (hover.ts, `tipAllowed`) ; elle revient quand la sélection change ou se vide. Échap la
// rejette (WCAG 1.4.13). La minuterie vit ici, dans la page (un hook React, `.tsx`), jamais dans le moteur.
import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { create as createTip } from "../../canvas/tip";
import type { Block, Tip } from "../../canvas/tip";
import { tipAllowed } from "./hover";
import type { Toile } from "./toile";

const TIP_DELAY_MS = 100, TIP_REARM_MS = 250;

export interface TipHost {
  svg: RefObject<SVGSVGElement | null>;
  show: (key: string, lines: () => Block[], event: ReactMouseEvent) => void;
  hide: () => void;
}

/** La bulle d'une toile : `selected` (les clés sélectionnées) et `busy` (un geste en cours) la font taire. */
export function useTips(container: RefObject<HTMLDivElement | null>, toile: Toile, selected: Set<string>, busy: () => boolean): TipHost {
  const svg = useRef<SVGSVGElement>(null);
  const tip = useRef<Tip | null>(null);
  const shown = useRef<string | null>(null);
  const timer = useRef<number | null>(null), hiddenAt = useRef(0);
  const waiting = useRef<{ key: string; lines: () => Block[]; x: number; y: number } | null>(null);
  const rules = useRef({ selected, busy });
  rules.current = { selected, busy };
  const allowed = (key: string): boolean => tipAllowed(key, rules.current.selected, rules.current.busy());
  const hide = useCallback((): void => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; waiting.current = null; }
    shown.current = null;
    if (tip.current && tip.current.group.getAttribute("visibility") === "visible") { tip.current.hide(); hiddenAt.current = performance.now(); }
  }, []);
  const place = useCallback((key: string, lines: () => Block[], x: number, y: number): void => {
    const el = container.current;
    if (!tip.current || !el || !allowed(key)) return;
    const rect = el.getBoundingClientRect(), i = toile.state.insets;
    const area = { x: i.left, y: i.top, width: Math.max(rect.width - i.left - i.right, 100), height: Math.max(rect.height - i.top - i.bottom, 100) };
    shown.current = key;
    tip.current.show(key + (toile.state.control ? ":control" : ""), lines, x - rect.left, y - rect.top, area);
  }, [container, toile]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = useCallback((key: string, lines: () => Block[], event: ReactMouseEvent): void => {
    if (!tip.current) return;
    // un élément qui n'a pas de bulle (sélectionné) fait partir celle d'à côté : la valeur sensible d'un bloc sélectionné
    // a la sienne, le reste du bloc non (audit du 2026-10-15)
    if (!allowed(key)) { if (shown.current || waiting.current) hide(); return; }
    const visible = tip.current.group.getAttribute("visibility") === "visible";
    if (visible || performance.now() - hiddenAt.current < TIP_REARM_MS) { place(key, lines, event.clientX, event.clientY); return; }
    waiting.current = { key, lines, x: event.clientX, y: event.clientY };
    if (timer.current === null) {
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const p = waiting.current; waiting.current = null;
        if (p) place(p.key, p.lines, p.x, p.y);
      }, TIP_DELAY_MS);
    }
  }, [place, hide]); // eslint-disable-line react-hooks/exhaustive-deps
  // La couche SVG en coordonnées d'écran, au-dessus de la toile ; Échap rejette la bulle.
  useEffect(() => {
    const layer = svg.current;
    if (!layer) return;
    const made = createTip(layer);
    tip.current = made;
    const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") hide(); };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); hide(); made.dispose(); tip.current = null; };
  }, [hide]);
  // L'élément montré vient d'être sélectionné : sa bulle s'en va.
  useEffect(() => { if (shown.current && selected.has(shown.current)) hide(); }, [selected, hide]);
  return { svg, show, hide };
}
