// La toile React Flow de l'application : dessine ce que la toile (toile.ts) décrit, et lui rapporte ce que
// l'utilisateur fait (clic, Maj + clic, rectangle, glissé d'un équipement ou de la sélection, survol). Les nœuds et
// arêtes sont reconstruits à chaque version de la toile depuis son état (positions, filtres, sélection, règle de
// recherche) ; React Flow tient la vue (zoom, décalage), les appuis et le clavier. Rien n'est déduit ici : ce qui
// est dessiné est dans le snapshot, ce qui est placé vient de scene.ts.
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, ViewportPortal, applyEdgeChanges, applyNodeChanges, useReactFlow } from "@xyflow/react";
import type { EdgeChange, NodeChange, Viewport } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { TableContent } from "../../contracts/intent";
import type { ConnectorPatch } from "../../shell/apps";
import type { ContextTarget } from "../state/context";
import { STUB_R, plan as cardPlan, displayName, shortName, textWidth } from "../../canvas/card";
import { PILL_H } from "../../canvas/pill";
import type { Box } from "../../canvas/card";
import { DIFF_LABEL, KIND_LABEL } from "../../canvas/format";
import { beamBand, clusterLabel, hull } from "../../canvas/geometry";
import { dashArray, frameOf, labelSlot } from "../../canvas/groups";
import { hueOfNode } from "../../canvas/hues";
import { LABEL as ICON_LABEL } from "../../canvas/icons";
import type { Point } from "../../canvas/layout";
import { aggregateOf, haBadge, haRoleGroup, worst } from "../../canvas/model";
import { matches, parseRule } from "../../canvas/query";
import { nothingRevealed, reveal } from "../../canvas/reveal";
import { changeOf, relatedTo, relatedToHosts } from "../../canvas/scene";
import { speedGroups } from "../../canvas/speed";
import type { TagSlot } from "../../canvas/tags";
import { beamLines, clusterLines, create as createTip, groupLines, linkLines, nodeLines } from "../../canvas/tip";
import type { Line, Tip } from "../../canvas/tip";
import { anchorRect, frameOf as annotationFrame, isOrphan, leaderOf, summary as annotationSummary } from "../../canvas/annotations";
import type { AnchorPoint, Frame as AFrame } from "../../canvas/annotations";
import { annotationLines, connectorLines } from "../../canvas/tip";
import { DEFAULT_HEADS, DEFAULT_STYLE, bbox, pathOf } from "../../canvas/connectors";
import type { End, EndPlace, Shape } from "../../canvas/connectors";
import { AnchorDots } from "./anchors";
import { AnnotationContext, AnnotationNode, EditRequest } from "./annotation";
import type { AnnotationActions, AnnotationNodeType } from "./annotation";
import { ConnectorNode, Stroke, shapeOf } from "./connector";
import type { ConnectorNodeType } from "./connector";
import { pickEnd } from "./snap";
import type { Candidate, Pick } from "./snap";
import { edgeTypes } from "./edges";
import type { BeamData, BeamEdgeType, CableData, CableEdgeType, SpeedEdgeType } from "./edges";
import { nodeTypes } from "./nodes";
import { beamTagId, placeCableTags, speedTagId } from "./tagging";
import type { CardData, CardNodeType, ClusterNodeType, FrameNodeType, StubNodeType } from "./nodes";
import type { Toile } from "./toile";

type FlowNode = CardNodeType | StubNodeType | ClusterNodeType | FrameNodeType | AnnotationNodeType | ConnectorNodeType;
const allNodeTypes = { ...nodeTypes, annotation: AnnotationNode, connector: ConnectorNode };
const Z_BACK = -40, Z_FRONT = 20;
type FlowEdge = CableEdgeType | BeamEdgeType | SpeedEdgeType;
const ZOOM_FAR = 0.6, ZOOM_NEAR = 1.2, DRAG_THRESHOLD = 4, MIN_ZOOM = 0.05, MAX_ZOOM = 6, MOVE_MS = 220;
const SNAP_PX = 14; // à l'écran : un bout glissé s'accroche à une ancre à moins de cette distance
/** Le pas de la grille (unités du dessin) : affichée derrière la toile, et celle sur laquelle un glissé s'aimante. */
export const GRID = 20;
const STUB_BOX: Box = { w: STUB_R * 2, h: STUB_R * 2 };
/** Ce que la page règle sur la toile, hors de la vue partagée par l'adresse : des préférences du navigateur. */
export interface FlowPrefs { grid: boolean; snap: boolean; minimap: boolean; theme: "dark" | "light" }
// Les textes que React Flow donne aux lecteurs d'écran, en français et vrais : rien ne se supprime ici, un câble ne
// se focalise pas (il s'ouvre par la fiche d'un équipement ou par la recherche).
const ARIA_LABELS = {
  "node.a11yDescription.default": "Entrée ou Espace sélectionne l'équipement ; Échap vide la sélection.",
  "node.a11yDescription.keyboardDisabled": "Entrée ou Espace sélectionne l'équipement ; les flèches le déplacent, Maj pour aller plus vite ; Échap vide la sélection.",
  "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }: { direction: string; x: number; y: number }) => `Déplacé vers ${direction}. Position : ${x}, ${y}.`,
  "edge.a11yDescription.default": "Un câble : il s'ouvre depuis la fiche d'un équipement ou par la recherche.",
  "minimap.ariaLabel": "vue d'ensemble de la toile",
};
const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const minimapClass = (node: FlowNode): string => (node.type === "card" ? "mm-" + (node.data as CardData).hue : "mm-" + node.type);
const isHost = (node: FlowNode): boolean => node.type === "card" || node.type === "stub";

