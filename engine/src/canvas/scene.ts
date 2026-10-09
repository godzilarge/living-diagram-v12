// La scène : ce qu'une toile montre d'une run, calculé sans DOM. Les nœuds, câbles, faisceaux et clusters visibles
// selon les filtres de vue ; le placement en deux temps (docs/09 : l'infrastructure fixée par les épingles puis la
// mémoire, le reste autour ; puis les voisins inconnus autour de l'infrastructure toute fixée) ; ce qu'une sélection
// éclaire. Extrait de graph.ts pour la toile de l'application (React Flow, 2026-10-07) ; pur, testé sous Node.
import { shownWith } from "./annotations";
import { attachedEnds, key as refKey, shownWith as connectorShown } from "./connectors";
import { CARD_H } from "./card";
import { run as placeAll, wired } from "./layout";
import type { Edge, Point } from "./layout";
import { aggregateOf, beamOf, clusterOf, entityOf, hostsOf, linkOf, nodeOf, presentOf } from "./model";
import { keepByRules } from "./query";
import { reveal } from "./reveal";
import type { Rule } from "./query";
import type { Annotation, Beam, Cluster, Connector, Group, Model, ModelLink, ModelNode, Selection } from "./types";

/** Les filtres de vue : voisins inconnus, changements (fantômes), statuts masqués, règles masquer / isoler. */
export interface Filters { showStubs: boolean; showDiff: boolean; hiddenStatuses: Set<string>; hide: Rule[]; only: Rule | null; showNotes?: boolean }
export interface Visible { nodes: ModelNode[]; links: ModelLink[]; beams: Beam[]; clusters: Cluster[]; groups: Group[]; annotations: Annotation[]; connectors: Connector[]; shown: Set<string> }

// Les fantômes du diff (retirés depuis la run d'avant) se dessinent avec les changements ; un fantôme stub suit la
// règle des stubs. Les voisins inconnus d'abord (bascule), puis les règles : masquer gagne sur isoler (query.ts). Un
// faisceau se dessine entre deux équipements distincts dès qu'un de ses câbles est visible ; un cluster dès que deux
// de ses membres le sont.
export function visible(model: Model, f: Filters): Visible {
  const allNodes = model.nodes.concat(f.showDiff ? model.ghostNodes : []);
  const allLinks = model.links.concat(f.showDiff ? model.ghostLinks : []);
  const nodes = keepByRules(allNodes.filter((n) => f.showStubs || n.kind !== "stub"), allLinks, f.hide, f.only);
  const shown = new Set(nodes.map((n) => n.hostname));
  const links = allLinks.filter((l) => shown.has(l.a.hostname) && shown.has(l.b.hostname) && !f.hiddenStatuses.has(l.status));
  const drawn = new Set(links.map((l) => l.id));
  const beams = model.beams.filter((b) => b.a.hostname !== b.b.hostname && shown.has(b.a.hostname) && shown.has(b.b.hostname) && b.links.some((l) => drawn.has(l.id)));
  const clusters = model.clusters.filter((c) => c.hosts.filter((h) => shown.has(h)).length >= 2);
  const groups = Array.from(model.groupById.values()).filter((g) => g.members.some((h) => shown.has(h))); // un groupe dès qu'un membre est visible (G4)
  // Les annotations (docs/10 §6, A1) : la couche allumée (défaut), une annotation attachée suit son ancre ; une orpheline n'est jamais dessinée.
  const drawnGroups = new Set(groups.map((g) => g.id));
  const annotations = f.showNotes === false ? [] : Array.from(model.annotationById.values()).filter((a) => !model.orphanAnnotations.includes(a) && shownWith(a, shown, drawnGroups));
  // Les connecteurs suivent la même couche : dessinés quand chacun de leurs bouts l'est ; un orphelin, jamais.
  const drawnNotes = new Set(annotations.map((a) => a.id));
  const connectors = f.showNotes === false ? [] : Array.from(model.connectorById.values()).filter((c) => !model.orphanConnectors.includes(c) && connectorShown(c, shown, drawnGroups, drawnNotes));
  return { nodes, links, beams, clusters, groups, annotations, connectors, shown };
}

/** Le changement d'un élément depuis la run d'avant, ou rien quand les changements sont masqués. */
export function changeOf(model: Model, showDiff: boolean, kind: "node" | "link", entity: { ghost?: boolean }, id: string): string | null {
  if (!showDiff) return null;
  if (entity.ghost) return "removed";
  return (model.changeOf(kind, id) || { kind: null }).kind;
}

// Les arêtes du placement : tous les câbles (un câble retiré attire encore ses deux bouts : le fantôme se dessine là
// où il était) ; les membres d'un cluster s'attirent comme s'ils étaient câblés (renfort 2.5), le cadre reste compact.
export function layoutEdges(model: Model): Edge[] {
  const edges: Edge[] = model.links.concat(model.ghostLinks).map((l) => [l.a.hostname, l.b.hostname]);
  model.clusters.forEach((c) => c.hosts.slice(1).forEach((host) => edges.push([c.hosts[0], host, 2.5])));
  return edges;
}

export interface Placed { positions: Map<string, Point>; fresh: Map<string, Point>; unplaced: Set<string> }

/** Place les nœuds visibles. `placed` (la mémoire) reçoit ce qui vient d'être placé : `fresh`, à envoyer au serveur ;
 *  un équipement épinglé, sans câble, ou fantôme n'est jamais mémorisé (docs/09 ; revue B1, M2). */
