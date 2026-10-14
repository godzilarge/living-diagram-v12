// Les points d'ancrage (Orhan, 2026-10-09 ; lot 1 de docs/11, décision D3 : « jamais au repos »). Aucun élément ne
// montre ses ancres au repos, au survol ni sélectionné : elles se dessinent sur l'élément que vise un bout de connecteur
// qu'on tire (brouillon de l'outil, bout d'un connecteur existant) et, l'outil connecteur armé, sur l'élément survolé.
// Deux cibles distinctes, comme draw.io (hover.ts) : le contour en accent = le bout sera `auto` (flottant) ; les quatre
// ancres = un bout fixe, celle à portée grossit. Dessinées une seule fois, par-dessus la toile, dans le plan
// (drawing.tsx) ; les rayons se divisent par le zoom pour garder une taille d'écran.
import { useStore } from "@xyflow/react";
import type { Marks } from "./hover";

export const ANCHOR_R = 5;
/** L'inverse du zoom courant : ce qui doit garder une taille d'écran se multiplie par lui. */
export const useUnzoom = (): number => useStore((s) => 1 / Math.max(s.transform[2], 0.05));

/** Les marques de la cible d'un bout : son contour (en accent s'il prendra le bout en `auto`) et ses quatre ancres. */
export function TargetMarks({ marks, k }: { marks: Marks; k: number }) {
  const f = marks.target.frame, shape = marks.target.shape;
  const outline = "target-outline" + (marks.floating ? " floating" : "");
  return (
    <g className="anchor-dots target" aria-hidden="true" data-target={marks.target.kind + ":" + marks.target.ref}>
      {shape.kind === "ellipse"
        ? <ellipse className={outline} cx={f.x + f.w / 2} cy={f.y + f.h / 2} rx={f.w / 2} ry={f.h / 2} />
        : <rect className={outline} x={f.x} y={f.y} width={f.w} height={f.h} rx={Math.min(shape.rx, f.w / 2, f.h / 2)} />}
      {marks.anchors.map((a) => {
        const near = marks.near === a.side;
        return <circle key={a.side} className={"anchor-dot" + (near ? " near" : "")} data-side={a.side} cx={a.at.x} cy={a.at.y} r={(near ? ANCHOR_R + 2 : ANCHOR_R) * k} />;
      })}
    </g>
  );
}
