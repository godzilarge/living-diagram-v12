// The one tooltip of the application (DESIGN.md, Tooltip): black, white label text, a shortcut in tip-sub, below the
// control and centred, 8 px away, toward the inside when against an edge; 350 ms delay, a 150 ms fade and a 3 px rise. Nothing else may render a
// `[role="tooltip"]`. Positioned by floating-ui (styles through the CSSOM, CSP-safe). A focus the page gives back
// (`quietFocus`: a layer closing returns the focus to its trigger) opens no tooltip: only the reader's own focus does.
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
import { EDGE, motionMs, TOOLTIP_OFFSET } from "./geometry";
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

const QUIET = "data-quiet-focus";

/** Gives the focus back to a control without opening its tooltip: the mark is lifted on its blur or the next key. */
export function quietFocus(element: HTMLElement | null | undefined): void {
  if (!element) return;
  element.setAttribute(QUIET, "");
  const lift = (): void => {
    element.removeAttribute(QUIET);
    element.removeEventListener("blur", lift);
    window.removeEventListener("keydown", lift, true);
  };
  element.addEventListener("blur", lift);
  window.addEventListener("keydown", lift, true);
  element.focus();
}

export type TooltipHandle = {
  setReference: (node: HTMLElement | null) => void;
  getReferenceProps: (props?: HTMLProps<Element>) => Record<string, unknown>;
  node: ReactNode;
};

export function useTooltip({ label, shortcut, placement = "bottom", open: forced }: TooltipOptions): TooltipHandle {
  const [open, setOpen] = useState(false);
  const controlled = forced !== undefined;
  const { refs, floatingStyles, context, placement: side } = useFloating({
    open: controlled ? forced : open,
    // a focus the page gave back (quietFocus) is not the reader's: it opens nothing
    onOpenChange: (next, _event, reason) => setOpen(next && reason === "focus" && refs.domReference.current?.hasAttribute(QUIET) ? false : next),
    placement,
    strategy: "absolute",
    transform: false, // positioned by top / left: the CSS transform is free for the 3 px rise
    middleware: [offset(TOOLTIP_OFFSET), flip({ padding: EDGE }), shift({ padding: EDGE })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { enabled: !controlled, delay: { open: motionMs("tooltip-delay"), close: 0 }, move: false });
  const focus = useFocus(context, { enabled: !controlled });
  const dismiss = useDismiss(context, { enabled: !controlled });
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const { isMounted, status } = useTransitionStatus(context, { duration: motionMs("tooltip") });
  const node = isMounted ? (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="ui-tooltip" data-status={status} data-side={side.split("-")[0]} {...getFloatingProps()}>
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
