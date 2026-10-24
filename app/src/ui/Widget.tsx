// A widget of the home (DESIGN.md, Islands, panels, widgets, Widget header): an island section with a 56 px header
// (the title at 15 px / 600, an optional count in ink-3 12 px, then on the right an optional segmented filter and the
// icon buttons, the widget's settings last) and a body padded 0 16 12, then an optional foot note (caption, ink-3:
// what the body could not show). Its header is measured as a bar when it holds a control, and anchors the popovers
// of its buttons (they open under the header, aligned on the widget's edge). It grows with the home grid (`flex: 1`)
// and its body scrolls inside, never the page. Check's widgets add three things: a row of toggles right after the
// count (`toggles`, the severity toggles), a caption in place of the count (`count` as words: Livraison's day) and a
// band between the header and the body that does not scroll (`band`, the coverage's strip of facts). While more of the
// body lies below, its last 32 px fade out (`data-more`, the approved Check mockup's `.w-body`). On Check's tiles, the
// header is the handle that moves the widget (`handle`, DESIGN.md, Widget handle) and its last button enlarges it
// (`enlarge`: "Enlarge" or "Reduce", an action whose words change, never `aria-pressed`; DESIGN.md, Enlarge).
import { useMergeRefs } from "@floating-ui/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { IconButton } from "./IconButton";
import { Island } from "./Island";
import "./Widget.css";

export type WidgetProps = {
  /** The widget's name for the measurement (`data-float`). */
  name: string;
  heading: string;
  /** A count next to the title (the number of infrastructures): always the total, whatever the filter shows; or a
   *  short caption in its place (a day). */
  count?: number | string;
  /** Independent toggles right after the count, on the left (Check's severities); measured as their own bar. */
  toggles?: ReactNode;
  /** Between the header and the body, under its own hairline, not scrolled (a strip of facts). */
  band?: ReactNode;
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
  /** The header moves the widget (a tile of Check's grid). */
  handle?: boolean;
  /** The last button of the header: enlarge the widget over the space, or reduce it (`on`). */
  enlarge?: WidgetEnlarge;
  children: ReactNode;
};

export type WidgetEnlarge = Readonly<{ on: boolean; label: string; shortcut?: string; onToggle: () => void }>;

/** True while the body holds more below what it shows: read at every render (a row opened), on scroll and resize. */
function useMore(body: { current: HTMLDivElement | null }): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = body.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  });
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [body]);
  return more;
}

export function Widget({ name, heading, count, toggles, band, filter, action, grow, busy, foot, bodyRef, handle, enlarge, children }: WidgetProps) {
  const id = useId();
  const tools = filter || action || enlarge;
  const body = useRef<HTMLDivElement | null>(null);
  const ref = useMergeRefs([bodyRef, body]);
  const more = useMore(body);
  return (
    <Island name={name} as="section" className="ui-widget" aria-labelledby={id} aria-busy={busy ? "true" : undefined} data-grow={grow ? "" : undefined} data-enlarged={enlarge?.on ? "" : undefined}>
      <header className="ui-widget-head" data-bar={tools ? `${name}-head` : undefined} data-anchor="" data-handle={handle ? "" : undefined}>
        <h2 id={id}>{heading}</h2>
        {count !== undefined ? <span className="ui-widget-count">{count}</span> : null}
        {toggles}
        {tools ? (
          <span className="ui-widget-tools">
            {filter}
            {action}
            {enlarge ? (
              <IconButton
                label={enlarge.label}
                icon={enlarge.on ? <Minimize2 /> : <Maximize2 />}
                shortcut={enlarge.shortcut}
                tooltipPlacement="bottom-end"
                onClick={enlarge.onToggle}
              />
            ) : null}
          </span>
        ) : null}
      </header>
      {band}
      <div className="ui-widget-body" ref={ref} data-more={more ? "" : undefined}>
        {children}
      </div>
      {foot ? <p className="ui-widget-foot">{foot}</p> : null}
    </Island>
  );
}

/** The toggles of a widget's header (DESIGN.md, Widget toggles): a named group, measured as its own bar. */
export function WidgetToggles({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div className="ui-widget-toggles" role="group" aria-label={label} data-bar={name}>
      {children}
    </div>
  );
}
