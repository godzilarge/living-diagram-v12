// A popover (DESIGN.md, Layout and Elevation): an island that floats higher, paper, a hairline, the island shadow, the
// surface radius (`elevation="layer"`: the layer shadow, for the search palette only). It opens 8 px under the island
// that holds its trigger, aligned on that island (under a widget's header when the trigger sits in one:
// `data-anchor`; 16 px under a trigger in no island); it may cover islands, never its trigger. Click opens and closes it,
// Escape and a click outside close it. `data-layer` names it for the measurement (≥ 16 px from the viewport).
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
import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { EDGE, motionMs, POPOVER_ISLAND_OFFSET, POPOVER_OFFSET } from "./geometry";
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
};

export function Popover({ label, name, trigger, children, placement = "bottom-end", defaultOpen = false, role = "dialog", elevation = "island" }: PopoverProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [island, setIsland] = useState<Element | null>(null);
  const { refs, floatingStyles, context, elements } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: "absolute",
    middleware: [offset(island ? POPOVER_ISLAND_OFFSET : POPOVER_OFFSET), flip({ padding: EDGE }), shift({ padding: EDGE })],
    whileElementsMounted: autoUpdate,
  });
  // positioned against the island that holds the trigger, when there is one (the settings popover of the mockup)
  useLayoutEffect(() => {
    const holder = elements.domReference instanceof Element ? elements.domReference.closest(HOLDERS) : null;
    setIsland(holder);
    refs.setPositionReference(holder);
  }, [elements.domReference, refs]);
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
              data-layer={name}
              data-elevation={elevation}
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
