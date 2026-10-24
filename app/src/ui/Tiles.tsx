// The tiles (DESIGN.md, Check view, Grid): a free grid of 12 columns and rows of 32 px, 16 px gutters, no bottom edge
// (the grid grows while a tile is carried past its last row; nothing under the lowest tile at rest). Each child is a tile (`key` = its id), moved by the header of its widget
// (`[data-handle]`) and resized by eight handles; nothing else moves during a gesture; the place it would take is a
// dashed frame that turns solid red where the drop would be refused (`data-refused` on the root); the board's rule
// (`state/tiles.ts`, `judge`) decides every change, a refused one goes back. `enlarged` lifts one tile over the
// space (fixed, at the inset its page gives, `--tiles-lift-inset`), travelling from its place in `motion.layer`; the
// other tiles are inert meanwhile (Tab never reaches what it covers).
// Placed by react-grid-layout (its legacy API: no compaction, overlaps left to our rule), which sets each tile's
// geometry by computed style (DESIGN.md, The library's geometry); no style of ours.
import { Children, isValidElement, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { useContainerWidth } from "react-grid-layout";
import GridLayout from "react-grid-layout/legacy";
import type { Layout, LayoutItem, ResizeHandleAxis } from "react-grid-layout/legacy";
import { COLS, fits, fromLayout, GAP, judge, ROW_HEIGHT, sameTiles, toLayout } from "../state/tiles";
import type { Axis, Tiles as TilesValue } from "../state/tiles";
import { durationMs } from "./motion";
import "./Tiles.css";

const AXES: readonly ResizeHandleAxis[] = ["se", "sw", "ne", "nw", "e", "s", "w", "n"];
const MARGIN = [GAP, GAP] as const;
const NO_PADDING = [0, 0] as const;
/** Inside a tile, what keeps its own gesture: the header's buttons, fields, links and toggles. */
const CANCEL = "button, input, a, [role='group']";

export type TilesProps = {
  tiles: TilesValue;
  onChange: (next: TilesValue) => void;
  /** False while a tile is enlarged: neither a move nor a handle. */
  enabled: boolean;
  /** The tile lifted over the space, if any. */
  enlarged?: string | null;
  label: string;
  /** One element per tile, its `key` its id. */
  children: ReactNode;
};

/** The side a resize handle pulls, read from its class (`react-resizable-handle-e`). */
function axisOf(event: Event | undefined): Axis | null {
  const handle = (event?.target as Element | null)?.closest?.(".react-resizable-handle");
  const found = handle ? /react-resizable-handle-(\w+)/.exec(handle.className) : null;
  return found && (AXES as readonly string[]).includes(found[1]) ? (found[1] as Axis) : null;
}

/** The motion of the design (`--motion-layer`, `--motion-ease`), read from the tokens; the built sheet writes the
 *  duration in seconds (`.24s`), hence `durationMs`. */
function motion(): KeyframeAnimationOptions {
  const style = getComputedStyle(document.documentElement);
  const duration = durationMs(style.getPropertyValue("--motion-layer"));
  return { duration, easing: style.getPropertyValue("--motion-ease").trim() || "ease-out", fill: "forwards" };
}

type Box = Readonly<{ top: number; left: number; width: number; height: number }>;

/** The tile at its place, seen through its lifted box: moved there (`translate`) and cut to its size (`clip-path`),
 *  so the widget never stretches while it travels; the radius read from the tokens. */
function seenAt(lifted: Box, place: Box, radius: string): Keyframe {
  const right = Math.max(0, lifted.width - place.width);
  const bottom = Math.max(0, lifted.height - place.height);
  return { translate: `${place.left - lifted.left}px ${place.top - lifted.top}px`, clipPath: `inset(0 ${right}px ${bottom}px 0 round ${radius})` };
}
const whole = (radius: string): Keyframe => ({ translate: "0 0", clipPath: `inset(0 0 0 0 round ${radius})` });
const surfaceRadius = () => getComputedStyle(document.documentElement).getPropertyValue("--radius-surface").trim() || "0";

/** A tile lifted over the space and put back: it travels between its place and the space in `motion.layer`. Landed,
 *  it is `settling` for one frame: the library's geometry comes back without the items' own transition (it would
 *  travel a second time, from the lifted box). */
function useLift(enlarged: string | null, root: { current: HTMLDivElement | null }, home: (id: string) => Box | null) {
  const [lifted, setLifted] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const from = useRef<Box | null>(null);
  const running = useRef<Animation | null>(null);
  const tile = useCallback((id: string) => root.current?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`) ?? null, [root]);
  const land = useCallback((id: string) => {
    setSettling(id);
    setLifted(null);
  }, []);
  useLayoutEffect(() => {
    running.current?.cancel();
    running.current = null;
    if (enlarged && enlarged !== lifted) {
      from.current = tile(enlarged)?.getBoundingClientRect() ?? null;
      setLifted(enlarged);
      return;
    }
    if (!enlarged && lifted) {
      const el = tile(lifted);
      const place = home(lifted);
      if (!el || !place || typeof el.animate !== "function") return land(lifted);
      const radius = surfaceRadius();
      const animation = el.animate([whole(radius), seenAt(el.getBoundingClientRect(), place, radius)], motion());
      animation.onfinish = () => land(lifted);
      running.current = animation;
    }
  }, [enlarged]);
  useLayoutEffect(() => {
    const el = lifted ? tile(lifted) : null;
    if (el && from.current && typeof el.animate === "function") {
      const radius = surfaceRadius();
      running.current = el.animate([seenAt(el.getBoundingClientRect(), from.current, radius), whole(radius)], { ...motion(), fill: "none" });
    } else if (!lifted) {
      running.current?.cancel();
      running.current = null;
    }
    from.current = null;
  }, [lifted, tile]);
  useLayoutEffect(() => {
    if (!settling) return;
    // the landed style computed now, without a transition; the next frame gives the items theirs back
    const el = tile(settling);
    if (el) void getComputedStyle(el).transform;
    const frame = requestAnimationFrame(() => setSettling(null));
    return () => cancelAnimationFrame(frame);
  }, [settling, tile]);
  return { lifted, settling };
}

export function Tiles({ tiles, onChange, enabled, enlarged = null, label, children }: TilesProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const axis = useRef<Axis | null>(null);
  // a layout the library must take back (after a refusal, or a change made to fit) is marked, every other time,
  // with a neutral field: equal to the last one given, it would keep the tile where the pointer left it
  const [mark, setMark] = useState(false);
  const layout = useMemo(() => toLayout(tiles, mark), [tiles, mark]);
  const latest = useRef(tiles);
  latest.current = tiles;
  const home = useCallback(
    (id: string): Box | null => {
      const root = containerRef.current?.getBoundingClientRect();
      const tile = tiles[id as keyof TilesValue];
      if (!root || !tile) return null;
      const column = (width - GAP * (COLS - 1)) / COLS;
      return { left: root.left + tile.x * (column + GAP), top: root.top + tile.y * (ROW_HEIGHT + GAP), width: tile.w * column + (tile.w - 1) * GAP, height: tile.h * ROW_HEIGHT + (tile.h - 1) * GAP };
    },
    [containerRef, tiles, width],
  );
  const { lifted, settling } = useLift(enlarged, containerRef, home);
  const refuse = (on: boolean) => containerRef.current?.toggleAttribute("data-refused", on);
  const onResizeStart = useCallback((_layout: Layout, _old: LayoutItem | null, _item: LayoutItem | null, _placeholder: LayoutItem | null, event: Event) => {
    axis.current = axisOf(event);
  }, []);
  const onDrag = useCallback((current: Layout, _old: LayoutItem | null, item: LayoutItem | null, placeholder: LayoutItem | null) => {
    const place = placeholder ?? item;
    if (place) refuse(!fits(place, current.filter((other) => other.i !== place.i)));
  }, []);
  const onDragStop = useCallback(() => refuse(false), []);
  const onLayoutChange = useCallback(
    (next: Layout) => {
      const prev = latest.current;
      const proposed = fromLayout(next, prev);
      const judged = judge(prev, proposed, axis.current);
      axis.current = null;
      if (!sameTiles(judged.tiles, proposed)) setMark((current) => !current);
      if (!sameTiles(judged.tiles, prev)) onChange(judged.tiles);
    },
    [onChange],
  );
  const items = useMemo(
    () =>
      Children.toArray(children)
        .filter(isValidElement)
        .map((child) => {
          const id = String((child as ReactElement).key ?? "").replace(/^\.\$/, "");
          return (
            <div key={id} className="ui-tiles-item" data-tile={id} data-enlarged={lifted === id ? "" : undefined} data-settling={settling === id ? "" : undefined} inert={!!enlarged && enlarged !== id}>
              {child}
            </div>
          );
        }),
    [children, lifted, settling, enlarged],
  );
  return (
    <div ref={containerRef} className="ui-tiles" role="group" aria-label={label} data-enabled={enabled ? "" : undefined} data-lifted={lifted ? "" : undefined}>
      {mounted ? (
        <GridLayout
          className="ui-tiles-grid"
          width={width}
          layout={layout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          containerPadding={NO_PADDING}
          compactType={null}
          allowOverlap
          isDraggable={enabled}
          isResizable={enabled}
          draggableHandle="[data-handle]"
          draggableCancel={CANCEL}
          resizeHandles={AXES as ResizeHandleAxis[]}
          autoSize
          useCSSTransforms
          onResizeStart={onResizeStart}
          onDrag={onDrag}
          onDragStop={onDragStop}
          onLayoutChange={onLayoutChange}
        >
          {items}
        </GridLayout>
      ) : null}
    </div>
  );
}
