// La vue à l'ouverture d'une run (revue Impeccable du 2026-10-07, lot 2) : jamais une pelote illisible. Pur, sans DOM :
// la toile lui passe les positions, ce qui compte et la partie visible du canevas, il rend la vue à poser.
// Tout tient à un zoom où les noms se lisent : on cadre tout, comme avant. Sinon on s'ouvre au zoom de lecture sur ce
// qui compte (équipements en défaut ou changés), sur la fenêtre qui en montre le plus ; s'il n'y a rien, au milieu
// du parc. « Cadrer tout » reste un geste explicite, sans plancher (toile.fit).
import { bounds } from "../../canvas/layout";
import type { Point } from "../../canvas/layout";

/** Le zoom en dessous duquel un nom de carte (15 unités) passe sous 10 px à l'écran. */
export const READ_ZOOM = 0.67;
export const FIT_MARGIN = 70, FIT_MAX_ZOOM = 1.6, MIN_ZOOM = 0.05;

export interface Area { x: number; y: number; width: number; height: number }
export interface View { x: number; y: number; zoom: number }

/** Le zoom qui fait tenir ces centres dans la zone, marge comprise. */
export function fitZoom(points: Map<string, Point>, area: Area): number {
  const box = bounds(points);
  return Math.max(Math.min((area.width - 2 * FIT_MARGIN) / Math.max(box.width, 1), (area.height - 2 * FIT_MARGIN) / Math.max(box.height, 1), FIT_MAX_ZOOM), MIN_ZOOM);
}

/** La vue qui met ce point du dessin au milieu de la zone, à ce zoom. */
export const centered = (point: Point, zoom: number, area: Area): View =>
  ({ zoom, x: area.x + area.width / 2 - point.x * zoom, y: area.y + area.height / 2 - point.y * zoom });

const middle = (points: Map<string, Point>): Point => { const box = bounds(points); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const pick = (positions: Map<string, Point>, hosts: string[]): Map<string, Point> =>
  new Map(hosts.filter((host) => positions.has(host)).map((host) => [host, positions.get(host) as Point] as const));

// La fenêtre (la zone vue au zoom de lecture) qui contient le plus de points, centrée tour à tour sur chacun ; à
// égalité, le premier dans l'ordre des noms. Rend les points de cette fenêtre.
function densest(points: Map<string, Point>, area: Area, zoom: number): Map<string, Point> {
  const halfW = (area.width / zoom) / 2 - FIT_MARGIN / zoom, halfH = (area.height / zoom) / 2 - FIT_MARGIN / zoom;
  const entries = Array.from(points).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let best = new Map<string, Point>();
  entries.forEach(([, c]) => {
    const inside = entries.filter(([, p]) => Math.abs(p.x - c.x) <= halfW && Math.abs(p.y - c.y) <= halfH);
    if (inside.length > best.size) best = new Map(inside);
  });
  return best;
}

// Le milieu du parc : l'équipement le plus proche du barycentre (la vue tombe sur une carte, jamais dans un vide).
function heart(positions: Map<string, Point>): Point {
  const all = Array.from(positions.values());
  const cx = all.reduce((s, p) => s + p.x, 0) / all.length, cy = all.reduce((s, p) => s + p.y, 0) / all.length;
  return all.reduce((near, p) => (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(near.x - cx, near.y - cy) ? p : near), all[0]);
}

/** La vue d'ouverture. `notable` : les équipements qui comptent (défauts, changements), dans n'importe quel ordre. */
export function openingView(positions: Map<string, Point>, notable: string[], area: Area): View | null {
  if (!positions.size) return null;
  const all = fitZoom(positions, area);
  if (all >= READ_ZOOM) return centered(middle(positions), all, area);
  const focus = pick(positions, notable);
  if (!focus.size) return centered(heart(positions), READ_ZOOM, area);
  const shown = fitZoom(focus, area) >= READ_ZOOM ? focus : densest(focus, area, READ_ZOOM);
  return centered(middle(shown), READ_ZOOM, area);
}
