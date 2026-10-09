// La toile de l'application, sans DOM ni React : l'état de ce qui est montré (filtres, épingles locales, mémoire des
// places, positions, sélection) et ce qu'on peut lui demander (placer, cadrer, montrer, sélectionner, déplacer,
// aligner, se réaligner sur le serveur). React Flow dessine ce que la toile décrit (Flow.tsx) ; la toile prévient la
// page (`onSelect`, `onPin`, `onPins`, `onPlaced`) comme graph.ts le fait pour `/view`. Déterministe : le placement
// vient de scene.ts, les positions sont des centres entiers en unités du dessin ; la vue (zoom, décalage) est celle
// de React Flow, que la toile lit et pose par `attach`.
import { align as alignPositions } from "../../canvas/align";
import type { AlignMode } from "../../canvas/align";
import type { PinsCause } from "../../canvas/graph";
import { bounds } from "../../canvas/layout";
import type { Point } from "../../canvas/layout";
import { aggregateOf, beamOf, entityOf, hostsOf, linkOf, worst } from "../../canvas/model";
import { changeOf, placeScene, visible } from "../../canvas/scene";
import type { Filters, Visible } from "../../canvas/scene";
import type { Model, ModelLink, Selection } from "../../canvas/types";
import { centered, fitZoom, openingView } from "./opening";

export interface Viewport { x: number; y: number; zoom: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
/** Ce que la toile sait de la vue : la taille du canevas, la vue courante, et comment en poser une. */
export interface ViewPort { rect: () => { width: number; height: number }; get: () => Viewport; set: (view: Viewport, animate: boolean) => void }
export interface ToileHooks {
  onSelect: (selection: Selection | null, hosts: string[]) => void;
  onPin?: (hostname: string, point: Point) => void;
  onPins?: (moves: Map<string, Point>, cause: PinsCause) => void;
  onPlaced?: (fresh: Map<string, Point>, replace: boolean) => void;
  /** Un geste de déplacement fini (glissé, alignement, flèches) : où étaient les équipements, où ils sont. */
  onMoved?: (before: Map<string, Point>, after: Map<string, Point>) => void;
  /** Rappelle `run` dans `ms` millisecondes, rend de quoi annuler : la minuterie vient de la page (la toile n'en a pas). */
  later?: (run: () => void, ms: number) => () => void;
}
export interface Layers { speeds: boolean; beams: boolean; pins: boolean; notes: boolean; oper: boolean }
export interface ToileState {
  filters: Filters; showPorts: boolean; query: string; insets: Insets;
  /** Les couches du panneau Affichage : vitesses, port-channels et vPC, épingles, annotations, câbles down. */
  layers: Layers;
  /** La vue Contrôle (2026-10-09) : statuts, contrôles et état de collecte dessinés ; sinon la vue Diagramme, neutre. */
  control: boolean;
  pinned: Map<string, Point>; placed: Map<string, Point>; positions: Map<string, Point>;
  selection: Selection | null; selected: Set<string>;
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
  /** Montre un élément choisi ailleurs : le rend visible (voisins inconnus, changements, statuts), le sélectionne, le centre. */
  reveal: (selection: Selection | null) => boolean;
  /** Un équipement déplacé prend sa position et une épingle locale ; la page décide d'enregistrer ou non. */
  moveTo: (hostname: string, point: Point) => void;
  /** Des équipements relâchés après un glissé : un seul, ou la sélection glissée d'un bloc (un seul paquet). */
  dropped: (hosts: string[]) => void;
  alignSelected: (mode: AlignMode) => Map<string, Point>;
  /** Déplace la sélection de (dx, dy) au clavier ; une rafale de flèches n'enregistre qu'un paquet, `NUDGE_MS` après la
   *  dernière. Rend faux s'il n'y a aucun équipement sélectionné. */
  nudge: (dx: number, dy: number) => boolean;
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
  ends: Map<string, { a: Point; b: Point }>;
  /** Le point du plan au milieu de ce qui reste visible : où poser une annotation insérée. */
  viewCenter: () => Point;
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
    insets: { top: 0, right: 0, bottom: 0, left: 0 }, pinned: savedPins(), placed: savedPlaces(), positions: new Map(), selection: null, selected: new Set(),
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
  // Amène l'élément choisi au milieu de ce qui reste visible, à un zoom où son nom se lit.
  function centerOn(selection: Selection | null): void {
    if (!view) return;
    let ends = hostsOf(model, selection).map(at).filter((p): p is Point => !!p);
    if (selection && selection.kind === "annotation") { const f = toile.frames.get(selection.id); ends = f ? [{ x: f.x + f.w / 2, y: f.y + f.h / 2 }] : []; }
    if (selection && selection.kind === "connector") { const e = toile.ends.get(selection.id); ends = e ? [e.a, e.b] : []; }
    if (!ends.length) return;
    const area = visibleRect();
    const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length, y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
    const k = Math.max(view.get().zoom, REVEAL_MIN_ZOOM);
    view.set({ zoom: k, x: area.x + area.width / 2 - x * k, y: area.y + area.height / 2 - y * k }, true);
  }
  const frame = (): void => { if (state.selection || state.selected.size) centerOn(state.selection || { kind: "node", id: Array.from(state.selected)[0] }); else fit(); };
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
    if (state.selection || state.selected.size) { frame(); return; }
    const next = openingView(state.positions, notable(), visibleRect());
    if (next) view.set(next, false);
  }

