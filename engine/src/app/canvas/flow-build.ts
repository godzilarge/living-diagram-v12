// Ce que React Flow doit dessiner, lu dans la toile (sorti de Flow.tsx à la revue du lot 3, B7 : la couture entre ce
// qui se calcule depuis la toile et ce qui réagit aux gestes). Une fonction de la toile et des droits d'écriture : nœuds
// (cartes, disques, clusters, cadres, annotations, connecteurs), arêtes (câbles, faisceaux, étiquettes, vitesses), et
// les boîtes, cadres et bouts que la toile garde pour ses calculs. Rien ne s'y déduit : la donnée et scene.ts.
import { t } from "../../i18n";
import { STUB_R, plan as cardPlan, displayName, shortName, textWidth } from "../../canvas/card";
import { PILL_H } from "../../canvas/pill";
import type { Box } from "../../canvas/card";
import { COLLECTION_LABEL, DIFF_LABEL, haModeText, KIND_LABEL } from "../../canvas/format";
import { beamBand, beamLabel, clusterLabel, hull } from "../../canvas/geometry";
import { dashArray, frameOf, labelSlot } from "../../canvas/groups";
import { hueOfNode } from "../../canvas/hues";
import { LABEL as ICON_LABEL } from "../../canvas/icons";
import type { Point } from "../../canvas/layout";
import { aggregateOf, endLabel, haBadge, haRoleGroup, worst } from "../../canvas/model";
import { matches, parseRule } from "../../canvas/query";
import { nothingRevealed, reveal } from "../../canvas/reveal";
import { changeOf, relatedTo, relatedToHosts } from "../../canvas/scene";
import { speedGroups } from "../../canvas/speed";
import type { TagSlot } from "../../canvas/tags";
import { anchorRect, frameOf as annotationFrame, isOrphan, leaderOf, summary as annotationSummary } from "../../canvas/annotations";
import type { AnchorPoint, Frame as AFrame } from "../../canvas/annotations";
import { bbox, pathOf } from "../../canvas/connectors";
import type { End, EndPlace, Shape } from "../../canvas/connectors";
import type { AnnotationNodeType } from "./annotation";
import type { ConnectorNodeType } from "./connector";
import type { BeamData, BeamEdgeType, CableData, CableEdgeType, SpeedEdgeType } from "./edges";
import { STUB_SLOT } from "./nodes";
import { beamTagId, placeCableTags, speedTagId } from "./tagging";
import { size as sizeOf } from "../state/selection";
import type { CardNodeType, ClusterNodeType, FrameNodeType, StubNodeType } from "./nodes";
import type { Toile } from "./toile";

export type FlowNode = CardNodeType | StubNodeType | ClusterNodeType | FrameNodeType | AnnotationNodeType | ConnectorNodeType;
export type FlowEdge = CableEdgeType | BeamEdgeType | SpeedEdgeType;
const Z_BACK = -40, Z_FRONT = 20;
/** Le disque d'un voisin inconnu : la boîte que les câbles, les cadres et l'accrochage lisent. */
export const STUB_BOX: Box = { w: STUB_R * 2, h: STUB_R * 2 };

export interface Built { nodes: FlowNode[]; edges: FlowEdge[]; key: string; hasSelection: boolean; frames: Map<string, AFrame>; ends: Map<string, { a: Point; b: Point; mid?: Point }>; boxes: Map<string, Box> }
/** Ce que la page règle pour les annotations : peut-on écrire (sinon rien ne se glisse), et une boîte posée localement
 *  en attendant la réponse de l'API (un glissé ou un redimensionnement relâché ne saute pas en arrière). */
/** `control` : la vue Contrôle (2026-10-09), où cadres, annotations et connecteurs restent dessinés mais inertes. Les
 *  boîtes et bouts posés localement vivent dans la toile (`toile.pending`, `toile.pendingEnds`). */
