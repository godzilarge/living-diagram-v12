// A state mark (DESIGN.md, Chips and counts): an 8 px square in the state colour, alone (a toast) or before its words,
// which then take the state colour too ("Failed", "6"). Neutral is grey: a fact that is merely present stays quiet.
import type { ReactNode } from "react";
import type { Tone } from "./Count";
import "./Mark.css";

export function Mark({ tone = "neutral", children }: { tone?: Tone; children?: ReactNode }) {
  if (children === undefined || children === null) return <span className="ui-mark" data-tone={tone} aria-hidden="true" />;
  return (
    <span className="ui-state" data-tone={tone}>
      <span className="ui-mark" data-tone={tone} aria-hidden="true" />
      {children}
    </span>
  );
}
