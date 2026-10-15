// La toile de l'application, sans DOM ni React : l'état de ce qui est montré (filtres, épingles locales, mémoire des
// places, positions, sélection) et ce qu'on peut lui demander (placer, cadrer, montrer, sélectionner, déplacer,
// aligner, se réaligner sur le serveur). React Flow dessine ce que la toile décrit (Flow.tsx) ; la toile prévient la
// page (`onSelect`, `onPin`, `onPins`, `onPlaced`) comme graph.ts le fait pour `/view`. Déterministe : le placement
// vient de scene.ts, les positions sont des centres entiers en unités du dessin ; la vue (zoom, décalage) est celle
// de React Flow, que la toile lit et pose par `attach`.
import { align as alignPositions, alignBoxes, gridBoxes } from "../../canvas/align";
import type { AlignMode, Box, BoxMode, GridItem, GridOrder } from "../../canvas/align";
import { KIND_LABEL } from "../../canvas/annotations";
import type { End } from "../../canvas/connectors";
import type { Op } from "../../shell/apps";
import { empty, has, itemOf, itemsOf, multiOf, primaryOf, readingOrder, cycle as cycleOrder, selectionOf, single, size } from "../state/selection";
import type { Item, Multi, Shape as PickShape } from "../state/selection";
import type { PinsCause } from "../../canvas/graph";
import { bounds } from "../../canvas/layout";
import type { Point } from "../../canvas/layout";
import { aggregateOf, beamOf, entityOf, hostsOf, linkOf, worst } from "../../canvas/model";
import { changeOf, placeScene, visible } from "../../canvas/scene";
import type { Filters, Visible } from "../../canvas/scene";
import type { Model, ModelLink, Selection } from "../../canvas/types";
import { centered, fitZoom, openingView } from "./opening";

export interface Viewport { x: number; y: number; zoom: number }
/** Pourquoi des équipements ont bougé d'un geste : aligner, glisser (graph.ts), ou mettre en grille (lot 8 de docs/11,
 *  propre à l'application : il passe toujours par `onBlock`, la page dit le message). */
