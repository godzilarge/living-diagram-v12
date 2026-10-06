// La géométrie du graphe, sans DOM : le tracé d'un câble (courbe, boucle, éventail entre deux équipements), le
// cadre d'un cluster, la largeur d'une bande de faisceau, les étiquettes des structures. Pur, testé sous Node.
import { bounds } from "./layout";
import type { Box, Point } from "./layout";
import type { Beam, Cluster } from "./types";

const FAN = 14, FAN_MAX = 110, HULL_PAD = 40, BAND = 18, HIT_MARGIN = 8;
export const CHAR_W = 6.6;

/** Ce que le tracé d'un câble a besoin de savoir de lui : ses deux équipements et son rang dans l'éventail. */
export interface CurveLink { a: { hostname: string }; b: { hostname: string }; indexInPair: number; pairCount: number }
export interface Curve { path: string; mid: Point; ends: [Point, Point]; anchor?: "start" | "middle" | "end" }

/** L'écart d'un câble à l'axe de sa paire, le long de la normale : 0 au centre de l'éventail, négatif d'un côté. */
export function fanOffset(link: Pick<CurveLink, "indexInPair" | "pairCount">): number {
  const spacing = Math.min(FAN, FAN_MAX / link.pairCount);
  return (link.indexInPair - (link.pairCount - 1) / 2) * spacing;
}

export function curve(p: Point, q: Point, link: CurveLink): Curve {
  if (link.a.hostname === link.b.hostname) { // câble entre deux ports du même équipement : une boucle au-dessus
    const reach = 46 + link.indexInPair * 12;
    return { path: `M${p.x - 8},${p.y - 12} C${p.x - reach},${p.y - reach - 30} ${p.x + reach},${p.y - reach - 30} ${p.x + 8},${p.y - 12}`,
      mid: { x: p.x, y: p.y - reach * 0.75 - 22 }, ends: [{ x: p.x - 26, y: p.y - 30 }, { x: p.x + 26, y: p.y - 30 }] };
  }
  return chord(p, q, fanOffset(link));
}

/** La courbe de p à q écartée de `offset` le long de la normale, à mi-parcours : le tracé d'un câble de l'éventail, ou
 *  l'axe de la bande d'un faisceau, qui suit ses câbles plutôt que l'axe de la paire. */
export function chord(p: Point, q: Point, offset: number): Curve {
  const dx = q.x - p.x, dy = q.y - p.y;
  const length = Math.max(Math.hypot(dx, dy), 0.01);
  const nx = -dy / length, ny = dx / length;
  const c = { x: (p.x + q.x) / 2 + nx * offset * 2, y: (p.y + q.y) / 2 + ny * offset * 2 };
  const at = (t: number): Point => ({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * c.y + t * t * q.y });
  // L'étiquette suit la courbe de son câble, assez loin du nœud pour ne pas couvrir son nom, et s'ancre du côté où
  // la courbe s'écarte : deux câbles parallèles verticaux ont leurs noms de part et d'autre, pas l'un sur l'autre.
  const inset = Math.min(0.4, 78 / length);
  const side = nx * offset;
  const anchor = side > 0.5 ? "start" : side < -0.5 ? "end" : "middle";
  return { path: `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}`, mid: at(0.5), ends: [at(inset), at(1 - inset)], anchor };
}

// Le cadre d'un cluster : la boîte de ses membres visibles, élargie ; assez large pour le plus long des hostnames
// (revue, 11) ; son étiquette dans le coin haut gauche.
export function hull(points: Point[], longest: number): Box {
  const box = bounds(new Map(points.map((p, i) => [i, p] as const)));
  const padX = Math.max(HULL_PAD, (CHAR_W * (longest || 0)) / 2 + 12);
  return { x: box.x - padX, y: box.y - HULL_PAD - 6, width: box.width + 2 * padX, height: box.height + 2 * HULL_PAD + 6 };
}

/** La bande d'un faisceau : sa largeur visible, sa largeur cliquable, et `offset`, l'écart de son axe à l'axe de la paire. */
export interface BeamBand { band: number; hit: number; offset: number }

// La bande d'un faisceau couvre l'éventail de ses propres câbles, avec une marge visible et cliquable de chaque côté
// (revue, 5) ; pas l'éventail de toute la paire, ni l'axe de la paire : deux faisceaux entre les mêmes équipements
// (un firewall en deux port-channels vers le même switch) ont chacun leur bande, côte à côte comme leurs câbles. Avant
// le 2026-10-06, les deux bandes se dessinaient sur le même axe et la seconde cachait la première.
export function beamBand(beam: Pick<Beam, "links">): BeamBand {
  const offsets = beam.links.length ? beam.links.map(fanOffset) : [0];
  const lo = Math.min(...offsets), hi = Math.max(...offsets);
  const band = BAND + (hi - lo);
  return { band, hit: band + 2 * HIT_MARGIN, offset: (lo + hi) / 2 };
}

// L'étiquette d'un faisceau : ses deux agrégats, puis ce qu'il est (peer-link, MLAG n). Sur le graphe, toujours la
// forme courte (la nature seule) ; la complète vit dans la bulle et l'inspecteur.
export function beamLabel(beam: Pick<Beam, "a" | "b" | "peerLink" | "mlags">, full?: boolean): string {
  const parts = full === false ? [] : [beam.a.aggregate + " ⇄ " + beam.b.aggregate];
  if (beam.peerLink) parts.push("peer-link");
  beam.mlags.forEach((domain) => parts.push("MLAG " + domain.raw.mlag_id));
  return parts.join(" · ");
}

export function clusterLabel(cluster: Pick<Cluster, "raw" | "hosts">): string {
  return "HA · " + (cluster.raw.cluster_name || cluster.hosts.join(" + ")) + " · " + cluster.raw.mode;
}

export const geometry = { curve, chord, fanOffset, hull, beamBand, beamLabel, clusterLabel, CHAR_W };
