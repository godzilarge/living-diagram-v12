// The panel (DESIGN.md, Islands and Layout): an island at one of three widths (compact 440, wide 864, focus 1408, which
// rises with the layer shadow over the scrim); a header with the type tile (40 px), the element's name at headline
// size, a 12 px subtitle in ink-3 and the icon buttons on the right, a rule below; a body that scrolls inside with a
// 48 px fade at its bottom edge. It hides when it has nothing to show (the caller unmounts it).
import type { ReactNode } from "react";
import { Island } from "./Island";
import "./Panel.css";

export type PanelWidth = "compact" | "wide" | "focus";

export type PanelProps = {
  name: string;
  /** The element's name (a hostname, a port): data, never a word of the interface. */
  heading: string;
  subheading?: string;
  /** The icon of the element's type, shown in the 40 px tile. */
  tile?: ReactNode;
  /** The header's icon buttons, laid out as a bar. */
  actions?: ReactNode;
  width?: PanelWidth;
  children: ReactNode;
};

export function Panel({ name, heading, subheading, tile, actions, width = "compact", children }: PanelProps) {
  return (
    <Island name={name} as="aside" className="ui-panel" data-width={width} aria-label={heading}>
      <header className="ui-panel-head">
        {tile ? (
          <span className="ui-panel-tile" aria-hidden="true">
            {tile}
          </span>
        ) : null}
        <div className="ui-panel-title">
          <h2>{heading}</h2>
          {subheading ? <p>{subheading}</p> : null}
        </div>
        {actions ? (
          <div className="ui-panel-actions" data-bar={`${name}-actions`}>
            {actions}
          </div>
        ) : null}
      </header>
      <div className="ui-panel-body">{children}</div>
    </Island>
  );
}

/** A section of a panel body: a 15 px heading and its content, a rule below. */
export function PanelSection({ heading, aside, children }: { heading: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-panel-section">
      <h3>
        {heading}
        {aside ? <span className="ui-panel-aside">{aside}</span> : null}
      </h3>
      {children}
    </section>
  );
}