export type MoveCause = PinsCause | "gridded";
/** Mettre la sélection en grille : colonnes (sinon le moins de cases vides), ordre, pas de l'aimant (`null` sans). */
export interface GridOptions { cols?: number | null; order: GridOrder; snap: number | null }
/** Une grille calculée sur la sélection : ses dimensions et la place à venir de chaque élément (boîte dans le plan, nom). */
export interface GridShape { cols: number; rows: number; count: number; places: { key: string; name: string; box: Box }[] }
export interface Insets { top: number; right: number; bottom: number; left: number }
/** Ce que la toile sait de la vue : la taille du canevas, la vue courante, et comment en poser une. */
export interface ViewPort { rect: () => { width: number; height: number }; get: () => Viewport; set: (view: Viewport, animate: boolean) => void }
export interface ToileHooks {
  /** La sélection a changé : l'élément lu quand il n'y en a qu'un (sinon `null`), et toute la sélection mixte. */
  onSelect: (selection: Selection | null, multi: Multi) => void;
  onPin?: (hostname: string, point: Point) => void;
  onPins?: (moves: Map<string, Point>, cause: PinsCause) => void;
  onPlaced?: (fresh: Map<string, Point>, replace: boolean) => void;
  /** Un geste de déplacement fini (glissé, alignement, flèches) : où étaient les équipements, où ils sont. */
  onMoved?: (before: Map<string, Point>, after: Map<string, Point>) => void;
  /** Rappelle `run` dans `ms` millisecondes, rend de quoi annuler : la minuterie vient de la page (la toile n'en a pas). */
  later?: (run: () => void, ms: number) => () => void;
  /** Un geste sur une sélection mixte (glissé, alignement, flèches) : les épingles et les opérations des annotations et
   *  connecteurs, à enregistrer en une seule écriture (une entrée d'annulation). */
  onBlock?: (pins: Map<string, Point>, ops: Op[], cause: MoveCause) => void;
  /** Peut-on écrire l'intention (un nom, la vue Diagramme) ? Sinon annotations et connecteurs ne bougent pas. */
  canWrite?: () => boolean;
}
/** Une boîte d'annotation posée localement (glissé, redimensionnement, flèches, alignement) en attendant la réponse. */
export type PendingBox = Partial<{ x: number; y: number; w: number; h: number }>;
export interface Layers { speeds: boolean; beams: boolean; pins: boolean; notes: boolean; oper: boolean }
export interface ToileState {
  filters: Filters; showPorts: boolean; query: string; insets: Insets;
  /** Les couches du panneau Affichage : vitesses, port-channels et vPC, épingles, annotations, câbles down. */
  layers: Layers;
  /** La vue Contrôle (2026-10-09) : statuts, contrôles et état de collecte dessinés ; sinon la vue Diagramme, neutre. */
  control: boolean;
  pinned: Map<string, Point>; placed: Map<string, Point>; positions: Map<string, Point>;
  /** L'élément lu (un seul élément sélectionné), sinon `null`. */
  selection: Selection | null;
  /** La sélection mixte (lot 2 de docs/11) : équipements, annotations, connecteurs, groupes, et son élément principal. */
  multi: Multi; primary: Item | null;
  /** Les équipements de la sélection (`multi.hosts`), en ensemble. */
  selected: Set<string>;
}
export interface Toile {
  model: Model;
  state: ToileState;
  /** Change dès que ce qui est à dessiner change ; React s'y abonne (`subscribe`). */
  version: () => number;
  subscribe: (listener: () => void) => () => void;
  attach: (view: ViewPort | null) => void;
  /** Ce qui est visible, pour le dernier placement. */
  scene: () => Visible;
  /** Replace (les nœuds épinglés et mémorisés gardent leur place) ; `keepView` garde le cadrage. */
  render: (keepView: boolean, replace?: boolean) => void;
  repaint: () => void;
  fit: () => void;
  /** Centre sur la sélection s'il y en a une, sinon cadre tout. */
  frame: () => void;
  /** La vue d'ouverture : la sélection de l'adresse, sinon tout s'il se lit, sinon ce qui compte (opening.ts). */
  open: () => void;
  /** Les équipements dessinés qui comptent : en erreur ou en avertissement, changés, au bout d'un câble changé. */
  notable: () => string[];
  /** La vue courante, et la reposer (un parcours rend la vue d'avant en finissant). */
  viewport: () => Viewport | null;
  restoreView: (view: Viewport) => void;
  select: (selection: Selection | null) => void;
  selectHosts: (hosts: string[]) => void;
  /** Une sélection mixte (rectangle, Maj + clic, Ctrl+A) ; `primary` : l'élément principal, sinon le dernier entré. */
  selectItems: (items: Item[], primary?: Item | null) => void;
  /** Tout ce qui est visible et se sélectionne en bloc (Ctrl+A) : équipements de la run, annotations et connecteurs
   *  dessinés, non verrouillés ; jamais les cadres. */
  allItems: () => Item[];
  /** Ce qu'un rectangle de sélection peut prendre : équipements de la run (boîte), annotations (boîte) et connecteurs
   *  (tracé) dessinés, avec leur verrou ; jamais un cadre ni un cluster, qui couvriraient tout. */
  shapes: () => PickShape[];
  /** Tab : sélectionne l'élément suivant (ou précédent) dans l'ordre de lecture, le rend. */
  cycle: (direction: 1 | -1) => Item | null;
  /** Montre un élément choisi ailleurs : le rend visible (voisins inconnus, changements, statuts), le sélectionne, le centre. */
  reveal: (selection: Selection | null) => boolean;
  /** Un équipement déplacé prend sa position et une épingle locale ; la page décide d'enregistrer ou non. */
  moveTo: (hostname: string, point: Point) => void;
  /** Des équipements relâchés après un glissé : un seul, ou la sélection glissée d'un bloc (un seul paquet) ; `ops` :
   *  les annotations et connecteurs glissés avec eux, dans la même écriture. */
  dropped: (hosts: string[], ops?: Op[]) => void;
  /** Aligne la sélection : des cartes seules par leurs centres (`AlignMode`), une sélection mixte par les boîtes. */
  alignSelected: (mode: AlignMode | BoxMode) => Map<string, Point>;
  /** La grille que « mettre en grille » poserait (l'aperçu du volet), sans rien bouger ; `null` sous trois éléments. */
  gridPlan: (options: GridOptions) => GridShape | null;
  /** Met la sélection en grille (équipements et annotations non verrouillées ; cadres et connecteurs ne bougent pas) :
   *  un paquet d'épingles et les places des annotations en une écriture, une entrée d'annulation. */
  gridSelected: (options: GridOptions) => GridShape | null;
  /** Déplace la sélection de (dx, dy) au clavier ; une rafale de flèches n'enregistre qu'un paquet, `NUDGE_MS` après la
   *  dernière. Rend faux s'il n'y a aucun équipement sélectionné. */
  nudge: (dx: number, dy: number) => boolean;
  /** Des connecteurs glissés avec une sélection : leurs bouts libres posés localement de (dx, dy), et les opérations
   *  qui les écrivent (rien pour un connecteur sans bout libre ou qui n'a pas bougé). */
  moveLines: (ids: string[], dx: number, dy: number) => Op[];
  /** Termine tout de suite une rafale de flèches en attente (avant une annulation, par exemple). */
  flush: () => void;
  /** Remet des équipements à ces positions, comme des déplacements locaux, sans rien enregistrer (annuler sans nom). */
  restore: (points: Map<string, Point>) => void;
  resetPins: () => void;
  replaceAll: () => void;
  syncPins: () => void;
  syncPlaces: () => void;
  unpin: (hosts: string[]) => void;
  /** Après une couleur ou un groupe d'intention acceptés : la scène se recalcule, une version de plus. */
  recolor: () => void;
  /** Le centre d'une annotation dessinée (pour la centrer) : posé par la toile React Flow à chaque dessin (`frames`). */
  frames: Map<string, { x: number; y: number; w: number; h: number }>;
  /** Les deux bouts d'un connecteur dessiné, dans le plan : posés de même (`ends`). */
  ends: Map<string, { a: Point; b: Point; mid?: Point }>;
  /** La boîte (largeur, hauteur) de chaque équipement dessiné : posée de même (`boxes`). */
  boxes: Map<string, { w: number; h: number }>;
  /** Le cadre de chaque groupe dessiné, dans le plan : posé de même (`groupFrames`, lu par la barre contextuelle). */
  groupFrames: Map<string, { x: number; y: number; w: number; h: number }>;
  /** Les boîtes d'annotations et les bouts libres de connecteurs posés localement, en attendant que le document les porte
   *  (Flow.tsx les lit au dessin et les oublie dès que le modèle est d'accord). */
  pending: Map<string, PendingBox>;
  pendingEnds: Map<string, { start?: End; end?: End }>;
  /** Le point du plan au milieu de ce qui reste visible : où poser une annotation insérée. */
  viewCenter: () => Point;
  /** Le point du plan sous le pointeur quand il est sur la toile, sinon `null` : où un Ctrl+V colle (lot 3 de docs/11) ;
   *  posé par la toile React Flow (Flow.tsx). */
  pointer: Point | null;
}

