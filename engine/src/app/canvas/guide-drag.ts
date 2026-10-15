// Les repères pendant un geste de la toile React Flow (lot 8 de docs/11) : ce qui relie guides.ts (pur) aux nœuds que
// React Flow glisse, à une annotation qu'on redimensionne et au fantôme d'un Alt + glissé. Au début d'un geste, une
// photographie : les boîtes qui bougent et les candidates (cartes, disques, annotations, cadres, clusters de la vue
// élargie, 400 au plus) ; à chaque pas, la correction de guides.ts, appliquée aux positions que React Flow propose
// (`onNodesChange`) avant qu'elles ne soient montrées, puis dessinée par la couche des repères (GuideLayer). Rien ici ne
// reconstruit la toile. React Flow ne pose plus l'aimant de la grille lui-même : il s'applique après les repères, sur
// l'axe qu'ils n'ont pas pris (placeMove). Ctrl tenu suspend les deux (`free`, lu par la page).
import type { NodeChange } from "@xyflow/react";
import type { Point } from "../../canvas/layout";
import type { Item } from "../state/selection";
import type { AnnotationNodeType } from "./annotation";
import type { CardData, ClusterNodeType, FrameNodeType } from "./nodes";
import { STUB_SLOT } from "./nodes";
import { isHost } from "./flow-build";
import type { FlowNode } from "./flow-build";
import { GRID_STEP, TOLERANCE_PX, cornersOf, edgesOf, pickCandidates, placeMove, placeResize, snapMove, union, viewZone } from "./guides";
import type { Box, Candidate } from "./guides";
import type { GuideStore } from "./GuideLayer";
import type { Toile } from "./toile";

export interface GuideDeps {
  toile: Toile; store: GuideStore;
  /** Les nœuds que React Flow montre (à jour avant le rendu), la place absolue d'un nœud, la vue, la taille du canevas. */
  nodes: () => FlowNode[];
  absolute: (id: string) => Point | null;
  view: () => { x: number; y: number; zoom: number };
  size: () => { width: number; height: number };
  /** Les préférences du moment : repères, aimant ; et Ctrl tenu (`free`). */
  prefs: () => { guides: boolean; snap: boolean };
  free: () => boolean;
  /** La classe `guiding` sur la toile : l'estompage de la sélection s'allège pendant le geste. */
  guiding: (on: boolean) => void;
}
export interface GuideDrag {
  /** Un glissé de React Flow commence : `moving` = les nœuds qu'il déplace (le cadre entraîne ses membres). */
  begin: (moving: FlowNode[]) => void;
  /** Les changements que React Flow propose, corrigés (repères, puis aimant de la grille) ; inchangés hors d'un glissé. */
  correct: (changes: NodeChange<FlowNode>[]) => NodeChange<FlowNode>[];
  /** Ctrl pressé ou relâché sans bouger : les dernières positions proposées, telles que React Flow les a données, à
   *  repasser par `correct` (`null` hors glissé). */
  replay: () => NodeChange<FlowNode>[] | null;
  end: () => void;
  /** Le redimensionnement d'une annotation : la boîte proposée (plan absolu), corrigée ; `mods` : Maj ou Alt (rapport,
   *  centre), qui suspendent les repères (le bord tiré n'est plus seul à bouger). */
  resize: (id: string, start: Box, raw: Box, handle: string, mods: { ratio: boolean; center: boolean; free: boolean }) => Box;
  resizeEnd: () => void;
  /** Le fantôme d'un Alt + glissé : la correction de l'écart `d` (plan) par les repères, et les axes qu'ils ont pris. */
  clone: (items: Item[], d: Point, free: boolean) => { dx: number; dy: number; took: { x: boolean; y: boolean } };
  cloneEnd: () => void;
}

const MIN_SIZE = 20;
/** La taille d'un nœud dans le plan, telle que la toile la calcule (jamais mesurée) ; `null` : pas une boîte (un
 *  connecteur bouge avec un bloc mais ne compte pas). */
function sizeOf(n: FlowNode): { w: number; h: number } | null {
  if (n.type === "card") { const p = (n.data as CardData).plan; return { w: p.w, h: p.h }; }
  if (n.type === "stub") return { w: STUB_SLOT.w, h: STUB_SLOT.h };
  if (n.type === "annotation") { const f = (n as AnnotationNodeType).data.frame; return { w: f.w, h: f.h }; }
  if (n.type === "frame") { const d = (n as FrameNodeType).data; return { w: d.w, h: d.h }; }
  if (n.type === "cluster") { const d = (n as ClusterNodeType).data; return { w: d.w, h: d.h }; }
  return null;
}