interface Built { nodes: FlowNode[]; edges: FlowEdge[]; key: string; hasSelection: boolean; frames: Map<string, AFrame>; ends: Map<string, { a: Point; b: Point }> }
/** Ce que la page règle pour les annotations : peut-on écrire (sinon rien ne se glisse), et une boîte posée localement
 *  en attendant la réponse de l'API (un glissé ou un redimensionnement relâché ne saute pas en arrière). */
export interface AnnotationLocal { editable: boolean; pending: Map<string, Partial<AFrame>> }
const flags = (selected: boolean, related: boolean, match = false): string => (selected ? " selected" : "") + (related ? " related" : "") + (match ? " match" : "");
const selectionKey = (nodes: { id: string }[], edges: { id: string }[]): string => nodes.map((n) => n.id).sort().join("|") + "#" + edges.map((e) => e.id).sort().join("|");

// Ce que React Flow doit dessiner, lu dans la toile : une carte ou un disque par équipement visible (position = coin
// haut gauche, la toile tient des centres), un cadre par cluster, sous les arêtes ; une bande par faisceau, un tracé
// par câble, puis les étiquettes des faisceaux au-dessus des câbles. Les classes sont celles de `/view`.
function build(toile: Toile, local: AnnotationLocal): Built {
  const { model, state } = toile;
  const sc = toile.scene();
  const sel = state.selection;
  const multi = state.selected.size >= 2;
  const related = multi ? relatedToHosts(model, state.selected) : relatedTo(model, sel);
  const is = (kind: string, id: string): boolean => !!sel && sel.kind === kind && sel.id === id;
  const selectedAggregate = sel && sel.kind === "aggregate" ? aggregateOf(model, sel) : null;
  const shown = multi ? nothingRevealed() : reveal(model, sel); // les faisceaux qu'un clic révèle (reveal.ts)
  const revealed = (id: string): string => (shown.primary.has(id) ? " reveal-primary" : shown.sibling.has(id) ? " reveal-sibling" : shown.peer.has(id) ? " reveal-peer" : "");
  const query = parseRule(state.query);
  const boxes = new Map<string, Box>();
  const nodes: FlowNode[] = sc.nodes.map((node) => {
    const memberships = model.haMembershipsByHost.get(node.hostname) || [];
    const ha = memberships[0] || null;
    const haState = memberships.some((m) => m.member.state === "down") ? "down" : ha ? ha.member.state : null;
    const haClasses = ha ? ` ha-member ha-${haRoleGroup(ha.cluster.raw.mode, ha.member.role)} ha-state-${haState}` : "";
    const change = changeOf(model, state.filters.showDiff, "node", node, node.hostname);
    const typeLabel = node.type ? ICON_LABEL[node.type] || node.type : null;
    const label = `${node.hostname} · ${KIND_LABEL[node.kind]}${typeLabel ? " · " + typeLabel : ""}${node.collection ? " · collecte : " + node.collection : ""}${ha ? " · HA " + ha.member.role : ""}${change ? " · " + DIFF_LABEL[change] : ""}`;
    const selected = is("node", node.hostname) || state.selected.has(node.hostname) || (!!selectedAggregate && selectedAggregate.hostname === node.hostname);
    const hue = hueOfNode(model, node);
    const classes = `kind-${node.kind} type-${node.type || "unknown"} hue-${hue} collection-${node.collection || "none"}${haClasses}${change ? " diff-" + change : ""}${state.pinned.has(node.hostname) ? " pinned" : ""}${flags(selected, related.hosts.has(node.hostname), matches(query, node))}`;
    const center = state.positions.get(node.hostname) || { x: 0, y: 0 };
    if (node.kind === "stub") {
      boxes.set(node.hostname, STUB_BOX);
      return { id: node.hostname, type: "stub", position: { x: center.x - STUB_R, y: center.y - STUB_R }, selected, ariaLabel: label, data: { hostname: node.hostname, name: shortName(node.hostname), change, classes, label, editable: local.editable } } satisfies StubNodeType;
    }
    const name = displayName(node.hostname);
    // Le rôle HA et le stack ne s'écrivent plus sous le nom : badge et chip sur le bord haut (chips.tsx).
    const plan = cardPlan(name, { role: null, stack: null }, model.cardWidth);
    const letter = ha ? haBadge(ha.cluster.raw.mode, ha.member.role) : null;
    const haChip = ha && letter ? { letter, down: haState === "down", title: "HA " + ha.member.role + " · " + ha.cluster.raw.mode + (haState === "down" ? " · membre tombé" : "") } : null;
    boxes.set(node.hostname, plan);
    return { id: node.hostname, type: "card", position: { x: center.x - plan.w / 2, y: center.y - plan.h / 2 }, selected, ariaLabel: label,
      data: { hostname: node.hostname, name, type: node.type, hue, plan, ha: haChip, members: node.stack ? node.stack.members : null, severity: worst(model.checksByNode.get(node.hostname) || []), change, classes, label, editable: local.editable } } satisfies CardNodeType;
  });
  const boxOf = (host: string): Box => boxes.get(host) || STUB_BOX;
  const clusters: FlowNode[] = sc.clusters.map((cluster) => {
    const points = cluster.hosts.map((h) => state.positions.get(h)).filter((p): p is Point => !!p);
    const members = cluster.hosts.map(boxOf);
    // La pastille HA d'un membre déborde du haut de sa carte : le cadre s'ouvre d'autant au-dessus, l'étiquette du
    // cluster reste lisible au-dessus des pastilles.
    const hulled = hull(points, Math.max(...members.map((b) => b.w)), Math.max(...members.map((b) => b.h)));
    const box = { ...hulled, y: hulled.y - PILL_H, height: hulled.height + PILL_H };
    const selected = is("cluster", cluster.id);
    return { id: "cluster:" + cluster.id, type: "cluster", position: { x: box.x, y: box.y }, selected, draggable: false, zIndex: -1, ariaLabel: "cluster " + clusterLabel(cluster),
      data: { id: cluster.id, w: box.width, h: box.height, label: clusterLabel(cluster), classes: flags(selected, related.clusters.has(cluster.id)).trim() } } satisfies ClusterNodeType;
  });
  // Les pastilles de câble se posent sur leur courbe, sans chevaucher une carte ni une autre pastille (tags.ts).
  const groups = speedGroups(model, sc.links);
  // Le titre d'un cluster HA (nodes.tsx : 14 px, à 14 du bord, ligne de base à 20) est un obstacle aussi.
  const titles = clusters.map((c) => { const d = (c as ClusterNodeType).data; return { x: c.position.x + 14, y: c.position.y + 4, w: Math.ceil(textWidth(d.label, 14) * 1.05), h: 20 }; });
  const slots = placeCableTags(groups, sc.beams, (host) => state.positions.get(host), boxes, titles);
  const MID: TagSlot = { t: 0.5, side: 0 };
  const beams: BeamEdgeType[] = sc.beams.map((beam) => {
    const selected = is("beam", beam.id);
    const classes = `${beam.peerLink ? "peer-link " : ""}${beam.degraded ? "degraded " : ""}${beam.mlags.length ? "mlag " : ""}${flags(selected, related.beams.has(beam.id)).trim()}${revealed(beam.id)}`;
    return { id: "beam:" + beam.id, type: "beam", source: beam.a.hostname, target: beam.b.hostname, selected, data: { beam, band: beamBand(beam), slot: slots.get(beamTagId(beam)) || MID, classes } };
  });
  // La vitesse (speed.ts) : une pastille par groupe, montrée par la couche « vitesses » ou quand le groupe est
  // sélectionné ou éclairé ; ses câbles cèdent alors leur point de gravité à la pastille.
  const covered = new Set<string>();
  const speeds: SpeedEdgeType[] = groups.map((group) => {
    const picked = group.links.some((l) => is("link", l.id)) || (!!group.beam && is("beam", group.beam.id));
    const lit = group.links.some((l) => related.links.has(l.id)) || (!!group.beam && related.beams.has(group.beam.id));
    const on = state.layers.speeds || picked || lit;
    if (on) group.links.forEach((l) => covered.add(l.id));
    const first = group.links[0];
    return { id: "speed:" + group.key, type: "speed", source: first.a.hostname, target: first.b.hostname, selectable: false, focusable: false,
      data: { group, slot: slots.get(speedTagId(group)) || MID, classes: (on ? "on" : "") + flags(picked, lit) } };
  });
  const cables: CableEdgeType[] = sc.links.map((link) => {
    const change = changeOf(model, state.filters.showDiff, "link", link, link.id);
    const selected = is("link", link.id);
    const classes = `link status-${link.status}${link.raw.oper === "down" ? " oper-down" : ""}${link.pairCount > 2 ? " crowded" : ""}${link.heartbeat ? " heartbeat" : ""}${change ? " diff-" + change : ""}${covered.has(link.id) ? " speed-covered" : ""}${flags(selected, related.links.has(link.id))}`;
    return { id: "link:" + link.id, type: "cable", source: link.a.hostname, target: link.b.hostname, selected, data: { link, boxA: boxOf(link.a.hostname), boxB: boxOf(link.b.hostname), change, classes } };
  });
  const labels: BeamEdgeType[] = beams.map((beam) => ({ ...beam, id: "beamlabel:" + (beam.data as BeamData).beam.id, type: "beamLabel" }));
  // Les cadres de groupe (docs/10 §5) : la boîte des membres présents, le plus grand dessous (G1), sous les clusters.
  const frames: FrameNodeType[] = [];
  sc.groups.forEach((group) => {
    const present = group.members.filter((host) => sc.shown.has(host) && state.positions.has(host));
    const frame = frameOf(present.map((host) => state.positions.get(host) as Point), present.map(boxOf), group.style);
    if (!frame) return;
    const selected = is("group", group.id);
    frames.push({ id: "group:" + group.id, type: "frame", position: { x: frame.x, y: frame.y }, selected, draggable: true, ariaLabel: "groupe " + group.label,
      data: { id: group.id, label: group.label, w: frame.w, h: frame.h, style: group.style, slot: labelSlot(frame, group.style), dash: dashArray(group.style), present: present.length,
        classes: flags(selected, related.groups.has(group.id)).trim(), editable: local.editable } });
  });
  frames.sort((a, b) => b.data.w * b.data.h - a.data.w * a.data.h);
  frames.forEach((frame, index) => { frame.zIndex = -3 - (frames.length - index); });
  // Les annotations (docs/10 §6) : une boîte depuis son ancre (A0), nœud enfant de sa carte ou de son cadre, dessous ou
  // dessus (A2) ; une boîte posée localement (glissé, redimensionnement en attente de l'API) remplace celle du document.
  const groupFrames = new Map(frames.map((f) => [f.data.id, { x: f.position.x, y: f.position.y, w: f.data.w, h: f.data.h }]));
  const anchorOf = (a: AnnotationNodeType["data"]["a"]): AnchorPoint | null => {
    if (a.anchor.kind === "device") { const center = state.positions.get(a.anchor.ref || ""); return center ? { kind: "device", center, box: boxOf(a.anchor.ref || "") } : null; }
    if (a.anchor.kind === "group") { const frame = groupFrames.get(a.anchor.ref || ""); return frame ? { kind: "group", frame } : null; }
    return null;
  };
  const notes: AnnotationNodeType[] = [];
  const noteFrames = new Map<string, AFrame>();
  sc.annotations.forEach((raw) => {
    const a = local.pending.has(raw.id) ? { ...raw, ...local.pending.get(raw.id) } : raw;
    const anchor = anchorOf(a);
    const frame = annotationFrame(a, anchor);
    if (!frame || isOrphan(model, a)) return;
    noteFrames.set(a.id, frame);
    const selected = is("annotation", a.id);
    const parent = anchor ? (anchor.kind === "device" ? { parentId: a.anchor.ref || "", position: { x: anchor.box.w / 2 + a.x, y: anchor.box.h / 2 + a.y } } : { parentId: "group:" + a.anchor.ref, position: { x: a.x, y: a.y } }) : { position: { x: frame.x, y: frame.y } };
    const leader = a.leader && anchor ? leaderOf(frame, anchorRect(anchor)) : null;
    notes.push({ id: "annotation:" + a.id, type: "annotation", ...parent, selected, draggable: local.editable && !a.locked, zIndex: a.z === "back" ? Z_BACK : Z_FRONT,
      ariaLabel: "annotation · " + annotationSummary(a), data: { a, frame, leader, editable: local.editable, label: annotationSummary(a), classes: flags(selected, related.annotations.has(a.id)).trim() } });
  });
  // Les connecteurs (docs/10 §6, 1.4.0) : un nœud posé au coin de leur boîte, qui dessine ses bouts depuis la place
  // vivante des éléments attachés (connector.tsx) ; ici, la place que la toile connaît (positions, cadres, boîtes).
  const placeOf = (end: End): EndPlace | null => {
    if (end.kind === "free") return { kind: "point", at: { x: end.x, y: end.y } };
    if (end.kind === "device") {
      const center = state.positions.get(end.ref), box = boxOf(end.ref);
      const shape: Shape = "rx" in box ? { kind: "rect", rx: (box as { rx: number }).rx } : { kind: "ellipse" };
      return center ? { kind: "box", frame: { x: center.x - box.w / 2, y: center.y - box.h / 2, w: box.w, h: box.h }, shape, side: end.side } : null;
    }
    if (end.kind === "group") {
      const frame = groupFrames.get(end.ref), group = model.groupById.get(end.ref);
      return frame && group ? { kind: "box", frame, shape: group.style.shape === "ellipse" ? { kind: "ellipse" } : { kind: "rect", rx: group.style.radius }, side: end.side } : null;
    }
    const frame = noteFrames.get(end.ref), a = model.annotationById.get(end.ref);
    const shape: Shape = a && a.content.kind === "shape" && a.content.shape === "ellipse" ? { kind: "ellipse" } : { kind: "rect", rx: a ? a.style.radius : 0 };
    return frame ? { kind: "box", frame, shape, side: end.side } : null;
  };
  const lines: ConnectorNodeType[] = [];
  const ends = new Map<string, { a: Point; b: Point }>();
  sc.connectors.forEach((c) => {
    const start = placeOf(c.start), end = placeOf(c.end);
    if (!start || !end) return;
    const path = pathOf(start, end, c.route, c.bend);
    ends.set(c.id, { a: path.a, b: path.b });
    const origin = bbox([path.a, path.b, path.mid]);
    const selected = is("connector", c.id);
    lines.push({ id: "connector:" + c.id, type: "connector", position: { x: origin.x, y: origin.y }, selected, draggable: false, zIndex: c.z === "back" ? Z_BACK - 1 : Z_FRONT + 1,
      ariaLabel: "connecteur · " + (c.label || c.id), data: { c, places: { start, end }, origin: { x: origin.x, y: origin.y }, editable: local.editable, label: c.label, classes: flags(selected, related.connectors.has(c.id)).trim() } });
  });
  const all = (frames as FlowNode[]).concat(clusters, nodes, notes, lines);
  const edges: FlowEdge[] = (beams as FlowEdge[]).concat(cables, labels, speeds);
  return { nodes: all, edges, key: selectionKey(all.filter((n) => n.selected), edges.filter((e) => e.selected)), hasSelection: !!sel || multi, frames: noteFrames, ends };
}

