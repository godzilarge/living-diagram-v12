// La bulle au survol : ce qu'un câble, un équipement, un faisceau ou un cluster a à dire en quelques lignes, lu dans
// le snapshot. Un groupe SVG posé dans le canevas en coordonnées d'écran, jamais un style en ligne (la CSP par
// empreinte n'en admet aucun) ; des cellules alignées en colonnes par leur largeur en caractères (police à chasse
// fixe), jamais par des espaces. Une valeur absente s'écrit « — », jamais une valeur inventée, et jamais une raison
// que le snapshot ne donne pas (`null` = « pas de valeur », pas « non lu »).
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { s, clear } = LD.dom;
  const CHAR_W = 7.4, LINE_H = 16, PAD_X = 10, PAD_Y = 7, GAP = 2 * CHAR_W, OFFSET = 14; // mono 12 px
  const DASH = "—";
  const SOURCE_ORDER = ["lldp", "cdp", "description"]; // l'observé avant le documenté
  const MAX_CHECK_LINES = 6;

  const cell = (text, cls) => ({ text: String(text), cls: cls || null });
  const line = (...cells) => cells;
  const plural = (count, word) => count + " " + word + (count > 1 ? "s" : "");
  const endLabel = (end) => LD.model.endLabel(end);

  // Les faits d'un bout : ce que `interfaces[]` dit du port ; `present: false` s'il n'y figure pas (voisin inconnu,
  // autre infra, port tel qu'annoncé par le voisin) : alors aucune valeur, et la bulle le dit en toutes lettres.
  function endFacts(model, end) {
    const itf = model.ifaceByKey.get(LD.model.ifaceKey(end.hostname, end.interface));
    if (!itf) return { present: false, speed: null, duplex: null, media: null, state: null };
    return { present: true, speed: LD.dom.speedText(itf.speed_mbps), duplex: itf.duplex, media: itf.media,
      state: itf.oper_status + (itf.oper_reason ? " · " + itf.oper_reason : "") };
  }

  // Les contrôles, une ligne par (sévérité, code) avec son nombre d'occurrences, les plus graves d'abord ; au-delà de
  // six lignes, le reste est compté en contrôles, pas en codes (revue, M3).
  function checkLines(checks) {
    const counts = new Map();
    checks.forEach((c) => { const key = c.severity + " · " + c.code; counts.set(key, (counts.get(key) || 0) + 1); });
    const rank = (key) => LD.model.SEVERITY_RANK[key.split(" · ")[0]];
    const rows = Array.from(counts.keys()).sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0));
    const lines = rows.slice(0, MAX_CHECK_LINES).map((key) =>
      line(cell(key + (counts.get(key) > 1 ? " ×" + counts.get(key) : ""), "severity-" + key.split(" · ")[0])));
    const rest = rows.slice(MAX_CHECK_LINES).reduce((sum, key) => sum + counts.get(key), 0);
    if (rest) lines.push(line(cell("… et " + rest + " autre" + (rest > 1 ? "s" : "") + " contrôle" + (rest > 1 ? "s" : ""), "tip-muted")));
    return lines;
  }

  function sourcesText(sources) {
    const ordered = SOURCE_ORDER.filter((src) => sources.includes(src)).concat(sources.filter((src) => !SOURCE_ORDER.includes(src)));
    return ordered.map((src) => LD.dom.SOURCE_LABEL[src] || src).join(" + ");
  }

  // Une ligne par caractéristique, seulement si au moins un bout l'a ; l'état à part, connu de tout bout présent.
  function linkLines(model, link) {
    const ends = [link.a, link.b];
    const facts = ends.map((end) => endFacts(model, end));
    const row = (label, key) => (facts.some((f) => f[key] !== null)
      ? line(cell(label, "tip-muted"), ...facts.map((f) => cell(f[key] === null ? DASH : f[key]))) : null);
    const traits = [row("vitesse", "speed"), row("duplex", "duplex"), row("média", "media")].filter(Boolean);
    return [
      line(cell(endLabel(link.a) + " ↔ " + endLabel(link.b), "tip-title")),
      line(cell(LD.dom.STATUS_LABEL[link.status] + " · " + sourcesText(link.sources) + " · " + link.raw.oper, "tip-muted")),
      ...ends.filter((end, index) => !facts[index].present).map((end) => line(cell(endLabel(end) + " : absent de interfaces[]", "tip-muted"))),
      line(cell(""), cell(link.a.interface, "tip-muted"), cell(link.b.interface, "tip-muted")),
      ...(traits.length ? traits : [line(cell("vitesse, duplex, média : aucune valeur", "tip-muted"))]),
      row("état", "state"),
      ...checkLines(link.checks),
    ].filter(Boolean);
  }

  const memberText = (member) => member.role + " · " + member.state
    + (member.priority !== null && member.priority !== undefined ? " · priorité " + member.priority : "");

  function nodeLines(model, node) {
    const memberships = model.haMembershipsByHost.get(node.hostname) || [];
    const links = model.linksByNode.get(node.hostname) || [];
    const hardware = [node.vendor, node.model].filter(Boolean).join(" · ");
    const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
    const facts = [node.collection ? "collecte : " + node.collection : null, plural(links.length, "câble"),
      node.stack ? "stack ×" + node.stack.member_count : null,
      node.evidence && node.evidence.capabilities.length ? "capacités : " + node.evidence.capabilities.join(", ") : null].filter(Boolean);
    return [
      line(cell(node.hostname + " · " + LD.dom.KIND_LABEL[node.kind] + (node.type ? " · " + node.type : ""), "tip-title")),
      hardware || system ? line(cell([hardware, system].filter(Boolean).join(" · "), "tip-muted")) : null,
      line(cell(facts.join(" · "), "tip-muted")),
      ...memberships.map((ha) => line(cell(LD.geometry.clusterLabel(ha.cluster) + " · " + memberText(ha.member)))), // tous ses clusters (revue, B4)
      ...checkLines(model.checksByNode.get(node.hostname) || []),
    ].filter(Boolean);
  }

  // Le titre nomme les deux équipements : deux faisceaux d'un même agrégat vers deux voisins ne se confondent pas (revue, M2).
  function beamLines(beam) {
    const nature = LD.geometry.beamLabel(beam, false);
    const protocols = Array.from(new Set(beam.known.map((agg) => agg.raw.protocol + (agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""))));
    return [
      line(cell("faisceau " + endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate }) + " ⇄ "
        + endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate }) + (nature ? " · " + nature : ""), "tip-title")),
      line(cell(plural(beam.links.length, "câble") + (protocols.length ? " · " + protocols.join(" / ") : "") + (beam.degraded ? " · un agrégat dégradé" : ""), "tip-muted")),
      ...checkLines(beam.checks),
    ];
  }

  function clusterLines(cluster) {
    return [
      line(cell(LD.geometry.clusterLabel(cluster), "tip-title")),
      ...cluster.raw.members.map((m) => line(cell(m.hostname), cell(memberText(m), "tip-muted"))),
      ...checkLines(cluster.checks),
    ];
  }

  // La bulle elle-même. `show` reçoit une clé (l'élément survolé) et une fabrique de lignes : les lignes ne sont
  // reconstruites que quand l'élément change, pas à chaque mouvement du pointeur.
  function create(svg) {
    const box = s("rect", { class: "tip-box", rx: 5 });
    const group = s("g", { class: "tip", visibility: "hidden", role: "tooltip", id: "ld-tip" }, box);
    svg.appendChild(group);
    let shownFor = null, size = { width: 0, height: 0 };

    // Les colonnes se mesurent sur les lignes à plusieurs cellules ; une ligne à une cellule s'étend sur toute la
    // largeur sans peser sur les colonnes (un titre long n'écarte pas le tableau).
    function fill(lines) {
      clear(group).appendChild(box);
      const widths = [0];
      lines.filter((cells) => cells.length > 1).forEach((cells) => cells.forEach((c, col) => { widths[col] = Math.max(widths[col] || 0, c.text.length); }));
      const offsets = widths.map((_, col) => widths.slice(0, col).reduce((sum, w) => sum + w * CHAR_W + GAP, 0));
      lines.forEach((cells, row) => cells.forEach((c, col) => {
        if (c.text === "") return;
        group.appendChild(s("text", { class: "tip-line" + (c.cls ? " " + c.cls : ""), x: PAD_X + offsets[col], y: PAD_Y + LINE_H * (row + 1) - 4 }, c.text));
      }));
      const last = widths.length - 1;
      const spanning = Math.max(0, ...lines.filter((cells) => cells.length === 1).map((cells) => cells[0].text.length));
      size = { width: 2 * PAD_X + Math.max(offsets[last] + widths[last] * CHAR_W, spanning * CHAR_W), height: 2 * PAD_Y + LINE_H * lines.length };
      box.setAttribute("width", size.width);
      box.setAttribute("height", size.height);
    }

    // Près du pointeur, du côté où il reste de la place, et jamais hors du canevas, d'aucun côté (revue, B2).
    function place(x, y, rect) {
      const wanted = { x: x + OFFSET + size.width > rect.width ? x - OFFSET - size.width : x + OFFSET,
        y: y + OFFSET + size.height > rect.height ? y - OFFSET - size.height : y + OFFSET };
      const left = Math.max(0, Math.min(wanted.x, rect.width - size.width));
      const top = Math.max(0, Math.min(wanted.y, rect.height - size.height));
      group.setAttribute("transform", `translate(${Math.round(left)},${Math.round(top)})`);
    }

    function show(key, linesOf, x, y, rect) {
      if (key !== shownFor) {
        shownFor = key;
        fill(linesOf());
      }
      place(x, y, rect);
      group.setAttribute("visibility", "visible");
    }

    function hide() {
      shownFor = null;
      group.setAttribute("visibility", "hidden");
    }

    return { group, id: "ld-tip", show, hide };
  }

  LD.tip = { create, linkLines, nodeLines, beamLines, clusterLines };
})();
