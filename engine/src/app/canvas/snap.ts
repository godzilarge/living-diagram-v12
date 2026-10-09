// L'accrochage d'un bout de connecteur (Orhan, 2026-10-09 : « pas de point d'ancrage sur les éléments, la flèche
// s'arrête un peu avant »), la partie pure : parmi les éléments sous le pointeur (et à `tolerance` autour), lequel
// prend le bout, et sur quelle ancre. Une ancre (le milieu d'un côté) à portée gagne ; sinon l'élément sous le pointeur
// prend le bout sur son contour (`auto`) ; sinon le bout est libre, au point. Une carte passe avant une annotation,
// qui passe avant un cadre de groupe ; à sorte égale, le plus petit. L'autre bout du même connecteur est exclu.
import { anchorsOf, nearestAnchor } from "../../canvas/connectors";
import type { Anchor, End, EndPlace, Shape } from "../../canvas/connectors";
import type { Frame } from "../../canvas/annotations";
import type { Point } from "../../canvas/layout";

export type EndKind = "device" | "group" | "annotation";
/** Un élément attachable sous le pointeur : sa sorte, sa référence, sa boîte dans le plan, son contour. */
export interface Candidate { kind: EndKind; ref: string; frame: Frame; shape: Shape }
/** Ce qu'un bout glissé en un point devient : le bout à écrire, sa place pour le dessiner tout de suite, l'élément visé
 *  (ses ancres se montrent) et l'ancre prise s'il y en a une. */
export interface Pick { end: End; place: EndPlace; target: Candidate | null; anchors: Anchor[]; snapped: Anchor | null }

const RANK: Record<EndKind, number> = { device: 0, annotation: 1, group: 2 };
const inside = (f: Frame, p: Point, pad: number): boolean => p.x >= f.x - pad && p.x <= f.x + f.w + pad && p.y >= f.y - pad && p.y <= f.y + f.h + pad;
const area = (f: Frame): number => f.w * f.h;
const free = (at: Point): End => ({ kind: "free", x: Math.round(at.x), y: Math.round(at.y) });

/** Le bout en `at` : accroché à une ancre à portée, sinon au contour de l'élément dessous, sinon libre. */
export function pickEnd(candidates: Candidate[], at: Point, tolerance: number, exclude: (kind: EndKind, ref: string) => boolean = () => false): Pick {
  const ordered = candidates.filter((c) => !exclude(c.kind, c.ref)).sort((p, q) => RANK[p.kind] - RANK[q.kind] || area(p.frame) - area(q.frame));
  const near = ordered.filter((c) => inside(c.frame, at, tolerance));
  for (const c of near) {
    const anchor = nearestAnchor(c.frame, at, tolerance);
    if (anchor) return { end: { kind: c.kind, ref: c.ref, side: anchor.side }, place: { kind: "box", frame: c.frame, shape: c.shape, side: anchor.side }, target: c, anchors: anchorsOf(c.frame), snapped: anchor };
  }
  const under = near.find((c) => inside(c.frame, at, 0));
  if (under) return { end: { kind: under.kind, ref: under.ref, side: "auto" }, place: { kind: "box", frame: under.frame, shape: under.shape, side: "auto" }, target: under, anchors: anchorsOf(under.frame), snapped: null };
  const hover = near[0] || null;
  return { end: free(at), place: { kind: "point", at }, target: hover, anchors: hover ? anchorsOf(hover.frame) : [], snapped: null };
}

export const snap = { pickEnd };
