// Placement force-dirigé (Fruchterman-Reingold), déterministe : positions initiales tirées de l'ordre des
// identifiants, nombre d'itérations fixe, aucun tirage au hasard. Mêmes nœuds et mêmes arêtes, mêmes positions.
// Les nœuds fixés (`fixed`) sont des contraintes dures : ils ne bougent pas, les autres s'organisent autour. Deux
// usages : des épingles dans un dessin neuf (les libres partent de la spirale), ou un dessin déjà fait qu'on complète
// (`extend` : le placement mémorisé, docs/09 ; les libres partent de leurs voisins déjà placés, de proche en proche).
// Les positions rendues sont entières : ce qui est mémorisé est exactement ce qui est dessiné.

export interface Point { x: number; y: number }
export type Edge = [string, string] | [string, string, number];
export interface Box { x: number; y: number; width: number; height: number }
type Card = { w: number; h: number };
export interface Options {
  /** Les nœuds fixés forment un dessin existant : un nœud libre part près de ses voisins déjà placés, à chaleur réduite. */
  extend?: boolean;
  /** La boîte d'une carte (largeur commune de la run, hauteur) : deux nœuds ne s'approchent jamais à moins d'une
   *  carte et d'un écart (`GAP_X`, `GAP_Y`). Sans elle, une carte ordinaire (`DEFAULT_CARD`). */
  card?: { w: number; h: number };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const IDEAL = 220; // longueur visée d'une arête, en unités du dessin (170 jusqu'au 2026-10-07 : les cartes portent le nom)
const MIN_DISTANCE = 0.0001;
const REACH = IDEAL * 3; // au-delà, deux nœuds ne se repoussent plus : les composantes séparées restent voisines
const DEFAULT_CARD = { w: 200, h: 80 };
const GAP_X = 60, GAP_Y = 40; // l'écart minimal entre deux cartes, à côté (la place des noms de port) et l'une sous l'autre
const SHELF_GAP = 50; // l'écart entre deux cartes de la rangée des nœuds sans câble
const HEAT = 1.5; // température de départ d'un dessin neuf, en longueurs d'arête
const EXTEND_HEAT = 0.5; // celle d'un dessin complété : un nouveau nœud ne traverse pas le dessin avant de se poser
const NEAR_STEP = 0.3; // écart entre deux nouveaux nœuds partis du même voisin, en pas de spirale

function iterationsFor(count: number): number {
  if (count <= 600) return 300;
  return count <= 1500 ? 150 : 80; // O(n²) par itération : on borne le temps sur les grosses infras
}

// Un point de la spirale de Fermat : tous distincts, sans hasard.
function spiral(index: number): Point {
  const radius = IDEAL * 0.6 * Math.sqrt(index + 0.5);
  return { x: radius * Math.cos(index * GOLDEN_ANGLE), y: radius * Math.sin(index * GOLDEN_ANGLE) };
}

function seed(ids: string[]): Map<string, Point> {
  return new Map(ids.map((id, index) => [id, spiral(index)]));
}

interface WeightedEdge { from: string; to: string; weight: number }

// edges : [a, b] ou [a, b, renfort] ; le renfort multiplie l'attraction (membres d'un cluster HA : 2.5).
function uniqueEdges(edges: Edge[], known: Set<string>): WeightedEdge[] {
  const weights = new Map<string, { count: number; boost: number }>();
  for (const [from, to, boost] of edges) {
    if (from === to || !known.has(from) || !known.has(to)) continue;
    const key = from < to ? from + "\u0000" + to : to + "\u0000" + from;
    const found = weights.get(key) || { count: 0, boost: 1 };
    weights.set(key, { count: found.count + 1, boost: Math.max(found.boost, boost || 1) });
  }
  // Triées : l'ordre d'addition des forces change les dernières décimales, donc les positions.
  return Array.from(weights).sort(([x], [y]) => (x < y ? -1 : 1)).map(([key, { count, boost }]) => {
    const [from, to] = key.split("\u0000");
    return { from, to, weight: (1 + 0.35 * Math.log(count)) * boost }; // dix câbles ne collent pas deux équipements l'un sur l'autre
  });
}

/** Les nœuds qu'au moins une arête relie à un autre nœud connu : ceux que les forces placent (les autres sont rangés). */
export function wired(ids: Iterable<string>, edges: Edge[]): Set<string> {
  const known = new Set(ids);
  return new Set(uniqueEdges(edges, known).flatMap((edge) => [edge.from, edge.to]));
}

// De proche en proche depuis les nœuds fixés : un nœud libre part du barycentre de ses voisins déjà placés, décalé
// d'un pas de spirale (deux nouveaux voisins d'un même équipement ne partent pas du même point). Un nœud sans
// chemin vers un nœud fixé garde son point de spirale.
function seedNear(sorted: string[], links: WeightedEdge[], fixed: Map<string, Point>, points: Map<string, Point>): void {
  const neighbours = new Map<string, string[]>();
  const push = (a: string, b: string): void => { const list = neighbours.get(a); if (list) list.push(b); else neighbours.set(a, [b]); };
  links.forEach(({ from, to }) => { push(from, to); push(to, from); });
  const placed = new Set(sorted.filter((id) => fixed.has(id)));
  let rank = 0;
  for (let grew = true; grew;) {
    grew = false;
    for (const id of sorted) {
      if (placed.has(id)) continue;
      const near = (neighbours.get(id) || []).filter((other) => placed.has(other)).map((other) => points.get(other) as Point);
      if (!near.length) continue;
      const step = spiral(rank++);
      points.set(id, { x: near.reduce((sum, p) => sum + p.x, 0) / near.length + step.x * NEAR_STEP, y: near.reduce((sum, p) => sum + p.y, 0) / near.length + step.y * NEAR_STEP });
      placed.add(id);
      grew = true;
    }
  }
}

interface Simulation {
  count: number; x: Float64Array; y: Float64Array; mx: Float64Array; my: Float64Array;
  from: Int32Array; to: Int32Array; weight: Float64Array; free: boolean[];
  /** L'écart minimal de centre à centre, à l'horizontale et à la verticale : une carte et son écart. */
  spanX: number; spanY: number;
}

// Une itération, sur des tableaux numériques indexés par le rang du nœud : à 500 nœuds, la même boucle écrite
// avec des dictionnaires prenait dix secondes. Deux nœuds fixés ne se calculent rien : seuls les libres bougent.
function step(sim: Simulation, temperature: number): void {
  const { count, x, y, mx, my, from, to, weight, free } = sim;
  mx.fill(0);
  my.fill(0);
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if (!free[i] && !free[j]) continue;
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const squared = Math.max(dx * dx + dy * dy, MIN_DISTANCE);
      if (squared > REACH * REACH) continue;
      const force = (IDEAL * IDEAL) / squared; // répulsion k²/d, portée par le vecteur unitaire (dx, dy)/d
      mx[i] += dx * force; my[i] += dy * force;
      mx[j] -= dx * force; my[j] -= dy * force;
    }
    mx[i] -= x[i] * 0.04; // gravité : les composantes séparées ne partent pas à l'infini
    my[i] -= y[i] * 0.04;
  }
  for (let e = 0; e < from.length; e += 1) {
    const dx = x[from[e]] - x[to[e]];
    const dy = y[from[e]] - y[to[e]];
    const force = (Math.max(Math.hypot(dx, dy), MIN_DISTANCE) / IDEAL) * weight[e];
    mx[from[e]] -= dx * force; my[from[e]] -= dy * force;
    mx[to[e]] += dx * force; my[to[e]] += dy * force;
  }
  for (let i = 0; i < count; i += 1) {
    if (!free[i]) continue;
    const length = Math.max(Math.hypot(mx[i], my[i]), MIN_DISTANCE);
    const capped = Math.min(length, temperature);
    x[i] += (mx[i] / length) * capped;
    y[i] += (my[i] / length) * capped;
  }
  separate(sim);
}

