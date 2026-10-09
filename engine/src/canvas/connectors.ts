// Les connecteurs (docs/10 §6, Intent 1.4.0 ; ancres 1.5.0), la partie pure : une ligne ou une flèche entre deux bouts, chacun libre
// (un point du plan) ou attaché à un équipement, un groupe ou une annotation (le tracé part de son bord, vers l'autre
// bout). Le tracé est droit, coudé (deux angles droits) ou courbe (un arc) ; la courbure est l'écart du milieu à la
// corde (courbe) ou le décalage du segment médian (coudé). Ici : les bouts résolus, le chemin SVG, la pointe, la
// courbure lue d'un glissé, les orphelins, la visibilité. Les deux faces et les tests sous Node lisent la même géométrie.
import { borderPoint } from "./annotations";
import type { Frame } from "./annotations";
import type { Point } from "./layout";
import type { Connector, ConnectorStyle, Model } from "./types";

export const ROUTES = ["straight", "elbow", "curve"] as const;
export const HEADS = ["none", "arrow"] as const;
export const END_KINDS = ["free", "device", "group", "annotation"] as const;
export const BOUNDS = { stroke_width: [1, 8], opacity: [10, 100], text_size: [8, 64], bend: [-2000, 2000] } as const;
export const LABEL: Record<string, string> = { straight: "droit", elbow: "coudé", curve: "courbe", none: "aucune", arrow: "flèche", free: "libre", device: "équipement", group: "groupe", annotation: "annotation" };
/** Les défauts du contrat (`DEFAULT_CONNECTOR_STYLE`, `DEFAULT_HEADS`). */
export const DEFAULT_STYLE: ConnectorStyle = { hue: "slate", stroke_width: 2, stroke_style: "solid", opacity: 100, text_size: 12, text_weight: "semibold", text_font: "sans", text_color: "hue" };
export const DEFAULT_HEADS: Connector["heads"] = { start: "none", end: "arrow" };
export const DEFAULT_LENGTH = 160;

export type End = Connector["start"];
export type Side = "auto" | "n" | "e" | "s" | "w";
export type FixedSide = Exclude<Side, "auto">;
export const SIDES: readonly Side[] = ["auto", "n", "e", "s", "w"];
export const FIXED_SIDES: readonly FixedSide[] = ["n", "e", "s", "w"];
export const SIDE_LABEL: Record<Side, string> = { auto: "automatique", n: "haut", e: "droite", s: "bas", w: "gauche" };
/** La sortie perpendiculaire d'une ancre fixe, avant le premier coin d'un tracé coudé. */
export const STUB = 24;
/** Le contour d'un élément attachable : un rectangle aux coins `rx`, ou une ellipse (un disque de voisin inconnu, une forme). */
export type Shape = { kind: "rect"; rx: number } | { kind: "ellipse" };
export const RECT: Shape = { kind: "rect", rx: 0 };
/** Où est un bout : un point (libre), ou la boîte de l'élément attaché dans le plan, avec son contour et son ancre. */
export type EndPlace = { kind: "point"; at: Point } | { kind: "box"; frame: Frame; shape?: Shape; side?: Side };
export interface Anchor { side: FixedSide; at: Point }
/** Un tracé : le chemin SVG, ses deux bouts, son milieu (étiquette, poignée), les tangentes aux bouts (pointes), la corde
 *  que la courbure décale, et si une courbure a un sens (un coudé en équerre n'en a pas). */
export interface Path { d: string; a: Point; b: Point; mid: Point; dirA: Point; dirB: Point; chord: { a: Point; b: Point }; bendable: boolean }

export const attachedEnds = (c: Pick<Connector, "start" | "end">): { kind: string; ref: string }[] =>
  [c.start, c.end].flatMap((e) => (e.kind === "free" ? [] : [{ kind: e.kind, ref: e.ref }]));
export const key = (kind: string, ref: string): string => kind + "\u0000" + ref;
/** Les équipements qu'un connecteur touche (présents ou non). */
export const hostsOf = (c: Pick<Connector, "start" | "end">): string[] => attachedEnds(c).filter((e) => e.kind === "device").map((e) => e.ref);

