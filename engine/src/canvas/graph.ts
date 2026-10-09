// Le graphe : un nœud par équipement, un tracé par câble (deux câbles entre les mêmes équipements restent deux
// tracés), coloré par statut ; sous les câbles, une bande par faisceau d'agrégat et un cadre par cluster HA ; une
// bulle au survol (tip.ts). La géométrie pure est dans geometry.ts, le pointeur (panoramique, glissé, rectangle de
// sélection) dans pointer.ts, les règles de recherche et de masquage dans query.ts, l'alignement dans align.ts.
// Rien n'est déduit ici : ce qui est dessiné est dans le snapshot.
import { align as alignPositions } from "./align";
import type { AlignMode } from "./align";
import { clear, s } from "./dom";
import { DIFF_LABEL, KIND_LABEL, STATUS_LABEL } from "./format";
import { beamBand, beamLabel, chord, clusterLabel, curve, hull, CHAR_W } from "./geometry";
import type { BeamBand } from "./geometry";
import { CARD_H, STUB_R, plan as cardPlan, displayName, reach, shortName } from "./card";
import type { Box } from "./card";
import { hueOfNode } from "./hues";
import { glyph, LABEL as ICON_LABEL } from "./icons";

// L'icône de type en trois couches (icons.ts) : silhouette à la couleur du type, bandeau du bas, symbole en réserve.
const typeGlyph = (type: string | null, transform: string): SVGGElement => {
  const g = glyph(type);
  return s("g", { class: "node-icon", transform }, s("path", { class: "icon-body", d: g.body }), s("path", { class: "icon-shade", d: g.shade }), s("path", { class: "icon-mark", d: g.mark }));
};
import { bounds, run as placeAll, wired } from "./layout";
import type { Edge, Point } from "./layout";
import { aggregateOf, beamOf, clusterOf, endLabel, entityOf, haRoleGroup, hostsOf, linkOf, nodeOf, worst } from "./model";
import { bind as bindPointer } from "./pointer";
import type { ScreenRect, View } from "./pointer";
import { keepByRules, matches, parseRule } from "./query";
import type { Rule } from "./query";
import { beamLines, clusterLines, create as createTip, linkLines, nodeLines } from "./tip";
import type { Block } from "./tip";
import type { Beam, Cluster, Model, ModelLink, ModelNode, Selection } from "./types";

const ZOOM_FAR = 0.7, ZOOM_NEAR = 1.2;

export type { View };
export interface LinkEls { group: SVGGElement; line: SVGPathElement; hit: SVGPathElement; halo: SVGPathElement | null; diff: SVGPathElement | null; mark: SVGCircleElement | null; ports: SVGTextElement[] }
export interface BeamEls { group: SVGGElement; band: SVGPathElement; hit: SVGPathElement; label: SVGTextElement; labelHit: SVGRectElement; tag: SVGGElement; shape: BeamBand }
export interface ClusterEls { group: SVGGElement; rect: SVGRectElement; label: SVGTextElement }
/** `selection` : l'élément lu (câble, équipement, structure) ; `selected` : la sélection multiple, des équipements
 * (un seul équipement sélectionné est à la fois `selection` et le seul membre de `selected`). `hide` / `only` : les
 * règles de masquage et d'isolement (query.ts), appliquées au dessin ; `query` : la règle de recherche, qui éclaire. */
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface GraphState {
  showStubs: boolean; showPorts: boolean; showDiff: boolean; hiddenStatuses: Set<string>; query: string; hide: Rule[]; only: Rule | null;
  /** Ce que la page pose sur la toile (barre, bande, panneau) : `fit` et `centerOn` cadrent dans ce qui reste visible. */
  insets: Insets;
  pinned: Map<string, Point>; placed: Map<string, Point>; positions: Map<string, Point>; view: View; selection: Selection | null; selected: Set<string>;
  nodeEls: Map<string, SVGGElement>; linkEls: Map<string, LinkEls>; beamEls: Map<string, BeamEls>; clusterEls: Map<string, ClusterEls>;
}
export interface Drawn { nodes: number; links: number }
/** `onPin` : un équipement vient d'être relâché après un glissé, à cette position (unités du dessin). `onPins` : des
 * équipements viennent d'être alignés, ou glissés d'un bloc (la sélection multiple), à ces positions. `onPlaced` : le
 * graphe vient de placer des équipements qui n'avaient pas de place mémorisée (`replace` : tout a été replacé).
 * `onHosts` : la sélection multiple a changé. */
