// An icon button (DESIGN.md, Buttons): 32 × 32, a 16 px icon, always a tooltip; `variant="line"` borders it (a control
// that stands alone on an empty surface, the free slot's "+"); `pressed` makes it a toggle with the
// rail; a popover's trigger (`aria-expanded`, one state, never `pressed` as well) carries the rail while its layer is
// open; disabled keeps its tooltip, which says why. Extra props (`data-*`, `aria-*`, a popover's handlers) pass through.
import { useMergeRefs } from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { Icon, Spinner } from "./Icon";
import { useTooltip } from "./Tooltip";
import "./control.css";
import "./IconButton.css";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled" | "title" | "style"> & {
  /** The words of the action: the accessible name and the tooltip. */
  label: string;
  icon: ReactNode;
  variant?: "plain" | "line";
  shortcut?: ReactNode;
  /** Why it is disabled, said in the tooltip after the label. */
  disabledReason?: string;
  pressed?: boolean;
  current?: boolean;
  disabled?: boolean;
  danger?: boolean;
  loading?: boolean;
  tooltipPlacement?: Placement;
  tooltipOpen?: boolean;
  ref?: Ref<HTMLButtonElement>;
  "data-force"?: "hover" | "focus";
};

export function IconButton(props: IconButtonProps) {
  const { label, icon, variant = "plain", shortcut, disabledReason, pressed, current, disabled, danger, loading, tooltipPlacement,
    tooltipOpen, ref, onClick, className, ...rest } = props;
  // a control whose popover is open says nothing more: its tooltip would cover the popover
  const expanded = rest["aria-expanded"] === true || rest["aria-expanded"] === "true";
  const tip = useTooltip({ label: disabled && disabledReason ? disabledReason : label, shortcut, placement: tooltipPlacement, open: expanded ? false : tooltipOpen });
  const merged = useMergeRefs([ref, tip.setReference]);
  const inert = disabled || loading;
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) event.preventDefault();
    else onClick?.(event);
  };
  const toggles = pressed !== undefined || current !== undefined || rest["aria-expanded"] !== undefined;
  return (
    <>
      <button
        type="button"
        {...tip.getReferenceProps({ ...rest, onClick: click })}
        ref={merged}
        className={["ui-control", "ui-icon-button", variant === "line" ? "ui-icon-button-line" : "", toggles ? "ui-rail" : "", className ?? ""].join(" ").replace(/\s+/g, " ").trim()}
        aria-label={label}
        aria-pressed={pressed}
        aria-current={current ? "true" : undefined}
        aria-disabled={disabled ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        data-danger={danger ? "" : undefined}
      >
        {loading ? <Spinner /> : <Icon>{icon}</Icon>}
      </button>
      {tip.node}
    </>
  );
}