/** Orphelin : un bout attaché à un équipement absent (ou fantôme), à un groupe sans membre présent, à une annotation
 *  inconnue ou elle-même orpheline. */
export function isOrphan(model: Pick<Model, "nodeByHost" | "groupById" | "annotationById" | "orphanAnnotations">, c: Pick<Connector, "start" | "end">): boolean {
  return attachedEnds(c).some((e) => {
    if (e.kind === "device") { const node = model.nodeByHost.get(e.ref); return !node || !!node.ghost; }
    if (e.kind === "group") {
      const group = model.groupById.get(e.ref);
      return !group || !group.members.some((host) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; });
    }
    const a = model.annotationById.get(e.ref);
    return !a || model.orphanAnnotations.includes(a);
  });
}
/** Dessiné quand chaque bout l'est : libre toujours ; attaché, avec son élément. */
export function shownWith(c: Pick<Connector, "start" | "end">, shownHosts: Set<string>, drawnGroups: Set<string>, drawnAnnotations: Set<string>): boolean {
  return attachedEnds(c).every((e) => (e.kind === "device" ? shownHosts.has(e.ref) : e.kind === "group" ? drawnGroups.has(e.ref) : drawnAnnotations.has(e.ref)));
}

const centerOf = (place: EndPlace): Point => (place.kind === "point" ? place.at : { x: place.frame.x + place.frame.w / 2, y: place.frame.y + place.frame.h / 2 });
const unit = (from: Point, to: Point): Point => { const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1; return { x: dx / len, y: dy / len }; };
const r1 = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);
const add = (p: Point, d: Point, k: number): Point => ({ x: p.x + d.x * k, y: p.y + d.y * k });

/** Les ancres d'une boîte (1.5.0) : le milieu de chaque côté, dans l'ordre haut, droite, bas, gauche. */
export const SIDE_NORMAL: Record<FixedSide, Point> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
export function anchorPoint(frame: Frame, side: FixedSide): Point {
  const n = SIDE_NORMAL[side];
  return { x: frame.x + frame.w / 2 + n.x * frame.w / 2, y: frame.y + frame.h / 2 + n.y * frame.h / 2 };
}
export const anchorsOf = (frame: Frame): Anchor[] => FIXED_SIDES.map((side) => ({ side, at: anchorPoint(frame, side) }));
/** L'ancre d'une boîte à moins de `tolerance` d'un point, la plus proche ; sinon rien. */
export function nearestAnchor(frame: Frame, at: Point, tolerance: number): Anchor | null {
  let best: Anchor | null = null, bestD = tolerance;
  anchorsOf(frame).forEach((a) => { const d = Math.hypot(a.at.x - at.x, a.at.y - at.y); if (d <= bestD) { best = a; bestD = d; } });
  return best;
}
/** Le point du contour d'une boîte qui regarde `toward` depuis son centre : un rectangle à coins arrondis (le tracé
 *  arrive sur l'arc, pas sur le coin fantôme), ou une ellipse. Entier, comme `borderPoint`. */
export function outlinePoint(frame: Frame, shape: Shape, toward: Point): Point {
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2, dx = toward.x - cx, dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  if (shape.kind === "ellipse") {
    const t = 1 / Math.sqrt((dx / (frame.w / 2)) ** 2 + (dy / (frame.h / 2)) ** 2);
    return { x: Math.round(cx + dx * t), y: Math.round(cy + dy * t) };
  }
  const rx = Math.max(0, Math.min(shape.rx, frame.w / 2, frame.h / 2));
  const flat = borderPoint(frame, toward);
  if (!rx || Math.abs(flat.x - cx) < frame.w / 2 - rx || Math.abs(flat.y - cy) < frame.h / 2 - rx) return flat;
  // dans la zone d'un coin : le rayon depuis le centre coupe l'arc de ce coin
  const k = { x: cx + Math.sign(dx) * (frame.w / 2 - rx), y: cy + Math.sign(dy) * (frame.h / 2 - rx) };
  const d = unit({ x: cx, y: cy }, toward), o = { x: cx - k.x, y: cy - k.y };
  const od = o.x * d.x + o.y * d.y, disc = od * od - (o.x * o.x + o.y * o.y - rx * rx);
  const t = -od + Math.sqrt(Math.max(0, disc));
  return { x: Math.round(cx + d.x * t), y: Math.round(cy + d.y * t) };
}
const sideOf = (place: EndPlace): FixedSide | null => (place.kind === "box" && place.side && place.side !== "auto" ? place.side : null);
export const normalOf = (place: EndPlace): Point | null => { const side = sideOf(place); return side ? SIDE_NORMAL[side] : null; };

