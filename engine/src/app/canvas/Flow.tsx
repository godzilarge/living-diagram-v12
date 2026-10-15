// La toile React Flow de l'application : dessine ce que la toile (toile.ts) décrit, et lui rapporte ce que
// l'utilisateur fait (clic, Maj + clic, rectangle, glissé d'un équipement ou de la sélection, survol). Les nœuds et
// arêtes sont reconstruits à chaque version de la toile depuis son état (positions, filtres, sélection, règle de
// recherche) ; React Flow tient la vue (zoom, décalage), les appuis et le clavier. Rien n'est déduit ici : ce qui
// est dessiné est dans le snapshot, ce qui est placé vient de scene.ts. À la jauge (lot 13 de docs/11) : ce qui n'a pas
// changé garde son objet (reuse.ts) et React Flow ne monte que ce qui se voit (`onlyRenderVisibleElements`). Pendant
// un glissé, un redimensionnement ou un Alt + glissé, les repères d'alignement (lot 8 : guides.ts, guide-drag.ts,
// GuideLayer.tsx) corrigent la place proposée et se dessinent par-dessus, sans reconstruire la toile.
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, applyEdgeChanges, applyNodeChanges, useReactFlow } from "@xyflow/react";
import type { EdgeChange, NodeChange, ReactFlowInstance, Viewport } from "@xyflow/react";
import { createContext, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStoreApi } from "@xyflow/react";
import type { MouseEvent as ReactMouseEvent, MutableRefObject, ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import type { TableContent } from "../../contracts/intent";
import type { ConnectorPatch } from "../../shell/apps";
import type { ContextTarget } from "../state/context";
import type { Box } from "../../canvas/card";
import type { Point } from "../../canvas/layout";
import { beamLines, clusterLines, groupLines, linkLines, nodeLines } from "../../canvas/tip";
import type { Frame as AFrame } from "../../canvas/annotations";
import { annotationLines, connectorLines } from "../../canvas/tip";
import type { End } from "../../canvas/connectors";
import { AnnotationContext, AnnotationNode, EditRequest } from "./annotation";
import type { AnnotationActions, AnnotationNodeType } from "./annotation";
import { ConnectorNode, shapeOf } from "./connector";
import type { ConnectorNodeType } from "./connector";
import { SketchLayer, createSketch, useConnectorTool } from "./drawing";
import { marksOf, selectedTipKeys } from "./hover";
import { pickEnd } from "./snap";
import { useTips } from "./tips";
import type { Candidate } from "./snap";
import { edgeTypes } from "./edges";
import type { BeamData, CableData } from "./edges";
import { STUB_SLOT, nodeTypes } from "./nodes";
import { same as sameValue } from "../state/history";
import type { Value } from "../state/history";
import { afterRectangle, covered, itemsOf, multiOf as multiOfItems, rectOf, selectionOf } from "../state/selection";
import type { Item } from "../state/selection";
import { useSpaceHeld, useViewGestures } from "./gestures";
import { CloneLayer, createGhost, useAltClone, usePointerPlan } from "./clone";
import type { Op } from "../../shell/apps";
import type { CardData, ClusterNodeType, FrameNodeType } from "./nodes";
import type { Toile } from "./toile";
import { STUB_BOX, build, isHost, selectionKey } from "./flow-build";
import { createGate } from "./gate";
import { reuse } from "./reuse";
import { GuideLayer, createGuideStore } from "./GuideLayer";
import type { GuideStore } from "./GuideLayer";
import { createGuideDrag } from "./guide-drag";
import type { Gate } from "./gate";
import type { AnnotationLocal, FlowEdge, FlowNode } from "./flow-build";

// Annotations et connecteurs lisent leur place et leur sélection : une comparaison superficielle de leurs propriétés.
const allNodeTypes = { ...nodeTypes, annotation: memo(AnnotationNode), connector: memo(ConnectorNode) };
// Les niveaux de détail des cartes (lot 5 de docs/11) : `zoom-far` sous 0,6, `zoom-tiny` (avec `zoom-far`) sous 0,4.
const ZOOM_FAR = 0.6, ZOOM_TINY = 0.4, DRAG_THRESHOLD = 4, MIN_ZOOM = 0.05, MAX_ZOOM = 6, MOVE_MS = 220;
/** Au-delà de ce nombre d'équipements dessinés, l'estompage ne s'allège pas pendant un geste (lot 8 : coût d'un repeint). */
const GUIDING_MAX = 150;
const SNAP_PX = 14; // à l'écran : un bout glissé s'accroche à une ancre à moins de cette distance
/** Le calme après un déplacement avant de replacer les pastilles de câble (lot 13 de docs/11) : celui de la barre contextuelle. */
const TAGS_SETTLE_MS = 120;
/** Le pas de la grille (unités du dessin) : affichée derrière la toile, et celle sur laquelle un glissé s'aimante
 *  (l'aimant passe par les repères, guides.ts : React Flow ne l'applique plus lui-même). */
export const GRID = 20;
const STUB_INSET = (STUB_SLOT.w - STUB_BOX.w) / 2;
/** La boîte d'un nœud d'équipement au sens de React Flow (sa position est le coin haut gauche de cette boîte). */
const slotOf = (node: FlowNode): Box => (node.type === "card" ? (node.data as CardData).plan : STUB_SLOT);
/** Ce que la page règle sur la toile, hors de la vue partagée par l'adresse : des préférences du navigateur. */
export interface FlowPrefs { grid: boolean; snap: boolean; minimap: boolean; theme: "dark" | "light"; guides: boolean }
// Les textes que React Flow donne aux lecteurs d'écran, dans la langue de la page et vrais : rien ne se supprime ici,
// un câble ne se focalise pas (il s'ouvre par la fiche d'un équipement ou par la recherche). React Flow donne la
// direction d'un déplacement en anglais (`up`, `down`, `left`, `right`) : elle passe par le catalogue.
const DIRECTIONS = ["up", "down", "left", "right"] as const;
const ariaLabels = () => ({
  "node.a11yDescription.default": t("shell:canvas.nodeHelp"),
  "node.a11yDescription.keyboardDisabled": t("shell:canvas.nodeHelpKeys"),
  "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }: { direction: string; x: number; y: number }) =>
    t("shell:canvas.moved", { direction: (DIRECTIONS as readonly string[]).includes(direction) ? t(`shell:canvas.direction.${direction as typeof DIRECTIONS[number]}`) : direction, x, y }),
  "edge.a11yDescription.default": t("shell:canvas.edgeHelp"),
  "minimap.ariaLabel": t("shell:canvas.minimap"),
});
const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const minimapClass = (node: FlowNode): string => (node.type === "card" ? "mm-" + (node.data as CardData).hue : "mm-" + node.type);
/** Ce qu'un nœud React Flow est dans une sélection mixte (lot 2 de docs/11) ; un cluster n'en est pas. */
function itemOfNode(node: FlowNode): Item | null {
  if (isHost(node)) return { kind: "node", id: node.id };
  if (node.type === "annotation") return { kind: "annotation", id: (node as AnnotationNodeType).data.a.id };
  if (node.type === "connector") return { kind: "connector", id: (node as ConnectorNodeType).data.c.id };
  if (node.type === "frame") return { kind: "group", id: (node as FrameNodeType).data.id };
  return null;
}
/** Maj, Ctrl ou Cmd + clic ajoutent à la sélection ou en retirent (D1 de docs/11). Une seule référence : React Flow
 *  s'abonne aux touches à chaque changement de cette valeur. */
const MULTI_KEYS = ["Shift", "Control", "Meta"];
/** D1, révisée par Orhan le 2026-10-14 (« le glissé nu qui sélectionne, très très perturbant ») : le glissé nu sur
 *  le fond déplace la vue, le bouton du milieu aussi (même en partant d'un élément) ; Maj + glissé dessine le
 *  rectangle, qui ajoute à la sélection ; Espace + glissé déplace la vue même depuis une carte (la toile entière laisse
 *  alors passer les appuis jusqu'au fond, `space-pan`). */
const PAN_BUTTONS = [0, 1];
/** Ce qu'un nœud ou une arête est pour la bulle (la clé que `showTip` reçoit). */
function tipTarget(node: FlowNode): { kind: string; id: string } {
  const d = node.data as Record<string, unknown>;
  if (node.type === "frame") return { kind: "group", id: d.id as string };
  if (node.type === "cluster") return { kind: "cluster", id: d.id as string };
  if (node.type === "annotation") return { kind: "annotation", id: (node as AnnotationNodeType).data.a.id };
  if (node.type === "connector") return { kind: "connector", id: (node as ConnectorNodeType).data.c.id };
  return { kind: "node", id: node.id };
}
const tipEdge = (edge: FlowEdge): { kind: string; id: string } => (edge.type === "cable" ? { kind: "link", id: (edge.data as CableData).link.id } : { kind: "beam", id: (edge.data as BeamData).beam.id });

/** Ce que la barre contextuelle (lot 4 de docs/11, `components/FloatingBar.tsx`) lit de la toile qui la porte : la
 *  toile (sa place des éléments, sa version) et les gestes en cours ; elle s'abonne, la toile ne la connaît pas. */
export const FloatingHost = createContext<{ toile: Toile; gate: Gate; guides: GuideStore } | null>(null);

/** Un clic droit : la cible, la position d'écran du menu, le point du plan visé. */
export interface ContextRequest { target: ContextTarget; at: Point; plan: Point }
export interface FlowProps {
  toile: Toile; prefs: FlowPrefs; editable: boolean;
  onAnnotation: (id: string, patch: Partial<AFrame> & { text?: string; content?: TableContent }) => void;
  onConnector: (id: string, patch: ConnectorPatch) => void;
  /** Le nom d'un groupe édité sur son cadre (lot 2 de docs/11). */
  onGroupLabel: (id: string, label: string) => void;
  /** Un connecteur tiré avec l'outil connecteur : créé par la page. */
  onConnectorCreate: (fields: { start: End; end: End }) => void;
  onContext: (request: ContextRequest) => void;
  /** Une édition en place demandée par le menu (cellule d'un tableau, texte d'une note). */
  editRequest: { id: string; cell: [number, number] | null; at: number; kind?: "annotation" | "group" } | null;
  /** L'outil connecteur armé (lot 1 de docs/11) ; `onToolDone` : un connecteur vient d'être créé, `keep` = Maj tenue. */
  toolArmed: boolean;
  onToolDone: (keep: boolean) => void;
  /** Alt + glissé relâché (lot 3 de docs/11) : copier ces éléments à cet écart. */
  onClone: (items: Item[], d: Point) => void;
  /** Ce qui se pose par-dessus la toile, en coordonnées d'écran, avec accès à sa vue (la barre contextuelle). */
  children?: ReactNode;
}
export function Flow(props: FlowProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ toile, prefs, editable, onAnnotation, onConnector, onGroupLabel, onConnectorCreate, onContext, editRequest, toolArmed, onToolDone, onClone, children }: FlowProps) {
  const rf = useReactFlow<FlowNode, FlowEdge>();
  const store = useStoreApi<FlowNode, FlowEdge>();
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Un rectangle en cours (glissé nu, ou Maj + glissé qui ajoute) : la sélection d'avant et son point de départ dans le
  // plan (voir plus bas).
  const selecting = useRef<{ before: Item[]; add: boolean; from: Point; ending?: boolean } | null>(null);
  const armed = toolArmed && editable;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  // Les gestes en cours (redimensionnement, bout de connecteur, outil, édition en place) : la bulle se tait (lot 1).
  const holds = useRef(new Set<string>());
  // Les mêmes gestes, plus le glissé et le rectangle, vus par la barre contextuelle (gate.ts) : elle s'efface pendant.
  const gate = useMemo(createGate, []);
  const guideStore = useMemo(createGuideStore, []);
  const floating = useMemo(() => ({ toile, gate, guides: guideStore }), [toile, gate, guideStore]);
  const sketch = useMemo(createSketch, []);
  const version = useSyncExternalStore(toile.subscribe, toile.version, toile.version);
  const { i18n } = useTranslation(); // les textes des nœuds (noms accessibles, pastilles) suivent la langue
  const language = i18n.language;
  const ariaLabelConfig = useMemo(ariaLabels, [language]);
  // Une boîte d'annotation ou un bout libre de connecteur posés localement (glissé, flèches, alignement) valent jusqu'à
  // ce que le document les porte (ou qu'une autre version les contredise) ; ils vivent dans la toile.
  // Le placement des pastilles de câble, différé après un déplacement (flow-build.ts) : redemandé quand les positions
  // n'ont plus bougé depuis `TAGS_SETTLE_MS`, une rafale de flèches ne le recalcule qu'une fois.
  const [tagsTick, setTagsTick] = useState(0);
  const freshTags = useRef(false);
  const built = useMemo(() => {
    const fresh = freshTags.current;
    freshTags.current = false;
    toile.pending.forEach((patch, id) => { const a = toile.model.annotationById.get(id); if (!a || Object.entries(patch).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v)) toile.pending.delete(id); });
    toile.pendingEnds.forEach((patch, id) => { const c = toile.model.connectorById.get(id); if (!c || Object.entries(patch).every(([k, v]) => sameValue((c as unknown as Record<string, Value>)[k], v as Value))) toile.pendingEnds.delete(id); });
    const out = build(toile, { editable, control: toile.state.control }, fresh);
    toile.frames = out.frames;
    toile.ends = out.ends;
    toile.boxes = out.boxes;
    toile.groupFrames = out.groups;
    return out;
  }, [toile, version, editable, language, tagsTick]);
  useEffect(() => {
    if (!built.staleTags) return undefined;
    const timer = window.setTimeout(() => { freshTags.current = true; setTagsTick((n) => n + 1); }, TAGS_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [built]);
  // La bulle (tips.tsx) : jamais sur ce qui est sélectionné, jamais pendant un geste (glissé, rectangle,
  // redimensionnement, bout de connecteur, outil armé) ni une édition en place ; elle revient quand la sélection change.
  const selectedKeys = useMemo(() => selectedTipKeys(built.nodes.filter((n) => n.selected).map(tipTarget).concat(built.edges.filter((e) => e.selected).map(tipEdge))), [built]);
  const tips = useTips(container, toile, selectedKeys, () => dragging.current || !!selecting.current || holds.current.size > 0 || armedRef.current);
  const hideTip = tips.hide, showTip = tips.show;
  const hold = useCallback((reason: string, on: boolean): void => {
    if (on) { holds.current.add(reason); hideTip(); } else holds.current.delete(reason);
    gate.set(reason, on);
  }, [hideTip, gate]);
  // Un nœud React Flow attachable, vu comme candidat d'accrochage : sa boîte absolue (une annotation attachée est un
  // enfant), son contour (coins d'une carte, disque, forme, cadre).
  const candidateOf = useCallback((node: FlowNode): Candidate | null => {
    const internal = rf.getInternalNode(node.id);
    if (!internal) return null;
    const at = internal.internals.positionAbsolute;
    if (node.type === "card") { const plan = (node.data as CardData).plan; return { kind: "device", ref: node.id, frame: { x: at.x, y: at.y, w: plan.w, h: plan.h }, shape: shapeOf(node) }; }
    if (node.type === "stub") return { kind: "device", ref: node.id, frame: { x: at.x + STUB_INSET, y: at.y + STUB_INSET, w: STUB_BOX.w, h: STUB_BOX.h }, shape: shapeOf(node) };
    if (node.type === "annotation") { const data = node.data as AnnotationNodeType["data"]; return { kind: "annotation", ref: data.a.id, frame: { x: at.x, y: at.y, w: data.frame.w, h: data.frame.h }, shape: shapeOf(node) }; }
    if (node.type === "frame") { const data = node.data as FrameNodeType["data"]; return { kind: "group", ref: data.id, frame: { x: at.x, y: at.y, w: data.w, h: data.h }, shape: shapeOf(node) }; }
    return null;
  }, [rf]);
  // Les repères d'alignement (lot 8 de docs/11) : les préférences du moment et Ctrl tenu (qui les suspend, avec
  // l'aimant de la grille) se lisent à chaque pas ; la couche (GuideLayer) dessine, la toile ne bouge pas.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const freeRef = useRef(false);
  const shownNodes = useRef<FlowNode[]>([]);
  const guide = useMemo(() => createGuideDrag({
    toile, store: guideStore,
    nodes: () => shownNodes.current,
    absolute: (id) => { const n = rf.getInternalNode(id); return n ? n.internals.positionAbsolute : null; },
    view: () => rf.getViewport(),
    size: () => { const el = container.current; return el ? el.getBoundingClientRect() : { width: 1200, height: 800 }; },
    prefs: () => ({ guides: prefsRef.current.guides, snap: prefsRef.current.snap }),
    free: () => freeRef.current,
    // L'estompage allégé repeint toutes les cartes estompées d'un coup : au-delà de GUIDING_MAX équipements dessinés, il
    // coûtait une image de plus de 100 ms au début d'un glissé (garde de la jauge, lot 13) ; les cartes alignées
    // repassent toujours à pleine opacité (`guide-hit`, quelques nœuds).
    guiding: (on) => { const el = container.current; if (el) el.classList.toggle("guiding", on && toile.state.positions.size <= GUIDING_MAX); },
  }), [toile, guideStore, rf]);
  const annotationActions = useMemo<AnnotationActions>(() => ({
    resize: (id, frame) => {
      const a = toile.model.annotationById.get(id);
      if (!a) return;
      // la boîte est en coordonnées du plan : rendue relative à l'ancre avant d'être écrite (A0)
      const current = toile.frames.get(id);
      const dx = current ? frame.x - current.x : 0, dy = current ? frame.y - current.y : 0;
      const patch = { x: a.x + dx, y: a.y + dy, w: frame.w, h: frame.h };
      toile.pending.set(id, patch);
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
    // le bout d'un connecteur existant qu'on glisse : les marques de ce qu'il vise, dans la couche du dessus
    aim: (pick) => sketch.set({ draft: null, marks: marksOf(pick) }),
    hold,
    groupLabel: (id, label) => onGroupLabel(id, label),
    guideResize: (id, start, raw, handle, mods) => guide.resize(id, start, raw, handle, mods),
    guideEnd: () => guide.resizeEnd(),
  }), [toile, rf, onAnnotation, onConnector, onGroupLabel, onContext, candidateOf, sketch, hold, guide]);
  // L'outil connecteur (drawing.tsx, tool.ts) : armé, il prend les appuis de la toile ; un connecteur créé le range,
  // sauf Maj tenue (création en série).
  useConnectorTool({
    container, armed, sketch,
    planAt: (p) => rf.screenToFlowPosition(p),
    pick: annotationActions.pick,
    onCreate: (fields, keep) => { onConnectorCreate(fields); onToolDone(keep); },
    hold: (on) => hold("tool", on),
  });
  useEffect(() => { if (armed) hideTip(); }, [armed, hideTip]);
  const builtRef = useRef(built);
  builtRef.current = built;
  const [nodes, setNodes] = useState<FlowNode[]>(built.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(built.edges);
  const nodesRef = useRef(nodes), edgesRef = useRef(edges); // ce que React Flow montre, à jour avant que React rende
  shownNodes.current = nodesRef.current;
  const [zoom, setZoom] = useState(1);
  // Ce qui n'a pas changé depuis le dessin montré garde son objet (reuse.ts, lot 13 de docs/11) : React Flow ne redessine
  // que ce qui change. Un nœud reconstruit garde les mesures que React Flow a déjà prises (`measured`) : sans elles, il
  // le tient pour neuf, le cache (`visibility: hidden`) et retire ses câbles jusqu'à une nouvelle mesure, qui ne vient
  // pas toujours quand la taille n'a pas changé (vu au basculement des couches, 2026-10-07). Une taille qui change
  // (cadre de cluster ou de groupe) est remesurée par React Flow, comme avant.
  useEffect(() => {
    const next = reuse(built.nodes, nodesRef.current), nextEdges = reuse(built.edges, edgesRef.current);
    if (next !== nodesRef.current) { nodesRef.current = next; shownNodes.current = next; setNodes(next); }
    if (nextEdges !== edgesRef.current) { edgesRef.current = nextEdges; setEdges(nextEdges); }
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

  // Ce que l'utilisateur sélectionne dans React Flow (clic, Maj / Ctrl + clic, clic sur le fond : des changements
  // `select`, jamais émis pour ce que la toile demande elle-même) devient la sélection de la toile, une fois les
  // changements des nœuds et des arêtes d'un même geste appliqués. Équipements, annotations, connecteurs et cadres de
  // groupe forment une sélection mixte (lot 2 de docs/11) ; un cluster ou une arête se sélectionnent seuls ; une
  // sélection identique à celle que la toile a dessinée ne revient pas.
  const syncSelection = useCallback((): void => {
    if (selecting.current) return;
    const picked = nodesRef.current.filter((n) => n.selected), pickedEdges = edgesRef.current.filter((e) => e.selected);
    if (selectionKey(picked, pickedEdges) === builtRef.current.key) return;
    const items = picked.map(itemOfNode).filter((item): item is Item => !!item);
    const cluster = picked.find((n) => n.type === "cluster") as ClusterNodeType | undefined;
    if (items.length >= 2) toile.selectItems(items);
    else if (items.length === 1) toile.select(selectionOf(items[0]));
    else if (cluster) toile.select({ kind: "cluster", id: cluster.data.id });
    else if (pickedEdges.length) {
      const edge = pickedEdges[0];
      toile.select(edge.type === "cable" ? { kind: "link", id: (edge.data as CableData).link.id } : { kind: "beam", id: (edge.data as BeamData).beam.id });
    } else toile.select(null);
  }, [toile]);
  const { onSelectionStart, onSelectionEnd } = useRectangle({ toile, rf, store, gate, armed, container, selecting });
  // Un cadre de groupe glissé (G2) : ses membres présents suivent dans le même passage que le cadre (followers, plus
  // bas), un changement de position chacun, plutôt qu'un second passage sur tous les nœuds (lot 13 de docs/11).
  const followers = useRef<{ id: string; start: Point; members: Map<string, Point>; boxes: Map<string, Box> } | null>(null);
  const onNodesChange = useCallback((proposed: NodeChange<FlowNode>[]): void => {
    let changes = guide.correct(proposed); // les repères, puis l'aimant de la grille (pendant un glissé seulement)
    const drag = followers.current;
    const lead = drag ? changes.find((c) => c.type === "position" && c.id === drag.id && c.position) : undefined;
    if (drag && lead && lead.type === "position" && lead.position) {
      const dx = lead.position.x - drag.start.x, dy = lead.position.y - drag.start.y;
      const moves: NodeChange<FlowNode>[] = [];
      drag.members.forEach((start, host) => { const box = drag.boxes.get(host) || STUB_SLOT; moves.push({ type: "position", id: host, position: { x: start.x + dx - box.w / 2, y: start.y + dy - box.h / 2 } }); });
      changes = changes.concat(moves);
    }
    nodesRef.current = applyNodeChanges(changes, nodesRef.current);
    shownNodes.current = nodesRef.current;
    setNodes(nodesRef.current);
    if (changes.some((c) => c.type === "select")) queueMicrotask(syncSelection);
  }, [syncSelection, guide]);
  // Ctrl pressé ou relâché pendant un glissé : la toile se replace sans attendre le prochain mouvement du pointeur.
  useEffect(() => {
    const el = container.current;
    if (!el) return undefined;
    const pointer = (event: PointerEvent): void => { freeRef.current = event.ctrlKey || event.metaKey; };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== "Control" && event.key !== "Meta") return;
      const free = event.type === "keydown";
      if (freeRef.current === free) return;
      freeRef.current = free;
      const again = dragging.current ? guide.replay() : null;
      if (again) onNodesChange(again);
    };
    el.addEventListener("pointermove", pointer, true);
    el.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    return () => { el.removeEventListener("pointermove", pointer, true); el.removeEventListener("pointerdown", pointer, true); window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", key, true); };
  }, [guide, onNodesChange]);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]): void => {
    edgesRef.current = applyEdgeChanges(changes, edgesRef.current);
    setEdges(edgesRef.current);
    if (changes.some((c) => c.type === "select")) queueMicrotask(syncSelection);
  }, [syncSelection]);

  // Un glissé déplace ce que React Flow tient pour sélectionné (ou le seul nœud saisi) ; un cadre de groupe glissé
  // entraîne ses membres présents de la même translation (G2), même quand il n'est qu'une part d'une sélection mixte :
  // leurs cartes suivent pendant le geste (onNodesChange), et à la relâche ils reprennent leur centre dans la toile.
  const onNodeDragStart = useCallback((_event: unknown, node: FlowNode, moving: FlowNode[]): void => {
    dragging.current = true; hideTip(); gate.set("drag", true);
    toile.flush(); // une rafale de flèches en attente se termine avant que le glissé commence
    const carried = new Set(moving.filter(isHost).map((n) => n.id));
    const members = new Map<string, Point>();
    moving.filter((n) => n.type === "frame").forEach((frame) => {
      const group = toile.model.groupById.get((frame as FrameNodeType).data.id);
      (group ? group.members : []).forEach((host) => { const at = toile.state.positions.get(host); if (at && !carried.has(host)) members.set(host, { ...at }); });
    });
    const boxes = new Map<string, Box>();
    if (members.size) nodesRef.current.forEach((n) => { if (members.has(n.id)) boxes.set(n.id, slotOf(n)); });
    followers.current = members.size ? { id: node.id, start: { ...node.position }, members, boxes } : null;
    guide.begin(moving);
  }, [toile, hideTip, gate, guide]);
  // Un glissé relâché : chaque équipement déplacé reprend son centre dans la toile, chaque annotation son écart à son
  // ancre, chaque connecteur ses bouts libres ; tout part en une seule écriture (une entrée d'annulation). Une
  // annotation glissée seule garde son écriture d'avant (« annotation modifiée »).
  const onNodeDragStop = useCallback((_event: unknown, lead: FlowNode, proposed: FlowNode[]) => {
    dragging.current = false; gate.set("drag", false);
    guide.end();
    // React Flow donne les places qu'il a calculées ; celles que les repères ont corrigées sont dans les nœuds montrés
    const ids = new Set(proposed.map((n) => n.id)), shown = new Map<string, FlowNode>();
    nodesRef.current.forEach((n) => { if (ids.has(n.id)) shown.set(n.id, n); });
    const dragged = proposed.map((n) => shown.get(n.id) || n), node = shown.get(lead.id) || lead;
    const drag = followers.current;
    followers.current = null;
    const hosts: string[] = [], ops: Op[] = [], notes: AnnotationNodeType[] = [];
    let lone: { id: string; patch: { x: number; y: number } } | null = null;
    dragged.forEach((n) => {
      if (n.type === "annotation") { notes.push(n as AnnotationNodeType); return; }
      if (n.type === "connector") {
        const data = (n as ConnectorNodeType).data;
        ops.push(...toile.moveLines([data.c.id], Math.round(n.position.x - data.origin.x), Math.round(n.position.y - data.origin.y)));
        return;
      }
      if (!isHost(n)) return;
      const box = slotOf(n);
      toile.moveTo(n.id, { x: Math.round(n.position.x + box.w / 2), y: Math.round(n.position.y + box.h / 2) });
      hosts.push(n.id);
    });
    if (drag && node.id === drag.id) {
      const dx = Math.round(node.position.x - drag.start.x), dy = Math.round(node.position.y - drag.start.y);
      if (dx || dy) drag.members.forEach((start, host) => { toile.moveTo(host, { x: start.x + dx, y: start.y + dy }); hosts.push(host); });
    }
    // relâchée : sa place dans le plan (libre : sa position React Flow ; enfant : relative au coin de son parent, immobile
    // pendant le geste) redevient l'écart enregistré (A0, A3), calculé depuis son ancre **après** le geste : un cadre de
    // groupe dont les membres ont bougé avec elle ne la décale pas une seconde fois (revue de session, H1)
    notes.forEach((n) => {
      const a = n.data.a;
      const parent = n.parentId ? rf.getInternalNode(n.parentId) : undefined;
      const origin = n.parentId ? (parent ? parent.internals.positionAbsolute : null) : { x: 0, y: 0 };
      const ref = a.anchor.kind === "free" ? { x: 0, y: 0 } : toile.anchorAt(a.anchor.kind as "device" | "group", a.anchor.ref || "");
      if (!origin || !ref) return;
      const patch = { x: Math.round(origin.x + n.position.x - ref.x), y: Math.round(origin.y + n.position.y - ref.y) };
      if (patch.x !== a.x || patch.y !== a.y) { toile.pending.set(a.id, patch); ops.push({ op: "annotation_update", id: a.id, ...patch }); lone = { id: a.id, patch }; }
    });
    const single = lone as { id: string; patch: { x: number; y: number } } | null;
    if (!hosts.length && ops.length === 1 && single) { onAnnotation(single.id, single.patch); toile.repaint(); return; }
    if (hosts.length || ops.length) toile.dropped(hosts, ops);
  }, [toile, rf, onAnnotation, gate, guide]);
  const onNodeMouseMove = useCallback((event: ReactMouseEvent, node: FlowNode): void => {
    const model = toile.model;
    if (node.type === "cluster") {
      const cluster = model.clusters.find((c) => c.id === (node as ClusterNodeType).data.id);
      if (cluster) showTip("cluster:" + cluster.id, () => clusterLines(cluster, { control: toile.state.control }), event);
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
    if (found) showTip("node:" + node.id, () => nodeLines(model, found, { control: toile.state.control }), event);
  }, [toile, showTip]);
  const onEdgeMouseMove = useCallback((event: ReactMouseEvent, edge: FlowEdge): void => {
    const model = toile.model;
    if (edge.type === "cable") { const link = (edge.data as CableData).link; showTip("link:" + link.id, () => linkLines(model, link, { control: toile.state.control }), event); }
    else if (edge.type !== "speed") { const beam = (edge.data as BeamData).beam; showTip("beam:" + beam.id, () => beamLines(beam, { control: toile.state.control }), event); }
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
  useViewGestures(container, rf, MIN_ZOOM, MAX_ZOOM);

  const control = toile.state.control;
  const space = useSpaceHeld();
  // Le presse-papiers (lot 3 de docs/11) : le point sous le pointeur (Ctrl+V y colle) et Alt + glissé (clone.tsx).
  const ghost = useMemo(createGhost, []);
  const planAt = useCallback((p: Point): Point => rf.screenToFlowPosition(p), [rf]);
  usePointerPlan(container, toile, planAt);
  useAltClone({ container, enabled: editable && !control && !armed && !space, toile, ghost, planAt, snap: prefs.snap, onDrop: onClone, hold: (on) => hold("clone", on),
    guide: { move: (items, d, free) => guide.clone(items, d, free), end: () => guide.cloneEnd() } });
  const rootClass = ["flow", control ? "mode-control" : "mode-diagram", built.hasSelection ? "has-selection" : "", toile.state.showPorts ? "show-ports" : "", toile.state.layers.beams ? "show-beams" : "", toile.state.layers.pins ? "" : "hide-pins", toile.state.layers.oper ? "show-oper" : "", toile.state.query ? "searching" : "", zoom < ZOOM_TINY ? "zoom-far zoom-tiny" : zoom < ZOOM_FAR ? "zoom-far" : "", editable ? "editable" : "", armed ? "tool-connector" : "", space ? "space-pan" : ""].filter(Boolean).join(" ");
  return (
    <div ref={container} className="flow-host">
      <AnnotationContext.Provider value={annotationActions}>
      <EditRequest.Provider value={editRequest}>
      <ReactFlow<FlowNode, FlowEdge> className={rootClass} nodes={nodes} edges={edges} nodeTypes={allNodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeContextMenu} onPaneContextMenu={onPaneContextMenu} onSelectionContextMenu={onSelectionContextMenu}
        onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop} onNodeMouseMove={onNodeMouseMove} onNodeMouseLeave={hideTip}
        onEdgeMouseMove={onEdgeMouseMove} onEdgeMouseLeave={hideTip} onMoveStart={hideTip} onMove={onMove} onInit={onInit}
        onSelectionStart={onSelectionStart} onSelectionEnd={onSelectionEnd}
        panOnDrag={PAN_BUTTONS} onlyRenderVisibleElements
        minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} nodeDragThreshold={DRAG_THRESHOLD} selectionKeyCode={armed || space ? null : "Shift"} multiSelectionKeyCode={armed ? null : MULTI_KEYS} elementsSelectable={!armed}
        selectionMode={SelectionMode.Partial} nodesConnectable={false} elevateEdgesOnSelect={false} elevateNodesOnSelect={false}
        zoomOnDoubleClick={false} deleteKeyCode={null} proOptions={{ hideAttribution: true }} fitView={false} nodesDraggable={!toile.state.control && !armed && !space}
        edgesFocusable={false} colorMode={prefs.theme} ariaLabelConfig={ariaLabelConfig}>
        {prefs.grid ? <Background variant={BackgroundVariant.Lines} gap={GRID} lineWidth={1} /> : null}
        {prefs.minimap ? <MiniMap position="bottom-left" pannable zoomable nodeClassName={minimapClass} nodeBorderRadius={3} /> : null}
        <SketchLayer sketch={sketch} />
        <CloneLayer ghost={ghost} />
      </ReactFlow>
      </EditRequest.Provider>
      </AnnotationContext.Provider>
      <GuideLayer store={guideStore} />
      <svg ref={tips.svg} className="tip-layer" aria-hidden="true" />
      <FloatingHost.Provider value={floating}>{children}</FloatingHost.Provider>
    </div>
  );
}

/** Le rectangle de sélection (Maj + glissé, D1) : son départ, sa fin, et son abandon quand React Flow ne le finira pas.
 *  `selecting` reste à la toile (la synchronisation de la sélection et la bulle le lisent). */
interface RectangleDeps {
  toile: Toile; rf: ReactFlowInstance<FlowNode, FlowEdge>; store: ReturnType<typeof useStoreApi<FlowNode, FlowEdge>>; gate: Gate; armed: boolean;
  container: RefObject<HTMLDivElement | null>; selecting: MutableRefObject<{ before: Item[]; add: boolean; from: Point; ending?: boolean } | null>;
}
function useRectangle({ toile, rf, store, gate, armed, container, selecting }: RectangleDeps): { onSelectionStart: (event: ReactMouseEvent) => void; onSelectionEnd: (event: ReactMouseEvent) => void } {
  // Le rectangle (Maj + glissé, D1) : React Flow sélectionne au fil du geste, et une toile reconstruite au milieu lui
  // faisait mêler les sélections ; on attend la fin, puis la toile prend ce que le rectangle couvre (selection.ts : en
  // mode « touche », ou « englobe » avec Ctrl tenu à la relâche) et l'ajoute à la sélection d'avant (Maj). En vue
  // Contrôle, des équipements seulement (le reste y est inerte).
  const onSelectionStart = useCallback((event: ReactMouseEvent): void => {
    const rect = store.getState().userSelectionRect; // son départ, déjà dans le plan
    selecting.current = { before: itemsOf(toile.state.multi), add: event.shiftKey, from: rect ? { x: rect.startX, y: rect.startY } : rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }) };
    gate.set("rectangle", true);
  }, [toile, rf, store, gate]);
  const onSelectionEnd = useCallback((event: ReactMouseEvent): void => {
    const g = selecting.current;
    if (!g) return;
    const to = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }), mode = event.ctrlKey || event.metaKey ? "inside" : "touch";
    g.ending = true;
    setTimeout(() => { // après les derniers changements `select` du geste
      selecting.current = null;
      const got = covered(rectOf(g.from, to), toile.shapes(), mode).filter((item) => !toile.state.control || item.kind === "node");
      toile.selectItems(itemsOf(afterRectangle(multiOfItems(g.before), got, g.add)));
      gate.set("rectangle", false);
    }, 0);
  }, [toile, rf, gate]);
  // Un rectangle que React Flow ne finira pas (revue de session, B3) : l'outil connecteur armé pendant le geste (React
  // Flow ignore alors la relâche) ou un appui annulé (stylet, tactile). La toile reprend la sélection d'avant, la porte
  // de la barre se relâche, et React Flow oublie son rectangle ; sans quoi les clics suivants ne sélectionnaient plus
  // rien dans la toile.
  const abortRectangle = useCallback((): void => {
    const g = selecting.current;
    if (!g || g.ending) return;
    selecting.current = null;
    store.setState({ userSelectionActive: false, userSelectionRect: null });
    gate.set("rectangle", false);
    toile.selectItems(g.before);
  }, [toile, store, gate]);
  useEffect(() => { if (armed) abortRectangle(); }, [armed, abortRectangle]);
  useEffect(() => {
    const el = container.current;
    if (!el) return undefined;
    el.addEventListener("pointercancel", abortRectangle, true);
    return () => el.removeEventListener("pointercancel", abortRectangle, true);
  }, [abortRectangle]);
  return { onSelectionStart, onSelectionEnd };
}
