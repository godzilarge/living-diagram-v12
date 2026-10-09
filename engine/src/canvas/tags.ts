// Où poser les pastilles des câbles : l'étiquette d'un faisceau (PO20, MLAG 101, PEER-LINK) et la vitesse d'un groupe
// (Orhan, 2026-10-07, sur capture : les étiquettes de vPC flottaient loin de leurs câbles et se chevauchaient là où les
// câbles se croisent). Une pastille se pose **sur sa courbe**, à la première place libre d'une liste ordonnée : ni sur
// une carte, ni sur une pastille déjà posée. Faute de place sur la courbe, elle se décale juste à côté (du côté
// extérieur de son faisceau, sinon vers le haut de l'écran), puis d'un cran de plus ; faute de mieux, la place qui
// chevauche le moins, une autre pastille comptant quatre fois plus qu'une carte (deux pastilles l'une sur l'autre ne se
// lisent plus ni l'une ni l'autre). Une MLAG
// se lit près de l'équipement double-attaché (l'autre bout que le domaine) : ses deux pattes portent leur numéro à
// côté de lui. Glouton, dans l'ordre des demandes : déterministe. Le résultat est une place relative (position le long
// de la courbe, côté), pas une coordonnée : pendant un glissé, la pastille suit son câble. Pur, testé sous Node.
import { PILL_H } from "./pill";
import { pointOn } from "./speed";

interface Point { x: number; y: number }
/** `t` le long de la courbe (0 = bout `p`), `side` : 0 sur la courbe, ±1 juste à côté d'un côté de la normale, ±2 un
 *  cran plus loin. */
export interface TagSlot { t: number; side: -2 | -1 | 0 | 1 | 2 }
export interface TagRequest { id: string; p: Point; q: Point; offset: number; w: number; prefer: readonly number[] }
/** Un obstacle, coin haut gauche et taille. */
export interface Rect { x: number; y: number; w: number; h: number }
interface Weighted extends Rect { weight: number }

/** Au milieu, puis de part et d'autre. */
export const MIDDLE: readonly number[] = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75];
/** Près du bout `q`, puis en revenant vers le milieu. */
export const NEAR_Q: readonly number[] = [0.7, 0.62, 0.78, 0.55, 0.5, 0.45, 0.4];
export const NEAR_P: readonly number[] = NEAR_Q.map((t) => Math.round((1 - t) * 100) / 100);
/** L'écart minimal entre une pastille et ce qu'elle évite. */
export const GAP = 3;
/** Le poids d'une pastille déjà posée face à celui d'une carte (1). */
const TAG_WEIGHT = 4;
const CELL = 64;

function normal(p: Point, q: Point): Point {
  const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
  return { x: -dy / length, y: dx / length };
}

/** Le centre d'une pastille de largeur `w` posée à `slot` sur la courbe de p à q écartée de `offset`. */
export function tagCenter(p: Point, q: Point, offset: number, w: number, slot: TagSlot): Point {
  const at = pointOn(p, q, offset, slot.t);
  if (!slot.side) return at;
  const n = normal(p, q);
  const away = Math.abs(n.x) * (w / 2) + Math.abs(n.y) * (PILL_H / 2) + GAP;
  return { x: at.x + n.x * slot.side * away, y: at.y + n.y * slot.side * away };
}

// Une grille de cases de 64 : chaque rectangle s'inscrit dans les cases qu'il touche, une requête n'en lit que quelques-unes.
class Grid {
  private cells = new Map<string, Weighted[]>();
  private keys(r: Rect): string[] {
    const out: string[] = [];
    for (let i = Math.floor(r.x / CELL); i <= Math.floor((r.x + r.w) / CELL); i++) {
      for (let j = Math.floor(r.y / CELL); j <= Math.floor((r.y + r.h) / CELL); j++) out.push(i + "," + j);
    }
    return out;
  }
  add(r: Weighted): void {
    this.keys(r).forEach((k) => { const got = this.cells.get(k); if (got) got.push(r); else this.cells.set(k, [r]); });
  }
  overlap(r: Rect): number {
    const seen = new Set<Weighted>();
    let area = 0;
    this.keys(r).forEach((k) => (this.cells.get(k) || []).forEach((o) => {
      if (seen.has(o)) return;
      seen.add(o);
      const w = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x), h = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y);
      if (w > 0 && h > 0) area += w * h * o.weight;
    }));
    return area;
  }
}

function rectAt(center: Point, w: number, pad: number): Rect {
  return { x: center.x - w / 2 - pad, y: center.y - PILL_H / 2 - pad, w: w + 2 * pad, h: PILL_H + 2 * pad };
}

function candidates(req: TagRequest): TagSlot[] {
  const n = normal(req.p, req.q);
  const up: 1 | -1 = n.y <= 0 ? 1 : -1;
  const outer: 1 | -1 = req.offset > 0 ? 1 : req.offset < 0 ? -1 : up;
  const other: 1 | -1 = outer === 1 ? -1 : 1;
  return [0, outer, other, 2 * outer, 2 * other].flatMap((side) => req.prefer.map((t) => ({ t, side: side as TagSlot["side"] })));
}

/** La place de chaque pastille, dans l'ordre des demandes (les premières choisissent d'abord). */
export function placeTags(requests: readonly TagRequest[], obstacles: readonly Rect[]): Map<string, TagSlot> {
  const grid = new Grid();
  obstacles.forEach((r) => grid.add({ ...r, weight: 1 }));
  const out = new Map<string, TagSlot>();
  requests.forEach((req) => {
    let best: TagSlot | null = null, cost = Infinity;
    for (const slot of candidates(req)) {
      const got = grid.overlap(rectAt(tagCenter(req.p, req.q, req.offset, req.w, slot), req.w, GAP));
      if (got < cost) { best = slot; cost = got; }
      if (got === 0) break;
    }
    const chosen = best || { t: 0.5, side: 0 };
    grid.add({ ...rectAt(tagCenter(req.p, req.q, req.offset, req.w, chosen), req.w, 0), weight: TAG_WEIGHT });
    out.set(req.id, chosen);
  });
  return out;
}

export const tags = { placeTags, tagCenter, MIDDLE, NEAR_P, NEAR_Q };
