// A state mark (DESIGN.md, Chips and counts): an 8 px square in the state colour, alone (a toast) or before its words,
// which then take the state colour too ("Failed", "6"). Neutral is grey: a fact that is merely present stays quiet.
// `off` is the hollow mark (a 1.5 px ink-4 outline, no fill): nothing was asked. A mark alone is decorative unless it
// is `said` (a table cell that holds the mark only: its word for assistive technologies).
import type { ReactNode } from "react";
import type { Tone } from "./Count";
import "./Mark.css";

export type MarkTone = Tone | "off";

export function Mark({ tone = "neutral", said, children }: { tone?: MarkTone; said?: string; children?: ReactNode }) {
  if (children === undefined || children === null) {
    return said ? <span className="ui-mark" data-tone={tone} role="img" aria-label={said} /> : <span className="ui-mark" data-tone={tone} aria-hidden="true" />;
  }
  return (
    <span className="ui-state" data-tone={tone}>
      <span className="ui-mark" data-tone={tone} aria-hidden="true" />
      {children}
    </span>
  );
}
