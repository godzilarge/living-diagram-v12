// Le graphe : un nœud par équipement, un tracé par câble (deux câbles entre les mêmes équipements restent deux
// tracés), coloré par statut. Rien n'est déduit ici : ce qui est dessiné est dans le snapshot.
var LD = globalThis.LD || (globalThis.LD = {});
(function () {
  "use strict";

  const { s, clear } = LD.dom;
  const TYPE_TAG = { switch: "SW", router: "RT", firewall: "FW", load_balancer: "LB", wireless_controller: "WLC", server: "SRV", other: "·" };
  const NODE_W = 46, NODE_H = 30, STUB_R = 8, FAN = 14, FAN_MAX = 110, CLICK_SLOP = 4;

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

  function nodeShape(node) {
    if (node.kind === "stub") return s("circle", { class: "node-shape", r: STUB_R });
    return s("rect", { class: "node-shape", x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 6 });
  }

  function create(svg, model, onSelect) {
    const state = { showStubs: false, showPorts: false, hiddenStatuses: new Set(), query: "", pinned: new Map(),
      positions: new Map(), view: { k: 1, tx: 0, ty: 0 }, selection: null, nodeEls: new Map(), linkEls: new Map() };
    const viewport = s("g", { class: "viewport" });
    const linkLayer = s("g", { class: "links" });
    const nodeLayer = s("g", { class: "nodes" });
    viewport.appendChild(linkLayer);
    viewport.appendChild(nodeLayer);
    clear(svg).appendChild(viewport);

    const visibleNodes = () => model.nodes.filter((n) => state.showStubs || n.kind !== "stub");
    const applyView = () => viewport.setAttribute("transform", `translate(${state.view.tx},${state.view.ty}) scale(${state.view.k})`);

    function visibleLinks(shown) {
      return model.links.filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !state.hiddenStatuses.has(l.status));
    }

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
      els.line.setAttribute("d", shape.path);
      els.hit.setAttribute("d", shape.path);
      if (els.mark) { els.mark.setAttribute("cx", shape.mid.x); els.mark.setAttribute("cy", shape.mid.y); }
      els.ports.forEach((text, i) => {
        text.setAttribute("x", shape.ends[i].x);
        text.setAttribute("y", shape.ends[i].y);
        text.setAttribute("text-anchor", shape.anchor || "middle");
      });
    }

    function drawLink(link) {
      const line = s("path", { class: "link-line" });
      const hit = s("path", { class: "link-hit" });
      const mark = link.worst === "error" || link.worst === "warning" ? s("circle", { class: "link-mark severity-" + link.worst, r: 4.5 }) : null;
      const ports = [link.a.interface, link.b.interface].map((name) => s("text", { class: "port-label" }, name));
      const group = s("g", { class: `link status-${link.status}${link.raw.oper === "down" ? " oper-down" : ""}${link.pairCount > 2 ? " crowded" : ""}` },
        s("title", {}, `${LD.model.endLabel(link.a)} ↔ ${LD.model.endLabel(link.b)} · ${LD.dom.STATUS_LABEL[link.status]} · ${link.combo}`),
        line, hit, mark, ports);
      hit.setAttribute("data-link", String(link.index)); // le clic est lu au relâchement, sur la cible de l'appui
      const els = { group, line, hit, mark, ports };
      state.linkEls.set(link.id, els);
      placeLink(link, els);
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
        (model.linksByNode.get(hostname) || []).forEach((link) => { const els = state.linkEls.get(link.id); if (els) placeLink(link, els); });
      });
      group.addEventListener("pointerup", () => { if (start && !start.moved) select({ kind: "node", id: hostname }); start = null; });
      group.addEventListener("keydown", (event) => { if (event.key === "Enter") select({ kind: "node", id: hostname }); });
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
        if (pan && !pan.moved) {
          const index = pan.target && pan.target.getAttribute ? pan.target.getAttribute("data-link") : null;
          select(index === null ? null : { kind: "link", id: model.links[Number(index)].id });
        }
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

    function paintSelection() {
      const selection = state.selection;
      const related = new Set();
      if (selection && selection.kind === "node") {
        (model.linksByNode.get(selection.id) || []).forEach((l) => { related.add(l.id); related.add(l.a.hostname); related.add(l.b.hostname); });
      } else if (selection && selection.kind === "link") {
        const link = model.linkById.get(selection.id);
        if (link) { related.add(link.a.hostname); related.add(link.b.hostname); }
      }
      svg.setAttribute("class", (selection ? "has-selection" : "") + (state.showPorts ? " show-ports" : ""));
      const query = state.query.trim().toLowerCase();
      state.nodeEls.forEach((el, id) => {
        el.classList.toggle("selected", !!selection && selection.kind === "node" && selection.id === id);
        el.classList.toggle("related", related.has(id));
        el.classList.toggle("match", query !== "" && id.toLowerCase().includes(query));
      });
      state.linkEls.forEach((els, id) => {
        els.group.classList.toggle("selected", !!selection && selection.kind === "link" && selection.id === id);
        els.group.classList.toggle("related", related.has(id));
      });
    }

    function select(selection) {
      state.selection = selection;
      paintSelection();
      onSelect(selection);
    }

    // Replace tout : nœuds visibles, placement (les nœuds déplacés à la main gardent leur place), tracés.
    function render(keepView) {
      const nodes = visibleNodes();
      const shown = new Set(nodes.map((n) => n.hostname));
      const links = visibleLinks(shown);
      const pinned = new Map(Array.from(state.pinned).filter(([id]) => shown.has(id)));
      state.positions = LD.layout.run(shown, model.links.map((l) => [l.a.hostname, l.b.hostname]), pinned);
      state.nodeEls.clear();
      state.linkEls.clear();
      clear(linkLayer);
      clear(nodeLayer);
      links.forEach((link) => linkLayer.appendChild(drawLink(link)));
      nodes.forEach((node) => nodeLayer.appendChild(drawNode(node)));
      if (!keepView) fit();
      paintSelection();
      return { nodes: nodes.length, links: links.length };
    }

    // Amène l'élément choisi au milieu de l'écran, à un zoom où son nom se lit : sur 400 nœuds, le sélectionner sans
    // le centrer laisse un point de quelques pixels dans un graphe estompé.
    function centerOn(selection) {
      const link = selection.kind === "link" ? model.linkById.get(selection.id) : null;
      const ends = (link ? [link.a.hostname, link.b.hostname] : [selection.id]).map((host) => state.positions.get(host)).filter(Boolean);
      if (!ends.length) return;
      const rect = svg.getBoundingClientRect();
      const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
      state.view.k = Math.max(state.view.k, 0.8);
      state.view.tx = (rect.width || 900) / 2 - x * state.view.k;
      state.view.ty = (rect.height || 600) / 2 - y * state.view.k;
      applyView();
    }

    // Montre un élément choisi ailleurs (table des contrôles, des sources) : le rend visible, puis le sélectionne.
    function reveal(selection) {
      const hosts = selection.kind === "node" ? [selection.id] : (() => { const l = model.linkById.get(selection.id); return l ? [l.a.hostname, l.b.hostname] : []; })();
      const needsStubs = hosts.some((host) => (model.nodeByHost.get(host) || {}).kind === "stub");
      const link = selection.kind === "link" ? model.linkById.get(selection.id) : null;
      let redraw = false;
      if (needsStubs && !state.showStubs) { state.showStubs = true; redraw = true; }
      if (link && state.hiddenStatuses.has(link.status)) { state.hiddenStatuses.delete(link.status); redraw = true; }
      if (redraw) render(true);
      select(selection);
      centerOn(selection);
      return redraw;
    }

    bindCanvas();
    return { state, render, fit, select, reveal, repaint: paintSelection,
      resetPins: () => { state.pinned.clear(); return render(false); } };
  }

  LD.graph = { create, curve, TYPE_TAG };
})();
