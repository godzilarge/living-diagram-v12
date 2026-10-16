// The Latest modifications widget: the most recent requests of the modifications log (10 by default, the
// `homeChanges` preference, chosen in the widget's settings), every infrastructure mixed; one line = the author's initial, "author did what", the infrastructure under it, when on the right. Lines of
// the log the server could not read are counted at its foot.
import { History } from "lucide-react";
import { Avatar, IconButton, Widget } from "../ui";
import type { JournalEntry } from "../api/home";
import { useText } from "../i18n";
import { HOME_CHANGES } from "../prefs";
import type { HomeState } from "../state/useHome";
import { Note } from "./Feedback";
import { WidgetSettings } from "./WidgetSettings";
import { byAuthorWords, failedWords, unreadableWords, whenWords } from "./words";

function Line({ entry, now }: { entry: JournalEntry; now: number }) {
  const t = useText();
  const said = byAuthorWords(t, entry);
  return (
    <li className="home-feed-item">
      <Avatar name={entry.author} />
      <div className="home-feed-text">
        <p className="home-feed-what">
          {said.before}
          <b>{said.author}</b>
          {said.after}
        </p>
        <p className="home-feed-where">{entry.infrastructure}</p>
      </div>
      <span className="home-feed-when">{whenWords(t, entry.at, now)}</span>
    </li>
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
    <ul className="home-feed">
      {load.data.entries.map((entry) => (
        <Line key={`${entry.infrastructure}:${entry.revision}`} entry={entry} now={state.now} />
      ))}
    </ul>
  );
}

export type ChangesWidgetProps = { state: HomeState; rows: number; onRows: (rows: number) => void };

export function ChangesWidget({ state, rows, onRows }: ChangesWidgetProps) {
  const t = useText();
  const load = state.journal;
  return (
    <Widget
      name="modifications"
      heading={t("home:changes.title")}
      grow
      busy={state.token === "present" && load.kind === "loading"}
      action={
        <>
          <IconButton label={t("home:changes.openLog")} icon={<History />} disabled disabledReason={t("home:changes.openLogSoon")} />
          <WidgetSettings name="modifications" choices={HOME_CHANGES} value={rows} after={t("home:settings.changes")} onChange={onRows} />
        </>
      }
      foot={state.token === "present" ? unreadableWords(t, load) : undefined}
    >
      <Body state={state} />
    </Widget>
  );
}
