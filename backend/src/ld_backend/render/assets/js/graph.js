// Le graphe : un nœud par équipement, un tracé par câble (deux câbles entre les mêmes équipements restent deux
// tracés), coloré par statut ; sous les câbles, une bande par faisceau d'agrégat et un cadre par cluster HA ; une
// bulle au survol (tip.js). La géométrie pure est dans geometry.js. Rien n'est déduit ici : ce qui est dessiné est
// dans le snapshot.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { s, clear } = LD.dom;
  const { curve, hull, beamWidths, beamLabel, clusterLabel, CHAR_W } = LD.geometry;
  const NODE_W = 48, NODE_H = 40, STUB_R = 8, CLICK_SLOP = 4, ICON_SCALE = 1.3, LABEL_MAX = 22;
  const ICON_PX = LD.icons.SIZE * ICON_SCALE;
  const ZOOM_FAR = 0.7, ZOOM_NEAR = 1.2;

  // Un hostname très long est raccourci au milieu sur la toile ; le nom complet reste dans la bulle, la fiche et aria-label.
  const shortName = (name) => (name.length <= LABEL_MAX ? name : name.slice(0, 11) + "…" + name.slice(-10));

  function nodeShape(node) {
    if (node.kind === "stub") return s("circle", { class: "node-shape", r: STUB_R });
    return s("rect", { class: "node-shape", x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 9 });
  }

  function create(svg, model, onSelect) {
    const state = { showStubs: false, showPorts: false, showDiff: true, hiddenStatuses: new Set(), query: "", pinned: new Map(),
      positions: new Map(), view: { k: 1, tx: 0, ty: 0 }, selection: null, nodeEls: new Map(), linkEls: new Map(), beamEls: new Map(), clusterEls: new Map() };
    const viewport = s("g", { class: "viewport" });
    const clusterLayer = s("g", { class: "clusters" });
    const beamLayer = s("g", { class: "beams" });
    const linkLayer = s("g", { class: "links" });
    const labelLayer = s("g", { class: "beam-labels" }); // au-dessus des câbles : l'étiquette reste lisible et cliquable
    const nodeLayer = s("g", { class: "nodes" });
    [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach((layer) => viewport.appendChild(layer));
    clear(svg).appendChild(viewport);
    const tip = LD.tip.create(svg); // au-dessus du viewport, en coordonnées d'écran

    // Les fantômes du diff (retirés depuis la run d'avant) se dessinent avec les changements ; un fantôme stub suit la règle des stubs.
    const allNodes = () => model.nodes.concat(state.showDiff ? model.ghostNodes : []);
    const allLinks = () => model.links.concat(state.showDiff ? model.ghostLinks : []);
    const linkAt = (index) => (index < model.links.length ? model.links[index] : model.ghostLinks[index - model.links.length]);
    // Rien n'est peint quand les changements sont masqués : ni halo, ni couronne, ni fantôme.
    const changeOf = (kind, entity, id) => (!state.showDiff ? null : entity.ghost ? "removed" : (model.changeOf(kind, id) || {}).kind || null);
    const visibleNodes = () => allNodes().filter((n) => state.showStubs || n.kind !== "stub");
    // Les classes du svg : sélection, noms des ports, et le palier de zoom (de loin, les petites étiquettes disparaissent).
    function svgClasses() {
      const k = state.view.k;
      svg.setAttribute("class", [state.selection ? "has-selection" : "", state.showPorts ? "show-ports" : "", k < ZOOM_FAR ? "zoom-far" : k >= ZOOM_NEAR ? "zoom-near" : ""].filter(Boolean).join(" "));
    }
    const applyView = () => { viewport.setAttribute("transform", `translate(${state.view.tx},${state.view.ty}) scale(${state.view.k})`); svgClasses(); };
    let dragging = false, pan = null; // un équipement en cours de glissé, une vue en cours de panoramique : pas de bulle

    function visibleLinks(shown) {
      return allLinks().filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !state.hiddenStatuses.has(l.status));
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
      [els.line, els.hit, els.halo, els.diff].forEach((el) => { if (el) el.setAttribute("d", shape.path); });
      if (els.mark) { els.mark.setAttribute("cx", shape.mid.x); els.mark.setAttribute("cy", shape.mid.y); }
      els.ports.forEach((text, i) => {
        text.setAttribute("x", shape.ends[i].x);
        text.setAttribute("y", shape.ends[i].y);
        text.setAttribute("text-anchor", shape.anchor || "middle");
      });
    }

    function drawLink(link) {
      const change = changeOf("link", link, link.id); // le diff : un halo coloré sous le tracé, le statut reste lisible
      const diffHalo = change ? s("path", { class: "diff-halo" }) : null;
      const halo = link.heartbeat ? s("path", { class: "link-halo" }) : null; // heartbeat HA : un halo sous le tracé
      const line = s("path", { class: "link-line" });
      const hit = s("path", { class: "link-hit" });
      const mark = link.worst === "error" || link.worst === "warning" ? s("circle", { class: "link-mark severity-" + link.worst, r: 4.5 }) : null;
      const ports = [link.a.interface, link.b.interface].map((name) => s("text", { class: "port-label" }, name));
      const classes = `link status-${link.status}${link.raw.oper === "down" ? " oper-down" : ""}${link.pairCount > 2 ? " crowded" : ""}${link.heartbeat ? " heartbeat" : ""}${change ? " diff-" + change : ""}`;
      // L'identité est portée par le groupe : le clic (lu au relâchement, sur la cible de l'appui) et le survol remontent
      // du point touché jusqu'à lui. Pas de <title> natif : la bulle de la page est la seule.
      const group = s("g", { class: classes, "data-link": String(link.index), tabindex: 0, role: "button",
        "aria-label": `${LD.model.endLabel(link.a)} ↔ ${LD.model.endLabel(link.b)} · ${LD.dom.STATUS_LABEL[link.status]} · ${link.combo}${change ? " · " + LD.dom.DIFF_LABEL[change] : ""}` },
        diffHalo, halo, line, hit, mark, ports);
      const els = { group, line, hit, halo, diff: diffHalo, mark, ports };
      state.linkEls.set(link.id, els);
      placeLink(link, els);
      bindFocus(group, { kind: "link", id: link.id }, () => toScreen(curve(state.positions.get(link.a.hostname), state.positions.get(link.b.hostname), link).mid));
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
      const tag = s("g", { class: "beam-tag", "data-beam": String(beam.index) }, labelHit, label);
      const classes = `beam${beam.peerLink ? " peer-link" : ""}${beam.degraded ? " degraded" : ""}${beam.mlags.length ? " mlag" : ""}`;
      const group = s("g", { class: classes, "data-beam": String(beam.index), tabindex: 0, role: "button",
        "aria-label": `faisceau ${LD.model.endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate })} ⇄ ${LD.model.endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate })} · ${beam.links.length} câble(s)` },
        band, hit);
      const els = { group, band, hit, label, labelHit, tag, widths };
      state.beamEls.set(beam.id, els);
      labelLayer.appendChild(tag);
      placeBeam(beam, els);
      bindFocus(group, { kind: "beam", id: beam.id }, () => toScreen(midpoint(beam.a.hostname, beam.b.hostname)));
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
      const group = s("g", { class: "cluster", "data-cluster": String(cluster.index), tabindex: 0, role: "button", "aria-label": clusterLabel(cluster) }, rect, label);
      const els = { group, rect, label };
      state.clusterEls.set(cluster.id, els);
      placeCluster(cluster, els);
      bindFocus(group, { kind: "cluster", id: cluster.id }, () => toScreen({ x: Number(rect.getAttribute("x")) + 20, y: Number(rect.getAttribute("y")) + 20 }));
      return group;
    }

    function drawNode(node) {
      const checks = model.checksByNode.get(node.hostname) || [];
      const worst = LD.model.worst(checks);
      // Le rôle HA d'un membre, tel qu'enregistré dans le snapshot (primary, secondary, active, standby, member) : écrit
      // sous l'étiquette de type, et une classe par famille de rôle pour le fond.
      const memberships = model.haMembershipsByHost.get(node.hostname) || [];
      const ha = memberships[0] || null;
      const haState = memberships.some((m) => m.member.state === "down") ? "down" : ha ? ha.member.state : null;
      const haClasses = ha ? ` ha-member ha-${LD.model.haRoleGroup(ha.cluster.raw.mode, ha.member.role)} ha-state-${haState}` : "";
      // Entrée sélectionne : pour un lecteur d'écran c'est un bouton, pas un groupe (revue, B7).
      // Le nom domine ; le type est une icône dessinée (icons.js), le rôle HA s'écrit sous l'icône.
      const typeLabel = node.type ? LD.icons.LABEL[node.type] || node.type : null;
      const change = changeOf("node", node, node.hostname); // le diff : une couronne autour du nœud ; un fantôme s'estompe
      const ring = change && change !== "removed" ? (node.kind === "stub" ? s("circle", { class: "node-ring", r: STUB_R + 4 })
        : s("rect", { class: "node-ring", x: -NODE_W / 2 - 4, y: -NODE_H / 2 - 4, width: NODE_W + 8, height: NODE_H + 8, rx: 12 })) : null;
      const group = s("g", { class: `node kind-${node.kind} collection-${node.collection || "none"}${haClasses}${change ? " diff-" + change : ""}`, tabindex: 0, role: "button", "data-node": node.hostname,
          "aria-label": `${node.hostname} · ${LD.dom.KIND_LABEL[node.kind]}${typeLabel ? " · " + typeLabel : ""}${node.collection ? " · collecte : " + node.collection : ""}${ha ? " · HA " + ha.member.role : ""}${change ? " · " + LD.dom.DIFF_LABEL[change] : ""}` },
        ring, nodeShape(node),
        node.kind === "stub" ? null : s("path", { class: "node-icon", d: LD.icons.path(node.type),
          transform: `translate(${-ICON_PX / 2},${ha ? -NODE_H / 2 + 3 : -ICON_PX / 2}) scale(${ICON_SCALE})` }),
        ha ? s("text", { class: "node-role", y: NODE_H / 2 - 5 }, ha.member.role) : null,
        s("text", { class: "node-label", y: node.kind === "stub" ? 22 : NODE_H / 2 + 14 }, shortName(node.hostname)),
        node.stack ? s("text", { class: "node-stack", x: NODE_W / 2 + 4, y: 4 }, "×" + node.stack.member_count) : null,
        worst === "error" || worst === "warning" ? s("circle", { class: "node-badge severity-" + worst, cx: NODE_W / 2 - 1, cy: -NODE_H / 2 + 1, r: 6 }) : null);
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

    // La position d'un équipement à l'écran, et s'il est dans le cadre du canevas.
    function screenPoint(hostname) {
      const p = state.positions.get(hostname);
      return { x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty };
    }
    const onScreen = (point, rect) => point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height;
    const toScreen = (p) => ({ x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty });
    const midpoint = (h1, h2) => { const p = state.positions.get(h1), q = state.positions.get(h2); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; };

    // Au clavier, tout élément du graphe se sélectionne par Entrée ; son focus l'amène en vue s'il est hors cadre, montre sa
    // bulle à côté de lui et la lui rattache ; la perte du focus la cache. Le focus reçu à l'appui ne rallume pas la bulle
    // que l'appui vient de cacher (revue, B1, B2, B7).
    function bindFocus(group, selection, pointOf) {
      group.addEventListener("keydown", (event) => { if (event.key === "Enter") select(selection); });
      group.addEventListener("focus", () => {
        if (dragging || pan) return;
        const rect = svg.getBoundingClientRect();
        if (!onScreen(pointOf(), rect)) centerOn(selection);
        const point = pointOf();
        tip.show(selection.kind + ":" + selection.id, () => tipLines(selection), point.x, point.y, rect);
        group.setAttribute("aria-describedby", tip.id);
      });
      group.addEventListener("blur", () => { tip.hide(); group.removeAttribute("aria-describedby"); });
    }

    function bindNode(group, hostname) {
      let start = null;
      const end = () => { start = null; dragging = false; };
      group.addEventListener("pointerdown", (event) => {
        if (event.button > 0) return; // clic droit ou central : ni glissé ni sélection
        event.stopPropagation();
        dragging = true;
        tip.hide();
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
      group.addEventListener("pointerup", () => { if (start && !start.moved) select({ kind: "node", id: hostname }); end(); });
      // Un appui annulé (toucher ou stylet interrompu, fenêtre qui perd le focus, nœud redessiné) n'a jamais de
      // relâchement : on libère quand même, sinon le nœud suivrait la souris sans appui et la bulle resterait morte (revue, H1).
      group.addEventListener("pointercancel", end);
      group.addEventListener("lostpointercapture", end);
      bindFocus(group, { kind: "node", id: hostname }, () => screenPoint(hostname));
    }

    // Ce que le pointeur a touché : un câble, un faisceau, un cluster, un équipement, ou le fond. On remonte du point
    // touché (un tracé, une étiquette, une forme) jusqu'au groupe qui porte l'identité.
    function entityAt(target) {
      for (let el = target; el && el !== svg && el.getAttribute; el = el.parentNode) {
        const link = el.getAttribute("data-link"), beam = el.getAttribute("data-beam"), cluster = el.getAttribute("data-cluster"), node = el.getAttribute("data-node");
        if (link !== null) return { kind: "link", id: linkAt(Number(link)).id };
        if (beam !== null) return { kind: "beam", id: model.beams[Number(beam)].id };
        if (cluster !== null) return { kind: "cluster", id: model.clusters[Number(cluster)].id };
        if (node !== null) return { kind: "node", id: node };
      }
      return null;
    }

    function tipLines(selection) {
      const entity = LD.model.entityOf(model, selection);
      if (selection.kind === "link") return LD.tip.linkLines(model, entity);
      if (selection.kind === "node") return LD.tip.nodeLines(model, entity);
      if (selection.kind === "beam") return LD.tip.beamLines(entity);
      return LD.tip.clusterLines(entity);
    }

    function bindCanvas() {
      svg.addEventListener("pointerdown", (event) => {
        if (event.button > 0) return;
        tip.hide();
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
        if (pan && !pan.moved) select(entityAt(pan.target));
        pan = null;
      });
      svg.addEventListener("pointercancel", () => { pan = null; }); // un appui annulé ne laisse pas la vue suivre la souris (revue, H1)
      svg.addEventListener("lostpointercapture", () => { pan = null; });
      // Le survol : la bulle suit le pointeur tant qu'il reste sur le même élément ; un glissé (vue ou équipement) la cache.
      svg.addEventListener("pointermove", (event) => {
        if (pan || dragging) { tip.hide(); return; }
        const entity = entityAt(event.target);
        if (!entity) { tip.hide(); return; }
        const rect = svg.getBoundingClientRect();
        tip.show(entity.kind + ":" + entity.id, () => tipLines(entity), event.clientX - rect.left, event.clientY - rect.top, rect);
      });
      svg.addEventListener("pointerleave", () => tip.hide());
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
      svgClasses();
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
      const edges = allLinks().map((l) => [l.a.hostname, l.b.hostname]); // un câble retiré attire encore ses deux bouts : le fantôme se dessine là où il était
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
      tip.hide(); // l'élément survolé va être redessiné
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
      if (entity && entity.ghost && !state.showDiff) { state.showDiff = true; redraw = true; } // un fantôme ne se montre qu'avec les changements
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

  LD.graph = { create };
})();
