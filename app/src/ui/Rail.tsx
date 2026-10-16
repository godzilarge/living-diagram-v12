// The tab strip (DESIGN.md, Navigation): body-size words at 500, ink-2; the current one in ink at 600 with the 2 px
// accent rail; a count in
// its state colour; a tab that is not ready yet is disabled and says why in its tooltip. Arrow keys move between tabs.
import type { KeyboardEvent } from "react";
import { Count } from "./Count";
import type { Tone } from "./Count";
import { useTooltip } from "./Tooltip";
import "./control.css";
import "./Rail.css";

export type RailItem = Readonly<{
  id: string;
  label: string;
  count?: number;
  countTone?: Tone;
  countLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
}>;

export type RailProps = {
  /** The strip's accessible name (`View`). */
  label: string;
  /** The measurement name (`data-bar`). */
  name: string;
  items: readonly RailItem[];
  value: string;
  onChange: (id: string) => void;
  /** Forces the tooltip of a disabled tab open (the primitives page). */
  tooltipOpen?: boolean;
};

function Tab({ item, selected, onSelect, tooltipOpen }: { item: RailItem; selected: boolean; onSelect: () => void; tooltipOpen?: boolean }) {
  const tip = useTooltip({ label: item.disabledReason ?? item.label, open: item.disabled && item.disabledReason ? tooltipOpen : false });
  return (
    <>
      <button
        type="button"
        role="tab"
        {...tip.getReferenceProps({ onClick: () => (item.disabled ? undefined : onSelect()) })}
        ref={tip.setReference}
        className="ui-control ui-rail ui-tab"
        aria-selected={selected}
        aria-disabled={item.disabled ? "true" : undefined}
        tabIndex={selected ? 0 : -1}
        data-tab={item.id}
      >
        {item.label}
        {item.count !== undefined ? <Count value={item.count} tone={item.countTone} label={item.countLabel} /> : null}
      </button>
      {item.disabled && item.disabledReason ? tip.node : null}
    </>
  );
}

export function Rail({ label, name, items, value, onChange, tooltipOpen }: RailProps) {
  const enabled = items.filter((item) => !item.disabled);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step || !enabled.length) return;
    event.preventDefault();
    const at = enabled.findIndex((item) => item.id === value);
    const next = enabled[(at + step + enabled.length) % enabled.length];
    onChange(next.id);
    event.currentTarget.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.id)}"]`)?.focus();
  };
  return (
    <div className="ui-tabs" role="tablist" aria-label={label} data-bar={name} onKeyDown={move}>
      {items.map((item) => (
        <Tab key={item.id} item={item} selected={item.id === value} onSelect={() => onChange(item.id)} tooltipOpen={tooltipOpen} />
      ))}
    </div>
  );
}
