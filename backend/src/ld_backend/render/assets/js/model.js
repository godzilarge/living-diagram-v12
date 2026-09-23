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

  // Un contrôle vise des nœuds, des interfaces, des liens : il est accroché à chaque équipement concerné
  // (la répartition sur les câbles est faite par distributeChecks).
  function attachChecks(model, checks) {
    checks.forEach((check, index) => {
      const entry = { index, code: check.code, severity: check.severity, origin: check.origin, refs: check.refs, details: check.details };
      model.checks.push(entry);
      const hosts = new Set();
      for (const ref of check.refs) {
        if (ref.kind === "link") {
          hosts.add(ref.a.hostname);
          hosts.add(ref.b.hostname);
        } else if (ref.kind === "interface" || ref.kind === "aggregate") {
          hosts.add(ref.hostname);
        } else if (ref.kind === "cluster") {
          ref.members.forEach((member) => hosts.add(member));
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
      const link = { index: model.links.length, id: linkId(raw), pair: pairKey(raw), raw, a: raw.a, b: raw.b, status: raw.status, sources, combo: sources.join(" + ") };
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

  // Ce que les détails d'un contrôle désignent : des bouts de câble {hostname, interface} et des noms bruts.
  function mentioned(value, found) {
    if (Array.isArray(value)) value.forEach((item) => mentioned(item, found));
    else if (value && typeof value === "object") {
      if ("hostname" in value && "interface" in value) found.ends.add(ifaceKey(value.hostname, value.interface));
      else Object.values(value).forEach((item) => mentioned(item, found));
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
      checksByNode: new Map(),
      aggregates: snapshot.aggregates, mlagDomains: snapshot.mlag_domains, haClusters: snapshot.ha_clusters,
    };
    snapshot.nodes.forEach((node) => model.nodeByHost.set(node.hostname, node));
    snapshot.interfaces.forEach((itf) => {
      model.ifaceByKey.set(ifaceKey(itf.hostname, itf.name), itf);
      pushTo(model.ifacesByNode, itf.hostname, itf);
    });
    buildLinks(model, snapshot.links);
    attachChecks(model, snapshot.checks);
    distributeChecks(model);
    model.combos = sourceCombos(model.links);
    model.severityCounts = countBy(model.checks, (c) => c.severity);
    model.statusCounts = countBy(model.links, (l) => l.status);
    model.kindCounts = countBy(model.nodes, (n) => n.kind);
    return model;
  }

  // Un câble s'adresse par son identité (ses deux bouts), jamais par son rang : le rang change dès qu'un export
  // corrigé ajoute un voisin, et la même adresse montrerait un autre câble.
  const linkToken = (link) => JSON.stringify([link.a.hostname, link.a.interface, link.b.hostname, link.b.interface]);
  function linkFromToken(model, token) {
    try {
      const parts = JSON.parse(token);
      return Array.isArray(parts) && parts.length === 4 ? model.linkById.get(parts.join(SEP)) || null : null;
    } catch (error) {
      return null;
    }
  }

  LD.model = { build, ifaceKey, linkId, endLabel, worst, linkToken, linkFromToken, SEVERITY_RANK, OBSERVED };
})();
