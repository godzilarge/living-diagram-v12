// A popover (DESIGN.md, Layout and Elevation): an island that floats higher, paper, a hairline, the island shadow, the
// surface radius (`elevation="layer"`: the layer shadow, for the search palette only); it opens under its trigger and may cover islands, never its trigger. Click opens and closes it,
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
import { useState } from "react";
import type { ReactNode } from "react";
import { EDGE, POPOVER_FADE, POPOVER_OFFSET } from "./geometry";
import "./Popover.css";

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
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: "absolute",
    middleware: [offset(POPOVER_OFFSET), flip({ padding: EDGE }), shift({ padding: EDGE })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context), useRole(context, { role })]);
  const { isMounted, status } = useTransitionStatus(context, { duration: POPOVER_FADE });
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
