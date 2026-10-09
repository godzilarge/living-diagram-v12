// Les points d'ancrage (Orhan, 2026-10-09 : « pas de point d'ancrage sur les éléments, ça ne facilite pas
// l'alignement »). Chaque élément attachable (carte, disque, annotation, cadre de groupe) montre, survolé ou
// sélectionné quand on peut écrire, quatre points au milieu de ses côtés : tirer depuis l'un d'eux crée un connecteur
// dont le départ est ancré à ce côté, le bout d'arrivée suit le pointeur et s'accroche à ce qu'il survole (snap.ts).
// Les mêmes points se montrent sur l'élément visé pendant qu'un bout se glisse. Tout est en unités du plan ; les rayons
// se divisent par le zoom pour garder une taille d'écran.
import { useReactFlow, useStore } from "@xyflow/react";
import { useCallback, useContext, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { anchorPoint, FIXED_SIDES } from "../../canvas/connectors";
import type { Anchor, FixedSide } from "../../canvas/connectors";
import type { Frame } from "../../canvas/annotations";
import type { Point } from "../../canvas/layout";
import { AnnotationContext } from "./annotation";
import type { EndKind } from "./snap";

export const ANCHOR_R = 5, ANCHOR_HIT = 11;
/** L'inverse du zoom courant : ce qui doit garder une taille d'écran se multiplie par lui. */
export const useUnzoom = (): number => useStore((s) => 1 / Math.max(s.transform[2], 0.05));

/** Les quatre ancres d'un élément, dans les coordonnées de son `svg` ; tirer depuis l'une d'elles dessine un connecteur. */
export function Anchors({ frame, kind, id }: { frame: Frame; kind: EndKind; id: string }) {
  const rf = useReactFlow();
  const actions = useContext(AnnotationContext);
  const k = useUnzoom();
  const active = useRef<FixedSide | null>(null);
  const planAt = (event: ReactPointerEvent): Point => rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
  const down = useCallback((side: FixedSide) => (event: ReactPointerEvent<SVGCircleElement>): void => {
    event.stopPropagation(); event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    active.current = side;
    actions.drawStart({ kind, ref: id, side }, planAt(event));
  }, [actions, kind, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = useCallback((event: ReactPointerEvent<SVGCircleElement>): void => { if (active.current) actions.drawMove(planAt(event)); }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = useCallback((event: ReactPointerEvent<SVGCircleElement>): void => {
    if (!active.current) return;
    active.current = null;
    actions.drawEnd(planAt(event));
  }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g className="anchor-dots" data-anchors={id}>
      {FIXED_SIDES.map((side) => {
        const at = anchorPoint(frame, side);
        return (
          <g key={side} className="anchor" data-side={side}>
            <circle className="anchor-hit nodrag nopan" cx={at.x} cy={at.y} r={ANCHOR_HIT * k} onPointerDown={down(side)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
            <circle className="anchor-dot" cx={at.x} cy={at.y} r={ANCHOR_R * k} />
          </g>
        );
      })}
    </g>
  );
}

/** Les ancres de l'élément visé pendant qu'un bout se glisse (celle qui accroche, en plein) ; `rel` ramène le plan
 *  dans les coordonnées du `svg` qui les dessine. */
export function AnchorDots({ anchors, snapped, rel, k }: { anchors: Anchor[]; snapped: Anchor | null; rel: (p: Point) => Point; k: number }) {
  return (
    <g className="anchor-dots target" aria-hidden="true">
      {anchors.map((a) => { const p = rel(a.at); return <circle key={a.side} className={"anchor-dot" + (snapped && snapped.side === a.side ? " near" : "")} cx={p.x} cy={p.y} r={(snapped && snapped.side === a.side ? ANCHOR_R + 2 : ANCHOR_R) * k} />; })}
    </g>
  );
}
