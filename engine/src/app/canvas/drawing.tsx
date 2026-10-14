// Ce qui se dessine pendant qu'on relie (lot 1 de docs/11) : le brouillon d'un connecteur et les marques de sa cible,
// dans une couche unique par-dessus la toile, dans le plan ; et l'outil connecteur lui-même, branché sur les appuis de la
// toile. La couche lit un petit état à part (`Sketch`) : le pointeur qui bouge ne redessine qu'elle, jamais la toile.
// L'outil armé (bouton de la barre, touche C) prend les appuis du bouton principal sur la toile avant React Flow (rien
// ne se glisse, ne se sélectionne ni ne se déplace) ; la décision de chaque geste est dans tool.ts, pure.
import { ViewportPortal } from "@xyflow/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { DEFAULT_HEADS, DEFAULT_STYLE, pathOf } from "../../canvas/connectors";
import type { End, EndPlace } from "../../canvas/connectors";
import type { Point } from "../../canvas/layout";
import { TargetMarks, useUnzoom } from "./anchors";
import { Stroke } from "./connector";
import { marksKey, marksOf } from "./hover";
import type { Marks } from "./hover";
import type { EndKind, Pick } from "./snap";
import { IDLE, down, draftOf, excludeStart, move, up } from "./tool";
import type { Phase, Step } from "./tool";

/** Ce que la couche dessine : le brouillon (du départ au bout visé) et les marques de la cible. */
export interface Sketch { draft: { from: EndPlace; to: EndPlace } | null; marks: Marks | null }
export interface SketchStore { get: () => Sketch; set: (next: Sketch) => void; subscribe: (listener: () => void) => () => void }

export function createSketch(): SketchStore {
  let current: Sketch = { draft: null, marks: null };
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    // les marques ne changent qu'en changeant de cible ou d'ancre : sans brouillon, un pointeur qui bouge ne redessine rien
    set: (next) => {
      if (!next.draft && !current.draft && marksKey(next.marks) === marksKey(current.marks)) return;
      current = next; listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** La couche : un trait en pointillé du départ au bout visé, une flèche à l'arrivée, les marques de la cible. */
export function SketchLayer({ sketch }: { sketch: SketchStore }) {
  const now = useSyncExternalStore(sketch.subscribe, sketch.get, sketch.get);
  const k = useUnzoom();
  if (!now.draft && !now.marks) return null;
  const path = now.draft ? pathOf(now.draft.from, now.draft.to, "straight", 0) : null;
  return (
    <ViewportPortal>
      <svg className="sketch-layer connector hue-slate" aria-hidden="true">
        {path ? <Stroke d={path.d} a={path.a} b={path.b} dirA={path.dirA} dirB={path.dirB} heads={DEFAULT_HEADS} style={DEFAULT_STYLE} label="" mid={path.mid} /> : null}
        {now.marks ? <TargetMarks marks={now.marks} k={k} /> : null}
      </svg>
    </ViewportPortal>
  );
}

export interface ToolOptions {
  container: RefObject<HTMLDivElement | null>;
  /** L'outil connecteur armé (et l'écriture possible). */
  armed: boolean;
  sketch: SketchStore;
  /** Le point du plan sous un point de l'écran. */
  planAt: (screen: Point) => Point;
  /** Ce que vise un bout en un point du plan (snap.ts), sans l'élément `exclude`. */
  pick: (at: Point, exclude?: (kind: EndKind, ref: string) => boolean) => Pick;
  /** Un connecteur à créer ; `keep` : Maj tenue, l'outil reste armé (création en série). */
  onCreate: (fields: { start: End; end: End }, keep: boolean) => void;
  /** Un geste en cours (la bulle se tait). */
  hold: (on: boolean) => void;
}

// Ce que l'outil prend : le fond, un équipement, un cadre, une annotation, un câble ; ni la minimap ni un panneau posé sur la toile.
const onCanvas = (target: EventTarget | null): boolean => {
  const el = target as Element | null;
  return !!el && typeof el.closest === "function" && !!el.closest(".react-flow__pane, .react-flow__node, .react-flow__edge") && !el.closest(".react-flow__minimap, .react-flow__panel");
};

/** L'outil connecteur, armé : appui, mouvement, relâche et clic de la toile passent par tool.ts ; désarmé, rien. */
export function useConnectorTool({ container, armed, sketch, planAt, pick, onCreate, hold }: ToolOptions): void {
  const phase = useRef<Phase>(IDLE);
  const latest = useRef({ planAt, pick, onCreate, hold });
  latest.current = { planAt, pick, onCreate, hold };
  useEffect(() => {
    const el = container.current;
    if (!armed || !el) return;
    let swallow = false; // l'appui pris par l'outil : son clic ne sélectionne rien derrière
    const screen = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
    const aim = (event: PointerEvent): { at: Point; target: Pick } => {
      const at = latest.current.planAt(screen(event));
      return { at, target: latest.current.pick(at, excludeStart(phase.current)) };
    };
    const show = (target: Pick | null): void => {
      const draft = draftOf(phase.current);
      sketch.set({ draft: draft && target ? { from: draft.place, to: target.place } : null, marks: marksOf(target) });
    };
    const apply = (step: Step, keep: boolean): void => {
      phase.current = step.phase;
      latest.current.hold(step.phase.kind !== "idle");
      if (step.create) latest.current.onCreate(step.create, keep);
    };
    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !onCanvas(event.target)) return; // le clic droit garde son menu
      event.preventDefault(); event.stopPropagation(); // ni glissé, ni panoramique, ni rectangle (React Flow)
      swallow = true;
      el.setPointerCapture(event.pointerId);
      const { at, target } = aim(event);
      apply(down(phase.current, target, at, screen(event)), event.shiftKey);
      show(phase.current.kind === "idle" ? null : target);
    };
    const onMove = (event: PointerEvent): void => {
      if (phase.current.kind === "idle" && !onCanvas(event.target)) { show(null); return; }
      phase.current = move(phase.current, screen(event));
      show(aim(event).target);
    };
    const onUp = (event: PointerEvent): void => {
      if (event.button !== 0 || phase.current.kind === "idle") return;
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      const { at, target } = aim(event);
      apply(up(phase.current, target, at), event.shiftKey);
      show(target);
    };
    const onCancel = (): void => { apply({ phase: IDLE, create: null }, false); show(null); };
    const onClick = (event: MouseEvent): void => { if (swallow) { event.stopPropagation(); event.preventDefault(); swallow = false; } };
    const onLeave = (): void => { if (phase.current.kind === "idle") show(null); };
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("pointercancel", onCancel, true);
    el.addEventListener("click", onClick, true);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("pointercancel", onCancel, true);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("pointerleave", onLeave);
      phase.current = IDLE;
      sketch.set({ draft: null, marks: null });
      latest.current.hold(false);
    };
  }, [armed, container, sketch]);
}