// Les points de passage d'un tracé entre deux bouts : droit (aucun), coudé (deux coins sur le milieu, ou un seul
// coin quand les deux ancres se font face en équerre), courbe (le point de contrôle de la quadratique, tel que le
// milieu de l'arc s'écarte de `bend` de la corde). Une ancre fixe sort perpendiculairement à son côté (`STUB`), et
// c'est entre ces sorties que le coudé se décide ; `median` = le segment que la courbure décale.
interface Route { via: Point[]; median: [Point, Point] | null; chord: [Point, Point] }
function waypoints(a: Point, b: Point, route: string, bend: number, da: Point | null, db: Point | null): Route {
  const straight: Route = { via: [], median: null, chord: [a, b] };
  if (route === "curve" && bend) {
    const n = normal(a, b);
    return { via: [{ x: (a.x + b.x) / 2 + n.x * 2 * bend, y: (a.y + b.y) / 2 + n.y * 2 * bend }], median: null, chord: [a, b] };
  }
  if (route !== "elbow") return straight;
  const a1 = da ? add(a, da, STUB) : a, b1 = db ? add(b, db, STUB) : b;
  const horizontal = (d: Point | null): boolean | null => (d ? d.x !== 0 : null);
  const ha = horizontal(da), hb = horizontal(db);
  const stubs = (corners: Point[]): Point[] => [...(da ? [a1] : []), ...corners, ...(db ? [b1] : [])];
  if (ha !== null && hb !== null && ha !== hb) { // en équerre : un seul coin, aucun segment médian
    const corner = ha ? { x: b1.x, y: a1.y } : { x: a1.x, y: b1.y };
    return { via: stubs([corner]), median: null, chord: [a1, b1] };
  }
  const alongX = ha !== null ? ha : hb !== null ? hb : Math.abs(b1.x - a1.x) >= Math.abs(b1.y - a1.y);
  const corners: [Point, Point] = alongX
    ? [{ x: (a1.x + b1.x) / 2 + bend, y: a1.y }, { x: (a1.x + b1.x) / 2 + bend, y: b1.y }]
    : [{ x: a1.x, y: (a1.y + b1.y) / 2 + bend }, { x: b1.x, y: (a1.y + b1.y) / 2 + bend }];
  return { via: stubs(corners), median: corners, chord: [a1, b1] };
}
/** La normale unitaire à gauche de la corde a → b. */
export const normal = (a: Point, b: Point): Point => { const u = unit(a, b); return { x: -u.y, y: u.x }; };

/** Le tracé entre deux bouts : d'une ancre (le milieu d'un côté), ou du contour de chaque boîte vers le premier point
 *  de passage ; `chord` est ce que la courbure décale (les sorties des ancres, pour un coudé). */
