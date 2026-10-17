// A popover (DESIGN.md, Layout and Elevation): an island that floats higher, paper, a hairline, the island shadow, the
// surface radius (`elevation="layer"`: the layer shadow, for the search palette only). It opens 8 px under the island
// that holds its trigger, aligned on that island (under a widget's header when the trigger sits in one:
// `data-anchor`; 16 px under a trigger in no island); it may cover islands, never its trigger. Click opens and closes it,
// Escape and a click outside close it; Escape gives the focus back to the trigger quietly (no tooltip). It opens with
// the mockup's rise (6 px, from a 98 % scale, from the corner it hangs from: `data-placement`). `data-layer` names it
// for the measurement (≥ 16 px from the viewport). Its trigger carries `aria-expanded`, which gives it the rail.
// `anchor="trigger"` (a volet of a contextual bar, a tool's choices): it hangs from its trigger, `gap` px from the edge
// of the island that holds the trigger (DESIGN.md, Contextual bars: 12 px), its first control lined up with the
// trigger (a `-start` placement); it flips to the other side when it lacks room. `layout` lays its controls out as an
// island does: `bar` (a row, 48 px high), `column` (stacked 4 px apart), `list` (a Menu: 4 px around its rows, as a
// choice's list), `plain` (8 px padding).
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  useTransitionStatus,
} from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EDGE, ISLAND_PADDING, LIST_PADDING, motionMs, POPOVER_ISLAND_OFFSET, POPOVER_OFFSET } from "./geometry";
import { quietFocus } from "./Tooltip";
import "./Popover.css";

/** What a popover opens under: a widget's header, else the island that holds the trigger. */
const HOLDERS = ["[data-anchor]", "[data-float]"].join(", ");

export type TriggerProps = Record<string, unknown> & { ref: (node: HTMLElement | null) => void };

export type PopoverProps = {
  /** The popover's accessible name. */
  label: string;
  name: string;
  /** Renders the trigger with the props it must spread (ref, handlers, `aria-expanded`). */
  trigger: (props: TriggerProps, open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  /** Opens it from the start (the primitives page). */
  defaultOpen?: boolean;
  role?: "dialog" | "menu";
  /** `layer` rises with the layer shadow: the search palette only (DESIGN.md, Elevation). */
  elevation?: "island" | "layer";
  /** What it opens against: the island that holds the trigger (the default), or the trigger itself (a volet). */
  anchor?: "island" | "trigger";
  /** Its distance in px from the island that holds the trigger (8, or 16 from a trigger in no island, by default). */
  gap?: number;
  layout?: "plain" | "bar" | "column" | "list";
};

/** Between a trigger and the edge of its island on the side the popover opens: what a gap counted from the island adds. */
function insetOf(trigger: Element | null, holder: Element | null, side: string): number {
  if (!trigger || !holder) return 0;
  const t = trigger.getBoundingClientRect(), h = holder.getBoundingClientRect();
  if (side === "top") return t.top - h.top;
  if (side === "bottom") return h.bottom - t.bottom;
  if (side === "left") return t.left - h.left;
  return h.right - t.right;
}

export function Popover(props: PopoverProps) {
  const { label, name, trigger, children, placement = "bottom-end", defaultOpen = false, role = "dialog", elevation = "island", anchor = "island", gap, layout = "plain" } = props;
  const [open, setOpen] = useState(defaultOpen);
  // the island that holds the trigger, read by the offset at each computation: floating-ui compares middleware
  // functions by their source and would keep a closure over a stale state
  const island = useRef<Element | null>(null);
  const onTrigger = anchor === "trigger";
  const { refs, floatingStyles, context, elements, placement: side } = useFloating({
    open,
    transform: false, // positioned by top / left: the CSS transform is free for the rise
    // Escape gives the focus back to the trigger without its tooltip (the reader did not focus it); a click outside
    // leaves the focus where the reader clicked
    onOpenChange: (next, _event, reason) => {
      setOpen(next);
      if (!next && reason === "escape-key") quietFocus(refs.domReference.current as HTMLElement | null);
    },
    placement,
    strategy: "absolute",
    middleware: [
      offset(({ placement: at, elements: parts }) => {
        const distance = gap ?? (island.current ? POPOVER_ISLAND_OFFSET : POPOVER_OFFSET);
        if (!onTrigger) return distance;
        // counted from the island's edge, the first control lined up with the trigger's
        const [side, align] = at.split("-");
        const trigger = parts.reference instanceof Element ? parts.reference : null;
        const mainAxis = distance + insetOf(trigger, trigger?.closest(HOLDERS) ?? null, side);
        // the popover's own padding and hairline, so its first control lines up with the trigger
        const inset = layout === "list" ? LIST_PADDING + 1 : layout === "plain" ? ISLAND_PADDING + 1 : ISLAND_PADDING;
        return { mainAxis, crossAxis: align === "start" ? -inset : align === "end" ? inset : 0 };
      }),
      flip({ padding: EDGE }),
      shift({ padding: EDGE }),
    ],
    whileElementsMounted: autoUpdate,
  });
  // positioned against the island that holds the trigger, when there is one (the settings popover of the mockup)
  useLayoutEffect(() => {
    const holder = elements.domReference instanceof Element ? elements.domReference.closest(HOLDERS) : null;
    island.current = holder;
    // hung from its trigger, the trigger stays the reference (a null position reference would clear it)
    if (!onTrigger) refs.setPositionReference(holder);
  }, [elements.domReference, refs, onTrigger]);
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context), useRole(context, { role })]);
  const { isMounted, status } = useTransitionStatus(context, { duration: motionMs("popover") });
  const close = () => setOpen(false);
  return (
    <>
      {trigger({ ref: refs.setReference, ...getReferenceProps() }, open)}
      {isMounted ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="ui-popover"
              data-status={status}
              data-placement={side}
              data-layer={name}
              data-elevation={elevation}
              data-layout={layout}
              aria-label={label}
              {...getFloatingProps()}
            >
              {typeof children === "function" ? children(close) : children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}
