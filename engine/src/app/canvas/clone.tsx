// Alt + glissé (lot 3 de docs/11) : dupliquer en glissant. Un appui du bouton principal avec Alt sur une annotation, un
// connecteur, une carte ou un cadre est pris avant React Flow (rien ne se glisse, rien ne change de sélection) ; un
// fantôme de ce qui sera copié (la sélection si l'élément en fait partie, sinon l'élément seul) suit le pointeur, à
// 60 % d'opacité, dans une couche à part (le pointeur qui bouge ne redessine qu'elle) ; à la relâche, la copie se crée
// à la place du fantôme, l'original reste. Sans Alt au départ, glissé normal. Les poignées (taille, bouts, frontières
// d'un tableau) et les champs gardent leur geste ; Espace + glissé et le bouton du milieu gardent la vue. La copie
// s'aligne comme un glissé (lot 8 de docs/11) : les repères corrigent l'écart, l'aimant de la grille pose le reste par
// pas de 20 sur l'axe qu'ils n'ont pas pris ; Ctrl tenu suspend les deux.
import { ViewportPortal } from "@xyflow/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type { Point } from "../../canvas/layout";
import { pathOf } from "../../canvas/connectors";
import type { Annotation } from "../../canvas/types";
import { ghostOf, snapped } from "../state/clipboard";
import { typing } from "./keys";
import type { Ghost } from "../state/clipboard";
import { payloadFromToile, targetOf } from "./clip-toile";
import { has, itemsOf, selectionOf } from "../state/selection";
import type { Item } from "../state/selection";
import { Body } from "./annotation";
import { Stroke } from "./connector";
import type { Toile } from "./toile";

/** Sous ce déplacement (pixels d'écran), un Alt + clic ne copie rien : il sélectionne. */
const THRESHOLD = 4;

export interface GhostStore { get: () => Ghost | null; set: (next: Ghost | null) => void; subscribe: (listener: () => void) => () => void }
export function createGhost(): GhostStore {
  let current: Ghost | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next) => { current = next; listeners.forEach((listener) => listener()); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** Ce qu'un nœud React Flow est pour une copie (son `data-id`) ; un cluster ne se copie pas. */
function itemOfElement(el: Element, toile: Toile): Item | null {
  const id = el.getAttribute("data-id") || "";
  if (id.startsWith("annotation:")) return { kind: "annotation", id: id.slice(11) };
  if (id.startsWith("connector:")) return { kind: "connector", id: id.slice(10) };
  if (id.startsWith("group:")) return { kind: "group", id: id.slice(6) };
  return toile.model.nodeByHost.has(id) ? { kind: "node", id } : null;
}

export interface CloneOptions {
  container: RefObject<HTMLDivElement | null>;
  /** Alt + glissé possible (vue Diagramme avec un nom, outil connecteur rangé, Espace relâchée ; sans nom, glissé normal). */
  enabled: boolean;
  toile: Toile;
  ghost: GhostStore;
  planAt: (screen: Point) => Point;
  /** L'aimant de la grille : l'écart se pose alors par pas de 20. */
  snap: boolean;
  onDrop: (items: Item[], d: Point) => void;
  /** Un geste en cours (la bulle se tait). */
  hold: (on: boolean) => void;
  /** Les repères d'alignement (lot 8) : la correction d'un écart `d` (plan, brut) et les axes pris ; `end` les efface. */
  guide?: { move: (items: Item[], d: Point, free: boolean) => { dx: number; dy: number; took: { x: boolean; y: boolean } }; end: () => void };
}

export function useAltClone({ container, enabled, toile, ghost, planAt, snap, onDrop, hold, guide }: CloneOptions): void {
  const latest = useRef({ planAt, snap, onDrop, hold, guide });
  latest.current = { planAt, snap, onDrop, hold, guide };
  useEffect(() => {
    const el = container.current;
    if (!enabled || !el) return;
    let gesture: { items: Item[]; from: Point; sx: number; sy: number; pointer: number; moved: boolean } | null = null;
    let swallow = false;
    const delta = (event: PointerEvent): Point => {
      const g = gesture as NonNullable<typeof gesture>, at = latest.current.planAt({ x: event.clientX, y: event.clientY });
      const free = event.ctrlKey || event.metaKey, raw = { x: at.x - g.from.x, y: at.y - g.from.y };
      const fix = latest.current.guide && g.moved ? latest.current.guide.move(g.items, raw, free) : { dx: 0, dy: 0, took: { x: false, y: false } };
      const step = (v: number): number => snapped(v, latest.current.snap && !free);
      return { x: fix.took.x ? Math.round(raw.x + fix.dx) : step(raw.x), y: fix.took.y ? Math.round(raw.y + fix.dy) : step(raw.y) };
    };
    const end = (): void => { gesture = null; ghost.set(null); latest.current.hold(false); if (latest.current.guide) latest.current.guide.end(); };
    const onDown = (event: PointerEvent): void => {
      swallow = false; // un clic avalé ne vaut que pour l'appui qui l'a pris
      if (event.button !== 0 || !event.altKey) return;
      const target = event.target as Element | null;
      const node = target && typeof target.closest === "function" ? target.closest(".react-flow__node") : null;
      if (!node || (target as Element).closest(".nodrag:not(.connector-hit)")) return; // poignées et champs gardent leur geste
      const item = itemOfElement(node, toile);
      if (!item) return;
      event.preventDefault(); event.stopPropagation(); // ni glissé ni sélection de React Flow
      swallow = true;
      const kept = has(toile.state.multi, item);
      if (!kept) toile.select(selectionOf(item)); // l'élément seul devient la sélection, comme un clic
      gesture = { items: kept ? itemsOf(toile.state.multi) : [item], from: latest.current.planAt({ x: event.clientX, y: event.clientY }), sx: event.clientX, sy: event.clientY, pointer: event.pointerId, moved: false };
      el.setPointerCapture(event.pointerId);
      latest.current.hold(true);
    };
    const onMove = (event: PointerEvent): void => {
      const g = gesture;
      if (!g || event.pointerId !== g.pointer) return;
      if (!g.moved && Math.hypot(event.clientX - g.sx, event.clientY - g.sy) < THRESHOLD) return;
      g.moved = true;
      ghost.set(ghostOf(payloadFromToile(toile, g.items), targetOf(toile), delta(event)));
    };
    const onUp = (event: PointerEvent): void => {
      const g = gesture;
      if (!g || event.pointerId !== g.pointer) return;
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      const d = delta(event);
      end();
      if (g.moved && (d.x || d.y)) latest.current.onDrop(g.items, d);
    };
    const onClick = (event: MouseEvent): void => { if (swallow) { event.stopPropagation(); event.preventDefault(); swallow = false; } };
    const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape" && gesture) { event.stopPropagation(); end(); } };
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("pointercancel", end, true);
    el.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("pointercancel", end, true);
      el.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      end();
    };
  }, [enabled, container, toile, ghost]);
}

