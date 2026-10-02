// Modèle de lecture : des index sur le snapshot, rien d'inventé. Pur (aucun DOM), testé sous Node.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const SEP = "\u0000";
  const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
  const OBSERVED = { lldp: true, cdp: true };

  const ifaceKey = (hostname, name) => hostname + SEP + name;
  const linkId = (link) => [link.a.hostname, link.a.interface, link.b.hostname, link.b.interface].join(SEP);
  const pairKey = (link) => link.a.hostname + SEP + link.b.hostname;
  const endLabel = (end) => end.hostname + " · " + (end.interface === null || end.interface === undefined ? "?" : end.interface);
  const aggregateKey = (hostname, name) => hostname + SEP + name;
  const clusterId = (members) => members.join(SEP);

  function worst(checks) {
    let best = null;
    for (const check of checks) {
      if (best === null || SEVERITY_RANK[check.severity] < SEVERITY_RANK[best]) best = check.severity;
    }
    return best;
  }

  function pushTo(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  // Un contrôle vise des nœuds, des interfaces, des liens, des agrégats, des clusters : il est accroché à chaque
  // équipement concerné, et à la structure qu'il nomme (la répartition sur les câbles est faite par distributeChecks).
  function attachChecks(model, checks) {
    checks.forEach((check, index) => {
      const entry = { index, code: check.code, severity: check.severity, origin: check.origin, refs: check.refs, details: check.details };
      model.checks.push(entry);
      const hosts = new Set();
      for (const ref of check.refs) {
        if (ref.kind === "link") {
          hosts.add(ref.a.hostname);
          hosts.add(ref.b.hostname);
        } else if (ref.kind === "aggregate") {
          hosts.add(ref.hostname);
          pushTo(model.checksByAggregate, aggregateKey(ref.hostname, ref.name), entry);
        } else if (ref.kind === "interface") {
          hosts.add(ref.hostname);
        } else if (ref.kind === "cluster") {
          ref.members.forEach((member) => hosts.add(member));
          pushTo(model.checksByCluster, clusterId(ref.members), entry);
        } else if (ref.hostname) {
          hosts.add(ref.hostname);
        }
      }
      hosts.forEach((host) => pushTo(model.checksByNode, host, entry));
    });
  }

  function buildLinks(model, links) {
    const groups = new Map();
    for (const raw of links) {
      const sources = Array.from(new Set(raw.evidence.map((e) => e.source))).sort();
      const link = { index: model.links.length, id: linkId(raw), pair: pairKey(raw), raw, a: raw.a, b: raw.b, status: raw.status, sources, combo: sources.join(" + "), beam: null, heartbeat: false };
      model.links.push(link);
      model.linkById.set(link.id, link);
      pushTo(groups, link.pair, link);
      pushTo(model.linksByIface, ifaceKey(raw.a.hostname, raw.a.interface), link);
      pushTo(model.linksByIface, ifaceKey(raw.b.hostname, raw.b.interface), link);
      pushTo(model.linksByNode, raw.a.hostname, link);
      if (raw.b.hostname !== raw.a.hostname) pushTo(model.linksByNode, raw.b.hostname, link);
    }
    groups.forEach((members) => members.forEach((link, index) => {
      link.indexInPair = index;
      link.pairCount = members.length;
    }));
  }

  // Les structures de R4. Un agrégat porte ses câbles (ceux de ses membres) ; un faisceau est l'ensemble des câbles
  // dont les deux bouts sont membres d'un agrégat, une paire d'agrégats donc ; un domaine MLAG relie deux agrégats
  // de deux équipements ; un cluster HA relie ses membres. Rien ici n'est déduit : tout est lu dans le snapshot.
  function buildAggregates(model, snapshot) {
    snapshot.aggregates.forEach((raw, index) => {
      const key = aggregateKey(raw.hostname, raw.name);
      const entry = { index, key, raw, hostname: raw.hostname, name: raw.name, cables: [], mlag: null, beams: [] };
      entry.cables = raw.cables.map((cable) => model.linkById.get(linkId(cable))).filter(Boolean);
      model.aggregates.push(entry);
      model.aggregateByKey.set(key, entry);
      pushTo(model.aggregatesByNode, raw.hostname, entry);
    });
    snapshot.mlag_domains.forEach((raw, index) => {
      const members = raw.members.map((m) => model.aggregateByKey.get(aggregateKey(m.hostname, m.aggregate))).filter(Boolean);
      const domain = { index, raw, id: String(raw.mlag_id) + SEP + raw.members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP), members,
        peerLink: raw.peer_link ? model.aggregateByKey.get(aggregateKey(raw.peer_link.hostname, raw.peer_link.aggregate)) || null : null };
      model.mlagDomains.push(domain);
      members.forEach((aggregate) => { aggregate.mlag = domain; });
    });
  }

  // Un faisceau relie deux équipements distincts : une boucle entre deux agrégats du même équipement reste un câble
  // (ses deux agrégats se lisent sur sa fiche), elle ne fabrique pas de faisceau fantôme (revue, 7).
  function buildBeams(model) {
    for (const link of model.links) {
      const raw = link.raw;
      if (raw.aggregate_a === null || raw.aggregate_b === null || raw.a.hostname === raw.b.hostname) continue;
      const ends = [{ hostname: raw.a.hostname, aggregate: raw.aggregate_a }, { hostname: raw.b.hostname, aggregate: raw.aggregate_b }]
        .map((end) => ({ ...end, key: aggregateKey(end.hostname, end.aggregate) }))
        .sort((x, y) => (x.key < y.key ? -1 : 1));
      const id = ends[0].key + SEP + ends[1].key;
      if (!model.beamById.has(id)) {
        const aggregates = ends.map((end) => model.aggregateByKey.get(end.key) || null);
        const known = aggregates.filter(Boolean);
        // Les domaines MLAG des deux agrégats, dédoublonnés : un vPC dos à dos en a deux (revue, 3).
        const mlags = Array.from(new Set(known.map((agg) => agg.mlag).filter(Boolean)));
        const beam = { index: model.beams.length, id, a: ends[0], b: ends[1], aggregates, known, links: [],
          peerLink: known.length > 0 && known.every((agg) => agg.raw.mlag_peer_link),
          degraded: known.some((agg) => agg.raw.degraded), mlags };
        model.beams.push(beam);
        model.beamById.set(id, beam);
        aggregates.forEach((agg) => { if (agg) agg.beams.push(beam); });
        ends.forEach((end) => pushTo(model.beamsByNode, end.hostname, beam));
      }
      const beam = model.beamById.get(id);
      beam.links.push(link);
      link.beam = beam;
    }
  }

  function buildClusters(model, snapshot) {
    snapshot.ha_clusters.forEach((raw, index) => {
      const hosts = raw.members.map((m) => m.hostname);
      const cluster = { index, raw, id: clusterId(hosts), hosts, heartbeats: raw.heartbeat_interfaces.map((hb) => ({ ...hb, link: hb.cable ? model.linkById.get(linkId(hb.cable)) || null : null })) };
      model.clusters.push(cluster);
      model.clusterById.set(cluster.id, cluster);
      hosts.forEach((host) => pushTo(model.clustersByHost, host, cluster)); // un équipement peut être décrit dans deux clusters
      cluster.heartbeats.forEach((hb) => { if (hb.link) hb.link.heartbeat = true; });
    });
  }

  // Ce que les détails d'un contrôle désignent : des bouts de câble {hostname, interface} et des noms bruts. Les clés
  // qui nomment le port local du contrôle (`member`, `interface`) ne désignent pas l'autre bout (revue, 6).
  // Les clés qui nomment les membres d'un cluster (`description_ha_unresolved`) ne désignent pas l'autre bout non plus
  // (revue du 2026-10-02, B7).
  const LOCAL_PORT_KEYS = new Set(["member", "interface", "members", "priorities", "disputed", "clusters"]);
  function mentioned(value, found) {
    if (Array.isArray(value)) value.forEach((item) => mentioned(item, found));
    else if (value && typeof value === "object") {
      if ("hostname" in value && "interface" in value) found.ends.add(ifaceKey(value.hostname, value.interface));
      else Object.entries(value).forEach(([key, item]) => { if (!LOCAL_PORT_KEYS.has(key)) mentioned(item, found); });
    } else if (typeof value === "string") found.names.add(value);
    return found;
  }

  // Un contrôle posé sur un port qui porte plusieurs câbles ne concerne que ceux dont l'autre bout est désigné par
  // ses détails (le voisin inconnu, le port observé…), par son nom résolu ou par ce que le témoin a annoncé.
  function concerns(check, link, portKey) {
    const found = mentioned(check.details, { ends: new Set(), names: new Set() });
    const other = ifaceKey(link.a.hostname, link.a.interface) === portKey ? link.b : link.a;
    if (found.ends.has(ifaceKey(other.hostname, other.interface)) || found.names.has(other.hostname) || found.names.has(other.interface)) return true;
    return link.raw.evidence.some((e) => ifaceKey(e.witness.hostname, e.witness.interface) === portKey
      && (found.names.has(e.remote_raw.name) || (e.remote_raw.port !== null && found.names.has(e.remote_raw.port))));
  }

  // Trois cas, du plus sûr au moins sûr : le contrôle nomme son câble ; il vise un port qui n'en porte qu'un ; il vise
  // un port qui en porte plusieurs, et ses détails disent lequel. Sinon il reste un contrôle du port, montré à part
  // sur chacun de ses câbles et compté sur aucun.
  function distributeChecks(model) {
    const byRank = (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.index - y.index;
    model.links.forEach((link) => { link.checks = []; link.portChecks = []; });
    for (const check of model.checks) {
      const named = check.refs.filter((ref) => ref.kind === "link").map((ref) => model.linkById.get(linkId(ref))).filter(Boolean);
      if (named.length) { named.forEach((link) => link.checks.push(check)); continue; }
      for (const ref of check.refs.filter((r) => r.kind === "interface")) {
        const portKey = ifaceKey(ref.hostname, ref.name);
        const carried = model.linksByIface.get(portKey) || [];
        const chosen = carried.length === 1 ? carried : carried.filter((link) => concerns(check, link, portKey));
        (chosen.length ? chosen : carried).forEach((link) => (chosen.length ? link.checks : link.portChecks).push(check));
      }
    }
    model.links.forEach((link) => {
      link.checks = Array.from(new Set(link.checks)).sort(byRank);
      link.portChecks = Array.from(new Set(link.portChecks)).filter((c) => !link.checks.includes(c)).sort(byRank);
      link.worst = worst(link.checks);
    });
    model.aggregates.forEach((agg) => { agg.checks = (model.checksByAggregate.get(agg.key) || []).slice().sort(byRank); agg.worst = worst(agg.checks); });
    model.clusters.forEach((cluster) => { cluster.checks = (model.checksByCluster.get(cluster.id) || []).slice().sort(byRank); cluster.worst = worst(cluster.checks); });
    model.beams.forEach((beam) => {
      const own = beam.aggregates.flatMap((agg) => (agg ? agg.checks : []));
      beam.checks = Array.from(new Set(own)).sort(byRank);
      beam.worst = worst(beam.checks);
    });
  }

  function sourceCombos(links) {
    const rows = new Map();
    for (const link of links) {
      const key = link.combo + SEP + link.status;
      if (!rows.has(key)) rows.set(key, { combo: link.combo, status: link.status, observed: link.sources.some((s) => OBSERVED[s]), count: 0 });
      rows.get(key).count += 1;
    }
    return Array.from(rows.values()).sort((x, y) => y.count - x.count || (x.combo < y.combo ? -1 : 1));
  }

  function countBy(items, keyOf) {
    const counts = new Map();
    for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
    return counts;
  }

  function build(data) {
    const snapshot = data.snapshot;
    const model = {
      source: snapshot.source, report: snapshot.report, coverage: snapshot.coverage, ingest: data.ingest || null,
      origin: data.origin, catalogue: data.catalogue || {}, snapshotVersion: snapshot.snapshot_version,
      nodes: snapshot.nodes, nodeByHost: new Map(), interfaces: snapshot.interfaces, ifaceByKey: new Map(),
      ifacesByNode: new Map(), links: [], linkById: new Map(), linksByNode: new Map(), linksByIface: new Map(), checks: [],
      checksByNode: new Map(), checksByAggregate: new Map(), checksByCluster: new Map(),
      aggregates: [], aggregateByKey: new Map(), aggregatesByNode: new Map(), mlagDomains: [],
      beams: [], beamById: new Map(), beamsByNode: new Map(), clusters: [], clusterById: new Map(), clustersByHost: new Map(),
    };
    snapshot.nodes.forEach((node) => model.nodeByHost.set(node.hostname, node));
    snapshot.interfaces.forEach((itf) => {
      model.ifaceByKey.set(ifaceKey(itf.hostname, itf.name), itf);
      pushTo(model.ifacesByNode, itf.hostname, itf);
    });
    buildLinks(model, snapshot.links);
    buildAggregates(model, snapshot);
    buildBeams(model);
    buildClusters(model, snapshot);
    attachChecks(model, snapshot.checks);
    distributeChecks(model);
    model.combos = sourceCombos(model.links);
    model.severityCounts = countBy(model.checks, (c) => c.severity);
    model.statusCounts = countBy(model.links, (l) => l.status);
    model.kindCounts = countBy(model.nodes, (n) => n.kind);
    return model;
  }

  // Une sélection s'adresse par l'identité de l'élément (ses bouts, ses membres), jamais par son rang : le rang change
  // dès qu'un export corrigé ajoute un voisin, et la même adresse montrerait un autre élément.
  const linkToken = (link) => JSON.stringify([link.a.hostname, link.a.interface, link.b.hostname, link.b.interface]);
  function parseToken(token, length) {
    try {
      const parts = JSON.parse(token);
      return Array.isArray(parts) && (length === null || parts.length === length) && parts.every((p) => typeof p === "string") ? parts : null;
    } catch (error) {
      return null;
    }
  }
  function linkFromToken(model, token) {
    const parts = parseToken(token, 4);
    return parts ? model.linkById.get(parts.join(SEP)) || null : null;
  }

  // L'entité désignée par une sélection, ou null si elle n'existe pas dans ce snapshot.
  function entityOf(model, selection) {
    if (!selection) return null;
    const maps = { node: model.nodeByHost, link: model.linkById, aggregate: model.aggregateByKey, beam: model.beamById, cluster: model.clusterById };
    return maps[selection.kind] ? maps[selection.kind].get(selection.id) || null : null;
  }

  // Les équipements qu'une sélection concerne : ceux à centrer, à garder visibles.
  function hostsOf(model, selection) {
    const entity = entityOf(model, selection);
    if (!entity) return [];
    switch (selection.kind) {
      case "node": return [entity.hostname];
      case "link": return [entity.a.hostname, entity.b.hostname];
      case "aggregate": return [entity.hostname];
      case "beam": return [entity.a.hostname, entity.b.hostname];
      default: return entity.hosts;
    }
  }

  // Le paramètre d'adresse d'une sélection (`link=`, `aggregate=`…) et sa valeur, et l'inverse.
  function tokenOf(model, selection) {
    const entity = entityOf(model, selection);
    if (!entity) return null;
    switch (selection.kind) {
      case "node": return ["node", entity.hostname];
      case "link": return ["link", linkToken(entity)];
      case "aggregate": return ["aggregate", JSON.stringify([entity.hostname, entity.name])];
      case "beam": return ["beam", JSON.stringify([entity.a.hostname, entity.a.aggregate, entity.b.hostname, entity.b.aggregate])];
      default: return ["cluster", JSON.stringify(entity.hosts)];
    }
  }
  // Une adresse écrite avec les bouts dans l'autre ordre désigne le même élément (revue, 8).
  function selectionFromToken(model, kind, token) {
    if (kind === "node") return model.nodeByHost.has(token) ? { kind, id: token } : null;
    const lengths = { link: 4, aggregate: 2, beam: 4, cluster: null };
    if (!(kind in lengths)) return null;
    const parts = parseToken(token, lengths[kind]);
    if (!parts) return null;
    const swapped = kind === "link" || kind === "beam" ? [parts[2], parts[3], parts[0], parts[1]] : null;
    const candidates = kind === "cluster" ? [parts.slice().sort()] : swapped ? [parts, swapped] : [parts];
    for (const order of candidates) {
      const id = kind === "beam" ? aggregateKey(order[0], order[1]) + SEP + aggregateKey(order[2], order[3]) : order.join(SEP);
      if (entityOf(model, { kind, id })) return { kind, id };
    }
    return null;
  }

  LD.model = { build, ifaceKey, linkId, endLabel, worst, linkToken, linkFromToken, aggregateKey, clusterId, entityOf, hostsOf, tokenOf, selectionFromToken,
    SEVERITY_RANK, OBSERVED, SELECTION_KINDS: ["node", "link", "aggregate", "beam", "cluster"] };
})();