export type PinsCause = "aligned" | "dragged";
export interface GraphOptions {
  onPin?: (hostname: string, point: Point) => void; onPins?: (moves: Map<string, Point>, cause: PinsCause) => void;
  onPlaced?: (fresh: Map<string, Point>, replace: boolean) => void; onHosts?: (hosts: string[]) => void;
}
export interface Graph {
  state: GraphState;
  render: (keepView: boolean) => Drawn;
  fit: () => void;
  select: (selection: Selection | null) => void;
  /** La sélection multiple : ces équipements, et eux seuls (un seul = sélection simple ; aucun = rien). */
  selectHosts: (hosts: string[]) => void;
  /** Aligne ou répartit la sélection multiple ; rend ce qui a bougé (déplacements locaux, épinglés par la page ou non). */
  alignSelected: (mode: AlignMode) => Map<string, Point>;
  reveal: (selection: Selection | null) => boolean;
  repaint: () => void;
  /** Oublie les déplacements locaux non enregistrés : chaque équipement retrouve sa place mémorisée ou son épingle. */
  resetPins: () => Drawn;
  /** « Replacer » : oublie la mémoire et les déplacements locaux, recalcule tout autour des épingles enregistrées. */
  replaceAll: () => Drawn;
  /** Réaligne les épingles locales sur le document enregistré (après une écriture acceptée) ; sans replacer. */
  syncPins: () => void;
  /** Après une couleur d'intention acceptée : les cartes reprennent leur teinte (un redessin, cadrage gardé). */
  recolor: () => Drawn;
  /** Réaligne la mémoire locale sur le document mémorisé (après une écriture acceptée) : la place enregistrée gagne. */
  syncPlaces: () => void;
  /** Retire des épingles (locales et enregistrées) et replace, en gardant la vue. */
  unpin: (hostnames: string[]) => Drawn;
}

// Le glyphe d'épingle, dans le coin haut gauche d'un équipement épinglé (tracé 16 × 16, même trait que les icônes).
const PIN_PATH = "M8 1.5a4 4 0 0 1 4 4c0 2.8-4 7.5-4 7.5S4 8.3 4 5.5a4 4 0 0 1 4-4z M8 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z";

