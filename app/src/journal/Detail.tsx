// The detail of a Log row, unfolded under its sentence: the facts of an operation in words (Facts), the verbs of a
// burst with their devices, each gesture of a fold, the devices and the requests of a session; the operations
// received behind "Raw"; then the link to the entry and the history of its objects. A cited object still there is a
// Link to it in the Diagram (a real address: a plain click shows it here and keeps the Log's filters for the way
// back); one that is gone says so. Read only; no network call here.
import { Braces, Check, History, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Button, Facts, FeedMatch, Icon, Link } from "../ui";
import { useText } from "../i18n";
import { entryLink, sessionHosts, timeLabel } from "../state/journal";
import type { JournalEntry, JournalItem } from "../state/journal";
import { detailGroups, factsOf, headline, marks , quotedName } from "../state/journal-text";
import type { Fact, Piece, Ref, RefKind, Sentence } from "../state/journal-text";
import type { HistoryObject, Presence } from "./rows";
import { objectsOf } from "./rows";
import { goneWords } from "./words";

/** What the detail does with a cited object: its address, showing it, the history of an object. */
export type DetailActions = Readonly<{
  presence: Presence;
  hrefOf: (infrastructure: string, kind: RefKind, id: string) => string;
  /** Shows an object of the open infrastructure in the Diagram; false when it cannot (another infrastructure). */
  show: (infrastructure: string, kind: RefKind, id: string) => boolean;
  history: (object: HistoryObject, infrastructure: string) => void;
  /** Copies a text; true when it is done. */
  copy: (text: string) => Promise<boolean>;
}>;

type Context = Readonly<{ entry: JournalEntry; words: readonly string[]; actions: DetailActions }>;

const HOSTS_MAX = 60;
const STEPS_MAX = 200;
const SAID_MS = 4000;

