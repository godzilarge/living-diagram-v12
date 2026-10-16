// A segmented choice (DESIGN.md, Inputs): a ground track, the chosen segment on paper with the island shadow, never
// the accent fill. A radio group: arrow keys move the choice. The track is one 32 px control in its bar. A filter over
// a list gives each segment its count (neutral, ink-4 at zero, decorative): the segment is then said by `said`
// ("Failed, 2"), and a segment at zero stays a choice.
import type { KeyboardEvent } from "react";
import { Count } from "./Count";
import "./Segmented.css";

export type SegmentedOption = Readonly<{ value: string; label: string; disabled?: boolean; count?: number; said?: string }>;

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
    const next = enabled[(at + step + enabled.length) % enabled.length];
    onChange(next.value);
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
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            className="ui-segment"
            aria-checked={checked}
            aria-disabled={off ? "true" : undefined}
            aria-label={option.count !== undefined ? option.said : undefined}
            tabIndex={checked ? 0 : -1}
            data-value={option.value}
            onClick={() => (off ? undefined : onChange(option.value))}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ui-segment-count" aria-hidden="true" data-zero={option.count === 0 ? "" : undefined}>
                <Count value={option.count} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
