// A checklist (DESIGN.md, Checklist): what is shown or kept, as a column of 32 px rows, each a word with a 16 px slot
// before it: a check mark in the accent when the item is on, nothing when it is off (the word then in ink-3). Never
// a rail (an item is on or off, not "current"), never a pill. Each row is a checkbox the keyboard reaches (Tab,
// Space); the list is a named group. The columns of the focus panel; later what an export shows or hides.
import { Check } from "lucide-react";
import { Icon } from "./Icon";
import "./control.css";
import "./Checklist.css";

export type ChecklistItem = Readonly<{ id: string; label: string; checked: boolean; disabled?: boolean }>;

export type ChecklistProps = {
  /** The group's accessible name ("Columns"). */
  label: string;
  name: string;
  items: readonly ChecklistItem[];
  onToggle: (id: string, checked: boolean) => void;
};

export function Checklist({ label, name, items, onToggle }: ChecklistProps) {
  return (
    <div className="ui-checklist" role="group" aria-label={label} data-bar={name}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="checkbox"
          className="ui-control ui-check"
          aria-checked={item.checked}
          aria-disabled={item.disabled ? "true" : undefined}
          data-value={item.id}
          onClick={() => (item.disabled ? undefined : onToggle(item.id, !item.checked))}
        >
          <span className="ui-check-slot">
            {item.checked ? (
              <Icon>
                <Check />
              </Icon>
            ) : null}
          </span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