/** The text, the words searched at the match weight. */
export function Marked({ text, words }: { text: string; words: readonly string[] }) {
  if (!words.length) return <>{text}</>;
  return (
    <>
      {marks(text, words).map((part, i) => (part.hit ? <FeedMatch key={i}>{part.text}</FeedMatch> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/** A cited object: a link to it in the Diagram, or its name and what became of it. */
function RefLink({ piece, context }: { piece: Ref; context: Context }) {
  const t = useText();
  const { entry, words, actions } = context;
  if (!actions.presence(entry.infrastructure, piece.ref, piece.id)) {
    return (
      <span className="journal-gone">
        <Marked text={piece.text} words={words} /> <span className="journal-gone-word">{t("journal:ui.goneSaid", { gone: goneWords(t, piece.ref) })}</span>
      </span>
    );
  }
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (actions.show(entry.infrastructure, piece.ref, piece.id)) event.preventDefault();
  };
  return (
    <Link href={actions.hrefOf(entry.infrastructure, piece.ref, piece.id)} onClick={open} aria-label={t("journal:ui.showNamed", { name: piece.text })}>
      <Marked text={piece.text} words={words} />
    </Link>
  );
}

function Phrase({ sentence, context }: { sentence: Sentence; context: Context }) {
  return (
    <>
      {sentence.pieces.map((piece: Piece, i) => (typeof piece === "string" ? <Marked key={i} text={piece} words={context.words} /> : <RefLink key={i} piece={piece} context={context} />))}
    </>
  );
}

function Hosts({ hosts, context }: { hosts: readonly string[]; context: Context }) {
  const t = useText();
  return (
    <ul className="journal-hosts">
      {hosts.slice(0, HOSTS_MAX).map((host) => (
        <li key={host}>
          <RefLink piece={{ ref: "node", id: host, text: host }} context={context} />
        </li>
      ))}
      {hosts.length > HOSTS_MAX ? <li className="journal-more">{t("journal:ui.more", { total: hosts.length - HOSTS_MAX })}</li> : null}
    </ul>
  );
}

function FactList({ facts, context }: { facts: readonly Fact[]; context: Context }) {
  if (!facts.length) return null;
  const items = facts.map((fact) => ({ label: fact.label, value: fact.list ? <Hosts hosts={fact.list} context={context} /> : <Marked text={fact.value} words={context.words} /> }));
  return <Facts items={items} />;
}

function Raw({ entries }: { entries: readonly JournalEntry[] }) {
  const t = useText();
  const ops = entries.flatMap((e) => e.ops);
  const body = entries.length > 1 ? entries.map((e) => ({ at: e.at, revision: e.revision, ops: e.ops })) : ops;
  return (
    <details className="journal-raw">
      <summary>
        <Icon>
          <Braces />
        </Icon>
        {t("journal:ui.raw", { count: ops.length })}
      </summary>
      <pre>{JSON.stringify(body, (_key, value: unknown) => (value === null ? undefined : value), 2)}</pre>
    </details>
  );
}

function Steps({ entries, render, more }: { entries: readonly JournalEntry[]; render: (entry: JournalEntry) => ReactNode; more?: string }) {
  return (
    <ol className="journal-steps">
      {entries.map((e) => (
        <li key={`${e.revision}\u0000${e.at}`}>
          <time dateTime={e.at}>{timeLabel(e.at)}</time>
          <div>{render(e)}</div>
        </li>
      ))}
      {more ? <li className="journal-more">{more}</li> : null}
    </ol>
  );
}

function Session({ entries, context }: { entries: readonly JournalEntry[]; context: Context }) {
  const t = useText();
  const { placed, unpinned } = sessionHosts(entries);
  const last = entries[entries.length - 1];
  const facts: Fact[] = [{ label: t("journal:ui.from"), value: t("journal:ui.span", { from: timeLabel(last.at), to: timeLabel(entries[0].at), count: entries.length }) }];
  if (placed.length) facts.push({ label: t("journal:ui.placed", { count: placed.length }), value: "", list: placed });
  if (unpinned.length) facts.push({ label: t("journal:ui.unpinned", { count: unpinned.length }), value: "", list: unpinned });
  const more = entries.length > STEPS_MAX ? t("journal:ui.moreSteps", { total: entries.length - STEPS_MAX }) : undefined;
  return (
    <>
      <FactList facts={facts} context={context} />
      <Steps entries={entries.slice(0, STEPS_MAX)} more={more} render={(e) => <Phrase sentence={headline(e)} context={{ ...context, entry: e }} />} />
    </>
  );
}

function Burst({ entry, context }: { entry: JournalEntry; context: Context }) {
  const t = useText();
  const groups = detailGroups(entry);
  return (
    <ol className="journal-ops">
      {groups.map((group, i) => (
        <li key={i}>
          <Phrase sentence={group.sentence} context={context} />
          {group.hosts.length ? (
            <>
              {t("journal:fieldsSep")}
              <Hosts hosts={group.hosts} context={context} />
            </>
          ) : null}
        </li>
      ))}
      {entry.ops.length > 50 && groups.length >= 50 ? <li className="journal-more">{t("journal:ui.moreOps")}</li> : null}
    </ol>
  );
}

function Body({ item, context }: { item: JournalItem; context: Context }) {
  if (item.kind === "session") return <Session entries={item.entries} context={context} />;
  if (item.kind === "fold") return <Steps entries={item.entries} render={(e) => <FactList facts={e.ops[0] ? factsOf(e.ops[0], e) : []} context={{ ...context, entry: e }} />} />;
  const entry = item.entry;
  if (entry.ops.length === 1) return <FactList facts={factsOf(entry.ops[0], entry)} context={context} />;
  return <Burst entry={entry} context={context} />;
}

/** The foot of the detail: the link to the entry, the history of its objects, what the copy did. */
function Actions({ entry, actions }: { entry: JournalEntry; actions: DetailActions }) {
  const t = useText();
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!said) return undefined;
    const timer = window.setTimeout(() => setSaid(null), SAID_MS);
    return () => window.clearTimeout(timer);
  }, [said]);
  const link = entryLink(window.location.origin + window.location.pathname, entry);
  const copy = async (): Promise<void> => {
    setSaid(null);
    setSaid((await actions.copy(link)) ? t("journal:ui.copied") : t("journal:ui.copyRefused", { link }));
  };
  const copied = said === t("journal:ui.copied");
  return (
    <div className="journal-actions" role="group" aria-label={t("journal:ui.actions")}>
      <Button variant="line" icon={copied ? <Check /> : <Link2 />} onClick={() => void copy()}>
        {t("journal:ui.copyLink")}
      </Button>
      {objectsOf(entry).map((object) => {
        const name = object.name ? quotedName(object.kind, object.name) : t(object.kind === "group" ? "journal:unnamedRef.group" : object.kind === "connector" ? "journal:unnamedRef.connectorPlain" : "journal:unnamedRef.annotation");
        return (
          <Button key={object.id} icon={<History />} tooltip={t("journal:ui.touched", { name })} onClick={() => actions.history(object, entry.infrastructure)}>
            {t("journal:ui.historyOf", { name })}
          </Button>
        );
      })}
      <span className="journal-said" role="status" aria-live="polite">
        {said ?? ""}
      </span>
    </div>
  );
}

export function Detail({ item, words, actions }: { item: JournalItem; words: readonly string[]; actions: DetailActions }) {
  const entry = item.kind === "entry" ? item.entry : item.entries[0];
  const context: Context = { entry, words, actions };
  return (
    <div className="journal-detail" data-journal-detail="">
      <Body item={item} context={context} />
      <Raw entries={item.kind === "entry" ? [item.entry] : item.entries} />
      <Actions entry={entry} actions={actions} />
    </div>
  );
}
