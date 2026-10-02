// La géométrie du graphe, sans DOM : le tracé d'un câble (courbe, boucle, éventail entre deux équipements), le
// cadre d'un cluster, la largeur d'une bande de faisceau, les étiquettes des structures. Pur, testé sous Node.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const FAN = 14, FAN_MAX = 110, HULL_PAD = 40, CHAR_W = 6.6, BAND = 18, HIT_MARGIN = 8;

  function curve(p, q, link) {
    if (link.a.hostname === link.b.hostname) { // câble entre deux ports du même équipement : une boucle au-dessus
      const reach = 46 + link.indexInPair * 12;
      return { path: `M${p.x - 8},${p.y - 12} C${p.x - reach},${p.y - reach - 30} ${p.x + reach},${p.y - reach - 30} ${p.x + 8},${p.y - 12}`,
        mid: { x: p.x, y: p.y - reach * 0.75 - 22 }, ends: [{ x: p.x - 26, y: p.y - 30 }, { x: p.x + 26, y: p.y - 30 }] };
    }
    const dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.max(Math.hypot(dx, dy), 0.01);
    const spacing = Math.min(FAN, FAN_MAX / link.pairCount);
    const offset = (link.indexInPair - (link.pairCount - 1) / 2) * spacing;
    const nx = -dy / length, ny = dx / length;
    const c = { x: (p.x + q.x) / 2 + nx * offset * 2, y: (p.y + q.y) / 2 + ny * offset * 2 };
    const at = (t) => ({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * c.y + t * t * q.y });
    // L'étiquette suit la courbe de son câble, assez loin du nœud pour ne pas couvrir son nom, et s'ancre du côté où
    // la courbe s'écarte : deux câbles parallèles verticaux ont leurs noms de part et d'autre, pas l'un sur l'autre.
    const inset = Math.min(0.4, 78 / length);
    const side = nx * offset;
    const anchor = side > 0.5 ? "start" : side < -0.5 ? "end" : "middle";
    return { path: `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}`, mid: at(0.5), ends: [at(inset), at(1 - inset)], anchor };
  }

  // Le cadre d'un cluster : la boîte de ses membres visibles, élargie ; assez large pour le plus long des hostnames
  // (revue, 11) ; son étiquette dans le coin haut gauche.
  function hull(points, longest) {
    const box = LD.layout.bounds(new Map(points.map((p, i) => [i, p])));
    const padX = Math.max(HULL_PAD, (CHAR_W * (longest || 0)) / 2 + 12);
    return { x: box.x - padX, y: box.y - HULL_PAD - 6, width: box.width + 2 * padX, height: box.height + 2 * HULL_PAD + 6 };
  }

  // La bande d'un faisceau couvre l'éventail de ses câbles, avec une marge visible et cliquable de chaque côté (revue, 5).
  function beamWidths(beam) {
    const reach = Math.max(0, ...beam.links.map((link) => {
      const spacing = Math.min(FAN, FAN_MAX / link.pairCount);
      return Math.abs((link.indexInPair - (link.pairCount - 1) / 2) * spacing);
    }));
    const band = BAND + 2 * reach;
    return { band, hit: band + 2 * HIT_MARGIN };
  }

  // L'étiquette d'un faisceau : ses deux agrégats, puis ce qu'il est (peer-link, MLAG n). Sur le graphe, toujours la
  // forme courte (la nature seule) ; la complète vit dans la bulle et l'inspecteur.
  function beamLabel(beam, full) {
    const parts = full === false ? [] : [beam.a.aggregate + " ⇄ " + beam.b.aggregate];
    if (beam.peerLink) parts.push("peer-link");
    beam.mlags.forEach((domain) => parts.push("MLAG " + domain.raw.mlag_id));
    return parts.join(" · ");
  }

  function clusterLabel(cluster) {
    return "HA · " + (cluster.raw.cluster_name || cluster.hosts.join(" + ")) + " · " + cluster.raw.mode;
  }

  LD.geometry = { curve, hull, beamWidths, beamLabel, clusterLabel, CHAR_W };
})();
