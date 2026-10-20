// The Log's feed (DESIGN.md, Feed): the items by day, one row per entry, the same gesture repeated folded ("×8"), a
// session of positions in one quiet row ("312 requests since 08:41"), a deletion's verb in red. A row's head is one
// button that unfolds its detail; the cited objects are words there (the detail links them; "o" shows the first).
// The feed is one tab stop, ↑ ↓ Home End move between rows (the primitive), Enter unfolds, "o" shows the cited
// object in the Diagram or says why it cannot. Memoised rows: unfolding one does not redraw the others.
import { memo } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Feed, FeedDay, FeedItem, FeedNote, FeedTally, FeedVerb, isFeedRow } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import type { JournalEntry, JournalItem } from "../state/journal";
import { firstEntry, timeLabel } from "../state/journal";
import { auxiliary, firstRef, hiddenHit, visibleMatch } from "../state/journal-text";
import type { Piece, Sentence } from "../state/journal-text";
import { Detail, Marked } from "./Detail";
import type { DetailActions } from "./Detail";
import { goneRef, lineOf, toneOf } from "./rows";
import { authorSlots, authorWords, dayTitle, goneWords, revisionWords, sessionWords, tallyWords } from "./words";

export type FeedDays = readonly Readonly<{ day: string; key: string; items: readonly JournalItem[] }>[];

/** The head's sentence: the verb (its auxiliary included) marked, the cited objects as words (the engine quotes a
 *  named group or annotation). */
function HeadPhrase({ sentence, words }: { sentence: Sentence; words: readonly string[] }) {
  const aux = auxiliary();
  return (
    <>
      {sentence.pieces.map((piece: Piece, i) => {
        const text = typeof piece === "string" ? piece : piece.text;
        if (i === 0 && sentence.verb && typeof piece === "string" && piece.startsWith(aux)) {
          const rest = piece.slice(aux.length);
          const cut = rest.search(/\s|$/);
          return (
            <span key={i}>
              <FeedVerb>
                <Marked text={aux + rest.slice(0, cut)} words={words} />
              </FeedVerb>
              <Marked text={rest.slice(cut)} words={words} />
            </span>
          );
        }
        return <Marked key={i} text={text} words={words} />;
      })}
    </>
  );
}

/** The author and the sentence, in the catalogue's order. */
function Said({ t, entry, sentence, words }: { t: Translate; entry: JournalEntry; sentence: Sentence; words: readonly string[] }) {
  return (
    <>
      {authorSlots(t).map((slot, i) =>
        slot.kind === "author" ? (
          <b key={i}>
            <Marked text={authorWords(t, entry.author)} words={words} />
          </b>
        ) : slot.kind === "phrase" ? (
          <HeadPhrase key={i} sentence={sentence} words={words} />
        ) : (
          <span key={i}>{slot.text}</span>
        ),
      )}
    </>
  );
}

type RowProps = Readonly<{
  item: JournalItem;
  open: boolean;
  active: boolean;
  target: boolean;
  all: boolean;
  words: readonly string[];
  actions: DetailActions;
  onToggle: (key: string) => void;
  onActive: (key: string) => void;
}>;

function after(t: Translate, item: JournalItem, gone: string | null): ReactNode {
  if (item.kind === "fold") {
    const tally = tallyWords(t, item);
    return <FeedTally times={tally.times}>{tally.span}</FeedTally>;
  }
  if (item.kind === "session") return <FeedNote>{sessionWords(t, item)}</FeedNote>;
  return gone ? <FeedNote>{gone}</FeedNote> : null;
}

function RowView({ item, open, active, target, all, words, actions, onToggle, onActive }: RowProps) {
  const t = useText();
  const { entry, sentence } = lineOf(item);
  const gone = goneRef(sentence, entry, actions.presence);
  const why = words.length > 0 && !visibleMatch(sentence, entry.author, words);
  const hit = why ? hiddenHit(entry, words) : null;
  const found = why ? (hit ? t("journal:ui.found", { name: hit }) : t("journal:ui.foundInDetail")) : null;
  const caption =
    all || found ? (
      <>
        {all ? <span className="journal-caption-part">{entry.infrastructure}</span> : null}
        {found ? <span className="journal-caption-part">{found}</span> : null}
      </>
    ) : null;
  const detailId = `journal-detail-${item.key.replace(/[^A-Za-z0-9_-]/g, (c) => `_${c.charCodeAt(0)}`)}`;
  return (
    <FeedItem
      author={entry.author}
      sentence={<Said t={t} entry={entry} sentence={sentence} words={words} />}
      after={after(t, item, gone ? goneWords(t, gone.ref) : null)}
      caption={caption}
      when={<time dateTime={entry.at}>{timeLabel(entry.at)}</time>}
      sub={revisionWords(t, item)}
      tone={toneOf(sentence)}
      item={item.key}
      expanded={open}
      onToggle={() => onToggle(item.key)}
      active={active}
      onActive={() => onActive(item.key)}
      target={target}
      detailId={detailId}
      keys={firstRef(firstEntry(item)) ? "o" : undefined}
    >
      {open ? <Detail item={item} words={words} actions={actions} /> : null}
    </FeedItem>
  );
}

const Row = memo(RowView);

export type JournalFeedProps = Readonly<{
  days: FeedDays;
  now: number;
  open: readonly string[];
  active: string | null;
  target: string | null;
  all: boolean;
  busy: boolean;
  words: readonly string[];
  actions: DetailActions;
  onToggle: (key: string) => void;
  onActive: (key: string) => void;
  /** "o" on a row: the first object its entry cites. */
  onShow: (item: JournalItem) => void;
}>;

export function JournalFeed({ days, now, open, active, target, all, busy, words, actions, onToggle, onActive, onShow }: JournalFeedProps) {
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const el = event.target as HTMLElement;
    if (event.key.toLowerCase() !== "o" || event.ctrlKey || event.metaKey || event.altKey || !isFeedRow(el)) return;
    const item = days.flatMap((day) => day.items).find((candidate) => candidate.key === el.dataset.item);
    if (!item) return;
    event.preventDefault();
    onShow(item);
  };
  return (
    <Feed className="journal-feed" aria-busy={busy ? "true" : "false"} onKeyDown={keys}>
      {days.map((day) => (
        <FeedDay key={day.key} day={dayTitle(firstEntry(day.items[0]).at, now)}>
          {day.items.map((item) => (
            <Row
              key={item.key}
              item={item}
              open={open.includes(item.key)}
              active={item.key === active}
              target={item.key === target}
              all={all}
              words={words}
              actions={actions}
              onToggle={onToggle}
              onActive={onActive}
            />
          ))}
        </FeedDay>
      ))}
    </Feed>
  );
}
