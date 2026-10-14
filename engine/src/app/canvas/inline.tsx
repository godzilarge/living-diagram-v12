// Un champ d'une ligne posé sur la toile, dans le SVG d'un nœud (lot 2 de docs/11) : l'étiquette d'une forme, le nom
// d'un groupe sur son cadre. Entrée ou quitter enregistre, Échap abandonne ; ni glissé ni panoramique ne partent de lui.
import { useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { Point } from "../../canvas/layout";

/** La fin d'un champ d'édition en place, une seule fois : Entrée, Échap, la perte du focus, ou sa disparition. La toile
 *  ne monte que ce qui se voit (lot 13 de docs/11) : un nœud sorti du champ démonte son champ, qui enregistre alors
 *  comme s'il était quitté (le navigateur ne signale pas la perte du focus d'un élément retiré). */
export function useFinish(onDone: (text: string | null, next?: boolean) => void, initial: string): { finish: (text: string | null, next?: boolean) => void; track: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void } {
  const done = useRef(false), value = useRef(initial), latest = useRef(onDone);
  latest.current = onDone;
  useEffect(() => () => { if (!done.current) { done.current = true; latest.current(value.current, false); } }, []);
  const finish = (text: string | null, next?: boolean): void => { if (done.current) return; done.current = true; latest.current(text, next); };
  const track = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => { value.current = event.target.value; };
  return { finish, track };
}

export interface InlineProps { at: Point; width: number; height: number; initial: string; max: number; label: string; onDone: (text: string | null) => void }

export function InlineInput({ at, width, height, initial, max, label, onDone }: InlineProps) {
  const ref = useRef<HTMLInputElement>(null);
  const { finish, track } = useFinish(onDone, initial); // Entrée puis la perte du focus : une seule fin
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); finish(null); }
    else if (event.key === "Enter") { event.preventDefault(); finish((event.target as HTMLInputElement).value); }
  };
  return (
    <foreignObject x={at.x} y={at.y} width={width} height={height} className="cell-editor-slot">
      <input ref={ref} className="cell-editor inline-editor nodrag nopan nowheel" defaultValue={initial} maxLength={max} aria-label={label} spellCheck={false}
        onKeyDown={keys} onChange={track} onBlur={(event) => finish(event.target.value)} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} />
    </foreignObject>
  );
}
