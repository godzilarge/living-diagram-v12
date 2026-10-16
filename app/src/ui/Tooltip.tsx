// The one tooltip of the application (DESIGN.md, Tooltip): black, white label text, a shortcut in tip-sub, below the
// control and centred, toward the inside when against an edge; 350 ms delay, 150 ms fade. Nothing else may render a
// `[role="tooltip"]`. Positioned by floating-ui (styles through the CSSOM, CSP-safe).
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStatus,
} from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import { cloneElement, isValidElement, useState } from "react";
import type { HTMLProps, ReactElement, ReactNode, Ref } from "react";
import { EDGE, TOOLTIP_DELAY, TOOLTIP_FADE, TOOLTIP_OFFSET } from "./geometry";
import "./Tooltip.css";

export type TooltipOptions = {
  /** What the control does, in words. */
  label: ReactNode;
  /** The keyboard shortcut, already in the page's language (`Ctrl K`). */
  shortcut?: ReactNode;
  placement?: Placement;
  /** Forces the tooltip open or closed (the primitives page); left out, hover and keyboard focus open it. */
  open?: boolean;
};

export type TooltipHandle = {
  setReference: (node: HTMLElement | null) => void;
  getReferenceProps: (props?: HTMLProps<Element>) => Record<string, unknown>;
  node: ReactNode;
};

export function useTooltip({ label, shortcut, placement = "bottom", open: forced }: TooltipOptions): TooltipHandle {
  const [open, setOpen] = useState(false);
  const controlled = forced !== undefined;
  const { refs, floatingStyles, context } = useFloating({
    open: controlled ? forced : open,
    onOpenChange: setOpen,
    placement,
    strategy: "absolute",
    middleware: [offset(TOOLTIP_OFFSET), flip({ padding: EDGE }), shift({ padding: EDGE })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { enabled: !controlled, delay: { open: TOOLTIP_DELAY, close: 0 }, move: false });
  const focus = useFocus(context, { enabled: !controlled });
  const dismiss = useDismiss(context, { enabled: !controlled });
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const { isMounted, status } = useTransitionStatus(context, { duration: TOOLTIP_FADE });
  const node = isMounted ? (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="ui-tooltip" data-status={status} {...getFloatingProps()}>
        {label}
        {shortcut ? <span className="ui-tooltip-shortcut">{shortcut}</span> : null}
      </div>
    </FloatingPortal>
  ) : null;
  return { setReference: refs.setReference, getReferenceProps, node };
}

type TooltipProps = TooltipOptions & { children: ReactElement<Record<string, unknown> & { ref?: Ref<HTMLElement> }> };

/** A tooltip on any focusable element that is not a primitive control (the primitives carry their own). */
export function Tooltip({ children, ...options }: TooltipProps) {
  const tip = useTooltip(options);
  if (!isValidElement(children)) return children;
  return (
    <>
      {cloneElement(children, { ref: tip.setReference, ...tip.getReferenceProps(children.props) })}
      {tip.node}
    </>
  );
}