/** Un clic droit : la cible, la position d'écran du menu, le point du plan visé. */
export interface ContextRequest { target: ContextTarget; at: Point; plan: Point }
export interface FlowProps {
  toile: Toile; prefs: FlowPrefs; editable: boolean;
  onAnnotation: (id: string, patch: Partial<AFrame> & { text?: string; content?: TableContent }) => void;
  onConnector: (id: string, patch: ConnectorPatch) => void;
  /** Un connecteur tiré depuis une ancre jusqu'à un point ou un élément : créé par la page. */
  onConnectorCreate: (fields: { start: End; end: End }) => void;
  onContext: (request: ContextRequest) => void;
  /** Une édition en place demandée par le menu (cellule d'un tableau, texte d'une note). */
  editRequest: { id: string; cell: [number, number] | null; at: number } | null;
}
export function Flow(props: FlowProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

/** Un connecteur en train d'être tiré depuis une ancre : son départ (écrit tel quel), sa place, et ce que le bout d'arrivée vise. */
interface Draft { start: End; place: EndPlace; pick: Pick; from: Point; moved: boolean }
function Inner({ toile, prefs, editable, onAnnotation, onConnector, onConnectorCreate, onContext, editRequest }: FlowProps) {
  const rf = useReactFlow<FlowNode, FlowEdge>();
  const container = useRef<HTMLDivElement>(null);
  const tipSvg = useRef<SVGSVGElement>(null);
  const tipRef = useRef<Tip | null>(null);
  const dragging = useRef(false);
  const version = useSyncExternalStore(toile.subscribe, toile.version, toile.version);
  // Une boîte d'annotation posée localement vaut jusqu'à ce que le document la porte (ou qu'une autre version la contredise).
  const pending = useRef(new Map<string, Partial<AFrame>>());
  const built = useMemo(() => {
    pending.current.forEach((patch, id) => { const a = toile.model.annotationById.get(id); if (!a || Object.entries(patch).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v)) pending.current.delete(id); });
    const out = build(toile, { editable, pending: pending.current });
    toile.frames = out.frames;
    toile.ends = out.ends;
    return out;
  }, [toile, version, editable]);
  const hideTip = useCallback((): void => { if (tipRef.current) tipRef.current.hide(); }, []);
  // Un nœud React Flow attachable, vu comme candidat d'accrochage : sa boîte absolue (une annotation attachée est un
  // enfant), son contour (coins d'une carte, disque, forme, cadre).
  const candidateOf = useCallback((node: FlowNode): Candidate | null => {
    const internal = rf.getInternalNode(node.id);
    if (!internal) return null;
    const at = internal.internals.positionAbsolute;
    if (node.type === "card") { const plan = (node.data as CardData).plan; return { kind: "device", ref: node.id, frame: { x: at.x, y: at.y, w: plan.w, h: plan.h }, shape: shapeOf(node) }; }
    if (node.type === "stub") return { kind: "device", ref: node.id, frame: { x: at.x, y: at.y, w: STUB_BOX.w, h: STUB_BOX.h }, shape: shapeOf(node) };
    if (node.type === "annotation") { const data = node.data as AnnotationNodeType["data"]; return { kind: "annotation", ref: data.a.id, frame: { x: at.x, y: at.y, w: data.frame.w, h: data.frame.h }, shape: shapeOf(node) }; }
    if (node.type === "frame") { const data = node.data as FrameNodeType["data"]; return { kind: "group", ref: data.id, frame: { x: at.x, y: at.y, w: data.w, h: data.h }, shape: shapeOf(node) }; }
    return null;
  }, [rf]);
  const annotationActions = useMemo<AnnotationActions>(() => ({
    resize: (id, frame) => {
      const a = toile.model.annotationById.get(id);
      if (!a) return;
      // la boîte est en coordonnées du plan : rendue relative à l'ancre avant d'être écrite (A0)
      const current = toile.frames.get(id);
      const dx = current ? frame.x - current.x : 0, dy = current ? frame.y - current.y : 0;
      const patch = { x: a.x + dx, y: a.y + dy, w: frame.w, h: frame.h };
      pending.current.set(id, patch);
      onAnnotation(id, patch);
    },
    edit: (id, text) => onAnnotation(id, { text }),
    content: (id, content) => onAnnotation(id, { content }),
    menu: (target, event) => onContext({ target, at: { x: event.clientX, y: event.clientY }, plan: rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }) }),
    connector: (id, patch) => onConnector(id, patch),
    // un bout glissé : les éléments à portée du pointeur (cartes, disques, annotations, cadres), lus dans React Flow
    // avec leur place vivante, et ce que snap.ts en fait (une ancre à portée, l'élément dessous, ou libre)
    pick: (at, exclude) => {
      const tol = SNAP_PX / Math.max(rf.getZoom(), MIN_ZOOM);
      const hits = rf.getIntersectingNodes({ x: at.x - tol, y: at.y - tol, width: 2 * tol, height: 2 * tol });
      const candidates = hits.map(candidateOf).filter((c): c is Candidate => !!c);
      return pickEnd(candidates, at, tol, exclude);
    },
    drawStart: (start, at) => {
      const node = start.kind === "free" ? null : rf.getInternalNode(start.kind === "device" ? start.ref : start.kind === "group" ? "group:" + start.ref : "annotation:" + start.ref);
      const candidate = node ? candidateOf(node as unknown as FlowNode) : null;
      if (!candidate || start.kind === "free") return;
      const place: EndPlace = { kind: "box", frame: candidate.frame, shape: candidate.shape, side: start.side };
      hideTip();
      setDraft({ start, place, pick: { end: { kind: "free", x: Math.round(at.x), y: Math.round(at.y) }, place: { kind: "point", at }, target: null, anchors: [], snapped: null }, from: at, moved: false });
    },
    drawMove: (at) => setDraft((d) => (d ? { ...d, pick: annotationActions.pick(at, (kind, ref) => d.start.kind === kind && d.start.ref === ref), moved: d.moved || Math.hypot(at.x - d.from.x, at.y - d.from.y) > 6 } : null)),
    drawEnd: (at) => setDraft((d) => {
      if (d && d.moved) { const pick = annotationActions.pick(at, (kind, ref) => d.start.kind === kind && d.start.ref === ref); onConnectorCreate({ start: d.start, end: pick.end }); }
      return null;
    }),
  }), [toile, rf, onAnnotation, onConnector, onConnectorCreate, onContext, candidateOf, hideTip]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Draft | null>(null);
  const builtRef = useRef(built);
  builtRef.current = built;
  const [nodes, setNodes] = useState<FlowNode[]>(built.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(built.edges);
  const nodesRef = useRef(nodes), edgesRef = useRef(edges); // ce que React Flow montre, à jour avant que React rende
  const [zoom, setZoom] = useState(1);
  // Les nœuds reconstruits gardent les mesures que React Flow a déjà prises (`measured`) : sans elles, il les tient
  // pour neufs, les cache (`visibility: hidden`) et retire leurs câbles jusqu'à une nouvelle mesure, qui ne vient pas
  // toujours quand la taille n'a pas changé (vu au basculement des couches, 2026-10-07). Une taille qui change
  // (cadre de cluster ou de groupe) est remesurée par React Flow, comme avant.
  useEffect(() => {
    const seen = new Map(nodesRef.current.map((n) => [n.id, n.measured] as const));
    const next = built.nodes.map((n) => { const m = seen.get(n.id); return m && m.width !== undefined && m.height !== undefined ? ({ ...n, measured: m } as FlowNode) : n; });
    nodesRef.current = next; edgesRef.current = built.edges; setNodes(next); setEdges(built.edges);
  }, [built]);

  // La vue : la toile lit la taille du canevas et la vue courante, et pose une vue (cadrer, centrer).
  useEffect(() => {
    toile.attach({
      rect: () => { const el = container.current; return el ? el.getBoundingClientRect() : { width: 900, height: 600 }; },
      get: () => rf.getViewport(),
      set: (view, animate) => { void rf.setViewport(view, animate && !reducedMotion() ? { duration: MOVE_MS } : undefined); },
    });
    return () => toile.attach(null);
  }, [toile, rf]);
  // La bulle au survol (tip.ts), dans une couche SVG en coordonnées d'écran au-dessus de la toile.
  useEffect(() => {
    const svg = tipSvg.current;
    if (!svg) return;
    tipRef.current = createTip(svg);
    return () => { tipRef.current = null; };
  }, []);

  // Ce que l'utilisateur sélectionne dans React Flow (clic, Maj + clic, rectangle, clic sur le fond : des changements
  // `select`, jamais émis pour ce que la toile demande elle-même) devient la sélection de la toile, une fois les
  // changements des nœuds et des arêtes d'un même geste appliqués. Des équipements gagnent sur un cluster, qui gagne
  // sur une arête ; une sélection identique à celle que la toile a dessinée ne revient pas.
  // Un rectangle en cours (Maj + glissé) : React Flow sélectionne au fil du geste, et une toile reconstruite au milieu
  // lui faisait mêler les sélections (tout l'écran sélectionné, ou l'ancienne perdue). On attend la fin du rectangle,
  // puis ce qu'il couvre s'ajoute à la sélection d'avant (Orhan, 2026-10-07 : « je ne peux pas ajouter à la sélection »).
  const selecting = useRef<string[] | null>(null);
  const syncSelection = useCallback((): void => {
    if (selecting.current) return;
    const picked = nodesRef.current.filter((n) => n.selected), pickedEdges = edgesRef.current.filter((e) => e.selected);
    if (selectionKey(picked, pickedEdges) === builtRef.current.key) return;
    const hosts = picked.filter(isHost).map((n) => n.id);
    const frame = picked.find((n) => n.type === "frame") as FrameNodeType | undefined;
    const cluster = picked.find((n) => n.type === "cluster") as ClusterNodeType | undefined;
    const note = picked.find((n) => n.type === "annotation") as AnnotationNodeType | undefined;
    const line = picked.find((n) => n.type === "connector") as ConnectorNodeType | undefined;
    if (hosts.length >= 2) toile.selectHosts(hosts);
    else if (hosts.length === 1) toile.select({ kind: "node", id: hosts[0] });
    else if (note) toile.select({ kind: "annotation", id: note.data.a.id });
    else if (line) toile.select({ kind: "connector", id: line.data.c.id });
    else if (frame) toile.select({ kind: "group", id: frame.data.id });
    else if (cluster) toile.select({ kind: "cluster", id: cluster.data.id });
    else if (pickedEdges.length) {
      const edge = pickedEdges[0];
      toile.select(edge.type === "cable" ? { kind: "link", id: (edge.data as CableData).link.id } : { kind: "beam", id: (edge.data as BeamData).beam.id });
    } else toile.select(null);
  }, [toile]);
  const onSelectionStart = useCallback((): void => {
    const s = toile.state;
    selecting.current = s.selected.size ? Array.from(s.selected) : s.selection && s.selection.kind === "node" ? [s.selection.id] : [];
  }, [toile]);
  const onSelectionEnd = useCallback((): void => {
    const before = selecting.current || [];
    setTimeout(() => { // après les derniers changements `select` du geste
      selecting.current = null;
      const covered = nodesRef.current.filter((n) => n.selected && isHost(n)).map((n) => n.id);
      const hosts = Array.from(new Set(before.concat(covered)));
      if (hosts.length >= 2) toile.selectHosts(hosts);
      else if (hosts.length === 1) toile.select({ kind: "node", id: hosts[0] });
      else syncSelection();
    }, 0);
  }, [toile, syncSelection]);
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]): void => {
    nodesRef.current = applyNodeChanges(changes, nodesRef.current);
    setNodes(nodesRef.current);
    if (changes.some((c) => c.type === "select")) queueMicrotask(syncSelection);
  }, [syncSelection]);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]): void => {
    edgesRef.current = applyEdgeChanges(changes, edgesRef.current);
    setEdges(edgesRef.current);
    if (changes.some((c) => c.type === "select")) queueMicrotask(syncSelection);
  }, [syncSelection]);

  const showTip = useCallback((key: string, lines: () => Line[], event: ReactMouseEvent): void => {
    const tip = tipRef.current, el = container.current;
    if (!tip || !el || dragging.current) return;
    const rect = el.getBoundingClientRect();
    tip.show(key, lines, event.clientX - rect.left, event.clientY - rect.top, rect);
  }, []);
  // Glisser un cadre de groupe déplace ses membres présents de la même translation (G2) : leurs cartes suivent pendant
  // le glissé, et à la relâche ils reprennent leur centre dans la toile, un seul paquet d'épingles.
  const frameDrag = useRef<{ id: string; start: Point; members: Map<string, Point> } | null>(null);
  const onNodeDragStart = useCallback((_event: unknown, node: FlowNode): void => {
    dragging.current = true; hideTip();
    toile.flush(); // une rafale de flèches en attente se termine avant que le glissé commence
    if (node.type !== "frame") { frameDrag.current = null; return; }
    const group = toile.model.groupById.get((node as FrameNodeType).data.id);
    const members = new Map<string, Point>();
    (group ? group.members : []).forEach((host) => { const at = toile.state.positions.get(host); if (at) members.set(host, { ...at }); });
    frameDrag.current = { id: node.id, start: { ...node.position }, members };
  }, [toile, hideTip]);
  const onNodeDrag = useCallback((_event: unknown, node: FlowNode): void => {
    const drag = frameDrag.current;
    if (!drag || node.id !== drag.id) return;
    const dx = node.position.x - drag.start.x, dy = node.position.y - drag.start.y;
    nodesRef.current = nodesRef.current.map((n) => {
      const start = isHost(n) ? drag.members.get(n.id) : undefined;
      if (!start) return n;
      const box = n.type === "card" ? (n.data as CardData).plan : STUB_BOX;
      return { ...n, position: { x: start.x + dx - box.w / 2, y: start.y + dy - box.h / 2 } } as FlowNode;
    });
    setNodes(nodesRef.current);
  }, []);
  // Un glissé relâché : chaque équipement déplacé (un seul, ou toute la sélection) reprend son centre dans la toile.
  const onNodeDragStop = useCallback((_event: unknown, node: FlowNode, dragged: FlowNode[]) => {
    dragging.current = false;
    const drag = frameDrag.current;
    frameDrag.current = null;
    if (drag && node.id === drag.id) {
      const dx = Math.round(node.position.x - drag.start.x), dy = Math.round(node.position.y - drag.start.y);
      if (!dx && !dy) return;
      drag.members.forEach((start, host) => toile.moveTo(host, { x: start.x + dx, y: start.y + dy }));
      toile.dropped(Array.from(drag.members.keys()));
      return;
    }
    const hosts: string[] = [];
    dragged.forEach((n) => {
      if (n.type === "annotation") {
        // relâchée : sa position React Flow (libre : le plan ; enfant : relative au coin de son parent) redevient l'écart enregistré (A0, A3)
        const a = (n as AnnotationNodeType).data.a;
        const parent = n.parentId ? nodesRef.current.find((p) => p.id === n.parentId) : undefined;
        const box = parent && parent.type === "card" ? (parent.data as CardData).plan : parent && parent.type === "stub" ? STUB_BOX : null;
        const patch = a.anchor.kind === "device" && box ? { x: Math.round(n.position.x - box.w / 2), y: Math.round(n.position.y - box.h / 2) } : { x: Math.round(n.position.x), y: Math.round(n.position.y) };
        if (patch.x !== a.x || patch.y !== a.y) { pending.current.set(a.id, patch); onAnnotation(a.id, patch); }
        return;
      }
      if (!isHost(n)) return;
      const box = n.type === "card" ? (n.data as CardData).plan : STUB_BOX;
      toile.moveTo(n.id, { x: Math.round(n.position.x + box.w / 2), y: Math.round(n.position.y + box.h / 2) });
      hosts.push(n.id);
    });
    if (hosts.length) toile.dropped(hosts);
  }, [toile, onAnnotation]);
  const onNodeMouseMove = useCallback((event: ReactMouseEvent, node: FlowNode): void => {
    const model = toile.model;
    if (node.type === "cluster") {
      const cluster = model.clusters.find((c) => c.id === (node as ClusterNodeType).data.id);
      if (cluster) showTip("cluster:" + cluster.id, () => clusterLines(cluster), event);
      return;
    }
    if (node.type === "frame") {
      const data = (node as FrameNodeType).data, group = model.groupById.get(data.id);
      if (group) showTip("group:" + group.id, () => groupLines(group, data.present), event);
      return;
    }
    if (node.type === "annotation") { const a = (node as AnnotationNodeType).data.a; showTip("annotation:" + a.id, () => annotationLines(a), event); return; }
    if (node.type === "connector") { const c = (node as ConnectorNodeType).data.c; showTip("connector:" + c.id, () => connectorLines(c), event); return; }
    const found = model.nodeByHost.get(node.id);
    if (found) showTip("node:" + node.id, () => nodeLines(model, found), event);
  }, [toile, showTip]);
  const onEdgeMouseMove = useCallback((event: ReactMouseEvent, edge: FlowEdge): void => {
    const model = toile.model;
    if (edge.type === "cable") { const link = (edge.data as CableData).link; showTip("link:" + link.id, () => linkLines(model, link), event); }
    else if (edge.type !== "speed") { const beam = (edge.data as BeamData).beam; showTip("beam:" + beam.id, () => beamLines(beam), event); }
  }, [toile, showTip]);
  const onMove = useCallback((_event: unknown, view: Viewport): void => setZoom(view.zoom), []);
  // Le clic droit (Orhan, 2026-10-09) : un menu contextuel selon ce qu'il vise ; les annotations et les connecteurs
  // gèrent le leur (cellule visée), les autres nœuds, la sélection multiple et le fond passent par ici.
  const context = useCallback((event: ReactMouseEvent | MouseEvent, target: ContextTarget): void => {
    event.preventDefault();
    hideTip();
    onContext({ target, at: { x: event.clientX, y: event.clientY }, plan: rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  }, [rf, onContext, hideTip]);
  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: FlowNode): void => {
    if (node.type === "annotation" || node.type === "connector") { event.preventDefault(); return; } // le nœud a déjà ouvert le sien
    if (isHost(node)) context(event, { kind: "node", id: node.id });
    else if (node.type === "frame") context(event, { kind: "group", id: (node as FrameNodeType).data.id });
    else event.preventDefault();
  }, [context]);
  const onPaneContextMenu = useCallback((event: ReactMouseEvent | MouseEvent): void => context(event, { kind: "pane" }), [context]);
  const onSelectionContextMenu = useCallback((event: ReactMouseEvent, picked: FlowNode[]): void => {
    const host = picked.find(isHost);
    if (host) context(event, { kind: "node", id: host.id }); else event.preventDefault();
  }, [context]);
  // Ce qui garde sa taille d'écran quel que soit le zoom (la liste d'un stack, comme la bulle) lit l'inverse du zoom.
  useEffect(() => { const el = container.current; if (el) el.style.setProperty("--unzoom", String(1 / Math.max(zoom, MIN_ZOOM))); }, [zoom]);
  const onInit = useCallback((): void => toile.open(), [toile]);

  const rootClass = ["flow", built.hasSelection ? "has-selection" : "", toile.state.showPorts ? "show-ports" : "", toile.state.layers.beams ? "show-beams" : "", toile.state.layers.pins ? "" : "hide-pins", toile.state.query ? "searching" : "", zoom < ZOOM_FAR ? "zoom-far" : zoom >= ZOOM_NEAR ? "zoom-near" : ""].filter(Boolean).join(" ");
  return (
    <div ref={container} className="flow-host">
      <AnnotationContext.Provider value={annotationActions}>
      <EditRequest.Provider value={editRequest}>
      <ReactFlow<FlowNode, FlowEdge> className={rootClass} nodes={nodes} edges={edges} nodeTypes={allNodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeContextMenu} onPaneContextMenu={onPaneContextMenu} onSelectionContextMenu={onSelectionContextMenu}
        onNodeDragStart={onNodeDragStart} onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop} onNodeMouseMove={onNodeMouseMove} onNodeMouseLeave={hideTip}
        onEdgeMouseMove={onEdgeMouseMove} onEdgeMouseLeave={hideTip} onMoveStart={hideTip} onMove={onMove} onInit={onInit}
        onSelectionStart={onSelectionStart} onSelectionEnd={onSelectionEnd}
        minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} nodeDragThreshold={DRAG_THRESHOLD} selectionKeyCode="Shift" multiSelectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial} nodesConnectable={false} elevateEdgesOnSelect={false} elevateNodesOnSelect={false}
        zoomOnDoubleClick={false} deleteKeyCode={null} proOptions={{ hideAttribution: true }} fitView={false}
        edgesFocusable={false} colorMode={prefs.theme} ariaLabelConfig={ARIA_LABELS}
        snapToGrid={prefs.snap} snapGrid={[GRID, GRID]}>
        {prefs.grid ? <Background variant={BackgroundVariant.Lines} gap={GRID} lineWidth={1} /> : null}
        {prefs.minimap ? <MiniMap position="bottom-left" pannable zoomable nodeClassName={minimapClass} nodeBorderRadius={3} /> : null}
        {draft ? <ViewportPortal><DraftLayer draft={draft} k={1 / Math.max(zoom, MIN_ZOOM)} /></ViewportPortal> : null}
      </ReactFlow>
      </EditRequest.Provider>
      </AnnotationContext.Provider>
      <svg ref={tipSvg} className="tip-layer" aria-hidden="true" />
    </div>
  );
}

/** Le connecteur qu'on tire depuis une ancre : un trait en pointillé du départ au pointeur, dans le plan, les ancres
 *  de l'élément visé, et une flèche à l'arrivée (ce qu'il sera à la relâche). */
function DraftLayer({ draft, k }: { draft: Draft; k: number }) {
  const path = pathOf(draft.place, draft.pick.place, "straight", 0);
  const same = (p: Point): Point => p;
  return (
    <svg className="draft-layer connector hue-slate" aria-hidden="true">
      <Stroke d={path.d} a={path.a} b={path.b} dirA={path.dirA} dirB={path.dirB} heads={DEFAULT_HEADS} style={DEFAULT_STYLE} label="" mid={path.mid} />
      {draft.pick.target ? <AnchorDots anchors={draft.pick.anchors} snapped={draft.pick.snapped} rel={same} k={k} /> : null}
    </svg>
  );
}
