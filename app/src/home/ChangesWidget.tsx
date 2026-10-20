// The Latest modifications widget: the most recent requests of the modifications log (10 by default, the
// `homeChanges` preference, chosen in the widget's settings), every infrastructure mixed, as a Feed (DESIGN.md, Feed:
// the Log's grammar, inert here): the author's initial, "author did what", the infrastructure under it, when on the
// right. Lines of the log the server could not read are counted at its foot. Its header's link opens the Log of
// every infrastructure, on the page of the most recent entry's.
import { History } from "lucide-react";
import { Feed, FeedItem, FeedList, IconButton, IconLink, Widget } from "../ui";
import type { JournalEntry } from "../api/home";
import { useText } from "../i18n";
import { HOME_CHANGES } from "../prefs";
import { logHref } from "../state/home";
import type { HomeState } from "../state/useHome";
import { Note } from "./Feedback";
import { WidgetSettings } from "./WidgetSettings";
import { byAuthorWords, failedWords, unreadableWords, whenWords } from "./words";
import { toneOf } from "../journal/rows";
import { headline } from "../state/journal-text";

function Line({ entry, now }: { entry: JournalEntry; now: number }) {
  const t = useText();
  const said = byAuthorWords(t, entry);
  return (
    <FeedItem
      author={entry.author}
      sentence={
        <>
          {said.before}
          <b>{said.author}</b>
          {said.after}
        </>
      }
      caption={entry.infrastructure}
      when={whenWords(t, entry.at, now)}
      tone={toneOf(headline(entry))}
    />
  );
}

function Body({ state }: { state: HomeState }) {
  const t = useText();
  if (state.token !== "present") return <Note>{t("home:token.waiting")}</Note>;
  const load = state.journal;
  if (load.kind === "loading") return <Note>{t("home:loading")}</Note>;
  if (load.kind === "failed") return <Note>{failedWords(t, load)}</Note>;
  if (load.data.entries.length === 0) return <Note>{t("home:changes.empty")}</Note>;
  return (
    <Feed>
      <FeedList>
        {load.data.entries.map((entry) => (
          <Line key={`${entry.infrastructure}:${entry.revision}`} entry={entry} now={state.now} />
        ))}
      </FeedList>
    </Feed>
  );
}

export type ChangesWidgetProps = { state: HomeState; rows: number; onRows: (rows: number) => void };

export function ChangesWidget({ state, rows, onRows }: ChangesWidgetProps) {
  const t = useText();
  const load = state.journal;
  const latest = load.kind === "ok" ? load.data.entries[0] : undefined;
  return (
    <Widget
      name="modifications"
      heading={t("home:changes.title")}
      grow
      busy={state.token === "present" && load.kind === "loading"}
      action={
        <>
          {latest ? (
            <IconLink href={logHref(latest.infrastructure, import.meta.env.BASE_URL)} label={t("home:changes.openLog")} icon={<History />} />
          ) : (
            <IconButton label={t("home:changes.openLog")} icon={<History />} disabled disabledReason={t("home:changes.nothingToOpen")} />
          )}
          <WidgetSettings name="modifications" choices={HOME_CHANGES} value={rows} after={t("home:settings.changes")} onChange={onRows} />
        </>
      }
      foot={state.token === "present" ? unreadableWords(t, load) : undefined}
    >
      <Body state={state} />
    </Widget>
  );
}
