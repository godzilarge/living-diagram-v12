// A source line (DESIGN.md, Chips and counts): the canvas's stroke of a cable as a 16 px marker 8 px before its words,
// from the approved Check mockup's `.src`: solid (confirmed: observed and documented), dotted (documented only),
// dashed (observed only). Decorative like a mark: the words say the sources.
import type { ReactNode } from "react";
import "./SourceLine.css";

export type LineKind = "solid" | "dotted" | "dashed";

export function SourceLine({ kind, children }: { kind: LineKind; children: ReactNode }) {
  return (
    <span className="ui-source">
      <span className="ui-source-line" data-line={kind} aria-hidden="true" />
      {children}
    </span>
  );
}
