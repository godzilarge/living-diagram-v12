// A feed (DESIGN.md, Feed): who did what, when, as a list one reads. A row is the avatar | the sentence on a 20 px
// line with an optional caption under it | the time on the right and an optional second line under it (the revision);
// 10 px above and below, a hairline between two rows. Tones: neutral, quiet (positions recede), destroy (the verb the
// sentence sets with `FeedVerb` in the error colour). Inline after the sentence: a tally (`FeedTally`, "×8" and its
// span) or a note (`FeedNote`). A row is inert (the home) or unfolds (the Log): its head is then one button
// (`aria-expanded`), the detail under the sentence's column. The feed is one tab stop (the active row: `active`),
// ↑ ↓ Home End move between rows; what a row does with the other keys is its holder's (`onKeyDown` on the feed).
// Days (`FeedDay`) stick their title at the top of the scrolling body; a flat list (`FeedList`) starts flush.
// Hooks: `data-feed-row` and `data-item` on a row's head, `data-day` on a day's title.
import type { HTMLAttributes, KeyboardEvent, ReactNode, Ref } from "react";
import { Avatar } from "./Avatar";
import "./Feed.css";

export type FeedTone = "neutral" | "quiet" | "destroy";

const ROW = "[data-feed-row]";
const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

/** True for the head of a row that unfolds (where the feed's keys act). */
export const isFeedRow = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && element.matches(ROW);

/** The head of the row of `key` inside `root`, if it is drawn. */
export const feedRowOf = (root: HTMLElement | null, key: string): HTMLElement | null =>
  root ? (Array.from(root.querySelectorAll<HTMLElement>(ROW)).find((el) => el.dataset.item === key) ?? null) : null;

/** The rows' keys: ↑ ↓ to the neighbour, Home and End to the ends, the focus only (Enter opens, natively). */
function walk(event: KeyboardEvent<HTMLDivElement>): void {
  const target = event.target as HTMLElement;
  if (!target.matches(ROW) || (!(event.key in STEPS) && event.key !== "Home" && event.key !== "End")) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(`button${ROW}`));
  const at = rows.indexOf(target);
  const to = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + STEPS[event.key]));
  event.preventDefault();
  rows[to]?.focus();
}

export type FeedProps = Omit<HTMLAttributes<HTMLDivElement>, "style" | "title"> & { children: ReactNode; ref?: Ref<HTMLDivElement> };

export function Feed({ children, className, onKeyDown, ref, ...rest }: FeedProps) {
  return (
    <div
      {...rest}
      ref={ref}
      className={["ui-feed", className ?? ""].join(" ").trim()}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented) walk(event);
      }}
    >
      {children}
    </div>
  );
}

/** A day: its title, sticking at the top of the scrolling body, and its rows. */
export function FeedDay({ day, children }: { day: string; children: ReactNode }) {
  return (
    <div className="ui-feed-day">
      <h3 className="ui-feed-day-title" data-day="">
        {day}
      </h3>
      <ul className="ui-feed-list" aria-label={day}>{children}</ul>
    </div>
  );
}

/** Rows without days (the home's widget): the first row flush with the header above. */
export function FeedList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="ui-feed-list" aria-label={label}>
      {children}
    </ul>
  );
}

/** The verb of a sentence: in the error colour when the row removes something. */
export function FeedVerb({ children }: { children: ReactNode }) {
  return <span className="ui-feed-verb">{children}</span>;
}

/** The same gesture repeated, inline after the sentence: "×8" and its span in a chip. */
export function FeedTally({ times, children }: { times: string; children?: ReactNode }) {
  return (
    <span className="ui-feed-tally">
      <span className="ui-feed-times">{times}</span>
      {children ? <span className="ui-feed-span">{children}</span> : null}
    </span>
  );
}

/** A few words inline after the sentence, in caption ink-3 ("312 requests since 08:41"). */
export function FeedNote({ children }: { children: ReactNode }) {
  return <span className="ui-feed-note">{children}</span>;
}

/** A word a search found, at the palette's match weight. */
export function FeedMatch({ children }: { children: ReactNode }) {
  return <mark className="ui-feed-match">{children}</mark>;
}

export type FeedItemProps = {
  /** The author: the avatar's initial (decorative: the sentence says the name). */
  author: string;
  /** The sentence, the author included (at 600: `<b>`). */
  sentence: ReactNode;
  /** Inline after the sentence: a tally or a note. */
  after?: ReactNode;
  /** A line under the sentence (caption, ink-3): the infrastructure, what a search found. */
  caption?: ReactNode;
  /** The time, on the sentence's line. */
  when: ReactNode;
  /** A second line under the time (ink-3): the revision. */
  sub?: ReactNode;
  tone?: FeedTone;
  /** A row that unfolds: its key (`data-item`), its state and what pressing it does. */
  item?: string;
  expanded?: boolean;
  onToggle?: () => void;
  /** The feed's one tab stop. */
  active?: boolean;
  onActive?: () => void;
  /** The row a link points at (the accent-weak fill). */
  target?: boolean;
  /** The id of the detail, which the head controls. */
  detailId?: string;
  /** Said to a screen reader instead of the head's visible text, when the head needs more words. */
  said?: string;
  keys?: string;
  headRef?: Ref<HTMLButtonElement>;
  /** The detail, when unfolded. */
  children?: ReactNode;
};

function Head({ author, sentence, after, caption, when, sub }: Pick<FeedItemProps, "author" | "sentence" | "after" | "caption" | "when" | "sub">) {
  return (
    <>
      <Avatar name={author} />
      <span className="ui-feed-text">
        <span className="ui-feed-sentence">
          {sentence}
          {after ? <span className="ui-visually-hidden"> </span> : null}
          {after}
        </span>
        {caption ? <span className="ui-feed-caption">{caption}</span> : null}
      </span>
      <span className="ui-feed-when">
        {when}
        {sub ? <span className="ui-feed-sub">{sub}</span> : null}
      </span>
    </>
  );
}

export function FeedItem(props: FeedItemProps) {
  const { tone = "neutral", item, expanded, onToggle, active, onActive, target, detailId, said, keys, headRef, children } = props;
  return (
    <li className="ui-feed-item" data-tone={tone} data-open={expanded ? "" : undefined} data-target={target ? "" : undefined}>
      {onToggle ? (
        <button
          ref={headRef}
          type="button"
          className="ui-feed-head"
          data-feed-row=""
          data-item={item}
          aria-expanded={!!expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={said}
          aria-keyshortcuts={keys}
          tabIndex={active ? 0 : -1}
          onClick={onToggle}
          onFocus={onActive}
        >
          <Head {...props} />
        </button>
      ) : (
        <div className="ui-feed-head" data-item={item}>
          <Head {...props} />
        </div>
      )}
      {children ? (
        <div className="ui-feed-detail" id={detailId}>
          {children}
        </div>
      ) : null}
    </li>
  );
}
