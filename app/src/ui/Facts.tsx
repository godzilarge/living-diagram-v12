// A list of facts (DESIGN.md, Facts): labels in ink-3 and their values, body size, in one column (the compact
// panel's identity) or two (the wide panel), 6 px between rows; or as a `strip`, the facts side by side under a
// hairline (the focus panel's header band): a 12 px label over its value. A fact's value is text or a node (a Mark
// with its words, a Link); a long value breaks on a second line in the list, is cut in the strip; a fact without a
// value is left out by the caller, never shown as a blank.
import type { ReactNode } from "react";
import "./Facts.css";

export type Fact = Readonly<{ label: string; value: ReactNode }>;

export type FactsProps = {
  /** The list's accessible name ("Identity"); a list under a heading needs none. */
  label?: string;
  items: readonly Fact[];
  columns?: 1 | 2;
  layout?: "list" | "strip";
};

export function Facts({ label, items, columns = 1, layout = "list" }: FactsProps) {
  return (
    <dl className="ui-facts" aria-label={label} data-columns={columns} data-layout={layout}>
      {items.map((fact, index) => (
        <div key={`${index}\u0000${fact.label}`} className="ui-fact">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
