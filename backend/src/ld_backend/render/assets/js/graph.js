// Le graphe : un nœud par équipement, un tracé par câble (deux câbles entre les mêmes équipements restent deux
// tracés), coloré par statut ; sous les câbles, une bande par faisceau d'agrégat et un cadre par cluster HA.
// Rien n'est déduit ici : ce qui est dessiné est dans le snapshot.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { s, clear } = LD.dom;
  const TYPE_TAG = { switch: "SW", router: "RT", firewall: "FW", load_balancer: "LB", wireless_controller: "WLC", server: "SRV", other: "·" };
  const NODE_W = 46, NODE_H = 30, STUB_R = 8, FAN = 14, FAN_MAX = 110, CLICK_SLOP = 4, HULL_PAD = 40, CHAR_W = 6.6, BAND = 18, HIT_MARGIN = 8;

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

  // L'étiquette d'un faisceau : ses deux agrégats, puis ce qu'il est (peer-link, MLAG n). Sur le graphe, la forme
  // courte ne garde que la nature ; les noms apparaissent avec ceux des ports, ou quand le faisceau est éclairé.
  function beamLabel(beam, full) {
    const parts = full === false ? [] : [beam.a.aggregate + " ⇄ " + beam.b.aggregate];
    if (beam.peerLink) parts.push("peer-link");
    beam.mlags.forEach((domain) => parts.push("MLAG " + domain.raw.mlag_id));
    return parts.join(" · ");
  }

  function clusterLabel(cluster) {
    return "HA · " + (cluster.raw.cluster_name || cluster.hosts.join(" + ")) + " · " + cluster.raw.mode;
  }

  function nodeShape(node) {
    if (node.kind === "stub") return s("circle", { class: "node-shape", r: STUB_R });
    return s("rect", { class: "node-shape", x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 6 });
  }

  function create(svg, model, onSelect) {
    const state = { showStubs: false, showPorts: false, hiddenStatuses: new Set(), query: "", pinned: new Map(),
      positions: new Map(), view: { k: 1, tx: 0, ty: 0 }, selection: null, nodeEls: new Map(), linkEls: new Map(), beamEls: new Map(), clusterEls: new Map() };
    const viewport = s("g", { class: "viewport" });
    const clusterLayer = s("g", { class: "clusters" });
    const beamLayer = s("g", { class: "beams" });
    const linkLayer = s("g", { class: "links" });
    const labelLayer = s("g", { class: "beam-labels" }); // au-dessus des câbles : l'étiquette reste lisible et cliquable
    const nodeLayer = s("g", { class: "nodes" });
    [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach((layer) => viewport.appendChild(layer));
    clear(svg).appendChild(viewport);

    const visibleNodes = () => model.nodes.filter((n) => state.showStubs || n.kind !== "stub");
    const applyView = () => viewport.setAttribute("transform", `translate(${state.view.tx},${state.view.ty}) scale(${state.view.k})`);

    function visibleLinks(shown) {
      return model.links.filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !state.hiddenStatuses.has(l.status));
    }
    // Un faisceau se dessine entre deux équipements distincts, dès qu'un de ses câbles est visible.
    function visibleBeams(shown, links) {
      const visible = new Set(links.map((l) => l.id));
      return model.beams.filter((b) => b.a.hostname !== b.b.hostname && shown.has(b.a.hostname) && shown.has(b.b.hostname) && b.links.some((l) => visible.has(l.id)));
    }
    const visibleClusters = (shown) => model.clusters.filter((c) => c.hosts.filter((h) => shown.has(h)).length >= 2);

    function fit() {
      const box = LD.layout.bounds(state.positions);
      const rect = svg.getBoundingClientRect();
      const width = rect.width || 900, height = rect.height || 600, margin = 70;
      const k = Math.min((width - 2 * margin) / box.width, (height - 2 * margin) / box.height, 1.6);
      state.view = { k: Math.max(k, 0.05), tx: 0, ty: 0 };
      state.view.tx = width / 2 - (box.x + box.width / 2) * state.view.k;
      state.view.ty = height / 2 - (box.y + box.height / 2) * state.view.k;
      applyView();
    }

    function placeLink(link, els) {
      const p = state.positions.get(link.a.hostname), q = state.positions.get(link.b.hostname);
      const shape = curve(p, q, link);
      [els.line, els.hit, els.halo].forEach((el) => { if (el) el.setAttribute("d", shape.path); });
      if (els.mark) { els.mark.setAttribute("cx", shape.mid.x); els.mark.setAttribute("cy", shape.mid.y); }
      els.ports.forEach((text, i) => {
        text.setAttribute("x", shape.ends[i].x);
        text.setAttribute("y", shape.ends[i].y);
        text.setAttribute("text-anchor", shape.anchor || "middle");
      });
    }

    function drawLink(link) {
      const halo = link.heartbeat ? s("path", { class: "link-halo" }) : null; // heartbeat HA : un halo sous le tracé
      const line = s("path", { class: "link-line" });
      const hit = s("path", { class: "link-hit" });
      const mark = link.worst === "error" || link.worst === "warning" ? s("circle", { class: "link-mark severity-" + link.worst, r: 4.5 }) : null;
      const ports = [link.a.interface, link.b.interface].map((name) => s("text", { class: "port-label" }, name));
      const group = s("g", { class: `link status-${link.status}${link.raw.oper === "down" ? " oper-down" : ""}${link.pairCount > 2 ? " crowded" : ""}${link.heartbeat ? " heartbeat" : ""}` },
        s("title", {}, `${LD.model.endLabel(link.a)} ↔ ${LD.model.endLabel(link.b)} · ${LD.dom.STATUS_LABEL[link.status]} · ${link.combo}`),
        halo, line, hit, mark, ports);
      hit.setAttribute("data-link", String(link.index)); // le clic est lu au relâchement, sur la cible de l'appui
      const els = { group, line, hit, halo, mark, ports };
      state.linkEls.set(link.id, els);
      placeLink(link, els);
      return group;
    }

    // L'étiquette suit l'axe du faisceau, au-delà de l'éventail des câbles, du côté du haut de l'écran ; elle porte sa
    // propre zone de clic, au-dessus des câbles : cliquer le nom d'un faisceau l'ouvre toujours.
    function placeBeam(beam, els) {
      const p = state.positions.get(beam.a.hostname), q = state.positions.get(beam.b.hostname);
      const path = `M${p.x},${p.y} L${q.x},${q.y}`;
      els.band.setAttribute("d", path);
      els.hit.setAttribute("d", path);
      const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      const side = -dy / length < 0 ? -1 : 1; // la normale qui pointe vers le haut de l'écran
      const away = els.widths.band / 2 + 8;
      const x = (p.x + q.x) / 2 + (-dy / length) * side * away, y = (p.y + q.y) / 2 + (dx / length) * side * away;
      const text = els.label.textContent || "";
      const width = CHAR_W * 0.95 * text.length + 10;
      els.label.setAttribute("x", x);
      els.label.setAttribute("y", y);
      els.labelHit.setAttribute("x", x - width / 2);
      els.labelHit.setAttribute("y", y - 10);
      els.labelHit.setAttribute("width", width);
      els.labelHit.setAttribute("height", 14);
      els.tag.setAttribute("transform", `rotate(${angle.toFixed(2)} ${x} ${y})`);
      els.tag.setAttribute("visibility", text ? "visible" : "hidden");
    }

    function drawBeam(beam) {
      const widths = beamWidths(beam);
      const band = s("path", { class: "beam-band", "stroke-width": widths.band });
      const hit = s("path", { class: "beam-hit", "stroke-width": widths.hit });
      const label = s("text", { class: "beam-label" }, beamLabel(beam, false));
      const labelHit = s("rect", { class: "beam-label-hit" });
      const tag = s("g", { class: "beam-tag" }, labelHit, label);
      const classes = `beam${beam.peerLink ? " peer-link" : ""}${beam.degraded ? " degraded" : ""}${beam.mlags.length ? " mlag" : ""}`;
      const group = s("g", { class: classes },
        s("title", {}, `faisceau ${LD.model.endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate })} ⇄ ${LD.model.endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate })} · ${beam.links.length} câble(s)`),
        band, hit);
      hit.setAttribute("data-beam", String(beam.index));
      labelHit.setAttribute("data-beam", String(beam.index));
      const els = { group, band, hit, label, labelHit, tag, widths };
      state.beamEls.set(beam.id, els);
      labelLayer.appendChild(tag);
      placeBeam(beam, els);
      return group;
    }

    function placeCluster(cluster, els) {
      const points = cluster.hosts.map((h) => state.positions.get(h)).filter(Boolean);
      const box = hull(points, Math.max(...cluster.hosts.map((h) => h.length)));
      ["x", "y", "width", "height"].forEach((name) => els.rect.setAttribute(name, box[name]));
      els.label.setAttribute("x", box.x + 10);
      els.label.setAttribute("y", box.y + 15);
    }

    function drawCluster(cluster) {
      const rect = s("rect", { class: "cluster-hull", rx: 12 });
      const label = s("text", { class: "cluster-label" }, clusterLabel(cluster));
      const group = s("g", { class: "cluster" }, s("title", {}, clusterLabel(cluster)), rect, label);
      rect.setAttribute("data-cluster", String(cluster.index));
      const els = { group, rect, label };
      state.clusterEls.set(cluster.id, els);
      placeCluster(cluster, els);
      return group;
    }

    function drawNode(node) {
      const checks = model.checksByNode.get(node.hostname) || [];
      const worst = LD.model.worst(checks);
      const group = s("g", { class: `node kind-${node.kind} collection-${node.collection || "none"}`, tabindex: 0 },
        s("title", {}, `${node.hostname} · ${LD.dom.KIND_LABEL[node.kind]}${node.collection ? " · collecte : " + node.collection : ""}`),
        nodeShape(node),
        node.kind === "stub" ? null : s("text", { class: "node-tag", y: 4 }, TYPE_TAG[node.type] || "?"),
        s("text", { class: "node-label", y: node.kind === "stub" ? 22 : 30 }, node.hostname),
        node.stack ? s("text", { class: "node-stack", x: NODE_W / 2 + 4, y: 4 }, "×" + node.stack.member_count) : null,
        worst === "error" || worst === "warning" ? s("circle", { class: "node-badge severity-" + worst, cx: NODE_W / 2 - 2, cy: -NODE_H / 2 + 2, r: 5 }) : null);
      state.nodeEls.set(node.hostname, group);
      moveNode(node.hostname);
      bindNode(group, node.hostname);
      return group;
    }

    function moveNode(hostname) {
      const p = state.positions.get(hostname);
      state.nodeEls.get(hostname).setAttribute("transform", `translate(${p.x},${p.y})`);
    }

    // Tout ce qui touche un équipement déplacé suit : ses câbles, ses faisceaux, le cadre de son cluster.
    function follow(hostname) {
      (model.linksByNode.get(hostname) || []).forEach((link) => { const els = state.linkEls.get(link.id); if (els) placeLink(link, els); });
      (model.beamsByNode.get(hostname) || []).forEach((beam) => { const els = state.beamEls.get(beam.id); if (els) placeBeam(beam, els); });
      model.clusters.forEach((cluster) => { const els = state.clusterEls.get(cluster.id); if (els && cluster.hosts.includes(hostname)) placeCluster(cluster, els); });
    }

    function bindNode(group, hostname) {
      let start = null;
      group.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        start = { x: event.clientX, y: event.clientY, origin: { ...state.positions.get(hostname) }, moved: false };
        group.setPointerCapture(event.pointerId);
      });
      group.addEventListener("pointermove", (event) => {
        if (!start) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
        start.moved = true;
        const point = { x: start.origin.x + dx / state.view.k, y: start.origin.y + dy / state.view.k };
        state.positions.set(hostname, point);
        state.pinned.set(hostname, point);
        moveNode(hostname);
        follow(hostname);
      });
      group.addEventListener("pointerup", () => { if (start && !start.moved) select({ kind: "node", id: hostname }); start = null; });
      group.addEventListener("keydown", (event) => { if (event.key === "Enter") select({ kind: "node", id: hostname }); });
    }

    // Ce que l'appui a touché : un câble, un faisceau, un cluster, ou le fond.
    function targetSelection(target) {
      if (!target || !target.getAttribute) return null;
      const link = target.getAttribute("data-link"), beam = target.getAttribute("data-beam"), cluster = target.getAttribute("data-cluster");
      if (link !== null) return { kind: "link", id: model.links[Number(link)].id };
      if (beam !== null) return { kind: "beam", id: model.beams[Number(beam)].id };
      if (cluster !== null) return { kind: "cluster", id: model.clusters[Number(cluster)].id };
      return null;
    }

    function bindCanvas() {
      let pan = null;
      svg.addEventListener("pointerdown", (event) => {
        pan = { x: event.clientX, y: event.clientY, tx: state.view.tx, ty: state.view.ty, moved: false, target: event.target };
        svg.setPointerCapture(event.pointerId); // la capture détourne l'événement click : on ne s'appuie pas dessus
      });
      svg.addEventListener("pointermove", (event) => {
        if (!pan) return;
        const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
        if (!pan.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
        pan.moved = true;
        state.view.tx = pan.tx + dx; state.view.ty = pan.ty + dy;
        applyView();
      });
      svg.addEventListener("pointerup", () => {
        if (pan && !pan.moved) select(targetSelection(pan.target));
        pan = null;
      });
      svg.addEventListener("wheel", (event) => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        const k = Math.min(Math.max(state.view.k * Math.exp(-event.deltaY * 0.0015), 0.05), 6);
        state.view.tx = x - ((x - state.view.tx) / state.view.k) * k;
        state.view.ty = y - ((y - state.view.ty) / state.view.k) * k;
        state.view.k = k;
        applyView();
      }, { passive: false });
    }

    // Ce qu'une sélection éclaire : les équipements, câbles, faisceaux et clusters qui la concernent.
    function relatedTo(selection) {
      const related = { hosts: new Set(), links: new Set(), beams: new Set(), clusters: new Set() };
      const entity = LD.model.entityOf(model, selection);
      if (!entity) return related;
      const addLink = (link) => { related.links.add(link.id); related.hosts.add(link.a.hostname); related.hosts.add(link.b.hostname); };
      LD.model.hostsOf(model, selection).forEach((host) => related.hosts.add(host));
      if (selection.kind === "node") {
        (model.linksByNode.get(entity.hostname) || []).forEach(addLink);
        (model.beamsByNode.get(entity.hostname) || []).forEach((beam) => related.beams.add(beam.id));
        (model.clustersByHost.get(entity.hostname) || []).forEach((cluster) => related.clusters.add(cluster.id));
      } else if (selection.kind === "link") {
        if (entity.beam) related.beams.add(entity.beam.id);
      } else if (selection.kind === "aggregate") {
        entity.cables.forEach(addLink);
        entity.beams.forEach((beam) => related.beams.add(beam.id));
      } else if (selection.kind === "beam") {
        entity.links.forEach(addLink);
      } else if (selection.kind === "cluster") {
        entity.heartbeats.forEach((hb) => { if (hb.link) addLink(hb.link); });
      }
      return related;
    }

    function paintSelection() {
      const selection = state.selection;
      const related = relatedTo(selection);
      const is = (kind, id) => !!selection && selection.kind === kind && selection.id === id;
      svg.setAttribute("class", (selection ? "has-selection" : "") + (state.showPorts ? " show-ports" : ""));
      const query = state.query.trim().toLowerCase();
      state.nodeEls.forEach((el, id) => {
        el.classList.toggle("selected", is("node", id) || (!!selection && selection.kind === "aggregate" && LD.model.entityOf(model, selection).hostname === id));
        el.classList.toggle("related", related.hosts.has(id));
        el.classList.toggle("match", query !== "" && id.toLowerCase().includes(query));
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
        els.label.textContent = beamLabel(model.beamById.get(id), is("beam", id)); // complète seulement sur le faisceau choisi
        placeBeam(model.beamById.get(id), els);
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

    // Les membres d'un cluster s'attirent comme s'ils étaient câblés : le cadre reste compact, un membre injoignable
    // (sans câble) se place à côté de son pair au lieu d'être rangé sous le graphe.
    function layoutEdges() {
      const edges = model.links.map((l) => [l.a.hostname, l.b.hostname]);
      model.clusters.forEach((c) => c.hosts.slice(1).forEach((host) => edges.push([c.hosts[0], host, 2.5])));
      return edges;
    }

    // Replace tout : nœuds visibles, placement (les nœuds déplacés à la main gardent leur place), tracés.
    function render(keepView) {
      const nodes = visibleNodes();
      const shown = new Set(nodes.map((n) => n.hostname));
      const links = visibleLinks(shown);
      const pinned = new Map(Array.from(state.pinned).filter(([id]) => shown.has(id)));
      state.positions = LD.layout.run(shown, layoutEdges(), pinned);
      [state.nodeEls, state.linkEls, state.beamEls, state.clusterEls].forEach((map) => map.clear());
      [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach(clear);
      visibleClusters(shown).forEach((cluster) => clusterLayer.appendChild(drawCluster(cluster)));
      visibleBeams(shown, links).forEach((beam) => beamLayer.appendChild(drawBeam(beam)));
      links.forEach((link) => linkLayer.appendChild(drawLink(link)));
      nodes.forEach((node) => nodeLayer.appendChild(drawNode(node)));
      if (!keepView) fit();
      paintSelection();
      return { nodes: nodes.length, links: links.length };
    }

    // Amène l'élément choisi au milieu de l'écran, à un zoom où son nom se lit : sur 400 nœuds, le sélectionner sans
    // le centrer laisse un point de quelques pixels dans un graphe estompé.
    function centerOn(selection) {
      const ends = LD.model.hostsOf(model, selection).map((host) => state.positions.get(host)).filter(Boolean);
      if (!ends.length) return;
      const rect = svg.getBoundingClientRect();
      const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
      state.view.k = Math.max(state.view.k, 0.8);
      state.view.tx = (rect.width || 900) / 2 - x * state.view.k;
      state.view.ty = (rect.height || 600) / 2 - y * state.view.k;
      applyView();
    }

    // Montre un élément choisi ailleurs (table des contrôles, des sources, des structures) : le rend visible, puis le
    // sélectionne. Un faisceau ou un agrégat rallume les statuts de ses câbles.
    function reveal(selection) {
      if (!selection) { select(null); return false; }
      const entity = LD.model.entityOf(model, selection);
      const links = ({ link: [entity], beam: entity ? entity.links : [], aggregate: entity ? entity.cables : [] }[selection.kind] || []).filter(Boolean);
      const hosts = LD.model.hostsOf(model, selection).concat(links.flatMap((link) => [link.a.hostname, link.b.hostname]));
      const needsStubs = hosts.some((host) => (model.nodeByHost.get(host) || {}).kind === "stub");
      let redraw = false;
      if (needsStubs && !state.showStubs) { state.showStubs = true; redraw = true; }
      links.forEach((link) => { if (state.hiddenStatuses.has(link.status)) { state.hiddenStatuses.delete(link.status); redraw = true; } });
      if (redraw) render(true);
      select(selection);
      centerOn(selection);
      return redraw;
    }

    bindCanvas();
    return { state, render, fit, select, reveal, repaint: paintSelection,
      resetPins: () => { state.pinned.clear(); return render(false); } };
  }

  LD.graph = { create, curve, hull, beamWidths, beamLabel, clusterLabel, TYPE_TAG };
})();
