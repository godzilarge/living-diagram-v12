// Un champ d'une ligne posé sur la toile, dans le SVG d'un nœud (lot 2 de docs/11) : l'étiquette d'une forme, le nom
// d'un groupe sur son cadre. Entrée ou quitter enregistre, Échap abandonne ; ni glissé ni panoramique ne partent de lui.
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { Point } from "../../canvas/layout";

export interface InlineProps { at: Point; width: number; height: number; initial: string; max: number; label: string; onDone: (text: string | null) => void }

export function InlineInput({ at, width, height, initial, max, label, onDone }: InlineProps) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false); // Entrée puis la perte du focus : une seule fin
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  const finish = (text: string | null): void => { if (done.current) return; done.current = true; onDone(text); };
  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); finish(null); }
    else if (event.key === "Enter") { event.preventDefault(); finish((event.target as HTMLInputElement).value); }
  };
  return (
    <foreignObject x={at.x} y={at.y} width={width} height={height} className="cell-editor-slot">
      <input ref={ref} className="cell-editor inline-editor nodrag nopan nowheel" defaultValue={initial} maxLength={max} aria-label={label} spellCheck={false}
        onKeyDown={keys} onBlur={(event) => finish(event.target.value)} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} />
    </foreignObject>
  );
}
