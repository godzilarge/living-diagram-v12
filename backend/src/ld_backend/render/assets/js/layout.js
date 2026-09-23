// Placement force-dirigé (Fruchterman-Reingold), déterministe : positions initiales tirées de l'ordre des
// identifiants, nombre d'itérations fixe, aucun tirage au hasard. Mêmes nœuds et mêmes arêtes, mêmes positions.
// C'est un outil de lecture : le vrai placement (seedé N-1, pins persistants) sera celui du moteur.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const IDEAL = 170; // longueur visée d'une arête, en unités du dessin
  const MIN_DISTANCE = 0.0001;
  const REACH = IDEAL * 3; // au-delà, deux nœuds ne se repoussent plus : les composantes séparées restent voisines
  const SHELF_GAP = 110; // pas de la rangée des nœuds sans câble

  function iterationsFor(count) {
    if (count <= 600) return 300;
    return count <= 1500 ? 150 : 80; // O(n²) par itération : on borne le temps sur les grosses infras
  }

  // Spirale de Fermat dans l'ordre des identifiants : points tous distincts, sans hasard.
  function seed(ids) {
    const positions = new Map();
    ids.forEach((id, index) => {
      const radius = IDEAL * 0.6 * Math.sqrt(index + 0.5);
      positions.set(id, { x: radius * Math.cos(index * GOLDEN_ANGLE), y: radius * Math.sin(index * GOLDEN_ANGLE) });
    });
    return positions;
  }

  function uniqueEdges(edges, known) {
    const weights = new Map();
    for (const [from, to] of edges) {
      if (from === to || !known.has(from) || !known.has(to)) continue;
      const key = from < to ? from + "\u0000" + to : to + "\u0000" + from;
      weights.set(key, (weights.get(key) || 0) + 1);
    }
    // Triées : l'ordre d'addition des forces change les dernières décimales, donc les positions.
    return Array.from(weights).sort(([x], [y]) => (x < y ? -1 : 1)).map(([key, count]) => {
      const [from, to] = key.split("\u0000");
      return { from, to, weight: 1 + 0.35 * Math.log(count) }; // dix câbles ne collent pas deux équipements l'un sur l'autre
    });
  }

  // Une itération, sur des tableaux numériques indexés par le rang du nœud : à 500 nœuds, la même boucle écrite
  // avec des dictionnaires prenait dix secondes.
  function step(sim, temperature) {
    const { count, x, y, mx, my, from, to, weight, free } = sim;
    mx.fill(0);
    my.fill(0);
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
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
  }

  function simulation(sorted, points, links, fixed) {
    const rank = new Map(sorted.map((id, index) => [id, index]));
    return {
      count: sorted.length,
      x: Float64Array.from(sorted, (id) => points.get(id).x), y: Float64Array.from(sorted, (id) => points.get(id).y),
      mx: new Float64Array(sorted.length), my: new Float64Array(sorted.length),
      from: Int32Array.from(links, (edge) => rank.get(edge.from)), to: Int32Array.from(links, (edge) => rank.get(edge.to)),
      weight: Float64Array.from(links, (edge) => edge.weight), free: sorted.map((id) => !fixed.has(id)),
    };
  }

  // Les nœuds sans aucun câble (équipement injoignable, par exemple) ne sont pas confiés aux forces, qui les
  // chasseraient au loin : ils sont rangés en ligne sous le graphe, dans l'ordre des identifiants.
  function shelve(points, lonely, fixed) {
    const box = bounds(points);
    const perRow = Math.max(1, Math.floor(Math.max(box.width, SHELF_GAP * 4) / SHELF_GAP));
    lonely.forEach((id, index) => {
      const spot = { x: box.x + (index % perRow) * SHELF_GAP, y: box.y + box.height + 140 + Math.floor(index / perRow) * 80 };
      points.set(id, fixed.has(id) ? { x: fixed.get(id).x, y: fixed.get(id).y } : spot);
    });
  }

  // ids : identifiants des nœuds à placer ; edges : paires [a, b] ; pinned : Map id → {x, y} imposés (nœuds déplacés).
  function run(ids, edges, pinned) {
    const all = Array.from(ids).sort();
    const fixed = pinned || new Map();
    const links = uniqueEdges(edges, new Set(all));
    const wired = new Set(links.flatMap((edge) => [edge.from, edge.to]));
    const sorted = all.filter((id) => wired.has(id));
    const points = seed(sorted);
    fixed.forEach((point, id) => {
      if (points.has(id)) points.set(id, { x: point.x, y: point.y });
    });
    const sim = simulation(sorted, points, links, fixed);
    const iterations = iterationsFor(sorted.length);
    for (let i = 0; i < iterations; i += 1) step(sim, IDEAL * 1.5 * (1 - i / iterations) + 1);
    sorted.forEach((id, index) => points.set(id, { x: sim.x[index], y: sim.y[index] }));
    shelve(points, all.filter((id) => !wired.has(id)), fixed);
    return points;
  }

  function bounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    if (minX === Infinity) return { x: 0, y: 0, width: 1, height: 1 };
    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }

  LD.layout = { run, bounds, IDEAL };
})();
