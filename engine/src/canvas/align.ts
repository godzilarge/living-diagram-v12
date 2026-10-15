// L'alignement d'une sélection d'équipements : sur une ligne horizontale (même y), verticale (même x), ou répartis à
// intervalles égaux entre les deux extrêmes, dans leur ordre actuel. Pur : des positions entrent, des positions
// sortent, entières (ce qui est épinglé ou mémorisé est ce qui est dessiné, docs/09). Rien n'est déplacé ici :
// la toile applique, et la page décide d'enregistrer en épingles ou de garder des déplacements locaux.
import { labelMap } from "../i18n/core";
import type { Point } from "./layout";

export type AlignMode = "horizontal" | "vertical" | "distribute-horizontal" | "distribute-vertical";
export const ALIGN_MODES: AlignMode[] = ["horizontal", "vertical", "distribute-horizontal", "distribute-vertical"];
/** Le nom d'un alignement, dans la langue de la page (catalogue `common:align`). */
export const ALIGN_LABEL = labelMap("common:align", ALIGN_MODES) as Record<AlignMode, string>;

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

// ——— Par les boîtes (lot 2 de docs/11) ———
// Une sélection mixte (cartes et annotations) s'aligne par les bords et les milieux des boîtes, comme dans tout éditeur :
// sur le bord le plus à gauche (en haut), le plus à droite (en bas), ou le milieu de l'ensemble ; une répartition laisse
// le même écart entre deux boîtes voisines, la première et la dernière ne bougent pas. Une sélection de cartes seules
// garde la règle des centres ci-dessus (les cartes ont toutes la même taille : les bords n'y ajoutent rien).

export type BoxMode = "left" | "center" | "right" | "top" | "middle" | "bottom" | "distribute-horizontal" | "distribute-vertical";
export const BOX_MODES: BoxMode[] = ["left", "center", "right", "top", "middle", "bottom", "distribute-horizontal", "distribute-vertical"];
/** Une boîte : son coin haut gauche et sa taille, en unités du dessin. */
export interface Box { x: number; y: number; w: number; h: number }

const byName = (p: string, q: string): number => (p < q ? -1 : p > q ? 1 : 0);

/** Le nouveau coin haut gauche des boîtes désignées qui bougent, et d'elles seules (entier) ; une boîte inconnue est
 *  ignorée. Aligner demande deux boîtes, répartir trois. */
export function alignBoxes(boxes: Map<string, Box>, ids: string[], mode: BoxMode): Map<string, Point> {
  const moved = new Map<string, Point>();
  const known = Array.from(new Set(ids)).filter((id) => boxes.has(id));
  const at = (id: string): Box => boxes.get(id) as Box;
  const put = (id: string, x: number, y: number): void => { const b = at(id); if (x !== b.x || y !== b.y) moved.set(id, { x, y }); };
  if (mode === "distribute-horizontal" || mode === "distribute-vertical") {
    if (known.length < 3) return moved;
    const h = mode === "distribute-horizontal";
    const start = (b: Box): number => (h ? b.x : b.y), length = (b: Box): number => (h ? b.w : b.h);
    const ordered = known.slice().sort((p, q) => start(at(p)) - start(at(q)) || byName(p, q));
    const first = at(ordered[0]), last = at(ordered[ordered.length - 1]);
    const span = start(last) + length(last) - start(first);
    const gap = (span - ordered.reduce((sum, id) => sum + length(at(id)), 0)) / (ordered.length - 1);
    let before = 0;
    ordered.forEach((id, index) => {
      const b = at(id), value = Math.round(start(first) + before + gap * index);
      before += length(b);
      if (index === 0 || index === ordered.length - 1) return; // les extrêmes restent
      put(id, h ? value : Math.round(b.x), h ? Math.round(b.y) : value);
    });
    return moved;
  }
  if (known.length < 2) return moved;
  const all = known.map(at);
  const left = Math.min(...all.map((b) => b.x)), right = Math.max(...all.map((b) => b.x + b.w));
  const top = Math.min(...all.map((b) => b.y)), bottom = Math.max(...all.map((b) => b.y + b.h));
  known.forEach((id) => {
    const b = at(id), x = Math.round(b.x), y = Math.round(b.y);
    if (mode === "left") put(id, Math.round(left), y);
    else if (mode === "right") put(id, Math.round(right - b.w), y);
    else if (mode === "center") put(id, Math.round((left + right) / 2 - b.w / 2), y);
    else if (mode === "top") put(id, x, Math.round(top));
    else if (mode === "bottom") put(id, x, Math.round(bottom - b.h));
    else put(id, x, Math.round((top + bottom) / 2 - b.h / 2));
  });
  return moved;
}

// ——— Mettre en grille (lot 8 de docs/11, repris du lot 6 parqué) ———
// Un geste d'édition, jamais un rangement imposé : poser d'un coup vingt switchs d'accès en rangées régulières. La grille
// part du coin haut gauche de la boîte englobante ; une case = la plus grande boîte + 60 dans chaque sens, chaque boîte
// centrée dans sa case ; positions entières, aimantées à la grille si l'aimant est mis. L'ordre : par nom (ce qu'un
// ingénieur range à la main, chiffres compris : acc-2 avant acc-10), ou tel qu'on le voit (rangées par y, puis x).
// Les colonnes par défaut : le moins de cases vides (règle validée par Orhan le 2026-10-14, `gridColumns`).