export function createGuideDrag(deps: GuideDeps): GuideDrag {
  // Un glissé en cours : les nœuds qu'il déplace avec l'écart entre leur place absolue et leur position React Flow (un
  // enfant est relatif à son parent), leur taille, les candidates, les dernières positions proposées.
  let drag: { moving: Map<string, { ox: number; oy: number; size: { w: number; h: number } | null }>; lone: boolean; cands: Candidate[]; obstacles: Box[]; pins: Point[]; raw: Map<string, Point> } | null = null;
  let resizing: { id: string; cands: Candidate[]; obstacles: Box[]; pins: Point[] } | null = null;
  let cloning: { start: Box; cands: Candidate[]; obstacles: Box[]; pins: Point[] } | null = null;
  const tolerance = (): number => TOLERANCE_PX / Math.max(deps.view().zoom, 0.05);

  // Les candidates : tout ce qui se dessine en boîte, hors de ce qui bouge (`skip`) ; un cadre dont un membre bouge, un
  // cluster dont un membre bouge, une annotation attachée à ce qui bouge bougent aussi, et ne comptent pas.
  function candidates(skip: Set<string>, near: Box): { cands: Candidate[]; obstacles: Box[]; pins: Point[] } {
    const toile = deps.toile, nodes = deps.nodes();
    const movedHosts = new Set<string>();
    nodes.forEach((n) => { if (skip.has(n.id) && isHost(n)) movedHosts.add(n.id); });
    nodes.forEach((n) => { if (skip.has(n.id) && n.type === "frame") { const g = toile.model.groupById.get((n as FrameNodeType).data.id); (g ? g.members : []).forEach((h) => movedHosts.add(h)); } });
    const all: Candidate[] = [];
    nodes.forEach((n) => {
      if (skip.has(n.id) || movedHosts.has(n.id) || n.type === "connector" || n.hidden) return;
      if (n.parentId && (skip.has(n.parentId) || movedHosts.has(n.parentId))) return;
      if (n.type === "frame") { const g = toile.model.groupById.get((n as FrameNodeType).data.id); if (g && g.members.some((h) => movedHosts.has(h))) return; }
      if (n.type === "cluster") { const c = toile.model.clusters.find((x) => "cluster:" + x.id === n.id); if (c && c.hosts.some((h) => movedHosts.has(h))) return; }
      const size = sizeOf(n), at = deps.absolute(n.id);
      if (!size || !at) return;
      all.push({ id: n.id, box: { x: at.x, y: at.y, w: size.w, h: size.h }, spaced: n.type === "card" || n.type === "stub" || n.type === "annotation" });
    });
    const cands = pickCandidates(all, viewZone(deps.view(), deps.size()), near);
    // l'épingle d'une carte est dessinée sur son coin haut gauche (nodes.tsx) : pas de croix par-dessus
    const pinned = toile.state.pinned;
    return { cands, obstacles: cands.filter((c) => c.spaced).map((c) => c.box), pins: cands.filter((c) => pinned.has(c.id)).map((c) => ({ x: c.box.x, y: c.box.y })) };
  }

  function begin(moving: FlowNode[]): void {
    const boxes = new Map<string, { ox: number; oy: number; size: { w: number; h: number } | null }>();
    moving.forEach((n) => { const at = deps.absolute(n.id) || n.position; boxes.set(n.id, { ox: at.x - n.position.x, oy: at.y - n.position.y, size: sizeOf(n) }); });
    const start = union(moving.flatMap((n) => { const b = boxes.get(n.id) as { ox: number; oy: number; size: { w: number; h: number } | null }; return b.size ? [{ x: n.position.x + b.ox, y: n.position.y + b.oy, w: b.size.w, h: b.size.h }] : []; }));
    if (!start) { drag = null; return; }
    const lone = moving.length === 1 && moving[0].type === "annotation";
    drag = { moving: boxes, lone, raw: new Map(), ...candidates(new Set(moving.map((n) => n.id)), start) };
    deps.guiding(true);
  }

  // La boîte qui bouge, depuis les positions proposées ; la correction ; ce que la couche dessine.
  function correctFrom(raw: Map<string, Point>): { dx: number; dy: number } | null {
    const d = drag;
    if (!d) return null;
    const boxes: Box[] = [];
    raw.forEach((p, id) => { const m = d.moving.get(id); if (m && m.size) boxes.push({ x: p.x + m.ox, y: p.y + m.oy, w: m.size.w, h: m.size.h }); });
    const box = union(boxes);
    if (!box) return null;
    const prefs = deps.prefs(), free = deps.free();
    const placed = placeMove(box, d.cands, { guides: prefs.guides, free, grid: prefs.snap ? GRID_STEP : null, tol: tolerance() });
    const many = d.moving.size > 1;
    deps.store.set({
      lines: placed.lines, gaps: placed.gaps, hits: placed.hits, obstacles: d.obstacles.concat([placed.box]), union: many ? placed.box : null,
      // une annotation seule a déjà sa pastille « X, Y » (celle de sa fiche) : ici, « libre » seulement
      pill: d.lone ? (free ? { box: placed.box, text: "", free } : null) : { box: placed.box, text: placed.box.x + ", " + placed.box.y, free },
      // une annotation seule porte ses poignées aux coins : la poignée marque le coin, pas de croix dessus
      bare: d.lone ? d.pins.concat(cornersOf(placed.box)) : d.pins,
    });
    return { dx: placed.box.x - box.x, dy: placed.box.y - box.y };
  }
  function correct(changes: NodeChange<FlowNode>[]): NodeChange<FlowNode>[] {
    const d = drag;
    if (!d) return changes;
    const raw = new Map<string, Point>();
    changes.forEach((c) => { if (c.type === "position" && c.position && d.moving.has(c.id)) raw.set(c.id, c.position); });
    if (!raw.size) return changes;
    d.raw = raw;
    const shift = correctFrom(raw);
    if (!shift || (!shift.dx && !shift.dy)) return changes;
    return changes.map((c) => (c.type === "position" && c.position && d.moving.has(c.id) ? { ...c, position: { x: c.position.x + shift.dx, y: c.position.y + shift.dy } } : c));
  }
  function replay(): NodeChange<FlowNode>[] | null {
    const d = drag;
    if (!d || !d.raw.size) return null;
    return Array.from(d.raw, ([id, position]): NodeChange<FlowNode> => ({ id, type: "position", position, dragging: true }));
  }
  function end(): void { drag = null; deps.store.clear(); deps.guiding(false); }

  function resize(id: string, start: Box, raw: Box, handle: string, mods: { ratio: boolean; center: boolean; free: boolean }): Box {
    if (!resizing || resizing.id !== id) { resizing = { id, ...candidates(new Set(["annotation:" + id]), start) }; deps.guiding(true); }
    const prefs = deps.prefs();
    // Maj (rapport) ou Alt (depuis le centre) font bouger deux bords : les repères se taisent, rien ne s'aimante
    if (mods.ratio || mods.center) { deps.store.set({ lines: [], gaps: [], hits: [], pill: mods.free ? { box: raw, text: "", free: true } : null }); return raw; }
    const placed = placeResize(start, raw, edgesOf(handle), resizing.cands, { guides: prefs.guides, free: mods.free, grid: prefs.snap ? GRID_STEP : null, tol: tolerance(), min: MIN_SIZE });
    deps.store.set({ lines: placed.lines, gaps: [], hits: placed.hits, obstacles: resizing.obstacles, union: null, pill: mods.free ? { box: placed.box, text: "", free: true } : null,
      bare: resizing.pins.concat(cornersOf(placed.box)) });
    return placed.box;
  }
  function resizeEnd(): void { resizing = null; deps.store.clear(); deps.guiding(false); }

  // Alt + glissé : les originaux restent (ce sont des candidates comme les autres : une copie s'aligne volontiers sur
  // l'original) ; la boîte qui bouge est celle de ce qui sera copié, décalée de l'écart.
  function clone(items: Item[], d: Point, free: boolean): { dx: number; dy: number; took: { x: boolean; y: boolean } } {
    if (!cloning) {
      const ids = new Set(items.map((item) => (item.kind === "node" ? item.id : item.kind === "group" ? "group:" + item.id : item.kind + ":" + item.id)));
      const boxes = deps.nodes().filter((n) => ids.has(n.id)).flatMap((n) => { const size = sizeOf(n), at = deps.absolute(n.id); return size && at ? [{ x: at.x, y: at.y, w: size.w, h: size.h }] : []; });
      const start = union(boxes);
      if (!start) return { dx: 0, dy: 0, took: { x: false, y: false } };
      cloning = { start, ...candidates(new Set(), start) };
      deps.guiding(true);
    }
    const prefs = deps.prefs(), box = { ...cloning.start, x: cloning.start.x + d.x, y: cloning.start.y + d.y };
    const g = !free && prefs.guides ? snapMove(box, cloning.cands, tolerance()) : { dx: 0, dy: 0, lines: [], gaps: [], took: { x: false, y: false } };
    const placed = { ...box, x: Math.round(box.x + g.dx), y: Math.round(box.y + g.dy) };
    deps.store.set({ lines: g.lines, gaps: g.gaps, hits: Array.from(new Set(g.lines.flatMap((l) => l.hits).concat(g.gaps.flatMap((x) => x.hits)))).sort(),
      obstacles: cloning.obstacles.concat([placed]), union: null, pill: free ? { box: placed, text: "", free: true } : null, bare: cloning.pins });
    return { dx: g.dx, dy: g.dy, took: g.took };
  }
  function cloneEnd(): void { if (cloning) deps.guiding(false); cloning = null; deps.store.clear(); }

  return { begin, correct, replay, end, resize, resizeEnd, clone, cloneEnd };
}
