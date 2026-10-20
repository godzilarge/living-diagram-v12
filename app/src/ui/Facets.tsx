// Facets (DESIGN.md, Facets): what narrows a list one reads, as sections of 32 px rows. A section's title is a label in
// ink-3 on a 28 px row, with a "clear" word on its right when something in it is on. An exclusive section is a
// `radiogroup` (one tab stop; the arrows move to the neighbour and choose it; the chosen row carries the 2 px accent
// rail on its left edge); a cumulative section is a list of toggles (`aria-pressed`) with the Checklist's 16 px slot
// and its accent check. A row: an optional icon or avatar, the word, an optional note, the count in the 40 px slot
// (ink-4 at zero), decorative: the row's accessible name (`said`) says it. Every row carries `data-facet="group:value"`.
import { Check } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import "./control.css";
import "./Facets.css";

export type FacetOption = Readonly<{
  value: string;
  label: string;
  /** The count of the value; null while nothing was read (the slot stays, empty). */
  count: number | null;
  /** The row's accessible name, the count included ("demo-dc, open, 236"). */
  said: string;
  icon?: ReactNode;
  /** An author: the avatar of the name before the word. */
  avatar?: string;
  /** A few words after the label, in ink-3 ("open"). */
  note?: string;
}>;

export type FacetGroup = Readonly<{
  id: string;
  title: string;
  options: readonly FacetOption[];
  /** The "clear" word of the title, when something is on: its words, its accessible name and its action. */
  clear?: Readonly<{ label: string; said: string; onClear: () => void }> | null;
  /** What the section says when it has no value at all. */
  empty?: string;
}> &
  (
    | Readonly<{ kind: "exclusive"; value: string; onChange: (value: string) => void }>
    | Readonly<{ kind: "cumulative"; value: readonly string[]; onToggle: (value: string) => void }>
  );

export type FacetsProps = {
  /** The list's accessible name ("Log filters"). */
  label: string;
  groups: readonly FacetGroup[];
};

const STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** An exclusive section at the keyboard: the arrows move to the neighbour and choose it, Home and End to the ends. */
function radioKeys(event: KeyboardEvent<HTMLElement>, options: readonly FacetOption[], onChange: (value: string) => void): void {
  if (!(event.key in STEP) && event.key !== "Home" && event.key !== "End") return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='radio']"));
  const at = radios.indexOf(event.target as HTMLElement);
  if (at < 0 || !radios.length) return;
  event.preventDefault();
  const to = event.key === "Home" ? 0 : event.key === "End" ? radios.length - 1 : (at + STEP[event.key] + radios.length) % radios.length;
  radios[to].focus();
  onChange(options[to].value);
}

function Row({ group, option, on }: { group: FacetGroup; option: FacetOption; on: boolean }) {
  const exclusive = group.kind === "exclusive";
  const press = (): void => (group.kind === "exclusive" ? group.onChange(option.value) : group.onToggle(option.value));
  return (
    <li role={exclusive ? "none" : undefined}>
      <button
        type="button"
        className="ui-facet"
        role={exclusive ? "radio" : undefined}
        aria-checked={exclusive ? on : undefined}
        aria-pressed={exclusive ? undefined : on}
        aria-label={option.said}
        tabIndex={exclusive ? (on ? 0 : -1) : undefined}
        data-facet={`${group.id}:${option.value}`}
        onClick={press}
      >
        {exclusive ? null : (
          <span className="ui-facet-slot" aria-hidden="true">
            {on ? (
              <Icon>
                <Check />
              </Icon>
            ) : null}
          </span>
        )}
        {option.avatar !== undefined ? <Avatar name={option.avatar} /> : option.icon ? <span className="ui-facet-icon"><Icon>{option.icon}</Icon></span> : null}
        <span className="ui-facet-label">{option.label}</span>
        {option.note ? <span className="ui-facet-note">{option.note}</span> : null}
        <span className="ui-facet-count" aria-hidden="true" data-zero={option.count === 0 ? "" : undefined}>
          {option.count ?? ""}
        </span>
      </button>
    </li>
  );
}

function Section({ group }: { group: FacetGroup }) {
  const on = (value: string): boolean => (group.kind === "exclusive" ? group.value === value : group.value.includes(value));
  return (
    <div className="ui-facets-section" role="group" aria-label={group.title} data-facets={group.id}>
      <div className="ui-facets-head">
        <h3>{group.title}</h3>
        {group.clear ? (
          <button type="button" className="ui-facets-clear" aria-label={group.clear.said} onClick={group.clear.onClear}>
            {group.clear.label}
          </button>
        ) : null}
      </div>
      {group.options.length ? (
        <ul
          className="ui-facets-list"
          role={group.kind === "exclusive" ? "radiogroup" : undefined}
          aria-label={group.kind === "exclusive" ? group.title : undefined}
          onKeyDown={group.kind === "exclusive" ? (event) => radioKeys(event, group.options, group.onChange) : undefined}
        >
          {group.options.map((option) => (
            <Row key={option.value} group={group} option={option} on={on(option.value)} />
          ))}
        </ul>
      ) : group.empty ? (
        <p className="ui-facets-empty">{group.empty}</p>
      ) : null}
    </div>
  );
}

export function Facets({ label, groups }: FacetsProps) {
  return (
    <div className="ui-facets" role="group" aria-label={label}>
      {groups.map((group) => (
        <Section key={group.id} group={group} />
      ))}
    </div>
  );
}