export type GridOrder = "name" | "screen";
export const GRID_ORDERS: GridOrder[] = ["name", "screen"];
/** L'écart entre deux cases (unités du dessin). */
export const GRID_GAP = 60;
/** Un élément à ranger : son identité, son nom (l'ordre par nom), sa boîte. */
export interface GridItem { id: string; name: string; box: Box }
/** Une grille : ses colonnes et rangées, les éléments dans l'ordre des cases, et le coin haut gauche de chacun. */
export interface GridPlan { cols: number; rows: number; ordered: GridItem[]; places: Map<string, Point> }

/** Les colonnes par défaut pour `count` éléments : entre ⌈√n⌉ et ⌈√(1,6 n)⌉ (la formule du lot 6), celle qui laisse le
 *  moins de cases vides dans la dernière rangée ; à égalité, la plus large. 12 → 4 (4 × 3), 20 → 5 (5 × 4), 3 → 3. */
export function gridColumns(count: number): number {
  if (count <= 1) return 1;
  const lo = Math.ceil(Math.sqrt(count)), hi = Math.ceil(Math.sqrt(count * 1.6));
  let best = hi, empty = Infinity;
  for (let cols = hi; cols >= lo; cols -= 1) {
    const holes = Math.ceil(count / cols) * cols - count;
    if (holes < empty) { best = cols; empty = holes; }
  }
  return best;
}

/** L'ordre naturel de deux noms : les chiffres comparés comme des nombres (acc-2 avant acc-10), le reste sans la casse ;
 *  à égalité, l'ordre exact des codes (le résultat ne dépend d'aucune locale). */
export function naturalCompare(a: string, b: string): number {
  const pa = a.toLowerCase().split(/(\d+)/), pb = b.toLowerCase().split(/(\d+)/);
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    if (pa[i] === pb[i]) continue;
    const digits = i % 2 === 1; // split garde les chiffres aux places impaires
    if (digits) { const d = Number(pa[i]) - Number(pb[i]); if (d) return d; }
    return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length || byName(a, b);
}

/** L'ordre de lecture : des rangées (deux boîtes dont les centres sont à moins d'une demi-hauteur sont sur la même),
 *  de haut en bas, chacune de gauche à droite. */
export function screenOrder(items: GridItem[]): GridItem[] {
  const cy = (g: GridItem): number => g.box.y + g.box.h / 2;
  const byY = items.slice().sort((p, q) => cy(p) - cy(q) || p.box.x - q.box.x || byName(p.id, q.id));
  const rows: { cy: number; h: number; items: GridItem[] }[] = [];
  byY.forEach((g) => {
    const row = rows[rows.length - 1];
    if (row && cy(g) - row.cy <= Math.max(row.h, g.box.h) / 2) row.items.push(g); else rows.push({ cy: cy(g), h: g.box.h, items: [g] });
  });
  return rows.flatMap((row) => row.items.sort((p, q) => p.box.x - q.box.x || byName(p.id, q.id)));
}

/** La grille de ces éléments ; `cols` (borné à 1..n) sinon `gridColumns`, `order` (« name » par défaut), `snap` : le pas
 *  de l'aimant, `null` sans. `null` sans élément. */
export function gridBoxes(items: GridItem[], options: { cols?: number | null; order?: GridOrder; snap?: number | null } = {}): GridPlan | null {
  if (!items.length) return null;
  const n = items.length;
  const cols = Math.max(1, Math.min(n, Math.round(options.cols || gridColumns(n))));
  const ordered = options.order === "screen" ? screenOrder(items) : items.slice().sort((p, q) => naturalCompare(p.name, q.name) || byName(p.id, q.id));
  const step = options.snap || 0;
  const fit = (v: number): number => (step ? Math.round(v / step) * step : Math.round(v));
  const cw = Math.max(...items.map((g) => g.box.w)) + GRID_GAP, ch = Math.max(...items.map((g) => g.box.h)) + GRID_GAP;
  const ox = fit(Math.min(...items.map((g) => g.box.x))), oy = fit(Math.min(...items.map((g) => g.box.y)));
  const places = new Map<string, Point>();
  ordered.forEach((g, i) => {
    const x = ox + (i % cols) * cw + Math.round((cw - GRID_GAP - g.box.w) / 2), y = oy + Math.floor(i / cols) * ch + Math.round((ch - GRID_GAP - g.box.h) / 2);
    places.set(g.id, { x: fit(x), y: fit(y) });
  });
  return { cols, rows: Math.ceil(n / cols), ordered, places };
}

export const alignment = { align, ALIGN_MODES, ALIGN_LABEL };
/** Pour les tests de l'application (`LDApp.boxAlignment`) : `/view` n'en a pas besoin (son bundle ne l'embarque pas). */
export const boxAlignment = { alignBoxes, BOX_MODES };
/** De même (`LDApp.gridding`) : mettre en grille n'existe que dans l'application. */
export const gridding = { gridColumns, gridBoxes, naturalCompare, screenOrder, GRID_GAP, GRID_ORDERS };