export function create(svg: SVGSVGElement, model: Model, onSelect: (selection: Selection | null) => void, options: GraphOptions = {}): Graph {
  // Les épingles enregistrées (couche d'intention) sont des contraintes dures dès le premier placement. Un fantôme du
  // diff n'est pas un nœud de la run : son épingle est orpheline, elle ne le place pas (docs/08 I3 ; revue B4, B3).
  const savedPins = (): Map<string, Point> => new Map(Array.from(model.pinByHost)
    .filter(([host]) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; })
    .map(([host, pin]) => [host, { x: pin.x, y: pin.y }] as const));
  // Le placement mémorisé (docs/09) : la place de chaque équipement déjà dessiné, lue dans le document embarqué ou servi,
  // puis complétée par ce que cette page place. Un fantôme mémorisé se dessine là où il était.
  const savedPlaces = (): Map<string, Point> => new Map(Array.from(model.placeByHost, ([host, place]) => [host, { x: place.x, y: place.y }]));
  const state: GraphState = { showStubs: false, showPorts: false, showDiff: true, hiddenStatuses: new Set(), query: "", hide: [], only: null, insets: { top: 0, right: 0, bottom: 0, left: 0 }, pinned: savedPins(), placed: savedPlaces(),
    positions: new Map(), view: { k: 1, tx: 0, ty: 0 }, selection: null, selected: new Set(), nodeEls: new Map(), linkEls: new Map(), beamEls: new Map(), clusterEls: new Map() };
  const viewport = s("g", { class: "viewport" });
  const clusterLayer = s("g", { class: "clusters" });
  const beamLayer = s("g", { class: "beams" });
  const linkLayer = s("g", { class: "links" });
  const labelLayer = s("g", { class: "beam-labels" }); // au-dessus des câbles : l'étiquette reste lisible et cliquable
  const nodeLayer = s("g", { class: "nodes" });
  [clusterLayer, beamLayer, linkLayer, labelLayer, nodeLayer].forEach((layer) => viewport.appendChild(layer));
  clear(svg).appendChild(viewport);
  const tip = createTip(svg); // au-dessus du viewport, en coordonnées d'écran
  const at = (hostname: string): Point => state.positions.get(hostname) as Point;
  // La boîte de chaque équipement dessiné (sa carte, ou le disque d'un voisin inconnu) : où ses câbles sortent, ce que
  // le cadre de son cluster entoure.
  const cards = new Map<string, Box>();
  const boxOf = (hostname: string): Box => cards.get(hostname) || { w: STUB_R * 2, h: STUB_R * 2 };

  // Les fantômes du diff (retirés depuis la run d'avant) se dessinent avec les changements ; un fantôme stub suit la règle des stubs.
  const allNodes = (): ModelNode[] => model.nodes.concat(state.showDiff ? model.ghostNodes : []);
  const allLinks = (): ModelLink[] => model.links.concat(state.showDiff ? model.ghostLinks : []);
  const linkAt = (index: number): ModelLink => (index < model.links.length ? model.links[index] : model.ghostLinks[index - model.links.length]);
  // Rien n'est peint quand les changements sont masqués : ni halo, ni couronne, ni fantôme.
  const changeOf = (kind: "node" | "link", entity: { ghost?: boolean }, id: string): string | null =>
    (!state.showDiff ? null : entity.ghost ? "removed" : (model.changeOf(kind, id) || { kind: null }).kind);
  // Les voisins inconnus d'abord (bascule), puis les règles : masquer gagne sur isoler, et isoler garde les voisins
  // directs de ce qu'il désigne (query.ts).
  const visibleNodes = (): ModelNode[] => keepByRules(allNodes().filter((n) => state.showStubs || n.kind !== "stub"), allLinks(), state.hide, state.only);
  const multi = (): boolean => state.selected.size >= 2;
  // Les classes du svg : sélection, noms des ports, et le palier de zoom (de loin, les petites étiquettes disparaissent).
  function svgClasses(): void {
    const k = state.view.k;
    svg.setAttribute("class", [state.selection || multi() ? "has-selection" : "", state.showPorts ? "show-ports" : "", k < ZOOM_FAR ? "zoom-far" : k >= ZOOM_NEAR ? "zoom-near" : ""].filter(Boolean).join(" "));
  }
  const applyView = (): void => { viewport.setAttribute("transform", `translate(${state.view.tx},${state.view.ty}) scale(${state.view.k})`); svgClasses(); };
  // Le pointeur (pointer.ts) : il tient les appuis, le graphe lui prête ce qu'il sait faire. Un équipement déplacé
  // (glissé, alignement) prend sa position et une épingle locale ; la page décide d'enregistrer ou non.
  function moveTo(hostname: string, point: Point): void {
    state.positions.set(hostname, point);
    state.pinned.set(hostname, point);
    const el = state.nodeEls.get(hostname);
    if (el) el.classList.toggle("pinned", true);
    moveNode(hostname);
    follow(hostname);
  }
  const pointer = bindPointer(svg, {
    view: () => state.view,
    setView: (view) => { state.view = view; applyView(); },
    at, moveTo, select, toggleHost, selectIn, entityAt,
    // Un équipement de la sélection multiple entraîne toute la sélection (ses équipements dessinés) ; relâchée d'un bloc,
    // elle fait un seul paquet d'épingles ; un seul équipement, ou une page sans `onPins` : une épingle par équipement.
    companions: (hostname) => (multi() && state.selected.has(hostname) ? Array.from(state.selected).filter((host) => state.nodeEls.has(host)) : [hostname]),
    dropped: (hosts) => {
      const moves = new Map(hosts.map((host): [string, Point] => [host, { ...at(host) }]));
      if (moves.size > 1 && options.onPins) options.onPins(moves, "dragged");
      else if (options.onPin) moves.forEach((point, host) => options.onPin?.(host, point));
    },
    tipHide: () => tip.hide(),
    tipShowAt: (entity, x, y) => tip.show(entity.kind + ":" + entity.id, () => tipLines(entity), x, y, svg.getBoundingClientRect()),
  });

  function visibleLinks(shown: Set<string>): ModelLink[] {
    return allLinks().filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !state.hiddenStatuses.has(l.status));
  }
  // Un faisceau se dessine entre deux équipements distincts, dès qu'un de ses câbles est visible.
  function visibleBeams(shown: Set<string>, links: ModelLink[]): Beam[] {
    const visible = new Set(links.map((l) => l.id));
    return model.beams.filter((b) => b.a.hostname !== b.b.hostname && shown.has(b.a.hostname) && shown.has(b.b.hostname) && b.links.some((l) => visible.has(l.id)));
  }
  const visibleClusters = (shown: Set<string>): Cluster[] => model.clusters.filter((c) => c.hosts.filter((h) => shown.has(h)).length >= 2);

  // La partie visible de la toile, moins ce que la page pose dessus.
  const visibleRect = (): { x: number; y: number; width: number; height: number } => {
    const rect = svg.getBoundingClientRect(), i = state.insets;
    return { x: i.left, y: i.top, width: Math.max((rect.width || 900) - i.left - i.right, 100), height: Math.max((rect.height || 600) - i.top - i.bottom, 100) };
  };
  function fit(): void {
    const box = bounds(state.positions);
    const area = visibleRect(), margin = 70;
    const k = Math.min((area.width - 2 * margin) / box.width, (area.height - 2 * margin) / box.height, 1.6);
    state.view = { k: Math.max(k, 0.05), tx: 0, ty: 0 };
    state.view.tx = area.x + area.width / 2 - (box.x + box.width / 2) * state.view.k;
    state.view.ty = area.y + area.height / 2 - (box.y + box.height / 2) * state.view.k;
    applyView();
  }

  function placeLink(link: ModelLink, els: LinkEls): void {
    const p = at(link.a.hostname), q = at(link.b.hostname);
    const clear: [number, number] = [reach(boxOf(link.a.hostname), q.x - p.x, q.y - p.y), reach(boxOf(link.b.hostname), q.x - p.x, q.y - p.y)]; // les noms de port hors des cartes
    const shape = curve(p, q, link, clear);
    [els.line, els.hit, els.halo, els.diff].forEach((el) => { if (el) el.setAttribute("d", shape.path); });
    if (els.mark) { els.mark.setAttribute("cx", String(shape.mid.x)); els.mark.setAttribute("cy", String(shape.mid.y)); }
    els.ports.forEach((text, i) => {
      text.setAttribute("x", String(shape.ends[i].x));
      text.setAttribute("y", String(shape.ends[i].y));
      text.setAttribute("text-anchor", shape.anchor || "middle");
    });
  }

  function drawLink(link: ModelLink): SVGGElement {
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
      "aria-label": `${endLabel(link.a)} ↔ ${endLabel(link.b)} · ${STATUS_LABEL[link.status]} · ${link.combo}${change ? " · " + DIFF_LABEL[change] : ""}` },
      diffHalo, halo, line, hit, mark, ports);
    const els: LinkEls = { group, line, hit, halo, diff: diffHalo, mark, ports };
    state.linkEls.set(link.id, els);
    placeLink(link, els);
    bindFocus(group, { kind: "link", id: link.id }, () => toScreen(curve(at(link.a.hostname), at(link.b.hostname), link).mid));
    return group;
  }

  // La bande suit l'axe de ses propres câbles (décalé de l'axe de la paire quand un autre faisceau la partage).
  // L'étiquette s'écarte de la bande au-delà de l'éventail, du côté du haut de l'écran, ou du côté extérieur quand la
  // bande n'est pas au centre de la paire : deux faisceaux côte à côte ont leurs noms de part et d'autre, jamais l'un
  // sur l'autre ni sur la bande voisine. Elle porte sa propre zone de clic, au-dessus des câbles : cliquer le nom
  // d'un faisceau l'ouvre toujours.
  function placeBeam(beam: Beam, els: BeamEls): void {
    const p = at(beam.a.hostname), q = at(beam.b.hostname);
    const axis = chord(p, q, els.shape.offset);
    els.band.setAttribute("d", axis.path);
    els.hit.setAttribute("d", axis.path);
    const dx = q.x - p.x, dy = q.y - p.y, length = Math.max(Math.hypot(dx, dy), 0.01);
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    const nx = -dy / length, ny = dx / length; // la normale à l'axe, celle des écarts de l'éventail
    const up = ny <= 0 ? 1 : -1; // son sens qui pointe vers le haut de l'écran
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

  function drawBeam(beam: Beam): SVGGElement {
    const shape = beamBand(beam);
    const band = s("path", { class: "beam-band", "stroke-width": shape.band });
    const hit = s("path", { class: "beam-hit", "stroke-width": shape.hit });
    const label = s("text", { class: "beam-label" }, beamLabel(beam, false));
    const labelHit = s("rect", { class: "beam-label-hit" });
    const tag = s("g", { class: "beam-tag", "data-beam": String(beam.index) }, labelHit, label);
    const classes = `beam${beam.peerLink ? " peer-link" : ""}${beam.degraded ? " degraded" : ""}${beam.mlags.length ? " mlag" : ""}`;
    const group = s("g", { class: classes, "data-beam": String(beam.index), tabindex: 0, role: "button",
      "aria-label": `faisceau ${endLabel({ hostname: beam.a.hostname, interface: beam.a.aggregate })} ⇄ ${endLabel({ hostname: beam.b.hostname, interface: beam.b.aggregate })} · ${beam.links.length} câble(s)` },
      band, hit);
    const els: BeamEls = { group, band, hit, label, labelHit, tag, shape };
    state.beamEls.set(beam.id, els);
    labelLayer.appendChild(tag);
    placeBeam(beam, els);
    bindFocus(group, { kind: "beam", id: beam.id }, () => toScreen(midpoint(beam.a.hostname, beam.b.hostname)));
    return group;
  }

  function placeCluster(cluster: Cluster, els: ClusterEls): void {
    const points = cluster.hosts.map((h) => state.positions.get(h)).filter((p): p is Point => !!p);
    const boxes = cluster.hosts.map(boxOf);
    const box = hull(points, Math.max(...boxes.map((b) => b.w)), Math.max(...boxes.map((b) => b.h)));
    (["x", "y", "width", "height"] as const).forEach((name) => els.rect.setAttribute(name, String(box[name])));
    els.label.setAttribute("x", String(box.x + 10));
    els.label.setAttribute("y", String(box.y + 15));
  }

  function drawCluster(cluster: Cluster): SVGGElement {
    const rect = s("rect", { class: "cluster-hull", rx: 12 });
    const label = s("text", { class: "cluster-label" }, clusterLabel(cluster));
    const group = s("g", { class: "cluster", "data-cluster": String(cluster.index), tabindex: 0, role: "button", "aria-label": clusterLabel(cluster) }, rect, label);
    const els: ClusterEls = { group, rect, label };
    state.clusterEls.set(cluster.id, els);
    placeCluster(cluster, els);
    bindFocus(group, { kind: "cluster", id: cluster.id }, () => toScreen({ x: Number(rect.getAttribute("x")) + 20, y: Number(rect.getAttribute("y")) + 20 }));
    return group;
  }

  function drawNode(node: ModelNode): SVGGElement {
    const checks = model.checksByNode.get(node.hostname) || [];
    const severity = worst(checks);
    // Le rôle HA d'un membre, tel qu'enregistré dans le snapshot (primary, secondary, active, standby, member) : écrit
    // sous l'étiquette de type, et une classe par famille de rôle pour le fond.
    const memberships = model.haMembershipsByHost.get(node.hostname) || [];
    const ha = memberships[0] || null;
    const haState = memberships.some((m) => m.member.state === "down") ? "down" : ha ? ha.member.state : null;
    const haClasses = ha ? ` ha-member ha-${haRoleGroup(ha.cluster.raw.mode, ha.member.role)} ha-state-${haState}` : "";
    // Entrée sélectionne : pour un lecteur d'écran c'est un bouton, pas un groupe (revue, B7).
    // Le nom domine ; le type est une icône dessinée (icons.ts), le rôle HA s'écrit sous l'icône.
    const typeLabel = node.type ? ICON_LABEL[node.type] || node.type : null;
    const change = changeOf("node", node, node.hostname); // le diff : une couronne autour du nœud ; un fantôme s'estompe
    // La carte (card.ts) : icône de type (trois couches, icons.ts), nom, rôle HA et compte de stack dedans ; un voisin inconnu reste un disque.
    const name = node.kind === "stub" ? shortName(node.hostname) : displayName(node.hostname);
    const card = node.kind === "stub" ? null : cardPlan(name, { role: ha ? ha.member.role : null, stack: node.stack ? node.stack.member_count : null }, model.cardWidth);
    const box: Box = card || { w: STUB_R * 2, h: STUB_R * 2 };
    cards.set(node.hostname, box);
    const ring = change && change !== "removed" ? (card ? s("rect", { class: "node-ring", x: -card.w / 2 - 4, y: -card.h / 2 - 4, width: card.w + 8, height: card.h + 8, rx: card.rx + 4 })
      : s("circle", { class: "node-ring", r: STUB_R + 4 })) : null;
    const pinned = state.pinned.has(node.hostname) ? " pinned" : ""; // une place voulue (couche d'intention), ou un glissé local
    const group = s("g", { class: `node kind-${node.kind} type-${node.type || "unknown"} hue-${hueOfNode(model, node)} collection-${node.collection || "none"}${haClasses}${change ? " diff-" + change : ""}${pinned}`, tabindex: 0, role: "button", "data-node": node.hostname,
        "aria-label": `${node.hostname} · ${KIND_LABEL[node.kind]}${typeLabel ? " · " + typeLabel : ""}${node.collection ? " · collecte : " + node.collection : ""}${ha ? " · HA " + ha.member.role : ""}${change ? " · " + DIFF_LABEL[change] : ""}` },
      ring,
      card ? s("rect", { class: "node-shape", x: -card.w / 2, y: -card.h / 2, width: card.w, height: card.h, rx: card.rx }) : s("circle", { class: "node-shape", r: STUB_R }),
      card ? s("path", { class: "node-rail", d: card.rail }) : null,
      card ? typeGlyph(node.type, `translate(${card.icon.x},${card.icon.y}) scale(${card.icon.scale})`) : null,
      card && card.role && ha ? s("text", { class: "node-role", x: card.role.x, y: card.role.y, "text-anchor": card.role.anchor }, ha.member.role) : null,
      s("text", { class: "node-label", x: card ? card.label.x : 0, y: card ? card.label.y : STUB_R + 14, "text-anchor": card ? card.label.anchor : "middle" }, name),
      card && card.stack && node.stack ? s("text", { class: "node-stack", x: card.stack.x, y: card.stack.y, "text-anchor": card.stack.anchor }, "×" + node.stack.member_count) : null,
      severity === "error" || severity === "warning" ? s("circle", { class: "node-badge severity-" + severity, cx: box.w / 2 - 2, cy: -box.h / 2 + 2, r: 6 }) : null,
      s("path", { class: "node-pin", d: PIN_PATH, transform: `translate(${-box.w / 2 - 9},${-box.h / 2 - 9})` }));
    state.nodeEls.set(node.hostname, group);
    moveNode(node.hostname);
    pointer.bindNode(group, node.hostname);
    bindFocus(group, { kind: "node", id: node.hostname }, () => screenPoint(node.hostname));
    return group;
  }

  function moveNode(hostname: string): void {
    const p = at(hostname);
    (state.nodeEls.get(hostname) as SVGGElement).setAttribute("transform", `translate(${p.x},${p.y})`);
  }

  // Tout ce qui touche un équipement déplacé suit : ses câbles, ses faisceaux, le cadre de son cluster.
  function follow(hostname: string): void {
    (model.linksByNode.get(hostname) || []).forEach((link) => { const els = state.linkEls.get(link.id); if (els) placeLink(link, els); });
    (model.beamsByNode.get(hostname) || []).forEach((beam) => { const els = state.beamEls.get(beam.id); if (els) placeBeam(beam, els); });
    model.clusters.forEach((cluster) => { const els = state.clusterEls.get(cluster.id); if (els && cluster.hosts.includes(hostname)) placeCluster(cluster, els); });
  }

  // La position d'un équipement à l'écran, et s'il est dans le cadre du canevas.
  function screenPoint(hostname: string): Point {
    const p = at(hostname);
    return { x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty };
  }
  const onScreen = (point: Point, rect: { width: number; height: number }): boolean => point.x >= 0 && point.x <= rect.width && point.y >= 0 && point.y <= rect.height;
  const toScreen = (p: Point): Point => ({ x: p.x * state.view.k + state.view.tx, y: p.y * state.view.k + state.view.ty });
  const midpoint = (h1: string, h2: string): Point => { const p = at(h1), q = at(h2); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; };

  // Au clavier, tout élément du graphe se sélectionne par Entrée ; son focus l'amène en vue s'il est hors cadre, montre sa
  // bulle à côté de lui et la lui rattache ; la perte du focus la cache. Le focus reçu à l'appui ne rallume pas la bulle
  // que l'appui vient de cacher (revue, B1, B2, B7).
  function bindFocus(group: SVGGElement, selection: Selection, pointOf: () => Point): void {
    group.addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") select(selection); });
    group.addEventListener("focus", () => {
      if (pointer.busy()) return;
      const rect = svg.getBoundingClientRect();
      if (!onScreen(pointOf(), rect)) centerOn(selection);
      const point = pointOf();
      tip.show(selection.kind + ":" + selection.id, () => tipLines(selection), point.x, point.y, rect);
      group.setAttribute("aria-describedby", tip.id);
    });
    group.addEventListener("blur", () => { tip.hide(); group.removeAttribute("aria-describedby"); });
  }

  // Ce que le pointeur a touché : un câble, un faisceau, un cluster, un équipement, ou le fond. On remonte du point
  // touché (un tracé, une étiquette, une forme) jusqu'au groupe qui porte l'identité.
  function entityAt(target: EventTarget | null): Selection | null {
    for (let el = target as Element | null; el && el !== svg && el.getAttribute; el = el.parentNode as Element | null) {
      const link = el.getAttribute("data-link"), beam = el.getAttribute("data-beam"), cluster = el.getAttribute("data-cluster"), node = el.getAttribute("data-node");
      if (link !== null) return { kind: "link", id: linkAt(Number(link)).id };
      if (beam !== null) return { kind: "beam", id: model.beams[Number(beam)].id };
      if (cluster !== null) return { kind: "cluster", id: model.clusters[Number(cluster)].id };
      if (node !== null) return { kind: "node", id: node };
    }
    return null;
  }

  function tipLines(selection: Selection): Block[] {
    if (selection.kind === "link") return linkLines(model, linkOf(model, selection) as ModelLink);
    if (selection.kind === "node") return nodeLines(model, nodeOf(model, selection) as ModelNode);
    if (selection.kind === "beam") return beamLines(beamOf(model, selection) as Beam);
    return clusterLines(clusterOf(model, selection) as Cluster);
  }

  interface Related { hosts: Set<string>; links: Set<string>; beams: Set<string>; clusters: Set<string> }

  // Ce qu'une sélection multiple éclaire : ses équipements, et les câbles, faisceaux et clusters entièrement entre eux.
  function relatedToHosts(hosts: Set<string>): Related {
    const related: Related = { hosts: new Set(hosts), links: new Set(), beams: new Set(), clusters: new Set() };
    hosts.forEach((host) => (model.linksByNode.get(host) || []).forEach((link) => { if (hosts.has(link.a.hostname) && hosts.has(link.b.hostname)) related.links.add(link.id); }));
    model.beams.forEach((beam) => { if (hosts.has(beam.a.hostname) && hosts.has(beam.b.hostname)) related.beams.add(beam.id); });
    model.clusters.forEach((cluster) => { if (cluster.hosts.every((host) => hosts.has(host))) related.clusters.add(cluster.id); });
    return related;
  }

  // Ce qu'une sélection éclaire : les équipements, câbles, faisceaux et clusters qui la concernent.
  function relatedTo(selection: Selection | null): Related {
    const related: Related = { hosts: new Set(), links: new Set(), beams: new Set(), clusters: new Set() };
    if (!selection || !entityOf(model, selection)) return related;
    const addLink = (link: ModelLink): void => { related.links.add(link.id); related.hosts.add(link.a.hostname); related.hosts.add(link.b.hostname); };
    hostsOf(model, selection).forEach((host) => related.hosts.add(host));
    if (selection.kind === "node") {
      const node = nodeOf(model, selection) as ModelNode;
      (model.linksByNode.get(node.hostname) || []).forEach(addLink);
      (model.beamsByNode.get(node.hostname) || []).forEach((beam) => related.beams.add(beam.id));
      (model.clustersByHost.get(node.hostname) || []).forEach((cluster) => related.clusters.add(cluster.id));
    } else if (selection.kind === "link") {
      const link = linkOf(model, selection) as ModelLink;
      if (link.beam) related.beams.add(link.beam.id);
    } else if (selection.kind === "aggregate") {
      const aggregate = aggregateOf(model, selection);
      if (aggregate) { aggregate.cables.forEach(addLink); aggregate.beams.forEach((beam) => related.beams.add(beam.id)); }
    } else if (selection.kind === "beam") {
      (beamOf(model, selection) as Beam).links.forEach(addLink);
    } else if (selection.kind === "cluster") {
      (clusterOf(model, selection) as Cluster).heartbeats.forEach((hb) => { if (hb.link) addLink(hb.link); });
    }
    return related;
  }

  function paintSelection(): void {
    const selection = state.selection;
    const related = multi() ? relatedToHosts(state.selected) : relatedTo(selection);
    const is = (kind: string, id: string): boolean => !!selection && selection.kind === kind && selection.id === id;
    svgClasses();
    const query = parseRule(state.query); // `[champ:]regex` : `type:firewall` éclaire les firewalls, `adm` les noms qui le contiennent
    const selectedAggregate = selection && selection.kind === "aggregate" ? aggregateOf(model, selection) : null;
    state.nodeEls.forEach((el, id) => {
      const node = model.nodeByHost.get(id);
      el.classList.toggle("selected", is("node", id) || state.selected.has(id) || (!!selectedAggregate && selectedAggregate.hostname === id));
      el.classList.toggle("related", related.hosts.has(id));
      el.classList.toggle("match", !!node && matches(query, node));
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

  // La sélection simple : un élément, lu ; un équipement est aussi le seul membre de la sélection multiple. La page
  // apprend l'élément (`onSelect`) et, si elle écoute, la sélection multiple (`onHosts`).
  const notifyHosts = (): void => { if (options.onHosts) options.onHosts(Array.from(state.selected)); };
  function select(selection: Selection | null): void {
    state.selection = selection;
    state.selected = new Set(selection && selection.kind === "node" ? [selection.id] : []);
    paintSelection();
    onSelect(selection);
    notifyHosts();
  }
  // La sélection multiple : des équipements de cette run ; un seul redevient une sélection simple, aucun = rien.
  function selectHosts(hosts: string[]): void {
    const kept = new Set(hosts.filter((host) => model.nodeByHost.has(host)));
    state.selected = kept;
    state.selection = kept.size === 1 ? { kind: "node", id: Array.from(kept)[0] } : null;
    paintSelection();
    onSelect(state.selection);
    notifyHosts();
  }
  function toggleHost(hostname: string): void {
    const next = new Set(state.selected);
    if (next.has(hostname)) next.delete(hostname); else next.add(hostname);
    selectHosts(Array.from(next));
  }
  // Le rectangle de sélection : les équipements dessinés dont le centre est dans le rectangle d'écran.
  function selectIn(rect: ScreenRect): void {
    const inside = Array.from(state.nodeEls.keys()).filter((host) => {
      const p = screenPoint(host);
      return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
    });
    selectHosts(inside);
  }
  function alignSelected(mode: AlignMode): Map<string, Point> {
    const moved = alignPositions(state.positions, Array.from(state.selected).filter((host) => state.nodeEls.has(host)), mode);
    moved.forEach((point, host) => moveTo(host, point));
    if (moved.size && options.onPins) options.onPins(moved, "aligned");
    return moved;
  }

  // Les membres d'un cluster s'attirent comme s'ils étaient câblés : le cadre reste compact, un membre injoignable
  // (sans câble) se place à côté de son pair au lieu d'être rangé sous le graphe.
  function layoutEdges(): Edge[] {
    const edges: Edge[] = allLinks().map((l) => [l.a.hostname, l.b.hostname]); // un câble retiré attire encore ses deux bouts : le fantôme se dessine là où il était
    model.clusters.forEach((c) => c.hosts.slice(1).forEach((host) => edges.push([c.hosts[0], host, 2.5])));
    return edges;
  }

  // Le placement, en deux temps. 1) L'infrastructure (équipements, externes, fantômes) : fixée par ses places
  // mémorisées puis par ses épingles (l'intention gagne), les autres placés autour ; ce qui vient d'être placé par les
  // forces entre dans la mémoire de la page (ni un fantôme, ni un nœud rangé sous le graphe, ni un nœud tenu par une
  // épingle : la mémoire n'est pas une copie de l'intention, revue B1). 2) Les voisins inconnus, autour de
  // l'infrastructure toute fixée : les afficher ne déplace jamais un équipement ; un voisin inconnu qui a une place
  // (un équipement retiré de la collecte survit en stub) se dessine là où il était, mais aucun n'est jamais mémorisé.
  let unplaced = new Set<string>(); // les équipements dessinés sans place à retenir (rangés sous le graphe)
  function place(nodes: ModelNode[]): { positions: Map<string, Point>; fresh: Map<string, Point> } {
    const edges = layoutEdges();
    const card = { w: model.cardWidth, h: CARD_H };
    const infra = nodes.filter((n) => n.kind !== "stub").map((n) => n.hostname);
    const stubs = nodes.filter((n) => n.kind === "stub").map((n) => n.hostname);
    const of = (ids: string[], source: Map<string, Point>): [string, Point][] => ids.filter((id) => source.has(id)).map((id) => [id, source.get(id) as Point]);
    const remembered = of(infra, state.placed);
    const base = placeAll(infra, edges, new Map([...remembered, ...of(infra, state.pinned)]), { extend: remembered.length > 0, card });
    const fresh = new Map<string, Point>();
    const held = wired(infra, edges);
    unplaced = new Set(infra.filter((id) => !held.has(id)));
    infra.forEach((id) => {
      const node = model.nodeByHost.get(id);
      if (state.placed.has(id) || state.pinned.has(id) || !held.has(id) || !node || node.ghost) return;
      const point = { ...(base.get(id) as Point) };
      state.placed.set(id, point);
      fresh.set(id, point);
    });
    if (!stubs.length) return { positions: base, fresh };
    const fixed = new Map([...base, ...of(stubs, state.placed), ...of(stubs, state.pinned)]);
    return { positions: placeAll(nodes.map((n) => n.hostname), edges, fixed, { extend: true, card }), fresh };
  }

  // Replace tout : nœuds visibles, placement (les nœuds épinglés et mémorisés gardent leur place), tracés.
  function render(keepView: boolean, replace = false): Drawn {
    const nodes = visibleNodes();
    const shown = new Set(nodes.map((n) => n.hostname));
    const links = visibleLinks(shown);
    const { positions, fresh } = place(nodes);
    state.positions = positions;
    tip.hide(); // l'élément survolé va être redessiné
    [state.nodeEls, state.linkEls, state.beamEls, state.clusterEls, cards].forEach((map) => map.clear());
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

  // Amène l'élément choisi au milieu de l'écran, à un zoom où son nom se lit : sur 400 nœuds, le sélectionner sans
  // le centrer laisse un point de quelques pixels dans un graphe estompé.
  function centerOn(selection: Selection | null): void {
    const ends = hostsOf(model, selection).map((host) => state.positions.get(host)).filter((p): p is Point => !!p);
    if (!ends.length) return;
    const area = visibleRect();
    const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
    state.view.k = Math.max(state.view.k, 0.8);
    state.view.tx = area.x + area.width / 2 - x * state.view.k;
    state.view.ty = area.y + area.height / 2 - y * state.view.k;
    applyView();
  }

  // Montre un élément choisi ailleurs (table des contrôles, des sources, des structures) : le rend visible, puis le
  // sélectionne. Un faisceau ou un agrégat rallume les statuts de ses câbles.
  function reveal(selection: Selection | null): boolean {
    if (!selection) { select(null); return false; }
    const entity = entityOf(model, selection);
    const links: ModelLink[] = selection.kind === "link" ? [linkOf(model, selection)].filter((l): l is ModelLink => !!l)
      : selection.kind === "beam" ? (beamOf(model, selection) || { links: [] as ModelLink[] }).links
      : selection.kind === "aggregate" ? (aggregateOf(model, selection) || { cables: [] as ModelLink[] }).cables : [];
    const hosts = hostsOf(model, selection).concat(links.flatMap((link) => [link.a.hostname, link.b.hostname]));
    const needsStubs = hosts.some((host) => (model.nodeByHost.get(host) || { kind: null }).kind === "stub");
    let redraw = false;
    if (entity && (entity as { ghost?: boolean }).ghost && !state.showDiff) { state.showDiff = true; redraw = true; } // un fantôme ne se montre qu'avec les changements
    if (needsStubs && !state.showStubs) { state.showStubs = true; redraw = true; }
    links.forEach((link) => { if (state.hiddenStatuses.has(link.status)) { state.hiddenStatuses.delete(link.status); redraw = true; } });
    if (redraw) render(true);
    select(selection);
    centerOn(selection);
    return redraw;
  }

  // Après une écriture acceptée : les épingles enregistrées s'ajoutent aux épingles locales (un glissé encore en
  // attente ou refusé reste local, il n'est pas effacé ; revue B4, M3), et un nœud dessiné loin de son épingle la
  // rejoint sans replacer le reste (« replacer » pendant un envoi).
  function syncPins(): void {
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

  // Après une réponse de l'API : le document enregistré est la mémoire (une autre page a pu dessiner le même
  // équipement la première, ou tout replacer) ; un équipement dessiné ailleurs que sa place, ou sans place alors
  // qu'il en mérite une, et non épinglé, est replacé, et la page renvoie ce qu'elle place (revue, H1, M1).
  function syncPlaces(): void {
    state.placed = savedPlaces();
    const stale = Array.from(state.nodeEls.keys()).some((host) => {
      const node = model.nodeByHost.get(host), place = state.placed.get(host), current = state.positions.get(host);
      if (!node || !current || state.pinned.has(host)) return false;
      if (place) return place.x !== current.x || place.y !== current.y;
      return node.kind !== "stub" && !node.ghost && !unplaced.has(host);
    });
    if (stale) render(true);
  }

  const drawn = (): Drawn => ({ nodes: state.nodeEls.size, links: state.linkEls.size });

  return { state, render: (keepView) => render(keepView), fit, select, selectHosts, alignSelected, reveal, repaint: paintSelection,
    resetPins: () => { state.pinned = savedPins(); return render(true); },
    replaceAll: () => { state.pinned = savedPins(); state.placed = new Map(); return render(false, true); },
    syncPins, syncPlaces, recolor: () => render(true),
    // Une épingle retirée replace le graphe seulement si son équipement est dessiné (une orpheline ne bouge rien).
    unpin: (hostnames) => {
      const shown = hostnames.some((host) => state.nodeEls.has(host));
      hostnames.forEach((host) => state.pinned.delete(host));
      return shown ? render(true) : drawn();
    } };
}

export const graph = { create };
