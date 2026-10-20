// A segmented choice (DESIGN.md, Inputs): a ground track, the chosen segment on paper with the island shadow, never
// the accent fill. A radio group: arrow keys move the choice. The track is one 32 px control in its bar. A filter over
// a list gives each segment its count (neutral, ink-4 at zero, decorative): the segment is then said by `said`
// ("Failed, 2"), and a segment at zero stays a choice. A segment may open a popover instead of choosing at once (the
// Log's range: two dates, then Apply): the arrows reach it without choosing it, Enter or a click opens it, under the
// island's header (`Popover`); what the popover applies chooses it.
import type { KeyboardEvent, ReactNode } from "react";
import { Count } from "./Count";
import { Popover } from "./Popover";
import "./Segmented.css";

/** What a segment opens: its popover's accessible name, its measurement name and its content. */
export type SegmentPopover = Readonly<{ label: string; name: string; content: (close: () => void) => ReactNode }>;
export type SegmentedOption = Readonly<{ value: string; label: string; disabled?: boolean; count?: number; said?: string; popover?: SegmentPopover }>;

export type SegmentedProps = {
  label: string;
  name: string;
  options: readonly SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function Segmented({ label, name, options, value, onChange, disabled }: SegmentedProps) {
  const enabled = options.filter((option) => !option.disabled && !disabled);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || !enabled.length) return;
    event.preventDefault();
    const at = enabled.findIndex((option) => option.value === value);
    const focused = (event.target as HTMLElement).closest("[data-value]")?.getAttribute("data-value") ?? value;
    const from = enabled.findIndex((option) => option.value === focused);
    const next = enabled[((from < 0 ? at : from) + step + enabled.length) % enabled.length];
    if (!next.popover) onChange(next.value);
    event.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  };
  return (
    <div
      className="ui-segmented"
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled ? "true" : undefined}
      data-control=""
      data-bar={name}
      onKeyDown={move}
    >
      {options.map((option) => {
        const off = disabled || option.disabled;
        const checked = option.value === value;
        const face = (
          <>
            {option.label}
            {option.count !== undefined ? (
              <span className="ui-segment-count" aria-hidden="true" data-zero={option.count === 0 ? "" : undefined}>
                <Count value={option.count} />
              </span>
            ) : null}
          </>
        );
        // a segment that opens a popover is a button (ARIA admits `aria-expanded` on a button, not on a radio), pressed
        // when the value it applies is the chosen one
        const common = {
          ...(option.popover ? { role: "button", "aria-pressed": checked } : { role: "radio", "aria-checked": checked }),
          className: "ui-segment",
          "aria-disabled": off ? ("true" as const) : undefined,
          "aria-label": option.count !== undefined ? option.said : undefined,
          tabIndex: checked ? 0 : -1,
          "data-value": option.value,
        };
        if (option.popover && !off) {
          const { popover } = option;
          return (
            <Popover key={option.value} label={popover.label} name={popover.name} trigger={(props) => <button type="button" {...props} {...common}>{face}</button>}>
              {(close) => popover.content(close)}
            </Popover>
          );
        }
        return (
          <button key={option.value} type="button" {...common} onClick={() => (off ? undefined : onChange(option.value))}>
            {face}
          </button>
        );
      })}
    </div>
  );
}