// Puis les recouvrements : deux nœuds plus proches qu'une carte et son écart, sur les deux axes à la fois, sont
// écartés d'autant par position, le long de l'axe où ils se recouvrent le moins (un nœud fixé ne bouge pas, l'autre
// prend tout l'écart). La répulsion seule n'y suffisait pas : deux cœurs tirés par les mêmes dix accès finissaient
// l'un sur l'autre (attraction en d², répulsion en 1/d). Depuis que toutes les cartes d'une run ont la même largeur
// (2026-10-07), la boîte est exacte : un rectangle, plus l'ellipse approchée d'avant.
function separate(sim: Simulation): void {
  const { count, x, y, free, spanX, spanY } = sim;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if (!free[i] && !free[j]) continue;
      const dx = x[i] - x[j], dy = y[i] - y[j];
      const overX = spanX - Math.abs(dx), overY = spanY - Math.abs(dy);
      if (overX <= 0 || overY <= 0) continue;
      const share = free[i] && free[j] ? 2 : 1;
      // Deux nœuds au même point : i passe à gauche ou au-dessus de j, un ordre fixe (aucun tirage au hasard).
      const alongX = overX / spanX < overY / spanY;
      const sign = (alongX ? dx : dy) > 0 ? 1 : -1;
      const pushX = alongX ? (sign * overX) / share : 0, pushY = alongX ? 0 : (sign * overY) / share;
      if (free[i]) { x[i] += pushX; y[i] += pushY; }
      if (free[j]) { x[j] -= pushX; y[j] -= pushY; }
    }
  }
}