/** Le fantôme : les annotations dessinées comme sur la toile, les connecteurs de bout en bout, à 60 % (canvas.css). */
export function CloneLayer({ ghost }: { ghost: GhostStore }) {
  const now = useSyncExternalStore(ghost.subscribe, ghost.get, ghost.get);
  if (!now) return null;
  return (
    <ViewportPortal>
      <svg className="clone-layer" aria-hidden="true" data-ghost="">
        {now.annotations.map(({ a, frame }) => (
          <g key={a.id} transform={`translate(${frame.x} ${frame.y})`}>
            <svg className={`annotation kind-${a.content.kind} hue-${a.style.hue}`} width={frame.w} height={frame.h} overflow="visible">
              <g opacity={a.style.opacity / 100}><Body a={a as unknown as Annotation} frame={frame} /></g>
            </svg>
          </g>
        ))}
        {now.lines.map(({ c, a, b }) => {
          const path = pathOf({ kind: "point", at: a }, { kind: "point", at: b }, c.route, c.bend);
          return <g key={c.id} className={`connector hue-${c.style.hue}`}><Stroke d={path.d} a={path.a} b={path.b} dirA={path.dirA} dirB={path.dirB} heads={c.heads} style={c.style} label={c.label} points={path.points} /></g>;
        })}
      </svg>
    </ViewportPortal>
  );
}

/** Le point du plan sous le pointeur, tenu dans la toile tant qu'il est sur elle (fond, carte, câble ; ni la minimap ni
 *  un panneau posé dessus) : un Ctrl+V y colle. Et un appui sur la toile, hors d'un champ, efface la sélection de texte
 *  de la page (revue du lot 3, M3 : un clic sur la toile ne l'efface pas dans Chromium, et Ctrl+C aurait copié ce texte
 *  au lieu de la sélection de la toile) ; un texte sélectionné dans un champ ou une fiche garde la copie native.
 *  `toile.pointer` est posé comme `frames`, `ends` et `boxes` (ce que la toile React Flow sait de son dessin) : la toile
 *  tient l'état mutable de la vue, React n'en a qu'une version (B9). */
export function usePointerPlan(container: RefObject<HTMLDivElement | null>, toile: Toile, planAt: (screen: Point) => Point): void {
  const latest = useRef(planAt);
  latest.current = planAt;
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onMove = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      const over = !!target && typeof target.closest === "function" && !!target.closest(".react-flow__pane, .react-flow__node, .react-flow__edge") && !target.closest(".react-flow__minimap, .react-flow__panel");
      toile.pointer = over ? latest.current({ x: event.clientX, y: event.clientY }) : null;
    };
    const onLeave = (): void => { toile.pointer = null; };
    const onDown = (event: PointerEvent): void => {
      if (typing(event.target)) return;
      const text = typeof window.getSelection === "function" ? window.getSelection() : null;
      if (text && !text.isCollapsed) text.removeAllRanges();
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown, true);
    return () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); el.removeEventListener("pointerdown", onDown, true); toile.pointer = null; };
  }, [container, toile]);
}
