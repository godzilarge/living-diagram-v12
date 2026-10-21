// A check code (DESIGN.md, Chips and counts, Code): the identifier of a check as B1 writes it, in a 20 px chip with a
// line-2 border, label size in ink-3, tabular figures; never translated, never cut. Reserved to the Check view: the
// Diagram view says its checks in words only (the Alerts rule).
import "./Code.css";

export function Code({ children }: { children: string }) {
  return <span className="ui-code">{children}</span>;
}
