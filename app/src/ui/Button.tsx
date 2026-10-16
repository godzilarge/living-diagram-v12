// A button with words (DESIGN.md, Buttons): `plain` (a choice in a bar), `line` (a bordered control that must read as
// one), `primary` (the accent fill, one per surface at most). An optional leading icon, a trailing chevron for a choice
// that opens a list; the same states as every control. A tooltip only when `tooltip` is given.
import { useMergeRefs } from "@floating-ui/react";
import { ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { Icon, Spinner } from "./Icon";
import { useTooltip } from "./Tooltip";
import "./control.css";
import "./Button.css";

export type ButtonVariant = "plain" | "line" | "primary";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled" | "title"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: ReactNode;
  chevron?: boolean;
  tooltip?: string;
  shortcut?: ReactNode;
  pressed?: boolean;
  current?: boolean;
  disabled?: boolean;
  danger?: boolean;
  loading?: boolean;
  tooltipOpen?: boolean;
  ref?: Ref<HTMLButtonElement>;
  "data-force"?: "hover" | "focus";
};

export function Button(props: ButtonProps) {
  const { children, variant = "plain", icon, chevron, tooltip, shortcut, pressed, current, disabled, danger, loading,
    tooltipOpen, ref, onClick, className, ...rest } = props;
  const tip = useTooltip({ label: tooltip ?? "", shortcut, open: tooltip ? tooltipOpen : false });
  const merged = useMergeRefs([ref, tip.setReference]);
  const inert = disabled || loading;
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) event.preventDefault();
    else onClick?.(event);
  };
  const toggles = pressed !== undefined || current !== undefined;
  const classes = ["ui-control", "ui-button", `ui-button-${variant}`, chevron ? "ui-button-choice" : "", toggles ? "ui-rail" : "", className ?? ""];
  return (
    <>
      <button
        type="button"
        {...(tooltip ? tip.getReferenceProps({ ...rest, onClick: click }) : { ...rest, onClick: click })}
        ref={merged}
        className={classes.join(" ").replace(/\s+/g, " ").trim()}
        aria-pressed={pressed}
        aria-current={current ? "true" : undefined}
        aria-disabled={disabled ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        data-danger={danger ? "" : undefined}
      >
        {loading ? <Spinner /> : icon ? <Icon>{icon}</Icon> : null}
        <span className="ui-button-text">{children}</span>
        {chevron ? (
          <span className="ui-button-chevron">
            <Icon>
              <ChevronDown />
            </Icon>
          </span>
        ) : null}
      </button>
      {tooltip ? tip.node : null}
    </>
  );
}
