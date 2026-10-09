// L'alignement d'une sélection d'équipements : sur une ligne horizontale (même y), verticale (même x), ou répartis à
// intervalles égaux entre les deux extrêmes, dans leur ordre actuel. Pur : des positions entrent, des positions
// sortent, entières (ce qui est épinglé ou mémorisé est ce qui est dessiné, docs/09). Rien n'est déplacé ici :
// la toile applique, et la page décide d'enregistrer en épingles ou de garder des déplacements locaux.
import type { Point } from "./layout";

export type AlignMode = "horizontal" | "vertical" | "distribute-horizontal" | "distribute-vertical";
export const ALIGN_MODES: AlignMode[] = ["horizontal", "vertical", "distribute-horizontal", "distribute-vertical"];
export const ALIGN_LABEL: Record<AlignMode, string> = {
  horizontal: "aligner horizontalement", vertical: "aligner verticalement",
  "distribute-horizontal": "répartir horizontalement", "distribute-vertical": "répartir verticalement",
};

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Les nouvelles positions des équipements désignés, et d'eux seuls ; un équipement sans position est ignoré. Une
 *  répartition demande trois équipements au moins (deux sont déjà aux extrêmes) ; un alignement en demande deux. */
export function align(positions: Map<string, Point>, hosts: string[], mode: AlignMode): Map<string, Point> {
  const moved = new Map<string, Point>();
  const known = hosts.filter((host) => positions.has(host));
  const at = (host: string): Point => positions.get(host) as Point;
  if (mode === "horizontal" || mode === "vertical") {
    if (known.length < 2) return moved;
    const axis = mode === "horizontal" ? "y" : "x";
    const level = Math.round(mean(known.map((host) => at(host)[axis])));
    known.forEach((host) => {
      const point = at(host);
      if (point[axis] !== level) moved.set(host, axis === "y" ? { x: Math.round(point.x), y: level } : { x: level, y: Math.round(point.y) });
    });
    return moved;
  }
  if (known.length < 3) return moved;
  const axis = mode === "distribute-horizontal" ? "x" : "y";
  // Dans l'ordre actuel le long de l'axe, les ex æquo départagés par le nom : le résultat ne dépend pas de l'ordre
  // de la sélection.
  const ordered = known.slice().sort((p, q) => at(p)[axis] - at(q)[axis] || (p < q ? -1 : p > q ? 1 : 0));
  const first = at(ordered[0])[axis], last = at(ordered[ordered.length - 1])[axis];
  const step = (last - first) / (ordered.length - 1);
  ordered.forEach((host, index) => {
    const point = at(host);
    const value = Math.round(first + step * index);
    if (point[axis] !== value) moved.set(host, axis === "x" ? { x: value, y: Math.round(point.y) } : { x: Math.round(point.x), y: value });
  });
  return moved;
}

export const alignment = { align, ALIGN_MODES, ALIGN_LABEL };
