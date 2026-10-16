// A widget of the home (DESIGN.md, Islands, panels, widgets, Widget header): an island section with a 56 px header
// (the title at 15 px / 600, an optional count in ink-3 12 px, then on the right an optional segmented filter and the
// icon buttons, the widget's settings last) and a body padded 0 16 12, then an optional foot note (caption, ink-3:
// what the body could not show). Its header is measured as a bar when it holds a control, and anchors the popovers
// of its buttons (they open under the header, aligned on the widget's edge). It grows with the home grid (`flex: 1`)
// and its body scrolls inside, never the page.
import { useId } from "react";
import type { ReactNode, Ref } from "react";
import { Island } from "./Island";
import "./Widget.css";

export type WidgetProps = {
  /** The widget's name for the measurement (`data-float`). */
  name: string;
  heading: string;
  /** A count next to the title (the number of infrastructures): always the total, whatever the filter shows. */
  count?: number;
  /** A segmented filter over the body's list, right of the title, before the actions. */
  filter?: ReactNode;
  /** The icon buttons on the right of the header; the widget's settings come last. */
  action?: ReactNode;
  /** Takes the free height of its column (the home grid). */
  grow?: boolean;
  busy?: boolean;
  /** A sentence under the body: what it could not show. */
  foot?: ReactNode;
  /** The body, which scrolls: the root of what its rows report on screen. */
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
};

export function Widget({ name, heading, count, filter, action, grow, busy, foot, bodyRef, children }: WidgetProps) {
  const id = useId();
  const tools = filter || action;
  return (
    <Island name={name} as="section" className="ui-widget" aria-labelledby={id} aria-busy={busy ? "true" : undefined} data-grow={grow ? "" : undefined}>
      <header className="ui-widget-head" data-bar={tools ? `${name}-head` : undefined} data-anchor="">
        <h2 id={id}>{heading}</h2>
        {count !== undefined ? <span className="ui-widget-count">{count}</span> : null}
        {tools ? (
          <span className="ui-widget-tools">
            {filter}
            {action}
          </span>
        ) : null}
      </header>
      <div className="ui-widget-body" ref={bodyRef}>
        {children}
      </div>
      {foot ? <p className="ui-widget-foot">{foot}</p> : null}
    </Island>
  );
}