export function placeScene(model: Model, nodes: ModelNode[], pinned: Map<string, Point>, placed: Map<string, Point>): Placed {
  const edges = layoutEdges(model);
  const card = { w: model.cardWidth, h: CARD_H };
  const infra = nodes.filter((n) => n.kind !== "stub").map((n) => n.hostname);
  const stubs = nodes.filter((n) => n.kind === "stub").map((n) => n.hostname);
  const of = (ids: string[], source: Map<string, Point>): [string, Point][] => ids.filter((id) => source.has(id)).map((id) => [id, source.get(id) as Point]);
  const remembered = of(infra, placed);
  const base = placeAll(infra, edges, new Map([...remembered, ...of(infra, pinned)]), { extend: remembered.length > 0, card });
  const fresh = new Map<string, Point>();
  const held = wired(infra, edges);
  const unplaced = new Set(infra.filter((id) => !held.has(id)));
  infra.forEach((id) => {
    const node = model.nodeByHost.get(id);
    if (placed.has(id) || pinned.has(id) || !held.has(id) || !node || node.ghost) return;
    const point = { ...(base.get(id) as Point) };
    placed.set(id, point);
    fresh.set(id, point);
  });
  if (!stubs.length) return { positions: base, fresh, unplaced };
  const fixed = new Map([...base, ...of(stubs, placed), ...of(stubs, pinned)]);
  return { positions: placeAll(nodes.map((n) => n.hostname), edges, fixed, { extend: true, card }), fresh, unplaced };
}

export interface Related { hosts: Set<string>; links: Set<string>; beams: Set<string>; clusters: Set<string>; groups: Set<string>; annotations: Set<string>; connectors: Set<string> }
const none = (): Related => ({ hosts: new Set(), links: new Set(), beams: new Set(), clusters: new Set(), groups: new Set(), annotations: new Set(), connectors: new Set() });
// Les connecteurs qui touchent un élément (par un bout attaché) s'éclairent avec lui.
const touching = (model: Model, related: Related, kind: string, ref: string): void => (model.connectorsByRef.get(refKey(kind, ref)) || []).forEach((c) => related.connectors.add(c.id));

/** Ce qu'une sélection multiple éclaire : ses équipements, et les câbles, faisceaux et clusters entièrement entre eux. */
export function relatedToHosts(model: Model, hosts: Set<string>): Related {
  const related = none();
  hosts.forEach((host) => related.hosts.add(host));
  hosts.forEach((host) => (model.linksByNode.get(host) || []).forEach((link) => { if (hosts.has(link.a.hostname) && hosts.has(link.b.hostname)) related.links.add(link.id); }));
  model.beams.forEach((beam) => { if (hosts.has(beam.a.hostname) && hosts.has(beam.b.hostname)) related.beams.add(beam.id); });
  model.clusters.forEach((cluster) => { if (cluster.hosts.every((host) => hosts.has(host))) related.clusters.add(cluster.id); });
  model.groupById.forEach((group) => { const present = presentOf(model, group); if (present.length && present.every((host) => hosts.has(host))) related.groups.add(group.id); });
  return related;
}

/** Ce qu'une sélection éclaire : les équipements, câbles, faisceaux et clusters qui la concernent. */
export function relatedTo(model: Model, selection: Selection | null): Related {
  const related = none();
  if (!selection || !entityOf(model, selection)) return related;
  const addLink = (link: ModelLink): void => { related.links.add(link.id); related.hosts.add(link.a.hostname); related.hosts.add(link.b.hostname); };
  hostsOf(model, selection).forEach((host) => related.hosts.add(host));
  if (selection.kind === "node") {
    const node = nodeOf(model, selection) as ModelNode;
    (model.linksByNode.get(node.hostname) || []).forEach(addLink);
    (model.beamsByNode.get(node.hostname) || []).forEach((beam) => related.beams.add(beam.id));
    (model.clustersByHost.get(node.hostname) || []).forEach((cluster) => related.clusters.add(cluster.id));
    (model.groupsByHost.get(node.hostname) || []).forEach((group) => related.groups.add(group.id));
    (model.annotationsByHost.get(node.hostname) || []).forEach((a) => related.annotations.add(a.id));
    touching(model, related, "device", node.hostname);
  } else if (selection.kind === "annotation") {
    // une annotation éclaire son ancre (équipement ou groupe) ; libre, elle n'éclaire qu'elle
    related.annotations.add(selection.id);
    const a = model.annotationById.get(selection.id);
    if (a && a.anchor.kind === "group" && a.anchor.ref) related.groups.add(a.anchor.ref);
    touching(model, related, "annotation", selection.id);
  } else if (selection.kind === "connector") {
    // un connecteur éclaire ses deux bouts
    related.connectors.add(selection.id);
    const c = model.connectorById.get(selection.id);
    if (c) attachedEnds(c).forEach((e) => { if (e.kind === "group") related.groups.add(e.ref); else if (e.kind === "annotation") related.annotations.add(e.ref); });
  } else if (selection.kind === "group") {
    // un groupe éclaire ses membres présents et les câbles entre eux (G3)
    const members = new Set(related.hosts);
    members.forEach((host) => (model.linksByNode.get(host) || []).forEach((link) => { if (members.has(link.a.hostname) && members.has(link.b.hostname)) related.links.add(link.id); }));
    related.groups.add(selection.id);
    (model.annotationsByGroup.get(selection.id) || []).forEach((a) => related.annotations.add(a.id));
    touching(model, related, "group", selection.id);
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
  // Les autres pattes du même MLAG et son peer-link, révélés (reveal.ts) : leurs câbles et équipements ne s'estompent pas.
  const shown = reveal(model, selection);
  [shown.sibling, shown.peer].forEach((ids) => ids.forEach((id) => {
    const beam = model.beamById.get(id);
    if (!beam) return;
    related.beams.add(id);
    beam.links.forEach(addLink);
  }));
  return related;
}

export const scene = { visible, changeOf, layoutEdges, placeScene, relatedTo, relatedToHosts };