  // La sélection simple : un élément, lu ; un équipement est aussi le seul membre de la sélection multiple. La page
  // apprend les deux (`onSelect`).
  const notify = (): void => hooks.onSelect(state.selection, Array.from(state.selected));
  function select(selection: Selection | null): void {
    state.selection = selection;
    state.selected = new Set(selection && selection.kind === "node" ? [selection.id] : []);
    bump();
    notify();
  }
  function selectHosts(hosts: string[]): void {
    const kept = new Set(hosts.filter((host) => model.nodeByHost.has(host)));
    state.selected = kept;
    state.selection = kept.size === 1 ? { kind: "node", id: Array.from(kept)[0] } : null;
    bump();
    notify();
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
  function save(hosts: string[], cause: PinsCause): void {
    const moves = new Map(hosts.filter((host) => at(host)).map((host): [string, Point] => [host, { ...(at(host) as Point) }]));
    if (moves.size > 1 && hooks.onPins) hooks.onPins(moves, cause);
    else if (hooks.onPin) moves.forEach((point, host) => hooks.onPin?.(host, point));
  }
  function dropped(hosts: string[]): void {
    bump();
    save(hosts, "dragged");
    settle(hosts);
  }
  function alignSelected(mode: AlignMode): Map<string, Point> {
    flush();
    const moved = alignPositions(state.positions, Array.from(state.selected).filter((host) => at(host)), mode);
    moved.forEach((point, host) => moveTo(host, point));
    bump();
    if (moved.size && hooks.onPins) hooks.onPins(moved, "aligned");
    settle(Array.from(moved.keys()));
    return moved;
  }
  // Les flèches : la sélection bouge tout de suite, l'enregistrement attend la fin de la rafale.
  let nudging: { hosts: Set<string>; cancel: () => void } | null = null;
  const movable = (): string[] => {
    const hosts = state.selected.size ? Array.from(state.selected) : state.selection && state.selection.kind === "node" ? [state.selection.id] : [];
    return hosts.filter((host) => { const node = model.nodeByHost.get(host); return !!at(host) && !!node && !node.ghost; });
  };
  function flush(): void {
    if (!nudging) return;
    const hosts = Array.from(nudging.hosts).sort();
    nudging.cancel();
    nudging = null;
    save(hosts, "dragged");
    settle(hosts);
  }
  function nudge(dx: number, dy: number): boolean {
    const hosts = movable();
    if (!hosts.length) return false;
    hosts.forEach((host) => { const now = at(host) as Point; moveTo(host, { x: now.x + dx, y: now.y + dy }); });
    bump();
    const all = new Set([...(nudging ? nudging.hosts : []), ...hosts]);
    if (nudging) nudging.cancel();
    nudging = { hosts: all, cancel: hooks.later ? hooks.later(flush, NUDGE_MS) : () => undefined };
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
    model, state, version: () => version, frames: new Map(), ends: new Map(), viewCenter,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    attach: (next) => { view = next; },
    scene: () => current || (current = visible(model, state.filters)),
    render, repaint: bump, fit, frame, open, notable, select,
    viewport: () => (view ? { ...view.get() } : null), restoreView: (next) => { if (view) view.set(next, true); }, selectHosts, reveal, moveTo, dropped, alignSelected, nudge, flush, restore,
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