export function pathOf(start: EndPlace, end: EndPlace, route: string, bend: number): Path {
  const da = normalOf(start), db = normalOf(end);
  const fixedA = start.kind === "box" && da ? anchorPoint(start.frame, sideOf(start) as FixedSide) : null;
  const fixedB = end.kind === "box" && db ? anchorPoint(end.frame, sideOf(end) as FixedSide) : null;
  const ca = fixedA || centerOf(start), cb = fixedB || centerOf(end);
  const rough = waypoints(ca, cb, route, bend, da, db); // d'abord entre les centres : où le tracé sort de chaque boîte
  const towardA = rough.via[0] || cb, towardB = rough.via[rough.via.length - 1] || ca;
  const a = fixedA || (start.kind === "box" ? outlinePoint(start.frame, start.shape || RECT, towardA) : ca);
  const b = fixedB || (end.kind === "box" ? outlinePoint(end.frame, end.shape || RECT, towardB) : cb);
  const real = waypoints(a, b, route, bend, da, db); // puis entre les vrais bouts
  const points = [a, ...real.via, b];
  let d: string, mid: Point;
  if (route === "curve" && real.via.length) {
    const c = real.via[0];
    d = `M${r1(a.x)},${r1(a.y)} Q${r1(c.x)},${r1(c.y)} ${r1(b.x)},${r1(b.y)}`;
    mid = { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 };
  } else {
    d = points.map((p, i) => (i ? "L" : "M") + r1(p.x) + "," + r1(p.y)).join(" ");
    const m = real.median;
    mid = m ? { x: (m[0].x + m[1].x) / 2, y: (m[0].y + m[1].y) / 2 } : real.via.length ? real.via[Math.floor((real.via.length - 1) / 2)] : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return { d, a, b, mid, dirA: unit(points[1], a), dirB: unit(points[points.length - 2], b), chord: { a: real.chord[0], b: real.chord[1] }, bendable: route !== "elbow" || !!real.median };
}
/** La courbure lue d'un point glissé au milieu du tracé : écart signé à la corde (courbe), décalage du segment médian (coudé). */
export function bendFrom(a: Point, b: Point, route: string, at: Point): number {
  if (route === "elbow") return Math.round(Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? at.x - (a.x + b.x) / 2 : at.y - (a.y + b.y) / 2);
  const n = normal(a, b);
  return Math.round((at.x - (a.x + b.x) / 2) * n.x + (at.y - (a.y + b.y) / 2) * n.y);
}
/** La pointe d'une flèche : un triangle dont la pointe est `tip`, orienté par `dir` (unitaire, vers la pointe). */
export function arrowHead(tip: Point, dir: Point, size: number): string {
  const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size }, n = { x: -dir.y, y: dir.x }, half = size * 0.45;
  return `${r1(tip.x)},${r1(tip.y)} ${r1(back.x + n.x * half)},${r1(back.y + n.y * half)} ${r1(back.x - n.x * half)},${r1(back.y - n.y * half)}`;
}
export const headSize = (style: Pick<ConnectorStyle, "stroke_width">): number => 7 + 2.5 * style.stroke_width;
/** La boîte qui contient des points, élargie d'une marge. */
export function bbox(points: Point[], pad = 0): Frame {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}
const endText = (e: End): string => (e.kind === "free" ? e.x + ", " + e.y : (LABEL[e.kind] || e.kind) + " " + e.ref + (e.side && e.side !== "auto" ? " (" + SIDE_LABEL[e.side] + ")" : ""));
/** Un résumé d'une ligne pour une liste ou une bulle. */
export const summary = (c: Connector): string => (c.heads.start === "arrow" || c.heads.end === "arrow" ? "flèche" : "ligne") + " · " + endText(c.start) + " → " + endText(c.end) + (c.label ? " · " + c.label : "");
/** Un bout libre à une position du plan, ou attaché. */
export const freeEnd = (at: Point): End => ({ kind: "free", x: Math.round(at.x), y: Math.round(at.y) });
export const attachedEnd = (kind: "device" | "group" | "annotation", ref: string, side: Side = "auto"): End => ({ kind, ref, side });
/** Les deux bouts échangés (et les pointes avec eux). */
export const reversed = (c: Pick<Connector, "start" | "end" | "heads">): Pick<Connector, "start" | "end" | "heads"> => ({ start: c.end, end: c.start, heads: { start: c.heads.end, end: c.heads.start } });

export const connectors = { ROUTES, HEADS, END_KINDS, SIDES, FIXED_SIDES, SIDE_LABEL, STUB, BOUNDS, LABEL, DEFAULT_STYLE, DEFAULT_HEADS, DEFAULT_LENGTH, attachedEnds, key, hostsOf, isOrphan, shownWith, normal, anchorPoint, anchorsOf, nearestAnchor, outlinePoint, normalOf, pathOf, bendFrom, arrowHead, headSize, bbox, summary, freeEnd, attachedEnd, reversed };