/** Le délai après la dernière flèche avant d'enregistrer le déplacement : une rafale = un paquet d'épingles. */
export const NUDGE_MS = 400;
const REVEAL_MIN_ZOOM = 0.8;

export function createToile(model: Model, hooks: ToileHooks): Toile {
  // Les épingles enregistrées (couche d'intention) sont des contraintes dures dès le premier placement ; un fantôme du
  // diff n'est pas un nœud de la run, son épingle est orpheline et ne le place pas (docs/08 I3 ; revue B4, B3).
  const savedPins = (): Map<string, Point> => new Map(Array.from(model.pinByHost)
    .filter(([host]) => { const node = model.nodeByHost.get(host); return !!node && !node.ghost; })
    .map(([host, pin]) => [host, { x: pin.x, y: pin.y }] as const));
  const savedPlaces = (): Map<string, Point> => new Map(Array.from(model.placeByHost, ([host, place]) => [host, { x: place.x, y: place.y }]));
  const state: ToileState = {
    filters: { showStubs: false, showDiff: true, hiddenStatuses: new Set(), hide: [], only: null }, showPorts: false, query: "", layers: { speeds: false, beams: false, pins: true, notes: true, oper: false }, control: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 }, pinned: savedPins(), placed: savedPlaces(), positions: new Map(), selection: null,
    multi: empty(), primary: null, selected: new Set(),
  };
  let version = 0;
  const listeners = new Set<() => void>();
  const bump = (): void => { version += 1; listeners.forEach((listener) => listener()); };
  let view: ViewPort | null = null;
  let current: Visible | null = null;
  let unplaced = new Set<string>();
  const at = (hostname: string): Point | undefined => state.positions.get(hostname);

  function render(keepView: boolean, replace = false): void {
    state.filters.showNotes = state.layers.notes;
    current = visible(model, state.filters);
    const placed = placeScene(model, current.nodes, state.pinned, state.placed);
    state.positions = placed.positions;
    unplaced = placed.unplaced;
    if (!keepView) fit();
    bump();
    if ((placed.fresh.size || replace) && hooks.onPlaced) hooks.onPlaced(placed.fresh, replace);
  }

  // La partie visible du canevas, moins ce que la page pose dessus (barre, bande, panneau).
  const visibleRect = (): { x: number; y: number; width: number; height: number } => {
    const rect = view ? view.rect() : { width: 900, height: 600 }, i = state.insets;
    return { x: i.left, y: i.top, width: Math.max((rect.width || 900) - i.left - i.right, 100), height: Math.max((rect.height || 600) - i.top - i.bottom, 100) };
  };
  function fit(): void {
    if (!view || !state.positions.size) return;
    const box = bounds(state.positions), area = visibleRect();
    view.set(centered({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, fitZoom(state.positions, area), area), false);
  }
  // Les points d'un élément : le centre d'un équipement, d'une annotation dessinée, les bouts d'un connecteur, les
  // membres d'un groupe ou d'un cluster.
  function pointsOf(selection: Selection): Point[] {
    if (selection.kind === "annotation") { const f = toile.frames.get(selection.id); return f ? [{ x: f.x + f.w / 2, y: f.y + f.h / 2 }] : []; }
    if (selection.kind === "connector") { const e = toile.ends.get(selection.id); return e ? [e.a, e.b] : []; }
    return hostsOf(model, selection).map(at).filter((p): p is Point => !!p);
  }
  // Amène l'élément choisi (ou toute la sélection mixte) au milieu de ce qui reste visible, à un zoom où son nom se lit.
  function centerOn(selection: Selection | null, many: Item[] = []): void {
    if (!view) return;
    const ends = (selection ? pointsOf(selection) : []).concat(many.flatMap((item) => pointsOf(selectionOf(item))));
    if (!ends.length) return;
    const area = visibleRect();
    const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
    const k = Math.max(view.get().zoom, REVEAL_MIN_ZOOM);
    view.set({ zoom: k, x: area.x + area.width / 2 - x * k, y: area.y + area.height / 2 - y * k }, true);
  }
  const frame = (): void => { if (state.selection || size(state.multi)) centerOn(state.selection, state.selection ? [] : itemsOf(state.multi)); else fit(); };
  // En vue Diagramme, les contrôles ne comptent pas : seuls les changements orientent l'ouverture.
  function notable(): string[] {
    const sc = current || visible(model, state.filters), found = new Set<string>();
    sc.nodes.forEach((node) => {
      if (node.kind === "stub" || !at(node.hostname)) return;
      const severity = state.control ? worst(model.checksByNode.get(node.hostname) || []) : null;
      if (severity === "error" || severity === "warning" || changeOf(model, state.filters.showDiff, "node", node, node.hostname)) found.add(node.hostname);
    });
    sc.links.forEach((link) => {
      if (!changeOf(model, state.filters.showDiff, "link", link, link.id)) return;
      [link.a.hostname, link.b.hostname].forEach((host) => { const node = model.nodeByHost.get(host); if (node && node.kind !== "stub" && at(host)) found.add(host); });
    });
    return Array.from(found).sort();
  }
  function open(): void {
    if (!view) return;
    if (state.selection || size(state.multi)) { frame(); return; }
    const next = openingView(state.positions, notable(), visibleRect());
    if (next) view.set(next, false);
  }

  // La sélection : un élément seul est lu (`selection`) et forme aussi la sélection mixte s'il est d'une des quatre
  // sortes (équipement, annotation, connecteur, groupe) ; plusieurs éléments n'ont pas d'élément lu. La page apprend
  // les deux (`onSelect`).
  const notify = (): void => hooks.onSelect(state.selection, state.multi);
  const known = (item: Item): boolean => (item.kind === "node" ? model.nodeByHost.has(item.id) : item.kind === "annotation" ? model.annotationById.has(item.id)
    : item.kind === "connector" ? model.connectorById.has(item.id) : model.groupById.has(item.id));
  function setMulti(multi: Multi, primary: Item | null): void {
    state.multi = multi;
    state.primary = primary;
    state.selected = new Set(multi.hosts);
  }
  function select(selection: Selection | null): void {
    const item = itemOf(selection);
    state.selection = selection;
    setMulti(item ? multiOf([item]) : empty(), item);
    bump();
    notify();
  }
  function selectItems(items: Item[], primary?: Item | null): void {
    const kept = items.filter(known);
    const multi = multiOf(kept);
    const only = single(multi);
    state.selection = only ? selectionOf(only) : null;
    setMulti(multi, primary && has(multi, primary) ? primary : primaryOf(state.multi, state.primary, multi, kept));
    bump();
    notify();
  }
  const selectHosts = (hosts: string[]): void => selectItems(hosts.map((id): Item => ({ kind: "node", id })));
  const locked = (item: Item): boolean => (item.kind === "annotation" ? !!(model.annotationById.get(item.id) || { locked: false }).locked
    : item.kind === "connector" ? !!(model.connectorById.get(item.id) || { locked: false }).locked : false);
  // Ce qui se sélectionne à la main sur la toile (Tab), avec son coin haut gauche : équipements de la run (pas un
  // fantôme du diff), annotations et connecteurs dessinés.
  function drawnItems(): { item: Item; at: Point }[] {
    const sc = current || visible(model, state.filters);
    const hosts = sc.nodes.filter((node) => !node.ghost && at(node.hostname)).map((node): { item: Item; at: Point } => {
      const c = at(node.hostname) as Point, box = toile.boxes.get(node.hostname) || { w: 0, h: 0 };
      return { item: { kind: "node" as const, id: node.hostname }, at: { x: c.x - box.w / 2, y: c.y - box.h / 2 } };
    });
    const notes = Array.from(toile.frames, ([id, f]): { item: Item; at: Point } => ({ item: { kind: "annotation", id }, at: { x: f.x, y: f.y } }));
    const lines = Array.from(toile.ends, ([id, e]): { item: Item; at: Point } => ({ item: { kind: "connector", id }, at: { x: Math.min(e.a.x, e.b.x), y: Math.min(e.a.y, e.b.y) } }));
    return hosts.concat(notes, lines).filter((entry) => known(entry.item));
  }
  function shapes(): PickShape[] {
    const out: PickShape[] = [];
    (current || visible(model, state.filters)).nodes.forEach((node) => {
      const c = at(node.hostname), b = toile.boxes.get(node.hostname);
      if (!node.ghost && c && b) out.push({ item: { kind: "node", id: node.hostname }, box: { x: c.x - b.w / 2, y: c.y - b.h / 2, w: b.w, h: b.h } });
    });
    toile.frames.forEach((f, id) => out.push({ item: { kind: "annotation", id }, box: f, locked: locked({ kind: "annotation", id }) }));
    toile.ends.forEach((e, id) => out.push({ item: { kind: "connector", id }, line: e.mid ? [e.a, e.mid, e.b] : [e.a, e.b], locked: locked({ kind: "connector", id }) }));
    return out;
  }
  const allItems = (): Item[] => drawnItems().map((entry) => entry.item).filter((item) => !locked(item));
  function cycle(direction: 1 | -1): Item | null {
    const next = cycleOrder(readingOrder(drawnItems()), state.primary || itemOf(state.selection), direction);
    if (next) select(selectionOf(next));
    return next;
  }
  function reveal(selection: Selection | null): boolean {
    if (!selection) { select(null); return false; }
    const entity = entityOf(model, selection);
    const links: ModelLink[] = selection.kind === "link" ? [linkOf(model, selection)].filter((l): l is ModelLink => !!l)
      : selection.kind === "beam" ? (beamOf(model, selection) || { links: [] as ModelLink[] }).links
      : selection.kind === "aggregate" ? (aggregateOf(model, selection) || { cables: [] as ModelLink[] }).cables : [];
    const hosts = hostsOf(model, selection).concat(links.flatMap((link) => [link.a.hostname, link.b.hostname]));
    const needsStubs = hosts.some((host) => (model.nodeByHost.get(host) || { kind: null }).kind === "stub");
    const f = state.filters;
    let redraw = false;
    if (entity && (entity as { ghost?: boolean }).ghost && !f.showDiff) { f.showDiff = true; redraw = true; } // un fantôme ne se montre qu'avec les changements
    if (needsStubs && !f.showStubs) { f.showStubs = true; redraw = true; }
    links.forEach((link) => { if (f.hiddenStatuses.has(link.status)) { f.hiddenStatuses.delete(link.status); redraw = true; } });
    if (redraw) render(true);
    select(selection);
    centerOn(selection);
    return redraw;
  }

  // Un geste (glissé, alignement, rafale de flèches) retient où chaque équipement était avant son premier mouvement ;
  // à sa fin, la page l'apprend (`onMoved` : la pile d'annulation des déplacements locaux).
  let gesture = new Map<string, Point>();
  function moveTo(hostname: string, point: Point): void {
    const now = at(hostname);
    if (now && !gesture.has(hostname)) gesture.set(hostname, { ...now });
    state.positions.set(hostname, point);
    state.pinned.set(hostname, point);
  }
  function settle(hosts: string[]): void {
    const before = new Map<string, Point>(), after = new Map<string, Point>();
    hosts.forEach((host) => {
      const was = gesture.get(host), now = at(host);
      if (was && now && (was.x !== now.x || was.y !== now.y)) { before.set(host, was); after.set(host, { ...now }); }
    });
    gesture = new Map();
    if (before.size && hooks.onMoved) hooks.onMoved(before, after);
  }
  // Une écriture pour un geste : les épingles seules passent par `onPin` / `onPins` (comme avant) ; avec des annotations
  // ou des connecteurs, tout part ensemble par `onBlock` (une seule entrée d'annulation).
  function save(hosts: string[], cause: MoveCause, ops: Op[] = []): void {
    const moves = new Map(hosts.filter((host) => at(host)).map((host): [string, Point] => [host, { ...(at(host) as Point) }]));
    if (cause === "gridded") { if (hooks.onBlock) hooks.onBlock(moves, ops, cause); return; }
    if (ops.length && hooks.onBlock) hooks.onBlock(moves, ops, cause);
    else if (moves.size > 1 && hooks.onPins) hooks.onPins(moves, cause);
    else if (hooks.onPin) moves.forEach((point, host) => hooks.onPin?.(host, point));
  }
  function dropped(hosts: string[], ops: Op[] = []): void {
    bump();
    save(hosts, "dragged", ops);
    settle(hosts);
  }
  const writable = (): boolean => !!hooks.canWrite && hooks.canWrite();
  // Les annotations et connecteurs de la sélection qu'un geste peut déplacer : dessinés, non verrouillés, et seulement
  // si l'on peut écrire (sans nom, rien de l'intention ne bouge, même localement).
  const movableNotes = (): string[] => (writable() ? state.multi.annotations.filter((id) => toile.frames.has(id) && !locked({ kind: "annotation", id })) : []);
  const movableLines = (): string[] => (writable() ? state.multi.connectors.filter((id) => {
    const c = model.connectorById.get(id);
    return !!c && !c.locked && toile.ends.has(id) && (endOf(id, "start").kind === "free" || endOf(id, "end").kind === "free");
  }) : []);
  // La place courante d'une annotation (écart à son ancre) et d'un bout de connecteur : posée localement, sinon celle du document.
  const noteAt = (id: string): Point => { const a = model.annotationById.get(id) as { x: number; y: number }, p = toile.pending.get(id) || {}; return { x: p.x === undefined ? a.x : p.x, y: p.y === undefined ? a.y : p.y }; };
  function endOf(id: string, which: "start" | "end"): End {
    const local = toile.pendingEnds.get(id), c = model.connectorById.get(id);
    return (local && local[which]) || (c ? c[which] : { kind: "free", x: 0, y: 0 });
  }
  const shiftNote = (id: string, dx: number, dy: number): void => { const now = noteAt(id); toile.pending.set(id, { ...(toile.pending.get(id) || {}), x: now.x + dx, y: now.y + dy }); };
  function shiftLine(id: string, dx: number, dy: number): void {
    const next: { start?: End; end?: End } = { ...(toile.pendingEnds.get(id) || {}) };
    (["start", "end"] as const).forEach((which) => { const e = endOf(id, which); if (e.kind === "free") next[which] = { kind: "free", x: e.x + dx, y: e.y + dy }; });
    toile.pendingEnds.set(id, next);
  }
  // Les opérations qui écrivent ce qui a été posé localement.
  const noteOps = (ids: Iterable<string>): Op[] => Array.from(ids).sort().map((id): Op => { const p = noteAt(id); return { op: "annotation_update", id, x: p.x, y: p.y }; });
  const lineOps = (ids: Iterable<string>): Op[] => Array.from(ids).sort().map((id): Op => {
    const s0 = endOf(id, "start"), e0 = endOf(id, "end");
    return { op: "connector_update", id, ...(s0.kind === "free" ? { start: s0 } : {}), ...(e0.kind === "free" ? { end: e0 } : {}) };
  });
  // Une sélection de cartes seules s'aligne par les centres (règle d'avant, captures inchangées) ; dès qu'une annotation
  // en fait partie, ou pour un bord (gauche, haut…), par les boîtes (align.ts).
  const CENTER_MODES: Record<AlignMode, BoxMode> = { horizontal: "middle", vertical: "center", "distribute-horizontal": "distribute-horizontal", "distribute-vertical": "distribute-vertical" };
  function alignSelected(mode: AlignMode | BoxMode): Map<string, Point> {
    flush();
    const hosts = Array.from(state.selected).filter((host) => at(host) && !(model.nodeByHost.get(host) || { ghost: true }).ghost);
    const notes = movableNotes();
    if (!notes.length && mode in CENTER_MODES) {
      const moved = alignPositions(state.positions, hosts, mode as AlignMode);
      moved.forEach((point, host) => moveTo(host, point));
      bump();
      if (moved.size && hooks.onPins) hooks.onPins(moved, "aligned");
      settle(Array.from(moved.keys()));
      return moved;
    }
    const boxes = new Map<string, Box>();
    hosts.forEach((host) => { const c = at(host) as Point, b = toile.boxes.get(host) || { w: 0, h: 0 }; boxes.set("node\u0000" + host, { x: c.x - b.w / 2, y: c.y - b.h / 2, w: b.w, h: b.h }); });
    notes.forEach((id) => boxes.set("annotation\u0000" + id, { ...(toile.frames.get(id) as Box) }));
    const moved = alignBoxes(boxes, Array.from(boxes.keys()), mode in CENTER_MODES ? CENTER_MODES[mode as AlignMode] : mode as BoxMode);
    const hostMoves = new Map<string, Point>(), shifted: string[] = [];
    moved.forEach((corner, key) => {
      const [kind, id] = key.split("\u0000"), box = boxes.get(key) as Box;
      if (kind === "node") { const point = { x: Math.round(corner.x + box.w / 2), y: Math.round(corner.y + box.h / 2) }; moveTo(id, point); hostMoves.set(id, point); }
      else { shiftNote(id, corner.x - box.x, corner.y - box.y); shifted.push(id); }
    });
    bump();
    save(Array.from(hostMoves.keys()).sort(), "aligned", noteOps(shifted));
    settle(Array.from(hostMoves.keys()));
    return hostMoves;
  }
  // Mettre en grille (lot 8 de docs/11) : les mêmes éléments qu'un alignement par les boîtes (équipements de la run,
  // annotations non verrouillées si l'on peut écrire), rangés par `gridBoxes` (align.ts) ; trois au moins.
  const noteName = (id: string): string => {
    const a = model.annotationById.get(id), c = a ? a.content : null;
    const text = !c ? "" : c.kind === "note" ? c.text.split("\n")[0] : c.kind === "shape" ? c.label : c.kind === "image" ? c.alt || "" : "";
    return text.trim() || (c ? KIND_LABEL[c.kind] || c.kind : id);
  };
  function gridItems(): GridItem[] {
    const hosts = Array.from(state.selected).filter((host) => at(host) && !(model.nodeByHost.get(host) || { ghost: true }).ghost).sort();
    const items = hosts.map((host): GridItem => { const c = at(host) as Point, b = toile.boxes.get(host) || { w: 0, h: 0 }; return { id: "node\u0000" + host, name: host, box: { x: c.x - b.w / 2, y: c.y - b.h / 2, w: b.w, h: b.h } }; });
    return items.concat(movableNotes().sort().map((id): GridItem => ({ id: "annotation\u0000" + id, name: noteName(id), box: { ...(toile.frames.get(id) as Box) } })));
  }
  function gridOf(options: GridOptions): { shape: GridShape; items: GridItem[]; places: Map<string, Point> } | null {
    const items = gridItems();
    if (items.length < 3) return null;
    const plan = gridBoxes(items, options);
    if (!plan) return null;
    const places = plan.ordered.map((g) => { const p = plan.places.get(g.id) as Point; return { key: g.id, name: g.name, box: { x: p.x, y: p.y, w: g.box.w, h: g.box.h } }; });
    return { shape: { cols: plan.cols, rows: plan.rows, count: items.length, places }, items, places: plan.places };
  }
  function gridSelected(options: GridOptions): GridShape | null {
    flush();
    const got = gridOf(options);
    if (!got) return null;
    const hostMoves = new Map<string, Point>(), shifted: string[] = [];
    got.items.forEach((g) => {
      const corner = got.places.get(g.id) as Point, [kind, id] = g.id.split("\u0000");
      if (corner.x === g.box.x && corner.y === g.box.y) return;
      if (kind === "node") { const point = { x: Math.round(corner.x + g.box.w / 2), y: Math.round(corner.y + g.box.h / 2) }; moveTo(id, point); hostMoves.set(id, point); }
      else { shiftNote(id, corner.x - g.box.x, corner.y - g.box.y); shifted.push(id); }
    });
    bump();
    if (hostMoves.size || shifted.length) save(Array.from(hostMoves.keys()).sort(), "gridded", noteOps(shifted));
    settle(Array.from(hostMoves.keys()));
    return got.shape;
  }
  // Les flèches : la sélection bouge tout de suite, l'enregistrement attend la fin de la rafale.
  let nudging: { hosts: Set<string>; notes: Set<string>; lines: Set<string>; cancel: () => void } | null = null;
  // Les équipements qu'un geste déplace : ceux de la sélection, et les membres des groupes sélectionnés (un cadre
  // entraîne ses membres, comme au glissé) ; jamais un fantôme du diff.
  const movable = (): string[] => {
    const hosts = new Set(state.selected.size ? state.selected : state.selection && state.selection.kind === "node" ? [state.selection.id] : []);
    state.multi.groups.forEach((id) => { const g = model.groupById.get(id); if (g) g.members.forEach((host) => hosts.add(host)); });
    return Array.from(hosts).sort().filter((host) => { const node = model.nodeByHost.get(host); return !!at(host) && !!node && !node.ghost; });
  };
  function flush(): void {
    if (!nudging) return;
    const { hosts, notes, lines } = nudging;
    nudging.cancel();
    nudging = null;
    const all = Array.from(hosts).sort();
    save(all, "dragged", noteOps(notes).concat(lineOps(lines)));
    settle(all);
  }
  function nudge(dx: number, dy: number): boolean {
    const hosts = movable(), notes = movableNotes(), lines = movableLines();
    if (!hosts.length && !notes.length && !lines.length) return false;
    hosts.forEach((host) => { const now = at(host) as Point; moveTo(host, { x: now.x + dx, y: now.y + dy }); });
    notes.forEach((id) => shiftNote(id, dx, dy));
    lines.forEach((id) => shiftLine(id, dx, dy));
    bump();
    const merge = (was: Set<string> | undefined, now: string[]): Set<string> => new Set([...(was || []), ...now]);
    if (nudging) nudging.cancel();
    nudging = { hosts: merge(nudging?.hosts, hosts), notes: merge(nudging?.notes, notes), lines: merge(nudging?.lines, lines), cancel: hooks.later ? hooks.later(flush, NUDGE_MS) : () => undefined };
    if (!hooks.later) flush(); // sans minuterie (tests), chaque flèche s'enregistre
    return true;
  }
  function restore(points: Map<string, Point>): void {
    flush();
    points.forEach((point, host) => { if (at(host)) { state.positions.set(host, { ...point }); state.pinned.set(host, { ...point }); } });
    bump();
  }

  // Après une écriture acceptée : les épingles enregistrées s'ajoutent aux épingles locales (un glissé encore en
  // attente ou refusé reste local ; revue B4, M3), et un nœud dessiné loin de son épingle la rejoint sans replacer.
  function syncPins(): void {
    savedPins().forEach((point, host) => {
      state.pinned.set(host, point);
      const now = at(host);
      if (now && (now.x !== point.x || now.y !== point.y)) state.positions.set(host, { ...point });
    });
    bump();
  }
  // Après une réponse de l'API : le document enregistré est la mémoire ; un équipement dessiné ailleurs que sa place,
  // ou sans place alors qu'il en mérite une, et non épinglé, est replacé (revue docs/09, H1, M1).
  function syncPlaces(): void {
    state.placed = savedPlaces();
    const stale = Array.from(state.positions.keys()).some((host) => {
      const node = model.nodeByHost.get(host), place = state.placed.get(host), now = at(host);
      if (!node || !now || state.pinned.has(host)) return false;
      if (place) return place.x !== now.x || place.y !== now.y;
      return node.kind !== "stub" && !node.ghost && !unplaced.has(host);
    });
    if (stale) render(true);
  }

  const viewCenter = (): Point => {
    const area = visibleRect(), v = view ? view.get() : { x: 0, y: 0, zoom: 1 };
    return { x: Math.round((area.x + area.width / 2 - v.x) / v.zoom), y: Math.round((area.y + area.height / 2 - v.y) / v.zoom) };
  };
  const toile: Toile = {
    model, state, version: () => version, frames: new Map(), ends: new Map(), boxes: new Map(), groupFrames: new Map(), pending: new Map(), pendingEnds: new Map(), viewCenter, pointer: null,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    attach: (next) => { view = next; },
    scene: () => current || (current = visible(model, state.filters)),
    render, repaint: bump, fit, frame, open, notable, select, selectItems, allItems, cycle, shapes,
    viewport: () => (view ? { ...view.get() } : null), restoreView: (next) => { if (view) view.set(next, true); }, selectHosts, reveal, moveTo, dropped, alignSelected, nudge, flush, restore,
    gridPlan: (options) => { const got = gridOf(options); return got ? got.shape : null; }, gridSelected,
    moveLines: (ids, dx, dy) => { const kept = ids.filter((id) => model.connectorById.has(id) && (dx || dy)); kept.forEach((id) => shiftLine(id, dx, dy)); return lineOps(kept).filter((op) => op.op === "connector_update" && (op.start || op.end)); },
    resetPins: () => { state.pinned = savedPins(); render(true); },
    replaceAll: () => { state.pinned = savedPins(); state.placed = new Map(); render(false, true); },
    syncPins, syncPlaces,
    // Après une couleur ou un groupe acceptés : la scène se recalcule (un groupe nouveau entre dans le dessin), une version de plus.
    recolor: () => { state.filters.showNotes = state.layers.notes; current = visible(model, state.filters); bump(); },
    // Une épingle retirée replace seulement si son équipement est dessiné (une orpheline ne bouge rien).
    unpin: (hosts) => { const shown = hosts.some((host) => at(host)); hosts.forEach((host) => state.pinned.delete(host)); if (shown) render(true); },
  };
  return toile;
}