function simulation(sorted: string[], points: Map<string, Point>, links: WeightedEdge[], fixed: Map<string, Point>, card: Card): Simulation {
  const rank = new Map(sorted.map((id, index) => [id, index] as const));
  const at = (id: string): Point => points.get(id) as Point;
  return {
    count: sorted.length,
    x: Float64Array.from(sorted, (id) => at(id).x), y: Float64Array.from(sorted, (id) => at(id).y),
    mx: new Float64Array(sorted.length), my: new Float64Array(sorted.length),
    from: Int32Array.from(links, (edge) => rank.get(edge.from) as number), to: Int32Array.from(links, (edge) => rank.get(edge.to) as number),
    weight: Float64Array.from(links, (edge) => edge.weight), free: sorted.map((id) => !fixed.has(id)),
    spanX: card.w + GAP_X, spanY: card.h + GAP_Y,
  };
}

// Les nœuds sans aucun câble (équipement injoignable, par exemple) ne sont pas confiés aux forces, qui les
// chasseraient au loin : ils sont rangés en ligne sous le graphe, dans l'ordre des identifiants. Un nœud fixé
// (épinglé, ou mémorisé) garde sa place.
function shelve(points: Map<string, Point>, lonely: string[], fixed: Map<string, Point>, card: Card): void {
  const box = bounds(points);
  const pitch = card.w + SHELF_GAP;
  const perRow = Math.max(1, Math.floor(Math.max(box.width, pitch * 4) / pitch));
  lonely.forEach((id, index) => {
    const spot = { x: box.x + (index % perRow) * pitch, y: box.y + box.height + 140 + Math.floor(index / perRow) * (card.h + GAP_Y) };
    const pin = fixed.get(id);
    points.set(id, pin ? { x: pin.x, y: pin.y } : spot);
  });
}

// ids : identifiants des nœuds à placer ; edges : paires [a, b] ; fixed : Map id → {x, y} imposés (épingles, places
// mémorisées) ; options.extend : les nœuds fixés sont un dessin existant à compléter.
export function run(ids: Iterable<string>, edges: Edge[], fixed?: Map<string, Point>, options: Options = {}): Map<string, Point> {
  const all = Array.from(ids).sort();
  const held = fixed || new Map<string, Point>();
  const links = uniqueEdges(edges, new Set(all));
  const connected = new Set(links.flatMap((edge) => [edge.from, edge.to]));
  const sorted = all.filter((id) => connected.has(id));
  const points = seed(sorted);
  held.forEach((point, id) => {
    if (points.has(id)) points.set(id, { x: point.x, y: point.y });
  });
  if (options.extend) seedNear(sorted, links, held, points);
  const card = options.card || DEFAULT_CARD;
  const sim = simulation(sorted, points, links, held, card);
  const iterations = iterationsFor(sorted.length);
  const heat = IDEAL * (options.extend ? EXTEND_HEAT : HEAT);
  for (let i = 0; i < iterations; i += 1) step(sim, heat * (1 - i / iterations) + 1);
  sorted.forEach((id, index) => points.set(id, held.has(id) ? (points.get(id) as Point) : { x: Math.round(sim.x[index]), y: Math.round(sim.y[index]) }));
  shelve(points, all.filter((id) => !connected.has(id)), held, card);
  return points;
}

export function bounds(points: Map<unknown, Point>): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  if (minX === Infinity) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

export const layout = { run, wired, bounds, IDEAL };
