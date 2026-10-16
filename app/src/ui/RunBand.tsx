// The run band (DESIGN.md, Navigation: run band): the collections of an infrastructure as words on a line, joined by
// 16 px wires; the current one with the rail, the compared one with a dotted ink-3 rail and the small word
// "compared"; then a separator and the "Compare with…" choice. It sits in its own bar island. The runs are one tab
// stop: Left and Right (Home, End) move the focus between them (roving tabindex); Enter or a click opens one. The
// band hides when there is nothing to walk (its caller gives it fewer than two runs: it renders nothing).
import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "./Button";
import { Island, Separator } from "./Island";
import { Select } from "./Select";
import type { SelectOption } from "./Select";
import "./RunBand.css";

export type RunBandItem = Readonly<{
  id: string;
  /** The run as a word ("19 Jan"). */
  label: string;
  /** What the run is, said in full ("Collection of 19 Jan 2026, 02:00, completed"). */
  tooltip: string;
  current: boolean;
  compared: boolean;
}>;

export type RunBandCompare = Readonly<{
  /** The choice's accessible name ("Compare with an earlier collection"). */
  label: string;
  /** The words on the trigger ("Compare with…"). */
  triggerLabel: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}>;

export type RunBandProps = {
  /** The measurement name (`data-float`, `data-bar`). */
  name: string;
  /** The band's label, shown first ("Collections"). */
  label: string;
  /** The small word after the compared run ("compared"). */
  comparedLabel: string;
  items: readonly RunBandItem[];
  onOpen: (id: string) => void;
  compare: RunBandCompare;
  className?: string;
};

const STEPS: Readonly<Record<string, (at: number, last: number) => number>> = {
  ArrowLeft: (at) => Math.max(0, at - 1),
  ArrowRight: (at, last) => Math.min(last, at + 1),
  Home: () => 0,
  End: (_at, last) => last,
};

function Run({ item, stop, comparedLabel, onOpen, onFocus }: { item: RunBandItem; stop: boolean; comparedLabel: string; onOpen: () => void; onFocus: () => void }) {
  return (
    <Button
      className={item.compared ? "ui-run ui-run-compared" : "ui-run"}
      current={item.current}
      tooltip={item.tooltip}
      tabIndex={stop ? 0 : -1}
      data-run={item.id}
      onClick={onOpen}
      onFocus={onFocus}
    >
      {item.label}
      {item.compared ? (
        <>
          {" "}
          <small>{comparedLabel}</small>
        </>
      ) : null}
    </Button>
  );
}

export function RunBand({ name, label, comparedLabel, items, onOpen, compare, className }: RunBandProps) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const current = items.find((item) => item.current)?.id ?? "";
  // the current run comes into view when the band scrolls (many collections); again once the font has loaded, which
  // widens every word after the first layout
  useEffect(() => {
    if (!current) return undefined;
    const show = () => group.current?.querySelector<HTMLElement>(`[data-run="${CSS.escape(current)}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
    show();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) show();
    });
    return () => {
      live = false;
    };
  }, [current, items.length]);
  if (items.length < 2) return null;
  const known = focused !== null && items.some((item) => item.id === focused);
  const stop = known ? focused : (items.find((item) => item.current) ?? items[items.length - 1]).id;
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    const at = items.findIndex((item) => item.id === (event.target as HTMLElement).closest("[data-run]")?.getAttribute("data-run"));
    if (!step || at < 0) return;
    event.preventDefault();
    const next = items[step(at, items.length - 1)];
    setFocused(next.id);
    group.current?.querySelector<HTMLElement>(`[data-run="${CSS.escape(next.id)}"]`)?.focus();
  };
  return (
    <Island name={name} layout="bar" className={className}>
      <span className="ui-runs-label" id={labelId}>
        {label}
      </span>
      <div ref={group} className="ui-runs" role="group" aria-labelledby={labelId} onKeyDown={move}>
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <span className="ui-run-wire" aria-hidden="true" /> : null}
            <Run item={item} stop={item.id === stop} comparedLabel={comparedLabel} onOpen={() => onOpen(item.id)} onFocus={() => setFocused(item.id)} />
          </Fragment>
        ))}
      </div>
      <Separator />
      <Select name={`${name}-compare`} {...compare} />
    </Island>
  );
}