export interface AnnotationLocal { editable: boolean; control: boolean }
const flags = (selected: boolean, related: boolean, match = false): string => (selected ? " selected" : "") + (related ? " related" : "") + (match ? " match" : "");
export const selectionKey = (nodes: { id: string }[], edges: { id: string }[]): string => nodes.map((n) => n.id).sort().join("|") + "#" + edges.map((e) => e.id).sort().join("|");

// Ce que React Flow doit dessiner, lu dans la toile : une carte ou un disque par équipement visible (position = coin
// haut gauche, la toile tient des centres), un cadre par cluster, sous les arêtes ; une bande par faisceau, un tracé
// par câble, puis les étiquettes des faisceaux au-dessus des câbles. Les classes sont celles de `/view`.
export function build(toile: Toile, local: AnnotationLocal): Built {
  const { model, state } = toile;
  const sc = toile.scene();
  const sel = state.selection;
  const multi = sizeOf(state.multi) >= 2;
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
    const label = [node.hostname, KIND_LABEL[node.kind], typeLabel, node.collection ? t("shell:canvas.collection", { status: COLLECTION_LABEL[node.collection] || node.collection }) : null, ha ? "HA " + ha.member.role : null, change ? DIFF_LABEL[change] : null].filter(Boolean).join(" · ");
    const selected = is("node", node.hostname) || state.selected.has(node.hostname) || (!!selectedAggregate && selectedAggregate.hostname === node.hostname);
    const hue = hueOfNode(model, node);
    const classes = `kind-${node.kind} type-${node.type || "unknown"} hue-${hue} collection-${node.collection || "none"}${haClasses}${change ? " diff-" + change : ""}${state.pinned.has(node.hostname) ? " pinned" : ""}${flags(selected, related.hosts.has(node.hostname), matches(query, node))}`;
    const center = state.positions.get(node.hostname) || { x: 0, y: 0 };
    if (node.kind === "stub") {
      boxes.set(node.hostname, STUB_BOX);
      return { id: node.hostname, type: "stub", position: { x: center.x - STUB_SLOT.w / 2, y: center.y - STUB_SLOT.h / 2 }, selected, ariaLabel: label, data: { hostname: node.hostname, name: shortName(node.hostname), change, classes, label, editable: local.editable } } satisfies StubNodeType;
    }
    const name = displayName(node.hostname);
    // Le rôle HA et le stack ne s'écrivent plus sous le nom : badge et chip sur le bord haut (chips.tsx).
    const plan = cardPlan(name, { role: null, stack: null }, model.cardWidth);
    const letter = ha ? haBadge(ha.cluster.raw.mode, ha.member.role) : null;
    const haChip = ha && letter ? { letter, down: haState === "down", title: t(haState === "down" ? "shell:canvas.haTitleDown" : "shell:canvas.haTitle", { role: ha.member.role, mode: haModeText(ha.cluster.raw.mode) }) } : null;
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
    return { id: "cluster:" + cluster.id, type: "cluster", position: { x: box.x, y: box.y }, selected, draggable: false, zIndex: -1, ariaLabel: t("shell:canvas.cluster", { label: clusterLabel(cluster, haModeText) }),
      data: { id: cluster.id, w: box.width, h: box.height, label: clusterLabel(cluster, haModeText), classes: flags(selected, related.clusters.has(cluster.id)).trim() } } satisfies ClusterNodeType;
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
    const selected = is("group", group.id) || state.multi.groups.includes(group.id);
    frames.push({ id: "group:" + group.id, type: "frame", position: { x: frame.x, y: frame.y }, selected, draggable: !local.control, selectable: !local.control, focusable: !local.control, ariaLabel: t("shell:canvas.group", { label: group.label }),
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
    const a = toile.pending.has(raw.id) ? { ...raw, ...toile.pending.get(raw.id) } : raw;
    const anchor = anchorOf(a);
    const frame = annotationFrame(a, anchor);
    if (!frame || isOrphan(model, a)) return;
    noteFrames.set(a.id, frame);
    const selected = is("annotation", a.id) || state.multi.annotations.includes(a.id);
    // enfant d'un équipement : sa position part du coin du nœud React Flow (la carte, ou le carré autour du disque)
    const slot = anchor && anchor.kind === "device" ? ((model.nodeByHost.get(a.anchor.ref || "") || { kind: null }).kind === "stub" ? STUB_SLOT : anchor.box) : null;
    const parent = anchor ? (anchor.kind === "device" && slot ? { parentId: a.anchor.ref || "", position: { x: slot.w / 2 + a.x, y: slot.h / 2 + a.y } } : { parentId: "group:" + a.anchor.ref, position: { x: a.x, y: a.y } }) : { position: { x: frame.x, y: frame.y } };
    const leader = a.leader && anchor ? leaderOf(frame, anchorRect(anchor)) : null;
    notes.push({ id: "annotation:" + a.id, type: "annotation", ...parent, selected, draggable: local.editable && !a.locked, selectable: !local.control, focusable: !local.control, zIndex: a.z === "back" ? Z_BACK : Z_FRONT,
      ariaLabel: t("shell:canvas.annotation", { summary: annotationSummary(a) }), data: { a, frame, leader, editable: local.editable, label: annotationSummary(a), multi, classes: flags(selected, related.annotations.has(a.id)).trim() } });
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
  const ends = new Map<string, { a: Point; b: Point; mid?: Point }>();
  sc.connectors.forEach((raw) => {
    const c = toile.pendingEnds.has(raw.id) ? { ...raw, ...toile.pendingEnds.get(raw.id) } : raw;
    const start = placeOf(c.start), end = placeOf(c.end);
    if (!start || !end) return;
    const path = pathOf(start, end, c.route, c.bend);
    ends.set(c.id, { a: path.a, b: path.b, mid: path.mid });
    const origin = bbox([path.a, path.b, path.mid]);
    const selected = is("connector", c.id) || state.multi.connectors.includes(c.id);
    // glissable avec une sélection (ses bouts libres suivent le bloc, connector.tsx) ; seul, il se glisse par son tracé
    lines.push({ id: "connector:" + c.id, type: "connector", position: { x: origin.x, y: origin.y }, selected, draggable: local.editable && !c.locked && !local.control, selectable: !local.control, focusable: !local.control, zIndex: c.z === "back" ? Z_BACK - 1 : Z_FRONT + 1,
      ariaLabel: t("shell:canvas.connector", { label: c.label || c.id }), data: { c, places: { start, end }, origin: { x: origin.x, y: origin.y }, editable: local.editable, label: c.label, classes: flags(selected, related.connectors.has(c.id)).trim() } });
  });
  // Ce que lit un lecteur d'écran, dans la langue de la page : React Flow pose sinon « node », « edge » et « Edge from X
  // to Y » en anglais (revue de l'interface bilingue, B4) ; les étiquettes et les vitesses, décoratives, se taisent.
  const role = (type: string): string => t(("shell:canvas.role." + type) as never) as unknown as string;
  const all = (frames as FlowNode[]).concat(clusters, nodes, notes, lines).map((n) => ({ ...n, domAttributes: { "aria-roledescription": role(n.type || "card") } }));
  const spoken = (e: FlowEdge): FlowEdge => {
    if (e.type === "cable") { const link = (e.data as CableData).link; return { ...e, ariaLabel: t("shell:canvas.cable", { a: endLabel(link.a), b: endLabel(link.b) }), domAttributes: { "aria-roledescription": role("cable") } }; }
    if (e.type === "beam") return { ...e, ariaLabel: t("shell:canvas.beam", { label: beamLabel((e.data as BeamData).beam, true) }), domAttributes: { "aria-roledescription": role("beam") } };
    return { ...e, domAttributes: { "aria-hidden": "true" } };
  };
  const edges: FlowEdge[] = (beams as FlowEdge[]).concat(cables, labels, speeds).map(spoken);
  return { nodes: all, edges, key: selectionKey(all.filter((n) => n.selected), edges.filter((e) => e.selected)), hasSelection: !!sel || multi, frames: noteFrames, ends, boxes };
}

