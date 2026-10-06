// Généré par engine/build.mjs depuis engine/src (TypeScript) : ne pas éditer ici, lancer `npm run build` dans engine/.
"use strict";
(() => {
  // src/canvas/dom.ts
  var SVG_NS = "http://www.w3.org/2000/svg";
  var HANDLERS = /* @__PURE__ */ new Map([["onclick", "click"], ["oninput", "input"], ["onchange", "change"], ["onsubmit", "submit"], ["onkeydown", "keydown"]]);
  function flatten(children, into = []) {
    for (const child of children) {
      if (Array.isArray(child)) flatten(child, into);
      else into.push(child);
    }
    return into;
  }
  function fill(element, attrs, children) {
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === null || value === void 0 || value === false) continue;
      const event = HANDLERS.get(name);
      if (name === "class") element.setAttribute("class", String(value));
      else if (event) element.addEventListener(event, value);
      else element.setAttribute(name, value === true ? "" : String(value));
    }
    for (const child of flatten(children)) {
      if (child === null || child === void 0 || child === false || Array.isArray(child)) continue;
      element.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
    }
    return element;
  }
  var h = (tag, attrs, ...children) => fill(document.createElement(tag), attrs, children);
  var s = (tag, attrs, ...children) => fill(document.createElementNS(SVG_NS, tag), attrs, children);
  function clear(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
    return element;
  }
  var dom = { h, s, clear };

  // src/canvas/model.ts
  var SEP = "\0";
  var SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
  var OBSERVED = { lldp: true, cdp: true };
  var SELECTION_KINDS = ["node", "link", "aggregate", "beam", "cluster"];
  var DIFF_SECTIONS = ["nodes", "interfaces", "links", "aggregates", "mlag_domains", "ha_clusters"];
  function haRoleGroup(mode, role) {
    if (role === "active" || mode === "active_passive" && role === "primary") return "lead";
    if (role === "standby" || mode === "active_passive" && role === "secondary") return "follow";
    return "plain";
  }
  var ifaceKey = (hostname, name) => hostname + SEP + name;
  var linkId = (link) => [link.a.hostname, link.a.interface, link.b.hostname, link.b.interface].join(SEP);
  var pairKey = (link) => link.a.hostname + SEP + link.b.hostname;
  var endLabel = (end) => end.hostname + " · " + (end.interface === null || end.interface === void 0 ? "?" : end.interface);
  var aggregateKey = (hostname, name) => hostname + SEP + name;
  var clusterId = (members) => members.join(SEP);
  function worst(checks) {
    let best = null;
    for (const check of checks) {
      if (best === null || SEVERITY_RANK[check.severity] < SEVERITY_RANK[best]) best = check.severity;
    }
    return best;
  }
  function pushTo(map, key, value) {
    const found = map.get(key);
    if (found) found.push(value);
    else map.set(key, [value]);
  }
  function attachChecks(model2, checks) {
    checks.forEach((check, index) => {
      const entry = { index, code: check.code, severity: check.severity, origin: check.origin, refs: check.refs, details: check.details };
      model2.checks.push(entry);
      const hosts = /* @__PURE__ */ new Set();
      for (const ref of check.refs) {
        if (ref.kind === "link") {
          hosts.add(ref.a.hostname);
          hosts.add(ref.b.hostname);
        } else if (ref.kind === "aggregate") {
          hosts.add(ref.hostname);
          pushTo(model2.checksByAggregate, aggregateKey(ref.hostname, ref.name), entry);
        } else if (ref.kind === "interface") {
          hosts.add(ref.hostname);
        } else if (ref.kind === "cluster") {
          ref.members.forEach((member) => hosts.add(member));
          pushTo(model2.checksByCluster, clusterId(ref.members), entry);
        } else if (ref.hostname) {
          hosts.add(ref.hostname);
        }
      }
      hosts.forEach((host) => pushTo(model2.checksByNode, host, entry));
    });
  }
  function buildLinks(model2, links, ghosts) {
    const groups = /* @__PURE__ */ new Map();
    const add = (raw, ghost) => {
      const sources = Array.from(new Set(raw.evidence.map((e) => e.source))).sort();
      const link = {
        index: model2.links.length + model2.ghostLinks.length,
        id: linkId(raw),
        pair: pairKey(raw),
        raw,
        a: raw.a,
        b: raw.b,
        status: raw.status,
        sources,
        combo: sources.join(" + "),
        beam: null,
        heartbeat: false,
        ghost,
        checks: [],
        portChecks: [],
        worst: null,
        indexInPair: 0,
        pairCount: 1
      };
      (ghost ? model2.ghostLinks : model2.links).push(link);
      model2.linkById.set(link.id, link);
      pushTo(groups, link.pair, link);
      pushTo(model2.linksByIface, ifaceKey(raw.a.hostname, raw.a.interface), link);
      pushTo(model2.linksByIface, ifaceKey(raw.b.hostname, raw.b.interface), link);
      pushTo(model2.linksByNode, raw.a.hostname, link);
      if (raw.b.hostname !== raw.a.hostname) pushTo(model2.linksByNode, raw.b.hostname, link);
    };
    links.forEach((raw) => add(raw, false));
    ghosts.forEach((raw) => {
      if (!model2.linkById.has(linkId(raw))) add(raw, true);
    });
    groups.forEach((members) => {
      const ranked = members.map((link, rank) => ({ link, rank, beam: beamIdOf(link.raw) || "" }));
      ranked.sort((x, y) => x.beam < y.beam ? -1 : x.beam > y.beam ? 1 : x.rank - y.rank);
      ranked.forEach(({ link }, index) => {
        link.indexInPair = index;
        link.pairCount = members.length;
      });
    });
  }
  function addGhosts(model2, diff) {
    diff.nodes.removed.forEach((node) => {
      if (model2.nodeByHost.has(node.hostname)) return;
      const ghost = { ...node, ghost: true };
      model2.ghostNodes.push(ghost);
      model2.nodeByHost.set(node.hostname, ghost);
    });
    diff.interfaces.removed.forEach((itf) => {
      const key = ifaceKey(itf.hostname, itf.name);
      if (model2.ifaceByKey.has(key)) return;
      const ghost = { ...itf, ghost: true };
      model2.ghostIfaceByKey.set(key, ghost);
      pushTo(model2.ghostIfacesByNode, itf.hostname, ghost);
    });
  }
  function interfaceAt(model2, hostname, name, removed) {
    const key = ifaceKey(hostname, name);
    const live = model2.ifaceByKey.get(key);
    if (live) return { itf: live, ghost: false };
    const gone = removed ? model2.ghostIfaceByKey.get(key) : null;
    return gone ? { itf: gone, ghost: true } : null;
  }
  var emptyDiffIndex = () => ({ node: /* @__PURE__ */ new Map(), interface: /* @__PURE__ */ new Map(), link: /* @__PURE__ */ new Map(), aggregate: /* @__PURE__ */ new Map(), cluster: /* @__PURE__ */ new Map(), mlag_domain: /* @__PURE__ */ new Map() });
  function indexDiff(diff) {
    const of = emptyDiffIndex();
    if (!diff) return of;
    const mark = (map, key, kind, fields) => {
      map.set(key, { kind, fields: fields || [] });
    };
    const mlagKey = (id, members) => id + SEP + members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP);
    diff.nodes.added.forEach((n) => mark(of.node, n.hostname, "added"));
    diff.nodes.removed.forEach((n) => mark(of.node, n.hostname, "removed"));
    diff.nodes.changed.forEach((c) => {
      if (c.ref.kind === "node") mark(of.node, c.ref.hostname, "changed", c.fields);
    });
    diff.interfaces.added.forEach((i) => mark(of.interface, ifaceKey(i.hostname, i.name), "added"));
    diff.interfaces.removed.forEach((i) => mark(of.interface, ifaceKey(i.hostname, i.name), "removed"));
    diff.interfaces.changed.forEach((c) => {
      if (c.ref.kind === "interface") mark(of.interface, ifaceKey(c.ref.hostname, c.ref.name), "changed", c.fields);
    });
    diff.links.added.forEach((l) => mark(of.link, linkId(l), "added"));
    diff.links.removed.forEach((l) => mark(of.link, linkId(l), "removed"));
    diff.links.changed.forEach((c) => {
      if (c.ref.kind === "link") mark(of.link, linkId(c.ref), "changed", c.fields);
    });
    diff.aggregates.added.forEach((a) => mark(of.aggregate, aggregateKey(a.hostname, a.name), "added"));
    diff.aggregates.removed.forEach((a) => mark(of.aggregate, aggregateKey(a.hostname, a.name), "removed"));
    diff.aggregates.changed.forEach((c) => {
      if (c.ref.kind === "aggregate") mark(of.aggregate, aggregateKey(c.ref.hostname, c.ref.name), "changed", c.fields);
    });
    diff.ha_clusters.added.forEach((c) => mark(of.cluster, clusterId(c.members.map((m) => m.hostname)), "added"));
    diff.ha_clusters.removed.forEach((c) => mark(of.cluster, clusterId(c.members.map((m) => m.hostname)), "removed"));
    diff.ha_clusters.changed.forEach((c) => {
      if (c.ref.kind === "cluster") mark(of.cluster, clusterId(c.ref.members), "changed", c.fields);
    });
    diff.mlag_domains.added.forEach((d) => mark(of.mlag_domain, mlagKey(d.mlag_id, d.members), "added"));
    diff.mlag_domains.removed.forEach((d) => mark(of.mlag_domain, mlagKey(d.mlag_id, d.members), "removed"));
    diff.mlag_domains.changed.forEach((c) => {
      if (c.ref.kind === "mlag_domain") mark(of.mlag_domain, mlagKey(c.ref.mlag_id, c.ref.members), "changed", c.fields);
    });
    return of;
  }
  function diffCount(diff) {
    if (!diff) return 0;
    const s2 = diff.summary;
    const sections = DIFF_SECTIONS.reduce((sum, name) => sum + s2[name].added + s2[name].removed + s2[name].changed, 0);
    return sections + s2.checks.appeared + s2.checks.resolved + s2.coverage.changed + s2.events.rebooted + s2.events.flapped;
  }
  function buildAggregates(model2, snapshot) {
    snapshot.aggregates.forEach((raw, index) => {
      const key = aggregateKey(raw.hostname, raw.name);
      const entry = { index, key, raw, hostname: raw.hostname, name: raw.name, cables: [], mlag: null, beams: [], checks: [], worst: null };
      entry.cables = raw.cables.map((cable) => model2.linkById.get(linkId(cable))).filter((link) => !!link);
      model2.aggregates.push(entry);
      model2.aggregateByKey.set(key, entry);
      pushTo(model2.aggregatesByNode, raw.hostname, entry);
    });
    snapshot.mlag_domains.forEach((raw, index) => {
      const members = raw.members.map((m) => model2.aggregateByKey.get(aggregateKey(m.hostname, m.aggregate))).filter((a) => !!a);
      const domain = {
        index,
        raw,
        id: String(raw.mlag_id) + SEP + raw.members.map((m) => aggregateKey(m.hostname, m.aggregate)).join(SEP),
        members,
        peerLink: raw.peer_link ? model2.aggregateByKey.get(aggregateKey(raw.peer_link.hostname, raw.peer_link.aggregate)) || null : null
      };
      model2.mlagDomains.push(domain);
      members.forEach((aggregate) => {
        aggregate.mlag = domain;
      });
    });
  }
  function beamEndsOf(raw) {
    if (raw.aggregate_a === null || raw.aggregate_b === null || raw.a.hostname === raw.b.hostname) return null;
    const ends = [{ hostname: raw.a.hostname, aggregate: raw.aggregate_a }, { hostname: raw.b.hostname, aggregate: raw.aggregate_b }].map((end) => ({ ...end, key: aggregateKey(end.hostname, end.aggregate) })).sort((x, y) => x.key < y.key ? -1 : 1);
    return [ends[0], ends[1]];
  }
  var beamIdOf = (raw) => {
    const ends = beamEndsOf(raw);
    return ends ? ends[0].key + SEP + ends[1].key : null;
  };
  function buildBeams(model2) {
    for (const link of model2.links) {
      const ends = beamEndsOf(link.raw);
      if (!ends) continue;
      const id = ends[0].key + SEP + ends[1].key;
      if (!model2.beamById.has(id)) {
        const aggregates = ends.map((end) => model2.aggregateByKey.get(end.key) || null);
        const known2 = aggregates.filter((agg) => !!agg);
        const mlags = Array.from(new Set(known2.map((agg) => agg.mlag).filter((d) => !!d)));
        const beam2 = {
          index: model2.beams.length,
          id,
          a: ends[0],
          b: ends[1],
          aggregates,
          known: known2,
          links: [],
          peerLink: known2.length > 0 && known2.every((agg) => agg.raw.mlag_peer_link),
          degraded: known2.some((agg) => agg.raw.degraded),
          mlags,
          checks: [],
          worst: null
        };
        model2.beams.push(beam2);
        model2.beamById.set(id, beam2);
        aggregates.forEach((agg) => {
          if (agg) agg.beams.push(beam2);
        });
        ends.forEach((end) => pushTo(model2.beamsByNode, end.hostname, beam2));
      }
      const beam = model2.beamById.get(id);
      beam.links.push(link);
      link.beam = beam;
    }
  }
  function buildClusters(model2, snapshot) {
    snapshot.ha_clusters.forEach((raw, index) => {
      const hosts = raw.members.map((m) => m.hostname);
      const cluster = {
        index,
        raw,
        id: clusterId(hosts),
        hosts,
        checks: [],
        worst: null,
        heartbeats: raw.heartbeat_interfaces.map((hb) => ({ ...hb, link: hb.cable ? model2.linkById.get(linkId(hb.cable)) || null : null }))
      };
      model2.clusters.push(cluster);
      model2.clusterById.set(cluster.id, cluster);
      hosts.forEach((host) => pushTo(model2.clustersByHost, host, cluster));
      raw.members.forEach((member) => pushTo(model2.haMembershipsByHost, member.hostname, { cluster, member }));
      cluster.heartbeats.forEach((hb) => {
        if (hb.link) hb.link.heartbeat = true;
      });
    });
  }
  var LOCAL_PORT_KEYS = /* @__PURE__ */ new Set(["member", "interface", "members", "priorities", "disputed", "clusters"]);
  function mentioned(value, found) {
    if (Array.isArray(value)) value.forEach((item) => mentioned(item, found));
    else if (value && typeof value === "object") {
      const record = value;
      if ("hostname" in record && "interface" in record) found.ends.add(ifaceKey(String(record.hostname), record.interface));
      else Object.entries(record).forEach(([key, item]) => {
        if (!LOCAL_PORT_KEYS.has(key)) mentioned(item, found);
      });
    } else if (typeof value === "string") found.names.add(value);
    return found;
  }
  function concerns(check, link, portKey) {
    const found = mentioned(check.details, { ends: /* @__PURE__ */ new Set(), names: /* @__PURE__ */ new Set() });
    const other = ifaceKey(link.a.hostname, link.a.interface) === portKey ? link.b : link.a;
    if (found.ends.has(ifaceKey(other.hostname, other.interface)) || found.names.has(other.hostname) || found.names.has(other.interface)) return true;
    return link.raw.evidence.some((e) => ifaceKey(e.witness.hostname, e.witness.interface) === portKey && (found.names.has(e.remote_raw.name) || e.remote_raw.port !== null && found.names.has(e.remote_raw.port)));
  }
  function distributeChecks(model2) {
    const byRank2 = (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.index - y.index;
    model2.links.forEach((link) => {
      link.checks = [];
      link.portChecks = [];
    });
    for (const check of model2.checks) {
      const named = check.refs.filter((ref) => ref.kind === "link").map((ref) => model2.linkById.get(linkId(ref))).filter((l) => !!l);
      if (named.length) {
        named.forEach((link) => link.checks.push(check));
        continue;
      }
      for (const ref of check.refs.filter((r) => r.kind === "interface")) {
        const portKey = ifaceKey(ref.hostname, ref.name);
        const carried = (model2.linksByIface.get(portKey) || []).filter((link) => !link.ghost);
        const chosen = carried.length === 1 ? carried : carried.filter((link) => concerns(check, link, portKey));
        (chosen.length ? chosen : carried).forEach((link) => (chosen.length ? link.checks : link.portChecks).push(check));
      }
    }
    model2.links.forEach((link) => {
      link.checks = Array.from(new Set(link.checks)).sort(byRank2);
      link.portChecks = Array.from(new Set(link.portChecks)).filter((c) => !link.checks.includes(c)).sort(byRank2);
      link.worst = worst(link.checks);
    });
    model2.aggregates.forEach((agg) => {
      agg.checks = (model2.checksByAggregate.get(agg.key) || []).slice().sort(byRank2);
      agg.worst = worst(agg.checks);
    });
    model2.clusters.forEach((cluster) => {
      cluster.checks = (model2.checksByCluster.get(cluster.id) || []).slice().sort(byRank2);
      cluster.worst = worst(cluster.checks);
    });
    model2.beams.forEach((beam) => {
      const own = beam.aggregates.flatMap((agg) => agg ? agg.checks : []);
      beam.checks = Array.from(new Set(own)).sort(byRank2);
      beam.worst = worst(beam.checks);
    });
  }
  function sourceCombos(links) {
    const rows = /* @__PURE__ */ new Map();
    for (const link of links) {
      const key = link.combo + SEP + link.status;
      let row = rows.get(key);
      if (!row) {
        row = { combo: link.combo, status: link.status, observed: link.sources.some((s2) => OBSERVED[s2]), count: 0 };
        rows.set(key, row);
      }
      row.count += 1;
    }
    return Array.from(rows.values()).sort((x, y) => y.count - x.count || (x.combo < y.combo ? -1 : 1));
  }
  function countBy(items, keyOf) {
    const counts = /* @__PURE__ */ new Map();
    for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
    return counts;
  }
  function applyIntent(model2, intent2) {
    model2.intent = intent2;
    model2.pinByHost = new Map((intent2 ? intent2.pins : []).map((pin) => [pin.hostname, pin]));
    model2.orphanPins = (intent2 ? intent2.pins : []).filter((pin) => {
      const node = model2.nodeByHost.get(pin.hostname);
      return !node || !!node.ghost;
    });
  }
  function applyPlacement(model2, placement2) {
    model2.placement = placement2;
    model2.placeByHost = new Map((placement2 ? placement2.places : []).map((place) => [place.hostname, place]));
  }
  function build(data2) {
    const snapshot = data2.snapshot;
    const diff = data2.diff || null;
    const model2 = {
      source: snapshot.source,
      report: snapshot.report,
      coverage: snapshot.coverage,
      ingest: data2.ingest || null,
      origin: data2.origin,
      catalogue: data2.catalogue || {},
      snapshotVersion: snapshot.snapshot_version,
      diff,
      nodes: snapshot.nodes,
      ghostNodes: [],
      nodeByHost: /* @__PURE__ */ new Map(),
      interfaces: snapshot.interfaces,
      ifaceByKey: /* @__PURE__ */ new Map(),
      ifacesByNode: /* @__PURE__ */ new Map(),
      ghostIfaceByKey: /* @__PURE__ */ new Map(),
      ghostIfacesByNode: /* @__PURE__ */ new Map(),
      links: [],
      ghostLinks: [],
      linkById: /* @__PURE__ */ new Map(),
      linksByNode: /* @__PURE__ */ new Map(),
      linksByIface: /* @__PURE__ */ new Map(),
      checks: [],
      checksByNode: /* @__PURE__ */ new Map(),
      checksByAggregate: /* @__PURE__ */ new Map(),
      checksByCluster: /* @__PURE__ */ new Map(),
      aggregates: [],
      aggregateByKey: /* @__PURE__ */ new Map(),
      aggregatesByNode: /* @__PURE__ */ new Map(),
      mlagDomains: [],
      beams: [],
      beamById: /* @__PURE__ */ new Map(),
      beamsByNode: /* @__PURE__ */ new Map(),
      clusters: [],
      clusterById: /* @__PURE__ */ new Map(),
      clustersByHost: /* @__PURE__ */ new Map(),
      haMembershipsByHost: /* @__PURE__ */ new Map(),
      combos: [],
      severityCounts: /* @__PURE__ */ new Map(),
      statusCounts: /* @__PURE__ */ new Map(),
      kindCounts: /* @__PURE__ */ new Map(),
      diffOf: emptyDiffIndex(),
      changeOf: () => null,
      diffCount: 0,
      intent: null,
      pinByHost: /* @__PURE__ */ new Map(),
      orphanPins: [],
      placement: null,
      placeByHost: /* @__PURE__ */ new Map()
    };
    snapshot.nodes.forEach((node) => model2.nodeByHost.set(node.hostname, node));
    snapshot.interfaces.forEach((itf) => {
      model2.ifaceByKey.set(ifaceKey(itf.hostname, itf.name), itf);
      pushTo(model2.ifacesByNode, itf.hostname, itf);
    });
    if (diff) addGhosts(model2, diff);
    buildLinks(model2, snapshot.links, diff ? diff.links.removed : []);
    buildAggregates(model2, snapshot);
    buildBeams(model2);
    buildClusters(model2, snapshot);
    attachChecks(model2, snapshot.checks);
    distributeChecks(model2);
    model2.combos = sourceCombos(model2.links);
    model2.severityCounts = countBy(model2.checks, (c) => c.severity);
    model2.statusCounts = countBy(model2.links, (l) => l.status);
    model2.kindCounts = countBy(model2.nodes, (n) => n.kind);
    model2.diffOf = indexDiff(diff);
    model2.changeOf = (kind, id) => model2.diffOf[kind].get(id) || null;
    model2.diffCount = diffCount(diff);
    applyIntent(model2, data2.intent || null);
    applyPlacement(model2, data2.placement || null);
    return model2;
  }
  var linkToken = (link) => JSON.stringify([link.a.hostname, link.a.interface, link.b.hostname, link.b.interface]);
  function parseToken(token, length) {
    try {
      const parts = JSON.parse(token);
      return Array.isArray(parts) && (length === null || parts.length === length) && parts.every((p) => typeof p === "string") ? parts : null;
    } catch (error) {
      return null;
    }
  }
  function linkFromToken(model2, token) {
    const parts = parseToken(token, 4);
    return parts ? model2.linkById.get(parts.join(SEP)) || null : null;
  }
  function entityOf(model2, selection) {
    if (!selection) return null;
    const maps = { node: model2.nodeByHost, link: model2.linkById, aggregate: model2.aggregateByKey, beam: model2.beamById, cluster: model2.clusterById };
    return maps[selection.kind] ? maps[selection.kind].get(selection.id) || null : null;
  }
  var nodeOf = (model2, selection) => selection && selection.kind === "node" ? entityOf(model2, selection) : null;
  var linkOf = (model2, selection) => selection && selection.kind === "link" ? entityOf(model2, selection) : null;
  var aggregateOf = (model2, selection) => selection && selection.kind === "aggregate" ? entityOf(model2, selection) : null;
  var beamOf = (model2, selection) => selection && selection.kind === "beam" ? entityOf(model2, selection) : null;
  var clusterOf = (model2, selection) => selection && selection.kind === "cluster" ? entityOf(model2, selection) : null;
  function hostsOf(model2, selection) {
    if (!selection || !entityOf(model2, selection)) return [];
    switch (selection.kind) {
      case "node":
        return [nodeOf(model2, selection).hostname];
      case "link": {
        const link = linkOf(model2, selection);
        return [link.a.hostname, link.b.hostname];
      }
      case "aggregate":
        return [aggregateOf(model2, selection).hostname];
      case "beam": {
        const beam = beamOf(model2, selection);
        return [beam.a.hostname, beam.b.hostname];
      }
      default:
        return clusterOf(model2, selection).hosts;
    }
  }
  function tokenOf(model2, selection) {
    if (!selection || !entityOf(model2, selection)) return null;
    switch (selection.kind) {
      case "node":
        return ["node", nodeOf(model2, selection).hostname];
      case "link":
        return ["link", linkToken(linkOf(model2, selection))];
      case "aggregate": {
        const agg = aggregateOf(model2, selection);
        return ["aggregate", JSON.stringify([agg.hostname, agg.name])];
      }
      case "beam": {
        const beam = beamOf(model2, selection);
        return ["beam", JSON.stringify([beam.a.hostname, beam.a.aggregate, beam.b.hostname, beam.b.aggregate])];
      }
      default:
        return ["cluster", JSON.stringify(clusterOf(model2, selection).hosts)];
    }
  }
  function selectionFromToken(model2, kind, token) {
    if (kind === "node") return model2.nodeByHost.has(token) ? { kind, id: token } : null;
    const lengths = { link: 4, aggregate: 2, beam: 4, cluster: null };
    if (!(kind in lengths)) return null;
    const parts = parseToken(token, lengths[kind]);
    if (!parts) return null;
    const swapped = kind === "link" || kind === "beam" ? [parts[2], parts[3], parts[0], parts[1]] : null;
    const candidates = kind === "cluster" ? [parts.slice().sort()] : swapped ? [parts, swapped] : [parts];
    for (const order of candidates) {
      const id = kind === "beam" ? aggregateKey(order[0], order[1]) + SEP + aggregateKey(order[2], order[3]) : order.join(SEP);
      const selection = { kind, id };
      if (entityOf(model2, selection)) return selection;
    }
    return null;
  }
  var model = {
    build,
    applyIntent,
    applyPlacement,
    ifaceKey,
    interfaceAt,
    linkId,
    endLabel,
    worst,
    linkToken,
    linkFromToken,
    aggregateKey,
    clusterId,
    entityOf,
    hostsOf,
    tokenOf,
    selectionFromToken,
    SEVERITY_RANK,
    OBSERVED,
    haRoleGroup,
    DIFF_SECTIONS,
    SELECTION_KINDS
  };

  // src/canvas/format.ts
  var SOURCE_LABEL = { lldp: "LLDP", cdp: "CDP", description: "Description" };
  var STATUS_LABEL = { confirmed: "confirmé", observed_only: "observé seul", documented_only: "documenté seul" };
  var KIND_LABEL = { device: "équipement collecté", external: "équipement d'une autre infra", stub: "voisin inconnu" };
  var RESOLUTION_LABEL = {
    hostname: "nom exact",
    hostname_casefold: "nom, à la casse près",
    reported_hostname: "nom annoncé par l'équipement",
    address: "adresse (IP ou MAC)",
    stub: "non résolu : voisin inconnu"
  };
  var DIFF_LABEL = { added: "ajouté", removed: "retiré", changed: "changé" };
  var EVENT_LABEL = { rebooted: "redémarré", flapped: "flap" };
  var isEnd = (value) => "hostname" in value && "interface" in value;
  function plain(value) {
    if (value === null || value === void 0) return "—";
    if (Array.isArray(value)) return value.length ? value.map(plain).join(", ") : "—";
    if (typeof value === "object") {
      if (isEnd(value)) return endWithFacts(value);
      return Object.entries(value).map(([k, v]) => k + " : " + plain(v)).join(" ; ");
    }
    return String(value);
  }
  var FACT_ORDER = ["oper_status", "oper_reason", "speed_mbps", "switchport_mode", "vlan"];
  var factRank = (key) => FACT_ORDER.includes(key) ? FACT_ORDER.indexOf(key) : FACT_ORDER.length;
  function endWithFacts(value) {
    const facts = Object.entries(value).filter(([k, v]) => k !== "hostname" && k !== "interface" && v !== null && v !== void 0).sort((x, y) => factRank(x[0]) - factRank(y[0]) || (x[0] < y[0] ? -1 : 1));
    const label2 = endLabel(value);
    return facts.length ? label2 + " (" + facts.map(([k, v]) => k + " " + plain(v)).join(", ") + ")" : label2;
  }
  function brief(value) {
    if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) return value.length + " élément" + (value.length > 1 ? "s" : "");
    return plain(value);
  }
  function elapsedText(seconds) {
    if (seconds === 0) return "même début de collecte";
    const abs = Math.abs(seconds);
    const amount = abs >= 86400 ? Math.round(abs / 8640) / 10 + " j" : abs >= 3600 ? Math.round(abs / 360) / 10 + " h" : Math.round(abs / 60) + " min";
    return amount + (seconds < 0 ? " plus tôt" : " plus tard");
  }
  function speedText(mbps) {
    if (mbps === null || mbps === void 0) return null;
    return mbps >= 1e3 ? String(mbps / 1e3).replace(".", ",") + " Gb/s" : mbps + " Mb/s";
  }
  var format = { plain, brief, speedText, elapsedText, SOURCE_LABEL, STATUS_LABEL, KIND_LABEL, RESOLUTION_LABEL, DIFF_LABEL, EVENT_LABEL };

  // src/canvas/layout.ts
  var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  var IDEAL = 170;
  var MIN_DISTANCE = 1e-4;
  var REACH = IDEAL * 3;
  var SHELF_GAP = 110;
  var HEAT = 1.5;
  var EXTEND_HEAT = 0.5;
  var NEAR_STEP = 0.3;
  function iterationsFor(count) {
    if (count <= 600) return 300;
    return count <= 1500 ? 150 : 80;
  }
  function spiral(index) {
    const radius = IDEAL * 0.6 * Math.sqrt(index + 0.5);
    return { x: radius * Math.cos(index * GOLDEN_ANGLE), y: radius * Math.sin(index * GOLDEN_ANGLE) };
  }
  function seed(ids) {
    return new Map(ids.map((id, index) => [id, spiral(index)]));
  }
  function uniqueEdges(edges, known2) {
    const weights = /* @__PURE__ */ new Map();
    for (const [from, to, boost] of edges) {
      if (from === to || !known2.has(from) || !known2.has(to)) continue;
      const key = from < to ? from + "\0" + to : to + "\0" + from;
      const found = weights.get(key) || { count: 0, boost: 1 };
      weights.set(key, { count: found.count + 1, boost: Math.max(found.boost, boost || 1) });
    }
    return Array.from(weights).sort(([x], [y]) => x < y ? -1 : 1).map(([key, { count, boost }]) => {
      const [from, to] = key.split("\0");
      return { from, to, weight: (1 + 0.35 * Math.log(count)) * boost };
    });
  }
  function wired(ids, edges) {
    const known2 = new Set(ids);
    return new Set(uniqueEdges(edges, known2).flatMap((edge) => [edge.from, edge.to]));
  }
  function seedNear(sorted, links, fixed, points) {
    const neighbours = /* @__PURE__ */ new Map();
    const push = (a, b) => {
      const list = neighbours.get(a);
      if (list) list.push(b);
      else neighbours.set(a, [b]);
    };
    links.forEach(({ from, to }) => {
      push(from, to);
      push(to, from);
    });
    const placed2 = new Set(sorted.filter((id) => fixed.has(id)));
    let rank = 0;
    for (let grew = true; grew; ) {
      grew = false;
      for (const id of sorted) {
        if (placed2.has(id)) continue;
        const near = (neighbours.get(id) || []).filter((other) => placed2.has(other)).map((other) => points.get(other));
        if (!near.length) continue;
        const step2 = spiral(rank++);
        points.set(id, { x: near.reduce((sum, p) => sum + p.x, 0) / near.length + step2.x * NEAR_STEP, y: near.reduce((sum, p) => sum + p.y, 0) / near.length + step2.y * NEAR_STEP });
        placed2.add(id);
        grew = true;
      }
    }
  }
  function step(sim, temperature) {
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
        const force = IDEAL * IDEAL / squared;
        mx[i] += dx * force;
        my[i] += dy * force;
        mx[j] -= dx * force;
        my[j] -= dy * force;
      }
      mx[i] -= x[i] * 0.04;
      my[i] -= y[i] * 0.04;
    }
    for (let e = 0; e < from.length; e += 1) {
      const dx = x[from[e]] - x[to[e]];
      const dy = y[from[e]] - y[to[e]];
      const force = Math.max(Math.hypot(dx, dy), MIN_DISTANCE) / IDEAL * weight[e];
      mx[from[e]] -= dx * force;
      my[from[e]] -= dy * force;
      mx[to[e]] += dx * force;
      my[to[e]] += dy * force;
    }
    for (let i = 0; i < count; i += 1) {
      if (!free[i]) continue;
      const length = Math.max(Math.hypot(mx[i], my[i]), MIN_DISTANCE);
      const capped = Math.min(length, temperature);
      x[i] += mx[i] / length * capped;
      y[i] += my[i] / length * capped;
    }
  }
  function simulation(sorted, points, links, fixed) {
    const rank = new Map(sorted.map((id, index) => [id, index]));
    const at = (id) => points.get(id);
    return {
      count: sorted.length,
      x: Float64Array.from(sorted, (id) => at(id).x),
      y: Float64Array.from(sorted, (id) => at(id).y),
      mx: new Float64Array(sorted.length),
      my: new Float64Array(sorted.length),
      from: Int32Array.from(links, (edge) => rank.get(edge.from)),
      to: Int32Array.from(links, (edge) => rank.get(edge.to)),
      weight: Float64Array.from(links, (edge) => edge.weight),
      free: sorted.map((id) => !fixed.has(id))
    };
  }
  function shelve(points, lonely, fixed) {
    const box = bounds(points);
    const perRow = Math.max(1, Math.floor(Math.max(box.width, SHELF_GAP * 4) / SHELF_GAP));
    lonely.forEach((id, index) => {
      const spot = { x: box.x + index % perRow * SHELF_GAP, y: box.y + box.height + 140 + Math.floor(index / perRow) * 80 };
      const pin = fixed.get(id);
      points.set(id, pin ? { x: pin.x, y: pin.y } : spot);
    });
  }
  function run(ids, edges, fixed, options = {}) {
    const all = Array.from(ids).sort();
    const held = fixed || /* @__PURE__ */ new Map();
    const links = uniqueEdges(edges, new Set(all));
    const connected = new Set(links.flatMap((edge) => [edge.from, edge.to]));
    const sorted = all.filter((id) => connected.has(id));
    const points = seed(sorted);
    held.forEach((point, id) => {
      if (points.has(id)) points.set(id, { x: point.x, y: point.y });
    });
    if (options.extend) seedNear(sorted, links, held, points);
    const sim = simulation(sorted, points, links, held);
    const iterations = iterationsFor(sorted.length);
    const heat = IDEAL * (options.extend ? EXTEND_HEAT : HEAT);
    for (let i = 0; i < iterations; i += 1) step(sim, heat * (1 - i / iterations) + 1);
    sorted.forEach((id, index) => points.set(id, held.has(id) ? points.get(id) : { x: Math.round(sim.x[index]), y: Math.round(sim.y[index]) }));
    shelve(points, all.filter((id) => !connected.has(id)), held);
    return points;
  }
  function bounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    if (minX === Infinity) return { x: 0, y: 0, width: 1, height: 1 };
    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }
  var layout = { run, wired, bounds, IDEAL };

  // src/canvas/geometry.ts
  var FAN = 14;
  var FAN_MAX = 110;
  var HULL_PAD = 40;
  var BAND = 18;
  var HIT_MARGIN = 8;
  var CHAR_W = 6.6;
  function fanOffset(link) {
    const spacing = Math.min(FAN, FAN_MAX / link.pairCount);
    return (link.indexInPair - (link.pairCount - 1) / 2) * spacing;
  }
  function curve(p, q, link) {
    if (link.a.hostname === link.b.hostname) {
      const reach = 46 + link.indexInPair * 12;
      return {
        path: `M${p.x - 8},${p.y - 12} C${p.x - reach},${p.y - reach - 30} ${p.x + reach},${p.y - reach - 30} ${p.x + 8},${p.y - 12}`,
        mid: { x: p.x, y: p.y - reach * 0.75 - 22 },
        ends: [{ x: p.x - 26, y: p.y - 30 }, { x: p.x + 26, y: p.y - 30 }]
      };
    }
    return chord(p, q, fanOffset(link));
  }
  function chord(p, q, offset) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const length = Math.max(Math.hypot(dx, dy), 0.01);
    const nx = -dy / length, ny = dx / length;
    const c = { x: (p.x + q.x) / 2 + nx * offset * 2, y: (p.y + q.y) / 2 + ny * offset * 2 };
    const at = (t) => ({ x: (1 - t) * (1 - t) * p.x + 2 * (1 - t) * t * c.x + t * t * q.x, y: (1 - t) * (1 - t) * p.y + 2 * (1 - t) * t * c.y + t * t * q.y });
    const inset = Math.min(0.4, 78 / length);
    const side = nx * offset;
    const anchor = side > 0.5 ? "start" : side < -0.5 ? "end" : "middle";
    return { path: `M${p.x},${p.y} Q${c.x},${c.y} ${q.x},${q.y}`, mid: at(0.5), ends: [at(inset), at(1 - inset)], anchor };
  }
  function hull(points, longest) {
    const box = bounds(new Map(points.map((p, i) => [i, p])));
    const padX = Math.max(HULL_PAD, CHAR_W * (longest || 0) / 2 + 12);
    return { x: box.x - padX, y: box.y - HULL_PAD - 6, width: box.width + 2 * padX, height: box.height + 2 * HULL_PAD + 6 };
  }
  function beamBand(beam) {
    const offsets = beam.links.length ? beam.links.map(fanOffset) : [0];
    const lo = Math.min(...offsets), hi = Math.max(...offsets);
    const band = BAND + (hi - lo);
    return { band, hit: band + 2 * HIT_MARGIN, offset: (lo + hi) / 2 };
  }
  function beamLabel(beam, full) {
    const parts = full === false ? [] : [beam.a.aggregate + " ⇄ " + beam.b.aggregate];
    if (beam.peerLink) parts.push("peer-link");
    beam.mlags.forEach((domain) => parts.push("MLAG " + domain.raw.mlag_id));
    return parts.join(" · ");
  }
  function clusterLabel(cluster) {
    return "HA · " + (cluster.raw.cluster_name || cluster.hosts.join(" + ")) + " · " + cluster.raw.mode;
  }
  var geometry = { curve, chord, fanOffset, hull, beamBand, beamLabel, clusterLabel, CHAR_W };

  // src/canvas/icons.ts
  var PATHS = {
    switch: "M1.5 4.5h13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z M4 7h7 M9 5.5L11 7l-2 1.5 M12 9H5 M7 7.5L5 9l2 1.5",
    router: "M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14z M4 6h5 M7.5 4.5L9 6l-1.5 1.5 M12 10H7 M8.5 8.5L7 10l1.5 1.5",
    firewall: "M1 3.5h14v9H1z M1 6.5h14 M1 9.5h14 M5 3.5v3 M10 3.5v3 M3 6.5v3 M8 6.5v3 M13 6.5v3 M5 9.5v3 M10 9.5v3",
    load_balancer: "M8 1.5v4 M8 5.5L3 10.5 M8 5.5v5 M8 5.5l5 5 M1.5 10.5h3v3h-3z M6.5 10.5h3v3h-3z M11.5 10.5h3v3h-3z",
    wireless_controller: "M1.5 9.5h13v4h-13z M8 9.5V6 M5 5a4.2 4.2 0 0 1 6 0 M3 3a7 7 0 0 1 10 0",
    server: "M3.5 1.5h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M2.5 5.5h11 M2.5 9.5h11 M5.5 3.5h.01 M5.5 7.5h.01 M5.5 11.5h.01",
    other: "M2.5 2.5h11v11h-11z M6 6.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.2 M8 11h.01"
  };
  var LABEL = {
    switch: "switch",
    router: "routeur",
    firewall: "firewall",
    load_balancer: "répartiteur",
    wireless_controller: "contrôleur Wi-Fi",
    server: "serveur",
    other: "autre"
  };
  var SIZE = 16;
  var TYPES = Object.keys(PATHS);
  var path = (type) => type !== null && type !== void 0 && PATHS[type] || PATHS.other;
  var known = (type) => Object.prototype.hasOwnProperty.call(PATHS, type);
  var icons = { path, known, LABEL, SIZE, TYPES };

  // src/canvas/tip.ts
  var CHAR_W2 = 7.4;
  var LINE_H = 16;
  var PAD_X = 10;
  var PAD_Y = 7;
  var GAP = 2 * CHAR_W2;
  var OFFSET = 14;
  var DASH = "—";
  var SOURCE_ORDER = ["lldp", "cdp", "description"];
  var MAX_CHECK_LINES = 6;
  var cell = (text, cls) => ({ text: String(text), cls: cls || null });
  var line = (...cells) => cells;
  var plural = (count, word) => count + " " + word + (count > 1 ? "s" : "");
  function endFacts(model2, end, removed) {
    const found = interfaceAt(model2, end.hostname, end.interface, removed);
    if (!found) return { present: false, ghost: false, speed: null, duplex: null, media: null, state: null };
    const itf = found.itf;
    return {
      present: true,
      ghost: found.ghost,
      speed: speedText(itf.speed_mbps),
      duplex: itf.duplex,
      media: itf.media,
      state: itf.oper_status + (itf.oper_reason ? " · " + itf.oper_reason : "")
    };
  }
  function checkLines(checks) {
    const counts = /* @__PURE__ */ new Map();
    checks.forEach((c) => {
      const key = c.severity + " · " + c.code;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const rank = (key) => SEVERITY_RANK[key.split(" · ")[0]];
    const rows = Array.from(counts.keys()).sort((x, y) => rank(x) - rank(y) || (x < y ? -1 : x > y ? 1 : 0));
    const lines = rows.slice(0, MAX_CHECK_LINES).map((key) => line(cell(key + (counts.get(key) > 1 ? " ×" + counts.get(key) : ""), "severity-" + key.split(" · ")[0])));
    const rest = rows.slice(MAX_CHECK_LINES).reduce((sum, key) => sum + counts.get(key), 0);
    if (rest) lines.push(line(cell("… et " + rest + " autre" + (rest > 1 ? "s" : "") + " contrôle" + (rest > 1 ? "s" : ""), "tip-muted")));
    return lines;
  }
  var DIFF_WORD = { added: "ajouté dans cette run", removed: "retiré depuis la run d'avant", changed: "changé" };
  function diffLine(change) {
    if (!change) return null;
    const fields = change.fields || [];
    const paths = change.kind === "changed" ? " : " + fields.slice(0, 4).map((f) => f.path).join(", ") + (fields.length > 4 ? "…" : "") : "";
    return line(cell(DIFF_WORD[change.kind] + paths, "tip-diff-" + change.kind));
  }
  function sourcesText(sources) {
    const ordered = SOURCE_ORDER.filter((src) => sources.includes(src)).concat(sources.filter((src) => !SOURCE_ORDER.includes(src)));
    return ordered.map((src) => SOURCE_LABEL[src] || src).join(" + ");
  }
  var present = (candidate) => candidate !== null;
  function linkLines(model2, link) {
    const ends = [link.a, link.b];
    const facts = ends.map((end) => endFacts(model2, end, link.ghost));
    const row = (label2, key) => facts.some((f) => f[key] !== null) ? line(cell(label2, "tip-muted"), ...facts.map((f) => cell(f[key] === null ? DASH : f[key]))) : null;
    const traits = [row("vitesse", "speed"), row("duplex", "duplex"), row("média", "media")].filter(present);
    return [
      line(cell(endLabel(link.a) + " ↔ " + endLabel(link.b), "tip-title")),
      line(cell(STATUS_LABEL[link.status] + " · " + sourcesText(link.sources) + " · " + link.raw.oper, "tip-muted")),
      diffLine(link.ghost ? { kind: "removed" } : model2.changeOf("link", link.id)),
      ...ends.filter((end, index) => !facts[index].present).map((end) => line(cell(endLabel(end) + " : absent de interfaces[]", "tip-muted"))),
      ...ends.filter((end, index) => facts[index].ghost).map((end) => line(cell(endLabel(end) + " : interface retirée, valeurs de la run d'avant", "tip-muted"))),
      line(cell(""), cell(link.a.interface, "tip-muted"), cell(link.b.interface, "tip-muted")),
      ...traits.length ? traits : [line(cell("vitesse, duplex, média : aucune valeur", "tip-muted"))],
      row("état", "state"),
      ...checkLines(link.checks)
    ].filter(present);
  }
  var memberText = (member) => member.role + " · " + member.state + (member.priority !== null && member.priority !== void 0 ? " · priorité " + member.priority : "");
  function nodeLines(model2, node) {
    const memberships = model2.haMembershipsByHost.get(node.hostname) || [];
    const links = (model2.linksByNode.get(node.hostname) || []).filter((l) => !l.ghost);
    const ghosts = (model2.linksByNode.get(node.hostname) || []).length - links.length;
    const hardware = [node.vendor, node.model].filter(Boolean).join(" · ");
    const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
    const facts = [
      node.collection ? "collecte : " + node.collection : null,
      plural(links.length, "câble") + (ghosts ? " · " + plural(ghosts, "câble retiré") : ""),
      node.stack ? "stack ×" + node.stack.member_count : null,
      node.evidence && node.evidence.capabilities.length ? "capacités : " + node.evidence.capabilities.join(", ") : null
    ].filter(Boolean);
    return [
      line(cell(node.hostname + " · " + KIND_LABEL[node.kind] + (node.type ? " · " + node.type : ""), "tip-title")),
      diffLine(node.ghost ? { kind: "removed" } : model2.changeOf("node", node.hostname)),
      hardware || system ? line(cell([hardware, system].filter(Boolean).join(" · "), "tip-muted")) : null,
      line(cell(facts.join(" · "), "tip-muted")),
      ...memberships.map((ha) => line(cell(clusterLabel(ha.cluster) + " · " + memberText(ha.member)))),
      // tous ses clusters (revue, B4)
      ...checkLines(model2.checksByNode.get(node.hostname) || [])
    ].filter(present);
  }
  function beamLines(beam) {
    const nature = beamLabel(beam, false);
    const protocols = Array.from(new Set(beam.known.map((agg) => agg.raw.protocol + (agg.raw.lacp_mode ? " " + agg.raw.lacp_mode : ""))));
    return [
      line(cell("faisceau " + endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate }) + " ⇄ " + endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate }) + (nature ? " · " + nature : ""), "tip-title")),
      line(cell(plural(beam.links.length, "câble") + (protocols.length ? " · " + protocols.join(" / ") : "") + (beam.degraded ? " · un agrégat dégradé" : ""), "tip-muted")),
      ...checkLines(beam.checks)
    ];
  }
  function clusterLines(cluster) {
    return [
      line(cell(clusterLabel(cluster), "tip-title")),
      ...cluster.raw.members.map((m) => line(cell(m.hostname), cell(memberText(m), "tip-muted"))),
      ...checkLines(cluster.checks)
    ];
  }
  function create(svg) {
    const box = s("rect", { class: "tip-box", rx: 5 });
    const group = s("g", { class: "tip", visibility: "hidden", role: "tooltip", id: "ld-tip" }, box);
    svg.appendChild(group);
    let shownFor = null, size = { width: 0, height: 0 };
    function fill2(lines) {
      clear(group).appendChild(box);
      const widths = [0];
      lines.filter((cells) => cells.length > 1).forEach((cells) => cells.forEach((c, col) => {
        widths[col] = Math.max(widths[col] || 0, c.text.length);
      }));
      const offsets = widths.map((_, col) => widths.slice(0, col).reduce((sum, w) => sum + w * CHAR_W2 + GAP, 0));
      lines.forEach((cells, row) => cells.forEach((c, col) => {
        if (c.text === "") return;
        group.appendChild(s("text", { class: "tip-line" + (c.cls ? " " + c.cls : ""), x: PAD_X + offsets[col], y: PAD_Y + LINE_H * (row + 1) - 4 }, c.text));
      }));
      const last = widths.length - 1;
      const spanning = Math.max(0, ...lines.filter((cells) => cells.length === 1).map((cells) => cells[0].text.length));
      size = { width: 2 * PAD_X + Math.max(offsets[last] + widths[last] * CHAR_W2, spanning * CHAR_W2), height: 2 * PAD_Y + LINE_H * lines.length };
      box.setAttribute("width", String(size.width));
      box.setAttribute("height", String(size.height));
    }
    function place(x, y, rect) {
      const wanted = {
        x: x + OFFSET + size.width > rect.width ? x - OFFSET - size.width : x + OFFSET,
        y: y + OFFSET + size.height > rect.height ? y - OFFSET - size.height : y + OFFSET
      };
      const left = Math.max(0, Math.min(wanted.x, rect.width - size.width));
      const top = Math.max(0, Math.min(wanted.y, rect.height - size.height));
      group.setAttribute("transform", `translate(${Math.round(left)},${Math.round(top)})`);
    }
    function show2(key, linesOf, x, y, rect) {
      if (key !== shownFor) {
        shownFor = key;
        fill2(linesOf());
      }
      place(x, y, rect);
      group.setAttribute("visibility", "visible");
    }
    function hide() {
      shownFor = null;
      group.setAttribute("visibility", "hidden");
    }
    return { group, id: "ld-tip", show: show2, hide };
  }
  var tip = { create, linkLines, nodeLines, beamLines, clusterLines };

  // src/canvas/graph.ts
  var NODE_W = 48;
  var NODE_H = 40;
  var STUB_R = 8;
  var CLICK_SLOP = 4;
  var ICON_SCALE = 1.3;
  var LABEL_MAX = 22;
  var ICON_PX = SIZE * ICON_SCALE;
  var ZOOM_FAR = 0.7;
  var ZOOM_NEAR = 1.2;
  var PIN_PATH = "M8 1.5a4 4 0 0 1 4 4c0 2.8-4 7.5-4 7.5S4 8.3 4 5.5a4 4 0 0 1 4-4z M8 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z";
  var shortName = (name) => name.length <= LABEL_MAX ? name : name.slice(0, 11) + "…" + name.slice(-10);
  function nodeShape(node) {
    if (node.kind === "stub") return s("circle", { class: "node-shape", r: STUB_R });
    return s("rect", { class: "node-shape", x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 9 });
  }
  function create2(svg, model2, onSelect, options = {}) {
    const savedPins = () => new Map(Array.from(model2.pinByHost).filter(([host]) => {
      const node = model2.nodeByHost.get(host);
      return !!node && !node.ghost;
    }).map(([host, pin]) => [host, { x: pin.x, y: pin.y }]));
    const savedPlaces = () => new Map(Array.from(model2.placeByHost, ([host, place2]) => [host, { x: place2.x, y: place2.y }]));
    const state = {
      showStubs: false,
      showPorts: false,
      showDiff: true,
      hiddenStatuses: /* @__PURE__ */ new Set(),
      query: "",
      pinned: savedPins(),
      placed: savedPlaces(),
      positions: /* @__PURE__ */ new Map(),
      view: { k: 1, tx: 0, ty: 0 },
      selection: null,
      nodeEls: /* @__PURE__ */ new Map(),
      linkEls: /* @__PURE__ */ new Map(),
      beamEls: /* @__PURE__ */ new Map(),
      clusterEls: /* @__PURE__ */ new Map()
    };
    const viewport = s("g", { class: "viewport" });
    const clusterLayer = s("g", { class: "clusters" });
    const beamLayer = s("g", { class: "beams" });
    const linkLayer = s("g", { class: "links" });
    const labelLayer = s("g", { class: "beam-labels" });
    const nodeLayer = s("g", { class: "nodes" });
    [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach((layer) => viewport.appendChild(layer));
    clear(svg).appendChild(viewport);
    const tip2 = create(svg);
    const at = (hostname) => state.positions.get(hostname);
    const allNodes = () => model2.nodes.concat(state.showDiff ? model2.ghostNodes : []);
    const allLinks = () => model2.links.concat(state.showDiff ? model2.ghostLinks : []);
    const linkAt = (index) => index < model2.links.length ? model2.links[index] : model2.ghostLinks[index - model2.links.length];
    const changeOf2 = (kind, entity, id) => !state.showDiff ? null : entity.ghost ? "removed" : (model2.changeOf(kind, id) || { kind: null }).kind;
    const visibleNodes = () => allNodes().filter((n) => state.showStubs || n.kind !== "stub");
    function svgClasses() {
      const k = state.view.k;
      svg.setAttribute("class", [state.selection ? "has-selection" : "", state.showPorts ? "show-ports" : "", k < ZOOM_FAR ? "zoom-far" : k >= ZOOM_NEAR ? "zoom-near" : ""].filter(Boolean).join(" "));
    }
    const applyView = () => {
      viewport.setAttribute("transform", `translate(${state.view.tx},${state.view.ty}) scale(${state.view.k})`);
      svgClasses();
    };
    let dragging = false;
    let pan = null;
    function visibleLinks(shown) {
      return allLinks().filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !state.hiddenStatuses.has(l.status));
    }
    function visibleBeams(shown, links) {
      const visible = new Set(links.map((l) => l.id));
      return model2.beams.filter((b) => b.a.hostname !== b.b.hostname && shown.has(b.a.hostname) && shown.has(b.b.hostname) && b.links.some((l) => visible.has(l.id)));
    }
    const visibleClusters = (shown) => model2.clusters.filter((c) => c.hosts.filter((h2) => shown.has(h2)).length >= 2);
    function fit() {
      const box = bounds(state.positions);
      const rect = svg.getBoundingClientRect();
      const width = rect.width || 900, height = rect.height || 600, margin = 70;
      const k = Math.min((width - 2 * margin) / box.width, (height - 2 * margin) / box.height, 1.6);
      state.view = { k: Math.max(k, 0.05), tx: 0, ty: 0 };
      state.view.tx = width / 2 - (box.x + box.width / 2) * state.view.k;
      state.view.ty = height / 2 - (box.y + box.height / 2) * state.view.k;
      applyView();
    }
    function placeLink(link, els) {
      const shape = curve(at(link.a.hostname), at(link.b.hostname), link);
      [els.line, els.hit, els.halo, els.diff].forEach((el) => {
        if (el) el.setAttribute("d", shape.path);
      });
      if (els.mark) {
        els.mark.setAttribute("cx", String(shape.mid.x));
        els.mark.setAttribute("cy", String(shape.mid.y));
      }
      els.ports.forEach((text, i) => {
        text.setAttribute("x", String(shape.ends[i].x));
        text.setAttribute("y", String(shape.ends[i].y));
        text.setAttribute("text-anchor", shape.anchor || "middle");
      });
    }
    function drawLink(link) {
      const change = changeOf2("link", link, link.id);
      const diffHalo = change ? s("path", { class: "diff-halo" }) : null;
      const halo = link.heartbeat ? s("path", { class: "link-halo" }) : null;
      const line2 = s("path", { class: "link-line" });
      const hit = s("path", { class: "link-hit" });
      const mark = link.worst === "error" || link.worst === "warning" ? s("circle", { class: "link-mark severity-" + link.worst, r: 4.5 }) : null;
      const ports = [link.a.interface, link.b.interface].map((name) => s("text", { class: "port-label" }, name));
      const classes = `link status-${link.status}${link.raw.oper === "down" ? " oper-down" : ""}${link.pairCount > 2 ? " crowded" : ""}${link.heartbeat ? " heartbeat" : ""}${change ? " diff-" + change : ""}`;
      const group = s(
        "g",
        {
          class: classes,
          "data-link": String(link.index),
          tabindex: 0,
          role: "button",
          "aria-label": `${endLabel(link.a)} ↔ ${endLabel(link.b)} · ${STATUS_LABEL[link.status]} · ${link.combo}${change ? " · " + DIFF_LABEL[change] : ""}`
        },
        diffHalo,
        halo,
        line2,
        hit,
        mark,
        ports
      );
      const els = { group, line: line2, hit, halo, diff: diffHalo, mark, ports };
      state.linkEls.set(link.id, els);
      placeLink(link, els);
      bindFocus(group, { kind: "link", id: link.id }, () => toScreen(curve(at(link.a.hostname), at(link.b.hostname), link).mid));
      return group;
    }
    function placeBeam(beam, els) {
      const p = at(beam.a.hostname), q = at(beam.b.hostname);
      const axis = chord(p, q, els.shape.offset);
      els.band.setAttribute("d", axis.path);
      els.hit.setAttribute("d", axis.path);
      const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      const nx = -dy / length, ny = dx / length;
      const up = ny <= 0 ? 1 : -1;
      const side = els.shape.offset === 0 ? up : Math.sign(els.shape.offset);
      const away = els.shape.band / 2 + 8;
      const x = axis.mid.x + nx * side * away, y = axis.mid.y + ny * side * away;
      const text = els.label.textContent || "";
      const width = CHAR_W * 0.95 * text.length + 10;
      els.label.setAttribute("x", String(x));
      els.label.setAttribute("y", String(y));
      els.labelHit.setAttribute("x", String(x - width / 2));
      els.labelHit.setAttribute("y", String(y - 10));
      els.labelHit.setAttribute("width", String(width));
      els.labelHit.setAttribute("height", "14");
      els.tag.setAttribute("transform", `rotate(${angle.toFixed(2)} ${x} ${y})`);
      els.tag.setAttribute("visibility", text ? "visible" : "hidden");
    }
    function drawBeam(beam) {
      const shape = beamBand(beam);
      const band = s("path", { class: "beam-band", "stroke-width": shape.band });
      const hit = s("path", { class: "beam-hit", "stroke-width": shape.hit });
      const label2 = s("text", { class: "beam-label" }, beamLabel(beam, false));
      const labelHit = s("rect", { class: "beam-label-hit" });
      const tag = s("g", { class: "beam-tag", "data-beam": String(beam.index) }, labelHit, label2);
      const classes = `beam${beam.peerLink ? " peer-link" : ""}${beam.degraded ? " degraded" : ""}${beam.mlags.length ? " mlag" : ""}`;
      const group = s(
        "g",
        {
          class: classes,
          "data-beam": String(beam.index),
          tabindex: 0,
          role: "button",
          "aria-label": `faisceau ${endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate })} ⇄ ${endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate })} · ${beam.links.length} câble(s)`
        },
        band,
        hit
      );
      const els = { group, band, hit, label: label2, labelHit, tag, shape };
      state.beamEls.set(beam.id, els);
      labelLayer.appendChild(tag);
      placeBeam(beam, els);
      bindFocus(group, { kind: "beam", id: beam.id }, () => toScreen(midpoint(beam.a.hostname, beam.b.hostname)));
      return group;
    }
    function placeCluster(cluster, els) {
      const points = cluster.hosts.map((h2) => state.positions.get(h2)).filter((p) => !!p);
      const box = hull(points, Math.max(...cluster.hosts.map((h2) => h2.length)));
      ["x", "y", "width", "height"].forEach((name) => els.rect.setAttribute(name, String(box[name])));
      els.label.setAttribute("x", String(box.x + 10));
      els.label.setAttribute("y", String(box.y + 15));
    }
    function drawCluster(cluster) {
      const rect = s("rect", { class: "cluster-hull", rx: 12 });
      const label2 = s("text", { class: "cluster-label" }, clusterLabel(cluster));
      const group = s("g", { class: "cluster", "data-cluster": String(cluster.index), tabindex: 0, role: "button", "aria-label": clusterLabel(cluster) }, rect, label2);
      const els = { group, rect, label: label2 };
      state.clusterEls.set(cluster.id, els);
      placeCluster(cluster, els);
      bindFocus(group, { kind: "cluster", id: cluster.id }, () => toScreen({ x: Number(rect.getAttribute("x")) + 20, y: Number(rect.getAttribute("y")) + 20 }));
      return group;
    }
    function drawNode(node) {
      const checks = model2.checksByNode.get(node.hostname) || [];
      const severity = worst(checks);
      const memberships = model2.haMembershipsByHost.get(node.hostname) || [];
      const ha = memberships[0] || null;
      const haState = memberships.some((m) => m.member.state === "down") ? "down" : ha ? ha.member.state : null;
      const haClasses = ha ? ` ha-member ha-${haRoleGroup(ha.cluster.raw.mode, ha.member.role)} ha-state-${haState}` : "";
      const typeLabel = node.type ? LABEL[node.type] || node.type : null;
      const change = changeOf2("node", node, node.hostname);
      const ring = change && change !== "removed" ? node.kind === "stub" ? s("circle", { class: "node-ring", r: STUB_R + 4 }) : s("rect", { class: "node-ring", x: -NODE_W / 2 - 4, y: -NODE_H / 2 - 4, width: NODE_W + 8, height: NODE_H + 8, rx: 12 }) : null;
      const pinned = state.pinned.has(node.hostname) ? " pinned" : "";
      const group = s(
        "g",
        {
          class: `node kind-${node.kind} collection-${node.collection || "none"}${haClasses}${change ? " diff-" + change : ""}${pinned}`,
          tabindex: 0,
          role: "button",
          "data-node": node.hostname,
          "aria-label": `${node.hostname} · ${KIND_LABEL[node.kind]}${typeLabel ? " · " + typeLabel : ""}${node.collection ? " · collecte : " + node.collection : ""}${ha ? " · HA " + ha.member.role : ""}${change ? " · " + DIFF_LABEL[change] : ""}`
        },
        ring,
        nodeShape(node),
        node.kind === "stub" ? null : s("path", {
          class: "node-icon",
          d: path(node.type),
          transform: `translate(${-ICON_PX / 2},${ha ? -NODE_H / 2 + 3 : -ICON_PX / 2}) scale(${ICON_SCALE})`
        }),
        ha ? s("text", { class: "node-role", y: NODE_H / 2 - 5 }, ha.member.role) : null,
        s("text", { class: "node-label", y: node.kind === "stub" ? 22 : NODE_H / 2 + 14 }, shortName(node.hostname)),
        node.stack ? s("text", { class: "node-stack", x: NODE_W / 2 + 4, y: 4 }, "×" + node.stack.member_count) : null,
        severity === "error" || severity === "warning" ? s("circle", { class: "node-badge severity-" + severity, cx: NODE_W / 2 - 1, cy: -NODE_H / 2 + 1, r: 6 }) : null,
        s("path", { class: "node-pin", d: PIN_PATH, transform: node.kind === "stub" ? `translate(${-STUB_R - 14},${-STUB_R - 14})` : `translate(${-NODE_W / 2 - 9},${-NODE_H / 2 - 9})` })
      );
      state.nodeEls.set(node.hostname, group);
      moveNode(node.hostname);
      bindNode(group, node.hostname);
      return group;
    }
    function moveNode(hostname) {
      const p = at(hostname);
      state.nodeEls.get(hostname).setAttribute("transform", `translate(${p.x},${p.y})`);
    }
    function follow(hostname) {
      (model2.linksByNode.get(hostname) || []).forEach((link) => {
        const els = state.linkEls.get(link.id);
        if (els) placeLink(link, els);
      });
      (model2.beamsByNode.get(hostname) || []).forEach((beam) => {
        const els = state.beamEls.get(beam.id);
        if (els) placeBeam(beam, els);
      });
      model2.clusters.forEach((cluster) => {
        const els = state.clusterEls.get(cluster.id);
        if (els && cluster.hosts.includes(hostname)) placeCluster(cluster, els);
      });
    }
    function screenPoint(hostname) {
      const p = at(hostname);
      return { x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty };
    }
    const onScreen = (point, rect) => point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height;
    const toScreen = (p) => ({ x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty });
    const midpoint = (h1, h2) => {
      const p = at(h1), q = at(h2);
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    };
    function bindFocus(group, selection, pointOf) {
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter") select(selection);
      });
      group.addEventListener("focus", () => {
        if (dragging || pan) return;
        const rect = svg.getBoundingClientRect();
        if (!onScreen(pointOf(), rect)) centerOn(selection);
        const point = pointOf();
        tip2.show(selection.kind + ":" + selection.id, () => tipLines(selection), point.x, point.y, rect);
        group.setAttribute("aria-describedby", tip2.id);
      });
      group.addEventListener("blur", () => {
        tip2.hide();
        group.removeAttribute("aria-describedby");
      });
    }
    function bindNode(group, hostname) {
      let start = null;
      const end = () => {
        start = null;
        dragging = false;
      };
      group.addEventListener("pointerdown", (event) => {
        const pointer = event;
        if (pointer.button > 0) return;
        event.stopPropagation();
        dragging = true;
        tip2.hide();
        start = { x: pointer.clientX, y: pointer.clientY, origin: { ...at(hostname) }, moved: false };
        group.setPointerCapture(pointer.pointerId);
      });
      group.addEventListener("pointermove", (event) => {
        if (!start) return;
        const pointer = event;
        const dx = pointer.clientX - start.x, dy = pointer.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
        start.moved = true;
        const point = { x: start.origin.x + dx / state.view.k, y: start.origin.y + dy / state.view.k };
        state.positions.set(hostname, point);
        state.pinned.set(hostname, point);
        group.classList.toggle("pinned", true);
        moveNode(hostname);
        follow(hostname);
      });
      group.addEventListener("pointerup", () => {
        if (start && !start.moved) select({ kind: "node", id: hostname });
        else if (start && start.moved && options.onPin) options.onPin(hostname, { ...at(hostname) });
        end();
      });
      group.addEventListener("pointercancel", end);
      group.addEventListener("lostpointercapture", end);
      bindFocus(group, { kind: "node", id: hostname }, () => screenPoint(hostname));
    }
    function entityAt(target) {
      for (let el = target; el && el !== svg && el.getAttribute; el = el.parentNode) {
        const link = el.getAttribute("data-link"), beam = el.getAttribute("data-beam"), cluster = el.getAttribute("data-cluster"), node = el.getAttribute("data-node");
        if (link !== null) return { kind: "link", id: linkAt(Number(link)).id };
        if (beam !== null) return { kind: "beam", id: model2.beams[Number(beam)].id };
        if (cluster !== null) return { kind: "cluster", id: model2.clusters[Number(cluster)].id };
        if (node !== null) return { kind: "node", id: node };
      }
      return null;
    }
    function tipLines(selection) {
      if (selection.kind === "link") return linkLines(model2, linkOf(model2, selection));
      if (selection.kind === "node") return nodeLines(model2, nodeOf(model2, selection));
      if (selection.kind === "beam") return beamLines(beamOf(model2, selection));
      return clusterLines(clusterOf(model2, selection));
    }
    function bindCanvas() {
      svg.addEventListener("pointerdown", (event) => {
        const pointer = event;
        if (pointer.button > 0) return;
        tip2.hide();
        pan = { x: pointer.clientX, y: pointer.clientY, tx: state.view.tx, ty: state.view.ty, moved: false, target: event.target };
        svg.setPointerCapture(pointer.pointerId);
      });
      svg.addEventListener("pointermove", (event) => {
        if (!pan) return;
        const pointer = event;
        const dx = pointer.clientX - pan.x, dy = pointer.clientY - pan.y;
        if (!pan.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
        pan.moved = true;
        state.view.tx = pan.tx + dx;
        state.view.ty = pan.ty + dy;
        applyView();
      });
      svg.addEventListener("pointerup", () => {
        if (pan && !pan.moved) select(entityAt(pan.target));
        pan = null;
      });
      svg.addEventListener("pointercancel", () => {
        pan = null;
      });
      svg.addEventListener("lostpointercapture", () => {
        pan = null;
      });
      svg.addEventListener("pointermove", (event) => {
        if (pan || dragging) {
          tip2.hide();
          return;
        }
        const entity = entityAt(event.target);
        if (!entity) {
          tip2.hide();
          return;
        }
        const pointer = event;
        const rect = svg.getBoundingClientRect();
        tip2.show(entity.kind + ":" + entity.id, () => tipLines(entity), pointer.clientX - rect.left, pointer.clientY - rect.top, rect);
      });
      svg.addEventListener("pointerleave", () => tip2.hide());
      svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const wheel = event;
        const rect = svg.getBoundingClientRect();
        const x = wheel.clientX - rect.left, y = wheel.clientY - rect.top;
        const k = Math.min(Math.max(state.view.k * Math.exp(-wheel.deltaY * 15e-4), 0.05), 6);
        state.view.tx = x - (x - state.view.tx) / state.view.k * k;
        state.view.ty = y - (y - state.view.ty) / state.view.k * k;
        state.view.k = k;
        applyView();
      }, { passive: false });
    }
    function relatedTo(selection) {
      const related = { hosts: /* @__PURE__ */ new Set(), links: /* @__PURE__ */ new Set(), beams: /* @__PURE__ */ new Set(), clusters: /* @__PURE__ */ new Set() };
      if (!selection || !entityOf(model2, selection)) return related;
      const addLink = (link) => {
        related.links.add(link.id);
        related.hosts.add(link.a.hostname);
        related.hosts.add(link.b.hostname);
      };
      hostsOf(model2, selection).forEach((host) => related.hosts.add(host));
      if (selection.kind === "node") {
        const node = nodeOf(model2, selection);
        (model2.linksByNode.get(node.hostname) || []).forEach(addLink);
        (model2.beamsByNode.get(node.hostname) || []).forEach((beam) => related.beams.add(beam.id));
        (model2.clustersByHost.get(node.hostname) || []).forEach((cluster) => related.clusters.add(cluster.id));
      } else if (selection.kind === "link") {
        const link = linkOf(model2, selection);
        if (link.beam) related.beams.add(link.beam.id);
      } else if (selection.kind === "aggregate") {
        const aggregate = aggregateOf(model2, selection);
        if (aggregate) {
          aggregate.cables.forEach(addLink);
          aggregate.beams.forEach((beam) => related.beams.add(beam.id));
        }
      } else if (selection.kind === "beam") {
        beamOf(model2, selection).links.forEach(addLink);
      } else if (selection.kind === "cluster") {
        clusterOf(model2, selection).heartbeats.forEach((hb) => {
          if (hb.link) addLink(hb.link);
        });
      }
      return related;
    }
    function paintSelection() {
      const selection = state.selection;
      const related = relatedTo(selection);
      const is = (kind, id) => !!selection && selection.kind === kind && selection.id === id;
      svgClasses();
      const query2 = state.query.trim().toLowerCase();
      const selectedAggregate = selection && selection.kind === "aggregate" ? aggregateOf(model2, selection) : null;
      state.nodeEls.forEach((el, id) => {
        el.classList.toggle("selected", is("node", id) || !!selectedAggregate && selectedAggregate.hostname === id);
        el.classList.toggle("related", related.hosts.has(id));
        el.classList.toggle("match", query2 !== "" && id.toLowerCase().includes(query2));
      });
      state.linkEls.forEach((els, id) => {
        els.group.classList.toggle("selected", is("link", id));
        els.group.classList.toggle("related", related.links.has(id));
      });
      state.beamEls.forEach((els, id) => {
        els.group.classList.toggle("selected", is("beam", id));
        els.group.classList.toggle("related", related.beams.has(id));
        els.tag.classList.toggle("selected", is("beam", id));
        els.tag.classList.toggle("related", related.beams.has(id));
      });
      state.clusterEls.forEach((els, id) => {
        els.group.classList.toggle("selected", is("cluster", id));
        els.group.classList.toggle("related", related.clusters.has(id));
      });
    }
    function select(selection) {
      state.selection = selection;
      paintSelection();
      onSelect(selection);
    }
    function layoutEdges() {
      const edges = allLinks().map((l) => [l.a.hostname, l.b.hostname]);
      model2.clusters.forEach((c) => c.hosts.slice(1).forEach((host) => edges.push([c.hosts[0], host, 2.5])));
      return edges;
    }
    let unplaced = /* @__PURE__ */ new Set();
    function place(nodes) {
      const edges = layoutEdges();
      const infra = nodes.filter((n) => n.kind !== "stub").map((n) => n.hostname);
      const stubs = nodes.filter((n) => n.kind === "stub").map((n) => n.hostname);
      const of = (ids, source) => ids.filter((id) => source.has(id)).map((id) => [id, source.get(id)]);
      const remembered = of(infra, state.placed);
      const base = run(infra, edges, new Map([...remembered, ...of(infra, state.pinned)]), { extend: remembered.length > 0 });
      const fresh = /* @__PURE__ */ new Map();
      const held = wired(infra, edges);
      unplaced = new Set(infra.filter((id) => !held.has(id)));
      infra.forEach((id) => {
        const node = model2.nodeByHost.get(id);
        if (state.placed.has(id) || state.pinned.has(id) || !held.has(id) || !node || node.ghost) return;
        const point = { ...base.get(id) };
        state.placed.set(id, point);
        fresh.set(id, point);
      });
      if (!stubs.length) return { positions: base, fresh };
      const fixed = new Map([...base, ...of(stubs, state.placed), ...of(stubs, state.pinned)]);
      return { positions: run(nodes.map((n) => n.hostname), edges, fixed, { extend: true }), fresh };
    }
    function render2(keepView, replace = false) {
      const nodes = visibleNodes();
      const shown = new Set(nodes.map((n) => n.hostname));
      const links = visibleLinks(shown);
      const { positions, fresh } = place(nodes);
      state.positions = positions;
      tip2.hide();
      [state.nodeEls, state.linkEls, state.beamEls, state.clusterEls].forEach((map) => map.clear());
      [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach(clear);
      visibleClusters(shown).forEach((cluster) => clusterLayer.appendChild(drawCluster(cluster)));
      visibleBeams(shown, links).forEach((beam) => beamLayer.appendChild(drawBeam(beam)));
      links.forEach((link) => linkLayer.appendChild(drawLink(link)));
      nodes.forEach((node) => nodeLayer.appendChild(drawNode(node)));
      if (!keepView) fit();
      paintSelection();
      if ((fresh.size || replace) && options.onPlaced) options.onPlaced(fresh, replace);
      return { nodes: nodes.length, links: links.length };
    }
    function centerOn(selection) {
      const ends = hostsOf(model2, selection).map((host) => state.positions.get(host)).filter((p) => !!p);
      if (!ends.length) return;
      const rect = svg.getBoundingClientRect();
      const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
      state.view.k = Math.max(state.view.k, 0.8);
      state.view.tx = (rect.width || 900) / 2 - x * state.view.k;
      state.view.ty = (rect.height || 600) / 2 - y * state.view.k;
      applyView();
    }
    function reveal(selection) {
      if (!selection) {
        select(null);
        return false;
      }
      const entity = entityOf(model2, selection);
      const links = selection.kind === "link" ? [linkOf(model2, selection)].filter((l) => !!l) : selection.kind === "beam" ? (beamOf(model2, selection) || { links: [] }).links : selection.kind === "aggregate" ? (aggregateOf(model2, selection) || { cables: [] }).cables : [];
      const hosts = hostsOf(model2, selection).concat(links.flatMap((link) => [link.a.hostname, link.b.hostname]));
      const needsStubs = hosts.some((host) => (model2.nodeByHost.get(host) || { kind: null }).kind === "stub");
      let redraw = false;
      if (entity && entity.ghost && !state.showDiff) {
        state.showDiff = true;
        redraw = true;
      }
      if (needsStubs && !state.showStubs) {
        state.showStubs = true;
        redraw = true;
      }
      links.forEach((link) => {
        if (state.hiddenStatuses.has(link.status)) {
          state.hiddenStatuses.delete(link.status);
          redraw = true;
        }
      });
      if (redraw) render2(true);
      select(selection);
      centerOn(selection);
      return redraw;
    }
    function syncPins() {
      savedPins().forEach((point, host) => {
        state.pinned.set(host, point);
        const current = state.positions.get(host);
        if (state.nodeEls.has(host) && current && (current.x !== point.x || current.y !== point.y)) {
          state.positions.set(host, { ...point });
          moveNode(host);
          follow(host);
        }
      });
      state.nodeEls.forEach((el, host) => el.classList.toggle("pinned", state.pinned.has(host)));
    }
    function syncPlaces() {
      state.placed = savedPlaces();
      const stale = Array.from(state.nodeEls.keys()).some((host) => {
        const node = model2.nodeByHost.get(host), place2 = state.placed.get(host), current = state.positions.get(host);
        if (!node || !current || state.pinned.has(host)) return false;
        if (place2) return place2.x !== current.x || place2.y !== current.y;
        return node.kind !== "stub" && !node.ghost && !unplaced.has(host);
      });
      if (stale) render2(true);
    }
    const drawn = () => ({ nodes: state.nodeEls.size, links: state.linkEls.size });
    bindCanvas();
    return {
      state,
      render: (keepView) => render2(keepView),
      fit,
      select,
      reveal,
      repaint: paintSelection,
      resetPins: () => {
        state.pinned = savedPins();
        return render2(true);
      },
      replaceAll: () => {
        state.pinned = savedPins();
        state.placed = /* @__PURE__ */ new Map();
        return render2(false, true);
      },
      syncPins,
      syncPlaces,
      // Une épingle retirée replace le graphe seulement si son équipement est dessiné (une orpheline ne bouge rien).
      unpin: (hostnames) => {
        const shown = hostnames.some((host) => state.nodeEls.has(host));
        hostnames.forEach((host) => state.pinned.delete(host));
        return shown ? render2(true) : drawn();
      }
    };
  }
  var graph = { create: create2 };

  // src/shell/apps.ts
  var apps = {};

  // src/shell/widgets.ts
  var pill = (kind, value, label2) => h("span", { class: "pill " + kind + "-" + value }, label2 === void 0 ? value : label2);
  var sourcePill = (source) => pill("source", source, SOURCE_LABEL[source] || source);
  var statusPill = (status) => pill("status", status, STATUS_LABEL[status] || status);
  var severityPill = (severity) => pill("severity", severity);
  var diffPill = (kind) => pill("diff", kind, DIFF_LABEL[kind] || kind);
  function definition(rows) {
    const kept = rows.filter((row) => !!row && row[1] !== null && row[1] !== void 0 && row[1] !== "");
    return h("dl", { class: "kv" }, kept.map(([label2, value]) => [h("dt", {}, label2), h("dd", {}, typeof value === "object" ? value : String(value))]));
  }
  function table(headers, rows, options) {
    const head = h("tr", {}, headers.map((label2) => h("th", {}, label2)));
    const body = rows.map((row) => {
      const line2 = h(
        "tr",
        { class: row.onclick ? "clickable" : null, onclick: row.onclick || null, tabindex: row.onclick ? 0 : null },
        row.cells.map((cell2) => h("td", {}, cell2))
      );
      const onclick = row.onclick;
      if (onclick) line2.addEventListener("keydown", (event) => {
        if (event.key === "Enter") onclick();
      });
      return line2;
    });
    const empty = rows.length ? null : h("tr", {}, h("td", { colspan: headers.length, class: "empty" }, options && options.empty || "rien à signaler"));
    return h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, head), h("tbody", {}, body, empty)));
  }
  function confirmable(label2, run2, options = {}) {
    const suffix = options.count === void 0 ? "" : " (" + options.count + ")";
    const holder = h("span", { class: "confirm-row" });
    const ask = () => {
      clear(holder).appendChild(h("button", { type: "button", onclick: () => {
        clear(holder).appendChild(first());
        run2();
      } }, "confirmer : " + label2 + suffix));
      holder.appendChild(h("button", { type: "button", class: "linklike", onclick: () => {
        clear(holder).appendChild(first());
      } }, "annuler"));
    };
    const first = () => h("button", { type: "button", title: options.title || null, onclick: ask }, label2 + suffix);
    holder.appendChild(first());
    return holder;
  }
  var widgets = { pill, sourcePill, statusPill, severityPill, diffPill, definition, table, confirmable };

  // src/shell/tables.ts
  var CHECK_HEADERS = ["sévérité", "code", "vise", "détails", "règle"];
  var QUALITY_CODES = [
    "description_unparseable",
    "description_ha_unresolved",
    "description_disagrees_with_observed",
    "neighbor_unknown",
    "neighbor_name_ambiguous",
    "neighbor_name_case_differs",
    "neighbor_resolved_by_reported_hostname",
    "neighbor_resolved_by_address",
    "remote_port_is_mac",
    "remote_port_is_aggregate",
    "one_way_observation",
    "multiple_observed_neighbors",
    "self_observation"
  ];
  function targetsOf(model2, check) {
    return check.refs.map((ref) => {
      if (ref.kind === "link") return { label: endLabel(ref.a) + " ↔ " + endLabel(ref.b), selection: { kind: "link", id: linkId(ref) } };
      if (ref.kind === "cluster") return { label: "cluster " + ref.members.join(" + "), selection: { kind: "cluster", id: clusterId(ref.members) } };
      if (ref.kind === "aggregate") return { label: ref.hostname + " · " + ref.name, selection: { kind: "aggregate", id: aggregateKey(ref.hostname, ref.name) } };
      const label2 = ref.kind === "interface" ? ref.hostname + " · " + ref.name : ref.hostname;
      return { label: label2, selection: { kind: "node", id: ref.hostname } };
    }).filter((target) => entityOf(model2, target.selection) !== null);
  }
  var refHost = (ref) => "hostname" in ref ? ref.hostname : "";
  function targetCell(model2, check, onSelect) {
    const targets = targetsOf(model2, check);
    if (!targets.length) return plain(check.refs.map(refHost));
    return targets.map((t) => h("button", { class: "linklike", type: "button", onclick: () => onSelect(t.selection) }, t.label));
  }
  function checkRows(model2, checks, onSelect) {
    return checks.map((check) => ({ cells: [
      severityPill(check.severity),
      h("code", {}, check.code),
      targetCell(model2, check, onSelect),
      Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : "",
      check.origin === "bundle" ? "contrat d'entrée" : (model2.catalogue[check.code] || { rule: "" }).rule || ""
    ] }));
  }
  var byRank = (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || (x.code < y.code ? -1 : x.code > y.code ? 1 : 0) || x.index - y.index;
  function checksView(container, model2, onSelect) {
    const state = { severity: "", code: "", text: "" };
    const codes = Array.from(new Set(model2.checks.map((c) => c.code))).sort();
    const body = h("div", {});
    const draw = () => {
      const text = state.text.trim().toLowerCase();
      const rows = model2.checks.filter((c) => (!state.severity || c.severity === state.severity) && (!state.code || c.code === state.code) && (!text || JSON.stringify([c.refs, c.details]).toLowerCase().includes(text))).sort(byRank);
      clear(body).appendChild(h("p", { class: "muted" }, rows.length + " contrôle" + (rows.length > 1 ? "s" : "") + " sur " + model2.checks.length));
      body.appendChild(table(CHECK_HEADERS, checkRows(model2, rows, onSelect), { empty: "aucun contrôle ne correspond" }));
    };
    const select = (id, label2, values, key) => h(
      "label",
      { class: "field" },
      label2,
      h("select", { id, onchange: (e) => {
        state[key] = e.target.value;
        draw();
      } }, h("option", { value: "" }, "tous"), values.map((v) => h("option", { value: v }, v)))
    );
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Contrôles"),
      h("p", { class: "lead" }, "Un désaccord n'est jamais résolu en silence : il devient un contrôle. Cliquer une cible l'ouvre dans le graphe."),
      h(
        "div",
        { class: "filters" },
        select("f-severity", "sévérité", ["error", "warning", "info"], "severity"),
        select("f-code", "code", codes, "code"),
        h("label", { class: "field" }, "contient", h("input", { id: "f-text", type: "search", placeholder: "hostname, port…", oninput: (e) => {
          state.text = e.target.value;
          draw();
        } }))
      ),
      glossary(model2, codes),
      body
    ));
    draw();
    return { setSeverity: (severity) => {
      state.severity = severity;
      const field = document.getElementById("f-severity");
      if (field) field.value = severity;
      draw();
    } };
  }
  function glossary(model2, codes) {
    if (!codes.length) return null;
    return h(
      "details",
      { class: "glossary" },
      h("summary", {}, "Sens des " + codes.length + " codes présents"),
      definition(codes.map((code) => [code, (model2.catalogue[code] || { meaning: "" }).meaning || "(constat du contrat d'entrée)"]))
    );
  }
  function coverageTable(model2) {
    const topics = model2.coverage.length ? Object.keys(model2.coverage[0].topics) : [];
    return table(["équipement", "collecte", ...topics], model2.coverage.map((c) => {
      const statuses = c.topics;
      return { cells: [c.hostname, pill("collection", c.status, c.status), ...topics.map((t) => pill("topic", statuses[t], statuses[t]))] };
    }), { empty: "aucun équipement dans le périmètre" });
  }
  function findingsTable(model2) {
    if (!model2.ingest) return h("p", { class: "muted" }, "Rapport d'ingestion non disponible pour cette page.");
    return table(["code", "équipement", "objet", "détails", "message"], model2.ingest.findings.map((f) => ({
      cells: [h("code", {}, f.code), f.hostname || "", f.ref || "", plain(f.details), f.message]
    })), { empty: "aucun constat : la livraison respecte le contrat sans réserve" });
  }
  function counters(object, emptyText) {
    const entries = Object.entries(object || {});
    if (!entries.length) return h("p", { class: "muted" }, emptyText);
    return definition(entries.map(([k, v]) => [k, String(v)]));
  }
  function qualityView(container, model2, onSelect) {
    const summary = model2.ingest && model2.ingest.summary;
    const dataChecks = model2.checks.filter((c) => QUALITY_CODES.includes(c.code));
    const described = model2.interfaces.filter((i) => i.description !== null && i.description !== "");
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Qualité des données"),
      h("p", { class: "lead" }, "Ce que la livraison dit d'elle-même et ce que B1 n'a pas su lire : de quoi corriger l'exportateur ou les descriptions d'interface."),
      h("h3", {}, "Couverture de la collecte, par équipement et par topic"),
      coverageTable(model2),
      h("h3", {}, "La livraison"),
      summary ? definition(Object.entries(summary).filter(([k]) => k !== "residual_normalizations").map(([k, v]) => [k, String(v)])) : null,
      h("h3", {}, "Constats du contrat d'entrée"),
      h("p", { class: "muted" }, "Clés nullables oubliées (nullable_key_absent), interface locale inconnue, membre d'agrégat inconnu… Tout doit tendre vers zéro."),
      findingsTable(model2),
      h("h3", {}, "Noms et descriptions que B1 a dû interpréter"),
      definition([
        ["interfaces avec une description", described.length + " sur " + model2.interfaces.length],
        ["descriptions non lues par la grammaire", String(model2.report.unparseable_descriptions)],
        ["voisins finis en « inconnu »", model2.report.unresolved_names.length ? model2.report.unresolved_names.join(", ") : "aucun"]
      ]),
      table(["sévérité", "code", "vise", "détails", "règle"], checkRows(model2, dataChecks, onSelect), { empty: "aucun contrôle de nom ni de description" }),
      h("h3", {}, "Normalisations"),
      h("p", { class: "muted" }, "Résiduelles : ce que l'exportateur a dû normaliser lui-même (doit tendre vers zéro). Appliquées : ce que B1 a normalisé."),
      h(
        "div",
        { class: "two" },
        h("div", {}, h("h4", {}, "résiduelles (exportateur)"), counters(model2.report.residual_normalizations, "aucune")),
        h("div", {}, h("h4", {}, "appliquées (B1)"), counters(model2.report.applied_normalizations, "aucune"))
      )
    ));
  }
  function sourcesView(container, model2, onSelect) {
    const state = { combo: null, text: "" };
    const body = h("div", {});
    const draw = () => {
      const text = state.text.trim().toLowerCase();
      const combo = state.combo;
      const rows = model2.links.filter((l) => (combo === null || l.combo === combo.combo && l.status === combo.status) && (!text || (endLabel(l.a) + " " + endLabel(l.b)).toLowerCase().includes(text)));
      clear(body).appendChild(h(
        "p",
        { class: "muted" },
        rows.length + " câble" + (rows.length > 1 ? "s" : "") + (combo ? " · " + combo.combo + " · " : ""),
        combo ? h("button", { class: "linklike", type: "button", onclick: () => {
          state.combo = null;
          draw();
        } }, "tout afficher") : null
      ));
      body.appendChild(table(["bout a", "bout b", "statut", "sources", "état", "contrôles"], rows.map((link) => ({
        onclick: () => onSelect({ kind: "link", id: link.id }),
        cells: [endLabel(link.a), endLabel(link.b), statusPill(link.status), link.sources.map(sourcePill), link.raw.oper, link.checks.length ? String(link.checks.length) : ""]
      })), { empty: "aucun câble" }));
    };
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Sources des câbles"),
      h("p", { class: "lead" }, "Chaque câble est tracé par une ou plusieurs sources. LLDP et CDP observent, une description documente : l'observé dessine le lien, le documenté le commente."),
      table(["sources", "statut", "câbles"], model2.combos.map((combo) => ({
        onclick: () => {
          state.combo = combo;
          draw();
        },
        cells: [combo.combo.split(" + ").map(sourcePill), statusPill(combo.status), String(combo.count)]
      })), { empty: "aucun câble" }),
      h("h3", {}, "Tous les câbles"),
      h("div", { class: "filters" }, h(
        "label",
        { class: "field" },
        "équipement ou port",
        h("input", { id: "s-text", type: "search", placeholder: "hostname, port…", oninput: (e) => {
          state.text = e.target.value;
          draw();
        } })
      )),
      body
    ));
    draw();
  }
  function structuresView(container, model2, onSelect) {
    const memberText2 = (aggregate) => aggregate.raw.members.map((m) => m.name + " (" + m.status + ")").join(", ");
    const mlagText3 = (aggregate) => {
      const raw = aggregate.raw;
      if (raw.mlag_peer_link) return "peer-link";
      const id = raw.mlag_id !== null ? String(raw.mlag_id) : "";
      return raw.mlag_peer_link === null ? id ? id + " · peer-link non lu" : "peer-link non lu" : id;
    };
    const aggregateRows = model2.aggregates.map((aggregate) => ({
      onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }),
      cells: [
        aggregate.hostname,
        aggregate.name,
        aggregate.raw.protocol + (aggregate.raw.lacp_mode ? " " + aggregate.raw.lacp_mode : ""),
        memberText2(aggregate),
        String(aggregate.cables.length),
        pill("degraded", String(aggregate.raw.degraded), aggregate.raw.degraded ? "dégradé" : "complet"),
        mlagText3(aggregate)
      ]
    }));
    const domainRows = model2.mlagDomains.map((domain) => ({
      onclick: () => onSelect(domain.members.length ? { kind: "aggregate", id: domain.members[0].key } : null),
      cells: [
        String(domain.raw.mlag_id),
        domain.raw.members.map((m) => m.hostname + " · " + m.aggregate).join(" + "),
        domain.raw.peer_link ? domain.raw.peer_link.hostname + " · " + domain.raw.peer_link.aggregate : "—",
        plain(domain.raw.downstream)
      ]
    }));
    const clusterRows = model2.clusters.map((cluster) => ({
      onclick: () => onSelect({ kind: "cluster", id: cluster.id }),
      cells: [
        plain(cluster.raw.cluster_name),
        pill("mode", cluster.raw.mode, cluster.raw.mode),
        cluster.raw.members.map((m) => m.hostname + " (" + m.role + ", " + m.state + ")").join(", "),
        cluster.heartbeats.map((hb) => hb.hostname + " · " + hb.interface + (hb.link ? "" : " (sans câble)")).join(", ") || "—"
      ]
    }));
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Structures"),
      h("p", { class: "lead" }, "Ce que B1 a reconstruit au-dessus des câbles : agrégats (document aggregates de chaque équipement), domaines MLAG (deux agrégats de même identifiant, appariés par leur peer-link) et clusters HA (documents ha de leurs membres). Cliquer une ligne l'ouvre dans le graphe."),
      h("h3", {}, "Agrégats : " + model2.aggregates.length),
      table(["équipement", "agrégat", "protocole", "membres", "câbles", "état", "MLAG"], aggregateRows, { empty: "aucun agrégat : aucun document aggregates dans le bundle" }),
      h("h3", {}, "Domaines MLAG : " + model2.mlagDomains.length),
      table(["identifiant", "agrégats", "peer-link", "équipement aval"], domainRows, { empty: "aucun domaine MLAG" }),
      h("h3", {}, "Clusters HA : " + model2.clusters.length),
      table(["cluster", "mode", "membres", "heartbeat"], clusterRows, { empty: "aucun cluster : aucun document ha dans le bundle" })
    ));
  }
  var SECTION_LABEL = { nodes: "équipements", interfaces: "interfaces", links: "câbles", aggregates: "agrégats", mlag_domains: "domaines MLAG", ha_clusters: "clusters HA" };
  var total = (part) => part.added + part.removed + part.changed;
  var fieldsCell = (change) => definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]));
  var byHost = (items) => {
    const counts = /* @__PURE__ */ new Map();
    items.forEach((item) => counts.set(item.hostname, (counts.get(item.hostname) || 0) + 1));
    return Array.from(counts, ([host, n]) => host + " (" + n + ")").join(", ");
  };
  var mlagText = (domain) => "MLAG " + domain.mlag_id + " · " + domain.members.map((m) => m.hostname + " · " + m.aggregate).join(" + ");
  function diffNodeRows(model2, d, onSelect) {
    const row = (kind, hostname, node, change) => ({
      onclick: () => onSelect({ kind: "node", id: hostname }),
      cells: [diffPill(kind), hostname, node ? KIND_LABEL[node.kind] : "", node ? plain(node.type) : "", change ? fieldsCell(change) : ""]
    });
    return [
      ...d.nodes.added.map((n) => row("added", n.hostname, n, null)),
      ...d.nodes.removed.map((n) => row("removed", n.hostname, n, null)),
      ...d.nodes.changed.flatMap((c) => c.ref.kind === "node" ? [row("changed", c.ref.hostname, model2.nodeByHost.get(c.ref.hostname), c)] : [])
    ];
  }
  function diffLinkRows(model2, d, onSelect) {
    const row = (kind, ref, change) => {
      const id = linkId(ref), live = model2.linkById.get(id);
      return {
        onclick: () => onSelect({ kind: "link", id }),
        cells: [
          diffPill(kind),
          endLabel(ref.a),
          endLabel(ref.b),
          !live ? "" : live.ghost ? h("span", { class: "muted" }, "était " + STATUS_LABEL[live.status]) : statusPill(live.status),
          change ? fieldsCell(change) : ""
        ]
      };
    };
    return [
      ...d.links.added.map((l) => row("added", l, null)),
      ...d.links.removed.map((l) => row("removed", l, null)),
      ...d.links.changed.flatMap((c) => c.ref.kind === "link" ? [row("changed", c.ref, c)] : [])
    ];
  }
  function diffStructureRows(d, onSelect) {
    const aggregate = (kind, hostname, name, change) => ({
      onclick: () => onSelect({ kind: "aggregate", id: aggregateKey(hostname, name) }),
      cells: [diffPill(kind), "agrégat", hostname + " · " + name, change ? fieldsCell(change) : ""]
    });
    const domain = (kind, ref, change) => ({ cells: [diffPill(kind), "domaine MLAG", mlagText(ref), change ? fieldsCell(change) : ""] });
    const cluster = (kind, hosts, change) => ({
      onclick: () => onSelect({ kind: "cluster", id: clusterId(hosts) }),
      cells: [diffPill(kind), "cluster HA", hosts.join(" + "), change ? fieldsCell(change) : ""]
    });
    return [
      ...d.aggregates.added.map((a) => aggregate("added", a.hostname, a.name, null)),
      ...d.aggregates.removed.map((a) => ({ cells: [diffPill("removed"), "agrégat", a.hostname + " · " + a.name, ""] })),
      ...d.aggregates.changed.flatMap((c) => c.ref.kind === "aggregate" ? [aggregate("changed", c.ref.hostname, c.ref.name, c)] : []),
      ...d.mlag_domains.added.map((m) => domain("added", m, null)),
      ...d.mlag_domains.removed.map((m) => domain("removed", m, null)),
      ...d.mlag_domains.changed.flatMap((c) => c.ref.kind === "mlag_domain" ? [domain("changed", c.ref, c)] : []),
      ...d.ha_clusters.added.map((c) => cluster("added", c.members.map((m) => m.hostname), null)),
      ...d.ha_clusters.removed.map((c) => ({ cells: [diffPill("removed"), "cluster HA", c.members.map((m) => m.hostname).join(" + "), ""] })),
      ...d.ha_clusters.changed.flatMap((c) => c.ref.kind === "cluster" ? [cluster("changed", c.ref.members, c)] : [])
    ];
  }
  function diffView(container, model2, onSelect) {
    const d = model2.diff, s2 = d.summary;
    const openNode = (hostname) => () => onSelect({ kind: "node", id: hostname });
    const summaryRows = Object.entries(SECTION_LABEL).map(([name, label2]) => ({ cells: [label2, String(s2[name].added), String(s2[name].removed), String(s2[name].changed)] }));
    const interfaceRows = d.interfaces.changed.flatMap((c) => c.ref.kind === "interface" ? [{ onclick: openNode(c.ref.hostname), cells: [diffPill("changed"), c.ref.hostname + " · " + c.ref.name, fieldsCell(c)] }] : []);
    const coverageRows = d.coverage.changed.flatMap((c) => c.ref.kind === "node" ? [{ onclick: openNode(c.ref.hostname), cells: [c.ref.hostname, fieldsCell(c)] }] : []);
    const eventRows = d.events.flatMap((e) => {
      const ref = e.ref;
      if (ref.kind !== "node" && ref.kind !== "interface") return [];
      return [{
        onclick: openNode(ref.hostname),
        cells: [pill("event", e.kind, EVENT_LABEL[e.kind] || e.kind), ref.kind === "node" ? ref.hostname : ref.hostname + " · " + ref.name, plain(e.details)]
      }];
    });
    clear(container).appendChild(h(
      "div",
      { class: "page" },
      h("h2", {}, "Diff"),
      h("p", { class: "lead" }, "De la run " + d.before.collector_run_id + " (" + d.before.start_datetime + ") à la run " + d.after.collector_run_id + " (" + d.after.start_datetime + "), " + elapsedText(d.elapsed_seconds) + ". Les équipements et câbles ajoutés, retirés ou changés sont peints dans le graphe ; cliquer une ligne l'y ouvre, un élément retiré compris. Les champs volatils (uptime, âge du dernier changement) ne comptent pas : " + s2.volatile_changes + " différence" + (s2.volatile_changes > 1 ? "s" : "") + " ignorée" + (s2.volatile_changes > 1 ? "s" : "") + "."),
      table(["section", "ajoutés", "retirés", "changés"], summaryRows),
      h("h3", {}, "Équipements : " + total(s2.nodes)),
      table(["changement", "équipement", "sorte", "type", "changements"], diffNodeRows(model2, d, onSelect), { empty: "aucun équipement ajouté, retiré ni changé" }),
      h("h3", {}, "Câbles : " + total(s2.links)),
      table(["changement", "bout a", "bout b", "statut", "changements"], diffLinkRows(model2, d, onSelect), { empty: "aucun câble ajouté, retiré ni changé" }),
      h("h3", {}, "Interfaces : " + total(s2.interfaces)),
      definition([["ajoutées", d.interfaces.added.length ? byHost(d.interfaces.added) : null], ["retirées", d.interfaces.removed.length ? byHost(d.interfaces.removed) : null]]),
      table(["changement", "interface", "changements"], interfaceRows, { empty: "aucune interface changée" }),
      h("h3", {}, "Structures : " + (total(s2.aggregates) + total(s2.mlag_domains) + total(s2.ha_clusters))),
      table(["changement", "sorte", "élément", "changements"], diffStructureRows(d, onSelect), { empty: "aucune structure ajoutée, retirée ni changée" }),
      h("h3", {}, "Contrôles apparus : " + s2.checks.appeared),
      table(CHECK_HEADERS, checkRows(model2, d.checks.appeared.map(asEntry), onSelect), { empty: "aucun contrôle apparu" }),
      h("h3", {}, "Contrôles résolus : " + s2.checks.resolved + " · persistants : " + s2.checks.persisted),
      table(CHECK_HEADERS, checkRows(model2, d.checks.resolved.map(asEntry), onSelect), { empty: "aucun contrôle résolu" }),
      h("h3", {}, "Couverture changée : " + s2.coverage.changed),
      table(["équipement", "changements"], coverageRows, { empty: "aucun changement de couverture" }),
      h("h3", {}, "Événements : " + (s2.events.rebooted + s2.events.flapped)),
      h("p", { class: "muted" }, "Lus dans les champs volatils : un uptime plus court que l'écart entre les runs, c'est un redémarrage ; un âge de dernier changement plus court, à état égal, c'est un flap (le port a bougé puis est revenu au même état), sauf sur un équipement redémarré, dont le redémarrage explique les ports."),
      table(["sorte", "élément", "détails"], eventRows, { empty: "aucun redémarrage, aucun flap" })
    ));
  }
  var asEntry = (check, index) => ({ index, ...check });
  var tables = { checksView, qualityView, sourcesView, structuresView, diffView, targetsOf };

  // src/shell/checks.ts
  function checkList(model2, checks, onSelect) {
    if (!checks.length) return h("p", { class: "muted" }, "Aucun contrôle sur cet élément.");
    return h("ul", { class: "checks" }, checks.map((check) => h(
      "li",
      { class: "check" },
      h("div", { class: "check-head" }, severityPill(check.severity), h("code", {}, check.code)),
      h("div", { class: "check-meaning" }, (model2.catalogue[check.code] || { meaning: "" }).meaning || ""),
      Object.keys(check.details).length ? definition(Object.entries(check.details).map(([k, v]) => [k, plain(v)])) : null,
      refButtons(model2, check, onSelect)
    )));
  }
  function refButtons(model2, check, onSelect) {
    const targets = targetsOf(model2, check);
    if (!targets.length || !onSelect) return null;
    return h("div", { class: "ref-row" }, targets.map((target) => h("button", { class: "linklike", type: "button", onclick: () => onSelect(target.selection) }, target.label)));
  }

  // src/shell/structures.ts
  var aggregateLabel = (aggregate) => aggregate.hostname + " · " + aggregate.name;
  var aggregateButton = (aggregate, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }) }, aggregateLabel(aggregate));
  var nodeButton = (hostname, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: hostname }) }, hostname);
  var beamButton = (beam, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "beam", id: beam.id }) }, beamLabel(beam));
  var clusterButton = (cluster, onSelect) => h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "cluster", id: cluster.id }) }, clusterLabel(cluster));
  function topicPill(model2, hostname, topic) {
    const coverage = model2.coverage.find((c) => c.hostname === hostname);
    const status = coverage ? coverage.topics[topic] : "absent";
    return pill("topic", status, "topic " + topic + " : " + status);
  }
  function cableRows(links, onSelect) {
    return links.map((link) => ({
      onclick: () => onSelect({ kind: "link", id: link.id }),
      cells: [endLabel(link.a), endLabel(link.b), [statusPill(link.status), link.sources.map(sourcePill)], link.raw.oper]
    }));
  }
  var cableTable = (links, onSelect, empty) => table(["bout a", "bout b", "statut · sources", "état"], cableRows(links, onSelect), { empty });
  function memberRows(model2, aggregate, onSelect) {
    return aggregate.raw.members.map((member) => {
      const links = model2.linksByIface.get(ifaceKey(aggregate.hostname, member.name)) || [];
      const facing = links.map((link) => endLabel(link.a.hostname === aggregate.hostname && link.a.interface === member.name ? link.b : link.a));
      return {
        onclick: links.length === 1 ? () => onSelect({ kind: "link", id: links[0].id }) : null,
        cells: [member.name, pill("member", member.status, member.status), facing.length ? facing.join(", ") : "—"]
      };
    });
  }
  function mlagText2(aggregate, onSelect) {
    const domain = aggregate.mlag;
    if (!domain) return null;
    const partner = domain.members.find((m) => m !== aggregate);
    return definition([
      ["domaine MLAG", String(domain.raw.mlag_id)],
      ["agrégat pair", partner ? aggregateButton(partner, onSelect) : "(absent du snapshot)"],
      ["peer-link", domain.peerLink ? aggregateButton(domain.peerLink, onSelect) : "aucun agrégat marqué peer-link"],
      ["équipement aval", domain.raw.downstream ? nodeButton(domain.raw.downstream, onSelect) : "non unique ou inconnu (voir les contrôles)"]
    ]);
  }
  var stoppedCables = (model2, aggregate) => model2.linksByIface.get(ifaceKey(aggregate.hostname, aggregate.name)) || [];
  function aggregateWhy(model2, aggregate) {
    const raw = aggregate.raw;
    const bundled = raw.members.filter((m) => m.status === "bundled").length;
    const stopped = stoppedCables(model2, aggregate).length;
    const parts = [raw.members.length + " membre" + (raw.members.length > 1 ? "s" : "") + " dont " + bundled + " bundled, " + raw.protocol + (raw.lacp_mode ? " " + raw.lacp_mode : "") + (raw.min_links !== null ? ", min_links " + raw.min_links : "") + "."];
    parts.push(aggregate.cables.length ? aggregate.cables.length + " câble" + (aggregate.cables.length > 1 ? "s" : "") + " tracé" + (aggregate.cables.length > 1 ? "s" : "") + " sur ses membres." : "Aucun câble tracé sur ses membres.");
    if (stopped) parts.push(stopped + " câble" + (stopped > 1 ? "s" : "") + " arrêté" + (stopped > 1 ? "s" : "") + " à l'agrégat lui-même : le voisin l'annonce en port-id et B1 n'a pas su désigner le membre.");
    if (raw.mlag_peer_link) parts.push("Cet agrégat est le peer-link de son domaine MLAG.");
    else if (aggregate.mlag) parts.push("Membre du domaine MLAG " + aggregate.mlag.raw.mlag_id + ".");
    if (raw.mlag_peer_link === null) parts.push("Peer-link non lu : la source MLAG du document aggregates n'a pas répondu, B1 ne le tient pas pour un peer-link.");
    return parts.join(" ");
  }
  function aggregatePanel(model2, aggregate, onSelect) {
    const raw = aggregate.raw;
    const stopped = stoppedCables(model2, aggregate);
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, "agrégat"),
        pill("degraded", String(raw.degraded), raw.degraded ? "dégradé" : "complet"),
        pill("oper", raw.oper_status, raw.oper_status),
        raw.mlag_peer_link ? pill("role", "peer-link", "peer-link") : null
      ),
      h("h3", { class: "ends" }, nodeButton(raw.hostname, onSelect), " · " + raw.name),
      h("p", { class: "why" }, aggregateWhy(model2, aggregate)),
      definition([
        ["protocole", raw.protocol + (raw.lacp_mode ? " · " + raw.lacp_mode : "")],
        ["min_links", raw.min_links],
        ["MLAG id", raw.mlag_id],
        ["peer-link", raw.mlag_peer_link === null ? "non lu" : raw.mlag_peer_link ? "oui" : "non"]
      ]),
      h("h4", { class: "section" }, "Membres : " + raw.members.length),
      table(["port", "statut", "câble vers"], memberRows(model2, aggregate, onSelect), { empty: "aucun membre listé" }),
      stopped.length ? [
        h("h4", { class: "section" }, "Câbles arrêtés à l'agrégat lui-même : " + stopped.length),
        h("p", { class: "muted" }, "Le voisin annonce le nom de l'agrégat en port-id (R1-bis) ; le membre n'a pas pu être désigné : contrôle remote_port_is_aggregate sur chaque câble."),
        cableTable(stopped, onSelect, "aucun")
      ] : null,
      aggregate.beams.length ? [h("h4", { class: "section" }, "Faisceaux"), h("ul", { class: "plain" }, aggregate.beams.map((beam) => h("li", {}, beamButton(beam, onSelect))))] : null,
      aggregate.mlag ? [h("h4", { class: "section" }, "Domaine MLAG"), mlagText2(aggregate, onSelect)] : null,
      h("h4", { class: "section" }, "Sources"),
      h("p", { class: "muted" }, "Document du topic aggregates de " + raw.hostname + " : membres et statuts tels que l'équipement les rapporte. ", topicPill(model2, raw.hostname, "aggregates")),
      h("p", { class: "muted" }, "Chaque câble a ses propres sources : cliquer un membre câblé."),
      h("h4", { class: "section" }, "Contrôles"),
      checkList(model2, aggregate.checks, onSelect)
    ];
  }
  function beamWhy(beam) {
    const parts = [beam.links.length + " câble" + (beam.links.length > 1 ? "s" : "") + " entre les membres de " + beam.a.aggregate + " et de " + beam.b.aggregate + "."];
    const missing = beam.aggregates.map((agg, index) => agg ? null : [beam.a, beam.b][index]).filter((end) => !!end);
    if (missing.length) {
      const known2 = beam.known.map((agg) => agg.raw.protocol);
      parts.push((known2.length ? "Protocole " + known2[0] + " d'un côté ; " : "") + missing.map((end) => end.hostname + " · " + end.aggregate).join(" et ") + " n'a pas de document aggregates (appartenance lue dans interfaces[].members) : B1 ne compare pas les protocoles.");
    } else {
      const protocols = beam.known.map((agg) => agg.raw.protocol);
      parts.push(protocols[0] === protocols[1] ? "Protocole " + protocols[0] + " des deux côtés." : "Protocoles différents : " + protocols.join(" / ") + ".");
    }
    if (beam.peerLink) parts.push("C'est le peer-link d'un domaine MLAG.");
    beam.mlags.forEach((domain) => parts.push("Patte du domaine MLAG " + domain.raw.mlag_id + (domain.raw.downstream ? " (vers " + domain.raw.downstream + ")" : "") + "."));
    return parts.join(" ");
  }
  function beamPanel(model2, beam, onSelect) {
    const ends = [beam.a, beam.b].map((end, index) => {
      const aggregate = beam.aggregates[index];
      return aggregate ? aggregateButton(aggregate, onSelect) : h("span", {}, end.hostname + " · " + end.aggregate + " (sans document aggregates)");
    });
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, "faisceau"),
        beam.peerLink ? pill("role", "peer-link", "peer-link") : null,
        beam.mlags.map((domain) => pill("role", "mlag", "MLAG " + domain.raw.mlag_id)),
        beam.degraded ? pill("degraded", "true", "un agrégat dégradé") : null
      ),
      h("h3", { class: "ends" }, ends[0], h("span", { class: "arrow" }, " ⇄ "), ends[1]),
      h("p", { class: "why" }, beamWhy(beam)),
      h("h4", { class: "section" }, "Câbles : " + beam.links.length),
      cableTable(beam.links, onSelect, "aucun câble"),
      h("h4", { class: "section" }, "Contrôles des deux agrégats"),
      checkList(model2, beam.checks, onSelect)
    ];
  }
  function memberTable(cluster, onSelect) {
    return table(["membre", "rôle", "état", "priorité", "rapporté par"], cluster.raw.members.map((member) => ({
      cells: [nodeButton(member.hostname, onSelect), member.role, pill("state", member.state, member.state), plain(member.priority), member.reported_by.join(", ")]
    })), { empty: "aucun membre" });
  }
  function heartbeatTable(cluster, onSelect) {
    return table(["membre", "interface", "câble"], cluster.heartbeats.map((hb) => {
      const link = hb.link;
      return { cells: [hb.hostname, hb.interface, link ? h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "link", id: link.id }) }, endLabel(link.a) + " ↔ " + endLabel(link.b)) : h("span", { class: "muted" }, "aucun câble observé ni documenté : rien n'est inventé")] };
    }), { empty: "aucune interface de heartbeat rapportée" });
  }
  function clusterSources(model2, cluster) {
    const reporters = new Set(cluster.raw.members.flatMap((m) => m.reported_by));
    return h("ul", { class: "plain" }, cluster.hosts.map((host) => {
      const node = model2.nodeByHost.get(host);
      const collection = node ? node.collection : null;
      return h("li", {}, reporters.has(host) ? ["document ha de " + host + " ", topicPill(model2, host, "ha")] : h("span", { class: "muted" }, host + " : aucun document ha" + (collection ? " (collecte : " + collection + ")" : "")));
    }));
  }
  function clusterWhy(cluster) {
    const reporters = Array.from(new Set(cluster.raw.members.flatMap((m) => m.reported_by)));
    const down = cluster.raw.members.filter((m) => m.state === "down").map((m) => m.hostname);
    const parts = [cluster.hosts.length + " membre" + (cluster.hosts.length > 1 ? "s" : "") + " en " + cluster.raw.mode + ", décrit" + (cluster.hosts.length > 1 ? "s" : "") + " par le document ha de " + reporters.join(" et de ") + "."];
    if (down.length) parts.push("Membre" + (down.length > 1 ? "s" : "") + " down : " + down.join(", ") + ".");
    const without = cluster.heartbeats.filter((hb) => !hb.link).length;
    if (without) parts.push(without + " interface" + (without > 1 ? "s" : "") + " de heartbeat sans câble.");
    return parts.join(" ");
  }
  function clusterPanel(model2, cluster, onSelect) {
    const raw = cluster.raw;
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "cluster HA"), pill("mode", raw.mode, raw.mode)),
      h("h3", {}, raw.cluster_name || cluster.hosts.join(" + ")),
      h("p", { class: "why" }, clusterWhy(cluster)),
      h("h4", { class: "section" }, "Membres : " + cluster.hosts.length),
      memberTable(cluster, onSelect),
      h("h4", { class: "section" }, "Heartbeat"),
      heartbeatTable(cluster, onSelect),
      h("h4", { class: "section" }, "Sources"),
      clusterSources(model2, cluster),
      h("h4", { class: "section" }, "Contrôles"),
      checkList(model2, cluster.checks, onSelect)
    ];
  }
  function nodeStructures(model2, hostname, onSelect) {
    const node = model2.nodeByHost.get(hostname);
    const aggregates = model2.aggregatesByNode.get(hostname) || [];
    const clusters = model2.clustersByHost.get(hostname) || [];
    return [
      clusters.length ? [
        h("h4", { class: "section" }, "Cluster" + (clusters.length > 1 ? "s" : "") + " HA"),
        h("ul", { class: "plain" }, clusters.map((cluster) => h("li", {}, clusterButton(cluster, onSelect))))
      ] : null,
      !node || node.kind !== "device" ? null : [
        h("h4", { class: "section" }, "Agrégats : " + aggregates.length),
        table(["agrégat", "protocole", "membres", "câbles", "état"], aggregates.map((aggregate) => ({
          onclick: () => onSelect({ kind: "aggregate", id: aggregate.key }),
          cells: [
            aggregate.name,
            aggregate.raw.protocol,
            aggregate.raw.members.filter((m) => m.status === "bundled").length + " / " + aggregate.raw.members.length + " bundled",
            String(aggregate.cables.length),
            pill("degraded", String(aggregate.raw.degraded), aggregate.raw.degraded ? "dégradé" : "complet")
          ]
        })), { empty: "aucun document aggregates pour cet équipement" })
      ]
    ];
  }
  var structures = { aggregatePanel, beamPanel, clusterPanel, nodeStructures, aggregateButton, beamButton, clusterButton, aggregateLabel };

  // src/shell/inspect.ts
  function changeOf(model2, kind, id, ghost) {
    if (ghost) return { kind: "removed", fields: [] };
    return model2.changeOf ? model2.changeOf(kind, id) : null;
  }
  function diffBlock(model2, change, what) {
    if (!change || !model2.diff) return null;
    const before = model2.diff.before.collector_run_id;
    if (change.kind === "added") return h("p", { class: "diff-note diff-added" }, "Ajouté : ce " + what + " n'était pas dans la run " + before + ".");
    if (change.kind === "removed") return h("p", { class: "diff-note diff-removed" }, "Retiré : ce " + what + " était dans la run " + before + " et n'est plus dans celle-ci ; la fiche le montre tel qu'il était.");
    return [
      h("h4", { class: "section" }, "Changements depuis la run " + before),
      definition(change.fields.map((f) => [f.path, brief(f.before) + " → " + brief(f.after)]))
    ];
  }
  function evidenceCard(evidence) {
    const observed = OBSERVED[evidence.source];
    const raw = evidence.remote_raw, resolved = evidence.remote_resolved;
    const renamed = raw.port !== null && resolved.interface !== null && raw.port !== resolved.interface;
    return h(
      "li",
      { class: "evidence " + (observed ? "observed" : "documented") },
      h("div", { class: "evidence-head" }, sourcePill(evidence.source), h("span", { class: "muted" }, observed ? "observé" : "documenté")),
      definition([
        ["témoin", endLabel(evidence.witness)],
        ["il annonce", raw.name + " · " + (raw.port === null ? "sans port" : raw.port)],
        ["résolu en", resolved.hostname + " · " + (resolved.interface === null ? "port non précisé" : resolved.interface)],
        ["résolution du nom", RESOLUTION_LABEL[evidence.resolution] || evidence.resolution],
        renamed ? ["nom de port", "normalisé par B1 (R1) : " + raw.port + " → " + resolved.interface] : null
      ])
    );
  }
  function portCard(model2, end, aggregate, removed) {
    const found = interfaceAt(model2, end.hostname, end.interface, removed);
    const title = h("h4", {}, endLabel(end));
    if (!found) return h("div", { class: "port" }, title, h("p", { class: "muted" }, "Port absent de interfaces[] : équipement non collecté, ou nom tel qu'annoncé par le voisin."));
    const itf = found.itf;
    const parsed = itf.description_parsed;
    return h(
      "div",
      { class: "port" },
      title,
      found.ghost ? h("p", { class: "muted diff-removed" }, "Interface retirée depuis la run d'avant : valeurs telles qu'elles étaient.") : null,
      definition([
        ["état", itf.oper_status + " (admin " + itf.admin_status + ")" + (itf.oper_reason ? " · " + itf.oper_reason : "")],
        ["type · vitesse", itf.type + (itf.speed_mbps ? " · " + speedText(itf.speed_mbps) : "") + (itf.duplex ? " · " + itf.duplex : "")],
        ["média", itf.media],
        ["agrégat", aggregate || (itf.aggregate ? itf.aggregate.name + (itf.aggregate.member_status ? " (" + itf.aggregate.member_status + ")" : "") : null)],
        ["rôles", itf.roles.length ? itf.roles.join(", ") : null],
        ["description brute", itf.description === null ? "(aucune)" : h("code", { class: "wrap" }, itf.description)],
        ["description lue", parsed ? "criticité " + parsed.criticality + " · voisin " + parsed.neighbor + " · port " + plain(parsed.port) + (parsed.options ? " · " + parsed.options : "") : itf.description ? "non lue par la grammaire criticité|voisin|port|options" : null],
        ["mode · VLAN", itf.switchport_mode ? itf.switchport_mode + vlanText(itf) : null],
        ["MAC", itf.mac_address],
        ["IP", itf.ip_addresses.length ? itf.ip_addresses.map((ip) => ip.address + "/" + ip.prefix).join(", ") : null]
      ])
    );
  }
  function vlanText(itf) {
    if (itf.access_vlan) return " · access " + itf.access_vlan;
    if (itf.native_vlan || itf.allowed_vlans) {
      const allowed = itf.allowed_vlans ? itf.allowed_vlans.map((r) => r.first === r.last ? String(r.first) : r.first + "-" + r.last).join(",") : "?";
      return " · natif " + plain(itf.native_vlan) + " · autorisés " + (allowed || "aucun");
    }
    return "";
  }
  function whyText(link) {
    const witnesses = (keep) => Array.from(new Set(link.raw.evidence.filter((e) => keep(e.source)).map((e) => endLabel(e.witness)))).join(", ");
    const seen = witnesses((src) => OBSERVED[src]);
    const written = witnesses((src) => !OBSERVED[src]);
    const protocols = link.sources.filter((src) => OBSERVED[src]).map((src) => src.toUpperCase()).join(" et ");
    const parts = [];
    if (seen) parts.push("Observé en " + protocols + " depuis " + seen + ".");
    else parts.push("Aucune observation LLDP ni CDP : ce câble n'existe que par les descriptions d'interface.");
    parts.push(written ? "Documenté par la description de " + written + "." : "Aucune description ne le documente.");
    if (link.checks.some((c) => c.code === "description_disagrees_with_observed")) parts.push("Attention : une description ne concorde pas avec l'observé, voir le contrôle ci-dessous.");
    return parts.join(" ");
  }
  function aggregateEnds(model2, link, onSelect) {
    const raw = link.raw;
    const ends = [[raw.a.hostname, raw.aggregate_a], [raw.b.hostname, raw.aggregate_b]].filter((end) => end[1] !== null);
    if (!ends.length) return null;
    return h("span", {}, ends.map(([hostname, name], index) => {
      const aggregate = model2.aggregateByKey.get(aggregateKey(hostname, name));
      return [index ? " · " : null, aggregate ? aggregateButton(aggregate, onSelect) : hostname + " · " + name];
    }));
  }
  function linkPanel(model2, link, onSelect) {
    const raw = link.raw;
    const why = whyText(link);
    const change = changeOf(model2, "link", link.id, link.ghost);
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, "câble"),
        statusPill(link.status),
        raw.oper === "down" ? pill("oper", "down", "down") : null,
        change ? diffPill(change.kind) : null
      ),
      h(
        "h3",
        { class: "ends" },
        h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.a.hostname }) }, raw.a.hostname),
        " · " + raw.a.interface,
        h("span", { class: "arrow" }, " ↔ "),
        h("button", { class: "linklike", type: "button", onclick: () => onSelect({ kind: "node", id: raw.b.hostname }) }, raw.b.hostname),
        " · " + raw.b.interface
      ),
      h("p", { class: "why" }, why),
      diffBlock(model2, change, "câble"),
      definition([
        ["état", raw.oper],
        ["vitesse commune", raw.speed_mbps ? speedText(raw.speed_mbps) : "différente ou inconnue"],
        ["agrégats", aggregateEnds(model2, link, onSelect)],
        ["faisceau", link.beam ? beamButton(link.beam, onSelect) : null]
      ]),
      h("h4", { class: "section" }, "Sources : " + raw.evidence.length + " évidence" + (raw.evidence.length > 1 ? "s" : "")),
      h("ul", { class: "evidences" }, raw.evidence.map((e) => evidenceCard(e))),
      h("h4", { class: "section" }, "Contrôles liés"),
      checkList(model2, link.checks, onSelect),
      link.portChecks.length ? [
        h("h4", { class: "section" }, "Contrôles d'un port partagé avec d'autres câbles"),
        h("p", { class: "muted" }, "Ils visent un port qui porte plusieurs câbles, sans dire lequel : ils ne sont pas comptés sur celui-ci."),
        checkList(model2, link.portChecks, onSelect)
      ] : null,
      h("h4", { class: "section" }, "Les deux ports"),
      portCard(model2, raw.a, raw.aggregate_a, link.ghost),
      portCard(model2, raw.b, raw.aggregate_b, link.ghost)
    ];
  }
  function coverageRow(model2, hostname) {
    const coverage = model2.coverage.find((c) => c.hostname === hostname);
    if (!coverage) return null;
    return h("div", { class: "topic-row" }, Object.entries(coverage.topics).map(([topic, status]) => pill("topic", status, topic + " : " + status)));
  }
  var facingOf = (model2, itf) => (model2.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || []).map((l) => endLabel(l.a.hostname === itf.hostname && l.a.interface === itf.name ? l.b : l.a) + (l.ghost ? " (retiré)" : "")).join(", ");
  function interfaceTable(model2, ifaces) {
    const holder = h("div", {});
    const cabled = (itf) => model2.linksByIface.get(ifaceKey(itf.hostname, itf.name)) || [];
    const lonely = ifaces.filter((itf) => (itf.type === "physical" || itf.type === "management") && itf.oper_status === "up" && !cabled(itf).some((l) => !l.ghost));
    const draw = (only) => {
      const rows = (only ? lonely : ifaces).map((itf) => {
        const facing = facingOf(model2, itf);
        return { cells: [itf.name, itf.type, itf.oper_status, facing || "—", itf.description === null ? "" : h("code", { class: "wrap" }, itf.description)] };
      });
      clear(holder).appendChild(table(["nom", "type", "état", "câble vers", "description"], rows, { empty: only ? "aucun port physique up sans câble" : "aucune interface collectée" }));
    };
    draw(false);
    return [h(
      "label",
      { class: "check-field" },
      h("input", { type: "checkbox", onchange: (e) => draw(e.target.checked) }),
      "seulement les ports physiques up sans câble (" + lonely.length + ")"
    ), holder];
  }
  function ghostInterfaceTable(model2, gone) {
    const rows = gone.map((itf) => ({ cells: [diffPill("removed"), itf.name, itf.type, itf.oper_status, facingOf(model2, itf) || "—"] }));
    return table(["changement", "nom", "type", "état (run d'avant)", "câble vers"], rows, { empty: "aucune" });
  }
  function nodePanel(model2, node, onSelect, extra) {
    const links = model2.linksByNode.get(node.hostname) || [];
    const gone = links.filter((l) => l.ghost).length;
    const ifaces = model2.ifacesByNode.get(node.hostname) || [];
    const ghostIfaces = model2.ghostIfacesByNode.get(node.hostname) || [];
    const seen = node.evidence ? node.evidence.seen_by : [];
    const change = changeOf(model2, "node", node.hostname, node.ghost);
    return [
      h(
        "div",
        { class: "panel-head" },
        h("span", { class: "eyebrow" }, KIND_LABEL[node.kind]),
        node.collection ? pill("collection", node.collection, "collecte : " + node.collection) : null,
        change ? diffPill(change.kind) : null
      ),
      h("h3", {}, node.hostname),
      diffBlock(model2, change, "équipement"),
      definition([
        ["type", node.type],
        ["constructeur · modèle", [node.vendor, node.model].filter(Boolean).join(" · ") || null],
        ["système", [node.os_name, node.os_version].filter(Boolean).join(" ") || null],
        ["série", node.serial_number],
        ["site", node.site],
        ["nom annoncé", node.reported_hostname],
        ["contextes virtuels", node.virtual_contexts.length ? node.virtual_contexts.join(", ") : null],
        ["stack", node.stack ? node.stack.member_count + " membres : " + node.stack.members.map((m) => m.slot + " " + m.role).join(", ") : null],
        ["capacités annoncées", node.evidence && node.evidence.capabilities.length ? node.evidence.capabilities.join(", ") : null]
      ]),
      node.kind === "device" ? [h("h4", { class: "section" }, "Couverture de la collecte"), coverageRow(model2, node.hostname)] : null,
      seen.length ? [h("h4", { class: "section" }, "Vu par"), h("ul", { class: "plain" }, seen.map((w) => h("li", {}, sourcePill(w.source), " ", endLabel(w))))] : null,
      h("h4", { class: "section" }, "Câbles : " + (links.length - gone) + (gone ? " · " + gone + " retiré" + (gone > 1 ? "s" : "") : "")),
      table(["port local", "en face"], links.map((link) => {
        const local = link.a.hostname === node.hostname ? link.a : link.b, remote = local === link.a ? link.b : link.a;
        return { onclick: () => onSelect({ kind: "link", id: link.id }), cells: [local.interface, [h("div", {}, endLabel(remote)), h("div", {}, link.ghost ? diffPill("removed") : null, statusPill(link.status), link.sources.map(sourcePill))]] };
      }), { empty: "aucun câble" }),
      nodeStructures(model2, node.hostname, onSelect),
      extra,
      h("h4", { class: "section" }, "Contrôles"),
      checkList(model2, model2.checksByNode.get(node.hostname) || [], onSelect),
      node.ghost ? null : [h("h4", { class: "section" }, "Interfaces : " + ifaces.length), interfaceTable(model2, ifaces)],
      ghostIfaces.length ? [
        h("h4", { class: "section" }, (node.ghost ? "Interfaces telles qu'elles étaient : " : "Interfaces retirées depuis la run d'avant : ") + ghostIfaces.length),
        ghostInterfaceTable(model2, ghostIfaces)
      ] : null
    ];
  }
  function overview(model2) {
    return [
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, "vue d'ensemble")),
      h("p", { class: "why" }, "Cliquer un câble montre ses sources ; cliquer un équipement montre sa fiche. Survoler un câble donne vitesse, duplex, média et état des deux bouts. Glisser un équipement le déplace, la molette zoome, Tab parcourt les éléments."),
      definition([
        ["voisins inconnus", (model2.kindCounts.get("stub") || 0) + " (masqués par défaut)"],
        ["agrégats", String(model2.aggregates.length)],
        ["faisceaux", model2.beams.length + " (bandes sous les câbles)"],
        ["domaines MLAG", String(model2.mlagDomains.length)],
        ["clusters HA", model2.clusters.length + " (cadres autour des membres)"]
      ])
    ];
  }
  var KIND_WORD = { link: "câble", node: "équipement", aggregate: "agrégat", beam: "faisceau", cluster: "cluster HA" };
  function describe(model2, selection) {
    if (!selection || !entityOf(model2, selection)) return "";
    const label2 = (() => {
      switch (selection.kind) {
        case "link": {
          const link = model2.linkById.get(selection.id);
          return endLabel(link.a) + " ↔ " + endLabel(link.b);
        }
        case "node":
          return model2.nodeByHost.get(selection.id).hostname;
        case "aggregate": {
          const agg = aggregateOf(model2, selection);
          return agg ? agg.hostname + " · " + agg.name : "";
        }
        case "beam": {
          const beam = beamOf(model2, selection);
          return beam ? beamLabel(beam, true) : "";
        }
        default: {
          const cluster = clusterOf(model2, selection);
          return cluster ? clusterLabel(cluster) : "";
        }
      }
    })();
    return KIND_WORD[selection.kind] + " " + label2 + " sélectionné";
  }
  function show(container, model2, selection, onSelect, nodeExtra) {
    clear(container);
    let content = overview(model2);
    if (selection && selection.kind === "link" && model2.linkById.has(selection.id)) content = linkPanel(model2, model2.linkById.get(selection.id), onSelect);
    if (selection && selection.kind === "node" && model2.nodeByHost.has(selection.id)) {
      content = nodePanel(model2, model2.nodeByHost.get(selection.id), onSelect, nodeExtra ? nodeExtra(selection.id) : null);
    }
    const aggregate = aggregateOf(model2, selection), beam = beamOf(model2, selection), cluster = clusterOf(model2, selection);
    if (aggregate) content = aggregatePanel(model2, aggregate, onSelect);
    if (beam) content = beamPanel(model2, beam, onSelect);
    if (cluster) content = clusterPanel(model2, cluster, onSelect);
    container.appendChild(h("div", { class: "panel" }, content));
    container.scrollTop = 0;
    if (selection && typeof matchMedia === "function" && matchMedia("(max-width: 900px)").matches && container.scrollIntoView) container.scrollIntoView({ block: "start" });
  }
  var inspect = { show, checkList, describe };

  // src/shell/intent.ts
  var OPS_PER_REQUEST = 500;
  var AUTHOR_MAX_LENGTH = 80;
  var dateText = (iso) => iso.replace("T", " ").replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/, " $2").replace(" Z", " UTC");
  function localMoves(model2, graph2) {
    return Array.from(graph2.state.pinned.keys()).filter((host) => !model2.pinByHost.has(host)).sort();
  }
  function chunks(items, size) {
    const out = [];
    for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
    return out;
  }
  function createIntentHost(model2, writer, hooks) {
    const canWrite = () => !!(writer && writer.author);
    const accept = (intent2) => {
      if (model2.intent && intent2.revision < model2.intent.revision) return false;
      applyIntent(model2, intent2);
      return true;
    };
    const refresh = () => {
      if (hooks.mounted()) view();
      hooks.refreshPage();
    };
    async function send(ops, removed, done) {
      if (!writer) return;
      hooks.note("enregistrement…");
      let failure = null;
      for (const part of chunks(ops, OPS_PER_REQUEST)) {
        const outcome = await writer.save(part);
        if (!outcome.ok) {
          failure = outcome.message;
          break;
        }
        accept(outcome.intent);
      }
      if (removed.length) hooks.graph().unpin(removed.filter((host) => model2.pinByHost.has(host) === false));
      else hooks.graph().syncPins();
      hooks.note(failure ? "non enregistré : " + failure : done);
      refresh();
    }
    function onPin(hostname, point) {
      if (!writer) {
        hooks.note("déplacement local de " + hostname + ", non enregistré (page sans serveur)");
        return;
      }
      if (!writer.author) {
        hooks.note("déplacement local de " + hostname + " : donnez votre nom (onglet Intentions) pour l'enregistrer");
        return;
      }
      hooks.note("enregistrement de l'épingle de " + hostname + "…");
      writer.save([{ op: "pin", hostname, x: Math.round(point.x), y: Math.round(point.y) }]).then((outcome) => {
        if (outcome.ok) {
          accept(outcome.intent);
          hooks.graph().syncPins();
          hooks.note("épingle de " + hostname + " enregistrée (" + writer.author + ")");
        } else hooks.note("épingle de " + hostname + " non enregistrée : " + outcome.message);
        refresh();
      });
    }
    const unpinOps = (hosts) => hosts.map((hostname) => ({ op: "unpin", hostname }));
    const removeOne = (hostname, button) => {
      button.setAttribute("disabled", "");
      void send(unpinOps([hostname]), [hostname], "épingle de " + hostname + " retirée");
    };
    function writerNote() {
      if (!writer) {
        const why = model2.intent ? "cette page a été générée sans serveur (ld render)" : "cette page vient d'un fichier, sans archive ni serveur";
        return h("p", { class: "intent-note warn" }, "Lecture seule : " + why + ". Glisser un équipement le déplace ici seulement ; rien n'est enregistré.");
      }
      const field = h("input", {
        id: "i-author",
        type: "text",
        value: writer.author,
        placeholder: "votre nom",
        maxlength: AUTHOR_MAX_LENGTH,
        "aria-label": "votre nom, écrit sur chaque épingle",
        spellcheck: "false",
        onchange: (e) => {
          writer.setAuthor(e.target.value.trim().slice(0, AUTHOR_MAX_LENGTH));
          refresh();
        }
      });
      const text = writer.author ? "Vos épingles s'enregistrent sous le nom « " + writer.author + " » : glisser un équipement l'épingle pour tout le monde. Dernier écrivain gagne, par épingle ; chaque écriture est journalisée." : "Sans nom, vos déplacements restent locaux. Donnez votre nom pour que vos épingles s'enregistrent :";
      return h("p", { class: "intent-note" + (writer.author ? "" : " warn") }, text, " ", h("label", { class: "check-field" }, "nom ", field));
    }
    function pinRow(pin, orphan) {
      const target = orphan ? pin.hostname : h("button", { class: "linklike", type: "button", onclick: () => hooks.openInGraph({ kind: "node", id: pin.hostname }) }, pin.hostname);
      const state = orphan ? pill("pin", "orphan", "orpheline : équipement absent de cette run") : pill("pin", "present", "présente");
      const remove = canWrite() ? h("button", { type: "button", onclick: (e) => removeOne(pin.hostname, e.target) }, "retirer") : "";
      return { cells: [target, String(pin.x), String(pin.y), pin.author, dateText(pin.at), state, remove] };
    }
    const removeMany = (label2, hosts) => hosts.length ? confirmable(label2, () => {
      void send(unpinOps(hosts), hosts, hosts.length + " épingle" + (hosts.length > 1 ? "s retirées" : " retirée"));
    }, { count: hosts.length }) : null;
    function view() {
      const container = hooks.container();
      const graph2 = hooks.graph();
      const pins = model2.intent ? model2.intent.pins : [];
      const orphans = new Set(model2.orphanPins.map((p) => p.hostname));
      const local = localMoves(model2, graph2);
      const headers = ["équipement", "x", "y", "auteur", "date", "état", ""];
      const rows = pins.map((pin) => pinRow(pin, orphans.has(pin.hostname)));
      const orphanHosts = model2.orphanPins.map((p) => p.hostname);
      const allHosts = pins.map((p) => p.hostname);
      clear(container).appendChild(h(
        "div",
        { class: "page" },
        h("h2", {}, "Intentions"),
        h("p", { class: "lead" }, "La couche d'intention est ce que vous voulez en plus de ce que la collecte montre. Première intention : l'épingle, la place voulue d'un équipement, keyée par son nom, qui survit aux runs. Glisser un équipement sur le graphe l'épingle ; « replacer » recalcule le placement autour des épingles. Le diff ne lit jamais l'intention. Les équipements non épinglés gardent aussi leur place d'une run à l'autre : c'est le placement mémorisé, une donnée calculée que « replacer » renouvelle."),
        writerNote(),
        model2.intent ? definition([
          ["infrastructure", model2.intent.infrastructure],
          ["révision", String(model2.intent.revision)],
          ["dernière écriture", model2.intent.updated_at ? dateText(model2.intent.updated_at) : "jamais"]
        ]) : null,
        h("h3", {}, "Épingles enregistrées : " + pins.length + (orphans.size ? " · " + orphans.size + " orpheline" + (orphans.size > 1 ? "s" : "") : "")),
        orphans.size ? h("p", { class: "muted" }, "Une épingle orpheline vise un équipement qui n'est pas dans cette run (retiré, renommé, ou pas encore collecté). Elle n'est pas dessinée, elle n'est pas effacée : si l'équipement revient, elle s'applique à nouveau.") : null,
        table(headers, rows, { empty: model2.intent ? "aucune épingle : glisser un équipement sur le graphe" : "pas de couche d'intention dans cette page" }),
        canWrite() ? h("div", { class: "toolbar-row" }, removeMany("retirer les épingles orphelines", orphanHosts), removeMany("retirer toutes les épingles", allHosts)) : null,
        h("h3", {}, "Déplacements locaux non enregistrés : " + local.length),
        local.length ? [
          h("p", { class: "muted" }, local.join(", ")),
          h("button", { type: "button", title: "chaque équipement retrouve sa place mémorisée ou son épingle", onclick: () => {
            graph2.resetPins();
            refresh();
          } }, "oublier les déplacements locaux")
        ] : h("p", { class: "muted" }, "aucun")
      ));
    }
    function pinBlock(hostname) {
      const pin = model2.pinByHost.get(hostname);
      const local = !pin && hooks.graph().state.pinned.has(hostname);
      if (!pin && !local) return null;
      return [
        h("h4", { class: "section" }, "Épingle"),
        pin ? definition([["place voulue", pin.x + ", " + pin.y], ["par", pin.author], ["le", dateText(pin.at)]]) : h("p", { class: "muted" }, "déplacé dans cette page, non enregistré"),
        pin && canWrite() ? h("button", { type: "button", onclick: (e) => removeOne(hostname, e.target) }, "retirer l'épingle") : null
      ];
    }
    return { onPin, view, pinBlock };
  }
  var intent = { createIntentHost, OPS_PER_REQUEST, AUTHOR_MAX_LENGTH };

  // src/shell/placement.ts
  var MAX_RETRIES = 3;
  var plural2 = (count, word) => count + " " + word + (count > 1 ? "s" : "");
  var placed = (count) => plural2(count, "équipement") + " placé" + (count > 1 ? "s" : "");
  var byHostname = (a, b) => a.hostname < b.hostname ? -1 : 1;
  function createPlacementHost(model2, placer, hooks) {
    const pending = /* @__PURE__ */ new Map();
    let queue = Promise.resolve();
    let replacing = false;
    let retries = 0;
    const accept = (placement2, realign) => {
      if (model2.placement && placement2.revision < model2.placement.revision) return;
      applyPlacement(model2, placement2);
      if (realign) hooks.graph().syncPlaces();
    };
    async function send(replace, what) {
      if (!placer) return;
      const places = Array.from(pending.values()).sort(byHostname);
      if (!replace && !places.length) return;
      hooks.note(what + ", mémorisation…");
      const outcome = await placer.save({ base_revision: model2.placement ? model2.placement.revision : 0, replace, places });
      if (replace) replacing = false;
      if (outcome.ok) {
        pending.clear();
        const kept = new Set(outcome.placement.places.map((place) => place.hostname));
        const missing = places.filter((place) => !kept.has(place.hostname)).length;
        retries = missing ? retries + 1 : 0;
        const stopped = retries > MAX_RETRIES;
        if (stopped) retries = 0;
        accept(outcome.placement, replace || !replacing && !stopped);
        hooks.note(replace ? "placement recalculé et mémorisé pour tout le monde" : stopped ? what + ", non mémorisé" + (places.length > 1 ? "s" : "") + " : l'API ne retient pas " + plural2(missing, "équipement") : what + " et mémorisé" + (places.length > 1 ? "s" : ""));
      } else if (outcome.stale) {
        pending.clear();
        retries = replace ? 0 : retries + 1;
        const stopped = retries > MAX_RETRIES;
        if (stopped) retries = 0;
        hooks.note(replace ? "placement recalculé, non mémorisé : le placement mémorisé a changé entre-temps ; replacer à nouveau si besoin" : stopped ? what + ", non mémorisé" + (places.length > 1 ? "s" : "") + " : le placement mémorisé a changé " + MAX_RETRIES + " fois de suite" : what + " sur un placement qui a changé entre-temps : replacé autour du nouveau…");
        accept(outcome.placement, replace || !stopped && !replacing);
      } else {
        hooks.note(what + ", non mémorisé" + (places.length > 1 && !replace ? "s" : "") + " : " + outcome.message + " (renvoyé au prochain dessin)");
      }
    }
    function onPlaced(fresh, replace) {
      if (replace) {
        pending.clear();
        replacing = true;
      }
      fresh.forEach((point, hostname) => pending.set(hostname, { hostname, x: point.x, y: point.y }));
      const what = replace ? "placement recalculé" : placed(fresh.size);
      if (!placer) {
        if (model2.placement) hooks.note(what + " ici, non mémorisé" + (fresh.size > 1 && !replace ? "s" : "") + " (page sans serveur)");
        return;
      }
      queue = queue.then(() => send(replace, what)).catch(() => void 0);
    }
    const replaceTitle = () => "recalcule tout le placement autour des épingles enregistrées ; les déplacements non enregistrés sont oubliés" + (placer ? ", et le nouveau placement remplace celui mémorisé, pour tout le monde" : "");
    return { onPlaced, replaceTitle, needsConfirmation: () => !!placer };
  }
  var placement = { createPlacementHost, MAX_RETRIES };

  // src/shell/main.ts
  var BASE_TABS = [["graph", "Graphe"], ["structures", "Structures"], ["intent", "Intentions"], ["checks", "Contrôles"], ["quality", "Qualité des données"], ["sources", "Sources"]];
  var STATUSES = ["confirmed", "observed_only", "documented_only"];
  var tabsFor = (model2) => model2.diff ? [BASE_TABS[0], ["diff", "Diff"], ...BASE_TABS.slice(1)] : BASE_TABS;
  var byId = (id) => document.getElementById(id);
  function renewCanvas() {
    const svg = byId("canvas");
    const parent = svg.parentNode;
    if (!parent) return;
    const fresh = s("svg", {});
    svg.getAttributeNames().forEach((name) => fresh.setAttribute(name, svg.getAttribute(name)));
    parent.replaceChild(fresh, svg);
  }
  function toggleStatus(graph2, status, st) {
    const hidden = graph2.state.hiddenStatuses;
    if (hidden.has(st)) hidden.delete(st);
    else hidden.add(st);
    status(graph2.render(true));
  }
  function intentChipText(model2) {
    const orphans = model2.orphanPins.length;
    return model2.pinByHost.size + " épingle" + (model2.pinByHost.size > 1 ? "s" : "") + (orphans ? " · " + orphans + " orpheline" + (orphans > 1 ? "s" : "") : "");
  }
  function header(model2, graph2, status, openChecks, openTab) {
    const run2 = model2.source.run, source = model2.source;
    const meta = clear(byId("run-meta"));
    meta.appendChild(h("div", { class: "run-line" }, h("strong", {}, source.infrastructure), " · run ", h("code", {}, source.collector_run_id)));
    meta.appendChild(h(
      "div",
      { class: "run-detail" },
      "collecte du " + run2.start_datetime + (run2.end_datetime ? " au " + run2.end_datetime : "") + " (" + run2.status + ")",
      " · bundle ",
      h("code", {}, source.bundle_sha256.slice(0, 12)),
      " · ",
      h("span", { class: "file" }, model2.origin)
    ));
    if (model2.diff) {
      const before = model2.diff.before;
      meta.appendChild(h("div", { class: "run-diff" }, "comparée à la run ", h("code", {}, before.collector_run_id), " du " + before.start_datetime + " · " + elapsedText(model2.diff.elapsed_seconds)));
    }
    const count = (map, key) => map.get(key) || 0;
    const statusChip = (st) => h("button", {
      type: "button",
      id: "c-" + st,
      class: "chip pill status-" + st,
      "aria-pressed": "true",
      title: "afficher ou masquer ces câbles",
      onclick: () => toggleStatus(graph2, status, st)
    }, count(model2.statusCounts, st) + " " + STATUS_LABEL[st]);
    const severityChip = (sev) => h("button", {
      type: "button",
      id: "c-" + sev,
      class: "chip pill severity-" + sev,
      title: "ouvrir les contrôles " + sev,
      onclick: () => openChecks(sev)
    }, count(model2.severityCounts, sev) + " " + sev);
    const diffChip = () => {
      if (!model2.diff) return null;
      const sum = model2.diff.summary.links;
      return h("span", { class: "chip-group" }, h(
        "button",
        { type: "button", id: "c-diff", class: "chip diff-chip", title: "ouvrir le diff", onclick: () => openTab("diff") },
        "diff · câbles +" + sum.added + " −" + sum.removed + " ~" + sum.changed
      ));
    };
    const intentChip = () => model2.intent ? h("span", { class: "chip-group" }, h("button", { type: "button", id: "c-intent", class: "chip intent-chip", title: "ouvrir les intentions", onclick: () => openTab("intent") }, intentChipText(model2))) : null;
    clear(byId("run-counts")).appendChild(h(
      "div",
      { class: "chips" },
      h("span", { class: "chip-group" }, h("span", { class: "chip" }, model2.nodes.length + " nœuds"), h("span", { class: "chip" }, model2.links.length + " câbles")),
      h("span", { class: "chip-group" }, STATUSES.map(statusChip)),
      h("span", { class: "chip-group" }, ["error", "warning", "info"].map(severityChip)),
      diffChip(),
      intentChip()
    ));
  }
  function toolbar(model2, graph2, status, placements) {
    const stubs = model2.kindCounts.get("stub") || 0;
    const redraw = { showStubs: () => graph2.render(false), showPorts: () => (graph2.repaint(), null), showDiff: () => graph2.render(true) };
    const toggle = (id, label2, key) => h(
      "label",
      { class: "check-field" },
      h("input", { id, type: "checkbox", checked: graph2.state[key] || null, onchange: (e) => {
        graph2.state[key] = e.target.checked;
        status(redraw[key]());
      } }),
      label2
    );
    clear(byId("graph-toolbar")).appendChild(h(
      "div",
      { class: "toolbar-row" },
      toggle("t-stubs", "voisins inconnus (" + stubs + ")", "showStubs"),
      toggle("t-ports", "noms des ports", "showPorts"),
      model2.diff ? toggle("t-diff", "changements (" + model2.diffCount + ")", "showDiff") : null,
      h("input", {
        id: "t-search",
        type: "search",
        placeholder: "chercher un équipement",
        "aria-label": "chercher un équipement",
        oninput: (e) => {
          graph2.state.query = e.target.value;
          graph2.repaint();
        }
      }),
      h("button", { type: "button", onclick: () => graph2.fit() }, "recentrer"),
      h("button", { type: "button", id: "t-legend", "aria-pressed": "true", title: "afficher ou masquer la légende", onclick: (e) => {
        const legend2 = byId("graph-legend");
        legend2.hidden = !legend2.hidden;
        e.target.setAttribute("aria-pressed", legend2.hidden ? "false" : "true");
      } }, "légende"),
      // « Replacer » renouvelle le placement mémorisé : dans une page servie, c'est pour tout le monde, donc confirmé.
      placements.needsConfirmation() ? confirmable("replacer", () => status(graph2.replaceAll()), { title: placements.replaceTitle() }) : h("button", { type: "button", title: placements.replaceTitle(), onclick: () => status(graph2.replaceAll()) }, "replacer"),
      h("span", { class: "muted", id: "graph-status" })
    ));
  }
  function legend(model2, graph2, status) {
    const item = (st) => h("button", {
      type: "button",
      id: "l-" + st,
      class: "legend-item status-" + st,
      "aria-pressed": "true",
      title: "afficher ou masquer ces câbles",
      onclick: () => toggleStatus(graph2, status, st)
    }, h("span", { class: "swatch" }), STATUS_LABEL[st]);
    const span = (cls) => h("span", { class: cls });
    const note = (swatch, text, title) => h("span", { class: "legend-note", title: title || null }, swatch, text);
    const group = (name, ...items) => h("span", { class: "legend-group" }, h("span", { class: "group-name" }, name), items);
    const icon = (type) => s("svg", { class: "legend-icon", viewBox: "0 0 16 16", "aria-hidden": "true" }, s("path", { d: path(type) }));
    clear(byId("graph-legend")).appendChild(h(
      "div",
      { class: "legend-row" },
      group("câbles", STATUSES.map(item), note(span("swatch down"), "down (estompé)")),
      group("contrôles", note(span("dot severity-warning"), "warning"), note(span("dot severity-error"), "error")),
      group(
        "structures",
        note(span("band"), "faisceau"),
        note(span("band degraded"), "dégradé"),
        note(span("frame"), "cluster HA"),
        note(span("halo"), "heartbeat"),
        note(span("role-swatch lead"), "forwarde", "rôle HA active, ou primary en active_passive"),
        note(span("role-swatch follow"), "en attente", "rôle HA standby, ou secondary en active_passive")
      ),
      group(
        "équipements",
        note(span("box external"), "autre infra"),
        note(span("box unreachable"), "injoignable"),
        note(span("box partial"), "collecte partielle"),
        note(span("box not_collected"), "non collecté"),
        note(span("box stub"), "voisin inconnu")
      ),
      group("types", TYPES.map((type) => note(icon(type), LABEL[type]))),
      model2.diff ? group(
        "changements",
        note(span("swatch diff-added"), "ajouté"),
        note(span("swatch diff-changed"), "changé"),
        note(span("swatch diff-removed"), "retiré (fantôme)", "tel qu'il était dans la run d'avant")
      ) : null
    ));
  }
  function mountTabs(list, activate, model2) {
    const counts = { diff: model2.diffCount, structures: model2.aggregates.length, intent: model2.pinByHost.size, checks: model2.checks.length, sources: model2.links.length };
    const bar = clear(byId("tabs"));
    list.forEach(([id, label2]) => bar.appendChild(h("button", {
      type: "button",
      role: "tab",
      id: "tab-" + id,
      "aria-selected": "false",
      "aria-controls": "view-" + id,
      onclick: () => activate(id)
    }, label2, id in counts ? h("span", { class: "tab-count", id: "count-" + id }, " · " + counts[id]) : null)));
  }
  function readHash() {
    const wanted = /* @__PURE__ */ new Map();
    if (typeof location === "undefined" || !location.hash) return wanted;
    for (const part of location.hash.slice(1).split("&")) {
      const cut = part.indexOf("=");
      if (cut <= 0) continue;
      try {
        wanted.set(part.slice(0, cut), decodeURIComponent(part.slice(cut + 1)));
      } catch (error) {
        continue;
      }
    }
    return wanted;
  }
  function writeHash(view, graph2, model2) {
    if (typeof history === "undefined" || typeof location === "undefined") return;
    const parts = ["view=" + view];
    if (graph2.state.showStubs) parts.push("stubs=1");
    if (graph2.state.showPorts) parts.push("ports=1");
    if (model2.diff && !graph2.state.showDiff) parts.push("diff=0");
    const token = tokenOf(model2, graph2.state.selection);
    if (token) parts.push(token[0] + "=" + encodeURIComponent(token[1]));
    history.replaceState(null, "", "#" + parts.join("&"));
  }
  var VIEWS = {
    diff: tables.diffView,
    structures: tables.structuresView,
    quality: tables.qualityView,
    sources: tables.sourcesView
  };
  function boot(data2, options = {}) {
    const model2 = build(data2);
    const tabs = tabsFor(model2);
    const inspector = byId("inspector");
    const writer = options.writer || null;
    const placer = options.placer || null;
    let graph2 = null;
    let view = "graph";
    let note = "";
    let checks = null;
    let disposed = false;
    const built = /* @__PURE__ */ new Set();
    const g = () => graph2;
    const openChecks = (severity) => {
      activate("checks");
      if (checks) checks.setSeverity(severity);
    };
    const activate = (id) => {
      view = id;
      if (graph2) writeHash(view, g(), model2);
      tabs.forEach(([tab]) => {
        byId("view-" + tab).hidden = tab !== id;
        byId("tab-" + tab).setAttribute("aria-selected", tab === id ? "true" : "false");
      });
      if (id !== "graph" && !built.has(id)) {
        built.add(id);
        if (id === "intent") intents.view();
        else if (id === "checks") checks = tables.checksView(byId("view-checks"), model2, openInGraph);
        else VIEWS[id](byId("view-" + id), model2, openInGraph);
      }
    };
    const openInGraph = (selection) => {
      activate("graph");
      g().reveal(selection);
      status();
    };
    const onSelect = (selection) => {
      show(inspector, model2, selection, (next) => {
        g().reveal(next);
        status();
      }, (hostname) => intents.pinBlock(hostname));
      const live = document.getElementById("live");
      if (live) live.textContent = describe(model2, selection);
      if (graph2) writeHash(view, g(), model2);
    };
    const refreshPage = () => {
      if (disposed) return;
      const count = document.getElementById("count-intent");
      if (count) count.textContent = " · " + model2.pinByHost.size;
      const chip = document.getElementById("c-intent");
      if (chip) chip.textContent = intentChipText(model2);
      else if (model2.intent) header(model2, g(), status, openChecks, activate);
      if (g().state.selection && g().state.selection?.kind === "node") onSelect(g().state.selection);
      status();
    };
    const intents = createIntentHost(model2, writer, {
      graph: g,
      openInGraph,
      refreshPage,
      note: (text) => {
        note = text;
        status();
      },
      mounted: () => built.has("intent"),
      container: () => byId("view-intent")
    });
    const drawn = () => {
      const nodes = Array.from(g().state.nodeEls.keys(), (host) => model2.nodeByHost.get(host)).filter((n) => !!n);
      const links = Array.from(g().state.linkEls.keys(), (id) => model2.linkById.get(id)).filter((l) => !!l);
      return {
        nodes: nodes.filter((n) => !n.ghost).length,
        links: links.filter((l) => !l.ghost).length,
        ghosts: nodes.filter((n) => n.ghost).length + links.filter((l) => l.ghost).length
      };
    };
    const ghostText = (shownGhosts) => {
      const parts = [
        model2.ghostNodes.length ? model2.ghostNodes.length + " équipement" + (model2.ghostNodes.length > 1 ? "s" : "") : null,
        model2.ghostLinks.length ? model2.ghostLinks.length + " câble" + (model2.ghostLinks.length > 1 ? "s" : "") : null
      ].filter(Boolean);
      const masked = model2.ghostNodes.length + model2.ghostLinks.length - shownGhosts;
      return "retirés depuis la run d'avant : " + parts.join(" et ") + " en fantômes" + (masked ? ", dont " + masked + " masqué" + (masked > 1 ? "s" : "") + " par le filtre des voisins inconnus" : "");
    };
    const status = () => {
      if (disposed) return;
      const shown = drawn();
      const total2 = { nodes: model2.nodes.length, links: model2.links.length };
      const hidden = [];
      const stubs = total2.nodes - shown.nodes;
      if (stubs > 0) hidden.push(stubs + (stubs > 1 ? " voisins inconnus masqués" : " voisin inconnu masqué"));
      if (g().state.hiddenStatuses.size) hidden.push("statuts masqués : " + Array.from(g().state.hiddenStatuses).map((st) => STATUS_LABEL[st]).join(", "));
      if (model2.diff && !g().state.showDiff) hidden.push("changements masqués");
      if (g().state.showDiff && model2.ghostNodes.length + model2.ghostLinks.length) hidden.push(ghostText(shown.ghosts));
      byId("graph-status").textContent = shown.nodes + " nœuds sur " + total2.nodes + " et " + shown.links + " câbles sur " + total2.links + " affichés" + (hidden.length ? " · " + hidden.join(" · ") : "") + (note ? " · " + note : "");
      const box = document.getElementById("t-stubs");
      if (box) box.checked = g().state.showStubs;
      const diffBox = document.getElementById("t-diff");
      if (diffBox) diffBox.checked = g().state.showDiff;
      STATUSES.forEach((st) => ["l-", "c-"].forEach((prefix) => {
        const el = document.getElementById(prefix + st);
        if (el) el.setAttribute("aria-pressed", g().state.hiddenStatuses.has(st) ? "false" : "true");
      }));
      const ports = document.getElementById("t-ports");
      if (ports) ports.checked = g().state.showPorts;
      writeHash(view, g(), model2);
    };
    const placements = createPlacementHost(model2, placer, { graph: g, note: (text) => {
      note = text;
      status();
    } });
    graph2 = create2(byId("canvas"), model2, onSelect, { onPin: intents.onPin, onPlaced: placements.onPlaced });
    header(model2, graph2, status, openChecks, activate);
    mountTabs(tabs, activate, model2);
    toolbar(model2, graph2, status, placements);
    legend(model2, graph2, status);
    if (typeof matchMedia === "function" && matchMedia("(max-width: 1199px)").matches) {
      byId("graph-legend").hidden = true;
      byId("t-legend").setAttribute("aria-pressed", "false");
    }
    const applyHash = (first) => {
      const wanted = readHash();
      const stubs = wanted.get("stubs") === "1";
      const diffShown = wanted.get("diff") !== "0";
      const redraw = first || stubs !== g().state.showStubs || diffShown !== g().state.showDiff;
      g().state.showStubs = stubs;
      g().state.showDiff = diffShown;
      g().state.showPorts = wanted.get("ports") === "1";
      if (redraw) g().render(!first);
      const kind = SELECTION_KINDS.find((name) => wanted.has(name) && selectionFromToken(model2, name, wanted.get(name)));
      if (kind) g().reveal(selectionFromToken(model2, kind, wanted.get(kind)));
      else g().select(null);
      const wantedView = wanted.get("view");
      activate(wantedView !== void 0 && tabs.some(([id]) => id === wantedView) ? wantedView : "graph");
      g().repaint();
      status();
    };
    applyHash(true);
    const onHashChange = () => {
      if (!disposed) applyHash(false);
    };
    if (typeof window !== "undefined") window.addEventListener("hashchange", onHashChange);
    const dispose = () => {
      disposed = true;
      if (typeof window !== "undefined") window.removeEventListener("hashchange", onHashChange);
      renewCanvas();
    };
    return { model: model2, graph: graph2, activate, applyHash, writer, placer, dispose };
  }
  function startPage(data2) {
    if (typeof document === "undefined") return;
    try {
      apps.app = boot(data2);
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + error.message));
      throw error;
    }
  }

  // src/shell/timeline.ts
  var indexOf = (runs, runId) => runs.findIndex((run2) => run2.run_id === runId);
  var previousOf = (runs, runId) => {
    const at = indexOf(runs, runId);
    return at > 0 ? runs[at - 1] : null;
  };
  var nextOf = (runs, runId) => {
    const at = indexOf(runs, runId);
    return at >= 0 && at + 1 < runs.length ? runs[at + 1] : null;
  };
  var previousId = (runs, runId) => {
    const run2 = previousOf(runs, runId);
    return run2 ? run2.run_id : "";
  };
  var label = (run2) => run2.run_start.replace("T", " ").slice(0, 16);
  var pendingFocus = false;
  function render(container, host) {
    const { runs, current, from, busy } = host;
    const at = indexOf(runs, current);
    const prev = previousOf(runs, current), next = nextOf(runs, current);
    const go = (run2, fromId) => {
      if (run2 && !busy) host.open(run2.run_id, fromId);
    };
    const stepButton = (text, run2, fromId, title) => h("button", { type: "button", class: "timeline-step", title, "aria-label": title, disabled: !run2 || busy || null, onclick: () => go(run2, fromId) }, text);
    const runButton = (run2) => h("button", {
      type: "button",
      class: "timeline-run run-" + run2.run_status + (run2.run_id === from ? " compared" : ""),
      "data-run": run2.run_id,
      "aria-current": run2.run_id === current ? "true" : null,
      disabled: busy || null,
      title: "run " + run2.run_id + " · " + run2.run_status + " · ingérée le " + run2.stored_at + (run2.run_id === from ? " · run comparée" : ""),
      onclick: () => {
        if (run2.run_id !== current) go(run2, previousId(runs, run2.run_id));
      }
    }, label(run2));
    const buttons = runs.map(runButton);
    const option = (run2) => h(
      "option",
      { value: run2.run_id, selected: run2.run_id === from || null },
      label(run2) + (run2.run_id === previousId(runs, current) ? " (précédente)" : "")
    );
    const compare = h(
      "select",
      {
        id: "timeline-compare",
        "aria-label": "comparer à une run antérieure",
        disabled: busy || at <= 0 || null,
        onchange: (event) => host.open(current, event.target.value)
      },
      h("option", { value: "", selected: from === "" || null }, "aucune"),
      runs.slice(0, Math.max(at, 0)).map(option)
    );
    const keys = (event) => {
      const key = event.key;
      if (key === "ArrowLeft") {
        event.preventDefault();
        go(prev, prev ? previousId(runs, prev.run_id) : "");
      } else if (key === "ArrowRight") {
        event.preventDefault();
        go(next, current);
      }
    };
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && typeof container.contains === "function" && container.contains(active)) pendingFocus = true;
    clear(container).appendChild(h(
      "div",
      { class: "timeline-row", onkeydown: keys },
      stepButton("←", prev, prev ? previousId(runs, prev.run_id) : "", "run précédente"),
      h("ol", { class: "timeline-runs" }, buttons.map((button) => h("li", {}, button))),
      stepButton("→", next, current, "run suivante"),
      h("label", { class: "timeline-compare" }, "comparer à ", compare),
      h("span", { class: "muted timeline-count" }, busy ? "chargement…" : (at >= 0 ? at + 1 + " sur " : "") + runs.length + (runs.length > 1 ? " runs" : " run"))
    ));
    container.hidden = false;
    const shown = at >= 0 ? buttons[at] : null;
    if (!shown) return;
    if (typeof shown.scrollIntoView === "function") shown.scrollIntoView({ inline: "center", block: "nearest" });
    if (pendingFocus && !busy && typeof shown.focus === "function") {
      pendingFocus = false;
      shown.focus();
    }
  }
  var timeline = { render, indexOf, previousOf, nextOf, label };

  // src/shell/shell.ts
  var TOKEN_KEY = "ld-api-token";
  var AUTHOR_KEY = "ld-author";
  var ROUTES = { runs: "/api/ingest/bundles", snapshot: "/api/snapshot", report: "/api/ingest/report", diff: "/api/diff", intent: "/api/intent", patches: "/api/intent/patches", placement: "/api/placement" };
  function storage() {
    try {
      return globalThis.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }
  function readToken() {
    try {
      const store = storage();
      return store && store.getItem(TOKEN_KEY) || "";
    } catch (error) {
      return "";
    }
  }
  function writeToken(token) {
    try {
      const store = storage();
      if (store) {
        if (token) store.setItem(TOKEN_KEY, token);
        else store.removeItem(TOKEN_KEY);
      }
    } catch (error) {
    }
  }
  function readAuthor() {
    try {
      return globalThis.localStorage && globalThis.localStorage.getItem(AUTHOR_KEY) || "";
    } catch (error) {
      return "";
    }
  }
  function writeAuthor(name) {
    try {
      const store = globalThis.localStorage;
      if (store) {
        if (name) store.setItem(AUTHOR_KEY, name);
        else store.removeItem(AUTHOR_KEY);
      }
    } catch (error) {
    }
  }
  var query = (name) => new URLSearchParams(location.search).get(name) || "";
  var withParams = (route, params) => route + "?" + new URLSearchParams(params).toString();
  async function call(route, params, token, payload) {
    const init = { headers: { Authorization: "Bearer " + token }, credentials: "omit" };
    if (payload !== void 0) Object.assign(init, { method: "POST", headers: { ...init.headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const response = await fetch(withParams(route, params), init);
    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      body = null;
    }
    return { status: response.status, body };
  }
  var isRecord = (value) => !!value && typeof value === "object";
  function explain(status, body) {
    if (status === 401) return "jeton refusé par l'API";
    const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : "";
    if (status === 404) return detail || "run inconnue pour cette infrastructure";
    return "l'API répond " + status + (detail ? " : " + detail : "");
  }
  function create3(root, data2) {
    const state = { token: readToken(), author: readAuthor(), infrastructure: query("infrastructure"), runId: query("run_id"), from: query("from"), runs: null, message: null, busy: false, pending: null };
    const fields = {};
    const input = (id, label2, type, value, placeholder, maxlength) => h(
      "label",
      { class: "field" },
      label2,
      fields[id] = h("input", { id, type, value, placeholder: placeholder || null, autocomplete: type === "password" ? "off" : null, spellcheck: "false", maxlength: maxlength || null })
    );
    function runsTable() {
      const runs = state.runs;
      if (!runs) return null;
      const compare = (run2, index) => index === 0 ? "—" : h("button", { type: "button", class: "linklike", onclick: (event) => {
        event.stopPropagation();
        state.runId = run2.run_id;
        state.from = runs[index - 1].run_id;
        state.pending = open();
      } }, "avec la précédente");
      return [
        h("h3", {}, "Runs archivées de " + state.infrastructure + " : " + runs.length),
        table(
          ["run", "début de collecte", "statut", "ingérée le", "comparer"],
          runs.map((run2, index) => ({
            onclick: () => {
              state.runId = run2.run_id;
              state.from = "";
              state.pending = open();
            },
            cells: [h("code", {}, run2.run_id), run2.run_start, pill("run", run2.run_status, run2.run_status), run2.stored_at, compare(run2, index)]
          })),
          { empty: "aucune run archivée pour cette infrastructure" }
        )
      ];
    }
    function siblings(hidden) {
      const parent = root.parentNode;
      (parent ? Array.from(parent.childNodes) : []).forEach((node) => {
        const el = node;
        const id = el.getAttribute ? el.getAttribute("id") : null;
        if (node !== root && id && id.startsWith("view-")) el.hidden = hidden;
      });
    }
    function timeline2() {
      const container = document.getElementById("timeline");
      if (!container) return;
      if (!state.runs || !apps.app) {
        container.hidden = true;
        return;
      }
      render(container, {
        runs: state.runs,
        current: state.runId,
        from: state.from,
        busy: state.busy,
        open: (runId, from) => {
          state.runId = runId;
          state.from = from;
          state.pending = open();
        }
      });
    }
    function render2() {
      root.hidden = false;
      siblings(true);
      const strip = document.getElementById("timeline");
      if (strip) strip.hidden = true;
      clear(root).appendChild(h(
        "div",
        { class: "page" },
        h("h2", {}, "Lire une run archivée"),
        h("p", { class: "lead" }, "Cette page lit le snapshot par l'API du backend. Le jeton d'API (LD_API_TOKEN) se saisit ici : il reste dans cet onglet et n'entre jamais dans l'adresse. L'adresse, elle, se partage : elle porte l'infrastructure, la run et l'état de vue."),
        h(
          "form",
          { class: "shell-form", onsubmit: (event) => {
            event.preventDefault();
            submit();
          } },
          input("s-token", "jeton d'API", "password", state.token),
          input("s-author", "votre nom (écrit sur les épingles que vous posez ; vide = déplacements locaux seulement)", "text", state.author, "prénom, trigramme…", 80),
          input("s-infrastructure", "infrastructure", "text", state.infrastructure, "libellé de devices[].infrastructure"),
          input("s-run", "run (collector_run_id, vide = lister les runs)", "text", state.runId),
          input("s-from", "comparer à la run d'avant (collector_run_id, optionnel : la page embarque alors le diff)", "text", state.from),
          h(
            "div",
            { class: "toolbar-row" },
            h("button", { type: "submit", disabled: state.busy || null }, state.busy ? "chargement…" : "ouvrir"),
            h("button", { type: "button", onclick: () => {
              state.token = "";
              writeToken("");
              state.message = "jeton oublié";
              render2();
            } }, "oublier le jeton")
          )
        ),
        state.message ? h("p", { class: "shell-message" }, state.message) : null,
        runsTable()
      ));
    }
    function readForm() {
      state.token = fields["s-token"].value.trim();
      state.author = fields["s-author"].value.trim();
      writeAuthor(state.author);
      state.infrastructure = fields["s-infrastructure"].value.trim();
      state.runId = fields["s-run"].value.trim();
      state.from = fields["s-from"].value.trim();
      writeToken(state.token);
    }
    function submit() {
      readForm();
      if (!state.token || !state.infrastructure) {
        state.message = "le jeton et l'infrastructure sont nécessaires";
        render2();
        return;
      }
      state.pending = state.runId ? open() : list();
    }
    async function list() {
      state.busy = true;
      state.message = null;
      state.runs = null;
      render2();
      const found = await call(ROUTES.runs, { infrastructure: state.infrastructure }, state.token);
      state.busy = false;
      if (found.status === 200 && isRecord(found.body) && Array.isArray(found.body.runs)) state.runs = found.body.runs;
      else failed(found);
      render2();
    }
    function failed(response) {
      state.message = explain(response.status, response.body);
      if (response.status === 401) {
        state.token = "";
        writeToken("");
      }
    }
    function writer() {
      let queue = Promise.resolve();
      const send = async (ops) => {
        if (!me.author) return { ok: false, message: "donnez votre nom dans l'onglet Intentions" };
        try {
          const done = await call(ROUTES.patches, { infrastructure: state.infrastructure }, state.token, { author: me.author, ops });
          if (done.status === 200 && isRecord(done.body)) return { ok: true, intent: done.body };
          return { ok: false, message: explain(done.status, done.body) };
        } catch (error) {
          return { ok: false, message: "l'API ne répond pas" };
        }
      };
      const me = {
        author: state.author,
        setAuthor: (name) => {
          state.author = name;
          me.author = name;
          writeAuthor(name);
        },
        save: (ops) => {
          const turn = queue.then(() => send(ops));
          queue = turn.catch(() => void 0);
          return turn;
        }
      };
      return me;
    }
    function placer() {
      const send = async (write) => {
        try {
          const done = await call(ROUTES.placement, { infrastructure: state.infrastructure }, state.token, write);
          if (done.status === 200 && isRecord(done.body)) return { ok: true, placement: done.body };
          if (done.status === 409 && isRecord(done.body)) return { ok: false, stale: true, placement: done.body };
          return { ok: false, message: explain(done.status, done.body) };
        } catch (error) {
          return { ok: false, message: "l'API ne répond pas" };
        }
      };
      return { save: send };
    }
    async function open() {
      state.busy = true;
      state.message = null;
      if (apps.app) timeline2();
      else render2();
      const params = { infrastructure: state.infrastructure, run_id: state.runId };
      const infra = { infrastructure: state.infrastructure };
      const diffParams = { infrastructure: state.infrastructure, from: state.from, to: state.runId };
      const [snapshot, report, diff, intent2, placement2, runs] = await Promise.all([
        call(ROUTES.snapshot, params, state.token),
        call(ROUTES.report, params, state.token),
        state.from ? call(ROUTES.diff, diffParams, state.token) : Promise.resolve(null),
        call(ROUTES.intent, infra, state.token),
        call(ROUTES.placement, infra, state.token),
        call(ROUTES.runs, infra, state.token)
      ]);
      state.busy = false;
      if (snapshot.status !== 200 || !isRecord(snapshot.body)) {
        failed(snapshot);
        render2();
        return;
      }
      data2.snapshot = snapshot.body;
      const reportBody = report.status === 200 && isRecord(report.body) ? report.body : null;
      data2.ingest = reportBody ? { summary: reportBody.summary, findings: reportBody.findings || [] } : null;
      data2.origin = "api · " + state.infrastructure + " · " + state.runId;
      delete data2.diff;
      if (diff) {
        if (diff.status === 200 && isRecord(diff.body)) data2.diff = diff.body;
        else data2.origin += " · diff indisponible : " + explain(diff.status, diff.body);
      }
      delete data2.intent;
      if (intent2.status === 200 && isRecord(intent2.body)) data2.intent = intent2.body;
      else data2.origin += " · intention indisponible : " + explain(intent2.status, intent2.body);
      delete data2.placement;
      let remembered = false;
      if (placement2.status === 200 && isRecord(placement2.body)) {
        data2.placement = placement2.body;
        remembered = true;
      } else data2.origin += " · placement mémorisé indisponible : " + explain(placement2.status, placement2.body);
      if (runs.status === 200 && isRecord(runs.body) && Array.isArray(runs.body.runs)) state.runs = runs.body.runs;
      else {
        state.runs = null;
        data2.origin += " · liste des runs indisponible : " + explain(runs.status, runs.body);
      }
      root.hidden = true;
      clear(root);
      siblings(false);
      const address = state.from ? { ...params, from: state.from } : params;
      if (typeof history !== "undefined") history.replaceState(null, "", "?" + new URLSearchParams(address).toString() + (location.hash || ""));
      if (apps.app) apps.app.dispose();
      apps.app = boot(data2, { writer: writer(), placer: remembered ? placer() : null });
      timeline2();
    }
    if (state.token && state.infrastructure && state.runId) state.pending = open();
    else render2();
    return { state, render: render2, submit, open, list };
  }
  function startShell(data2) {
    const root = typeof document === "undefined" ? null : document.getElementById("view-shell");
    if (!root) return;
    try {
      apps.shellApp = create3(root, data2);
    } catch (error) {
      document.body.appendChild(h("p", { class: "fatal" }, "La page n'a pas pu démarrer : " + error.message));
      throw error;
    }
  }
  var shell = { create: create3, explain, TOKEN_KEY, AUTHOR_KEY };

  // src/index.ts
  var LD = Object.assign(apps, { model, layout, geometry, dom: { ...dom, ...format, ...widgets }, icons, tip, graph, inspect, intent, placement, structures, tables, timeline, boot, shell });
  globalThis.LD = LD;
  function embedded() {
    if (typeof document === "undefined") return null;
    const block = document.getElementById("ld-data");
    if (!block) return null;
    try {
      return JSON.parse(block.textContent || "");
    } catch (error) {
      document.body.appendChild(dom.h("p", { class: "fatal" }, "La page n'a pas pu s'afficher : " + error.message));
      throw error;
    }
  }
  var data = embedded();
  if (data) {
    if (data.snapshot) startPage(data);
    else startShell(data);
  }
})();
