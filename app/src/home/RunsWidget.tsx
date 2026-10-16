// The Latest collections widget: the most recent collections of every infrastructure (6 by default, the `homeRuns`
// preference, chosen in the widget's settings), their result (how many did not answer when it was partial), who
// answered out of the scope, and what changed since the collection before (a dash when there is none, an ellipsis
// while its diff is read, "unavailable" when it cannot be). A diff is read only for a row on screen in the body.
// A filter over the result in the header; sort and filter are transient.
import { useState } from "react";
import { Mark, Table, Widget } from "../ui";
import type { Column, Sort } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { HOME_RUNS } from "../prefs";
import { comparedOf, filterCounts, filterRows, latestRuns, RUN_FILTERS, sortRunRows } from "../state/home";
import type { RunRow, RunSortKey, StatusFilter as Filter, TableSort } from "../state/home";
import { shortDateTime } from "../state/time";
import type { HomeState, SeeRows } from "../state/useHome";
import { Note } from "./Feedback";
import { StatusFilter } from "./StatusFilter";
import { useVisibleRows } from "./useVisibleRows";
import { WidgetSettings } from "./WidgetSettings";
import { comparedWords, failedWords, runDevicesWords, statusWords } from "./words";

function columns(t: Translate): Column[] {
  return [
    { key: "date", label: t("home:runs.columns.date"), sortable: true },
    { key: "infrastructure", label: t("home:runs.columns.infrastructure"), cut: true, sortable: true },
    { key: "result", label: t("home:runs.columns.result"), sortable: true },
    { key: "devices", label: t("home:runs.columns.devices"), sortable: true },
    { key: "compared", label: t("home:runs.columns.compared") },
  ];
}

/** The "compared" cell: ink-2 for what is known, ink-3 when the diff is unavailable, busy while it is read. */
function Compared({ run, state }: { run: RunRow; state: HomeState }) {
  const t = useText();
  const compared = comparedOf(run, state.diffs);
  return (
    <span className={compared.kind === "failed" ? "home-muted" : "home-quiet"} aria-busy={compared.kind === "pending" ? "true" : undefined}>
      {comparedWords(t, compared, state.now)}
    </span>
  );
}

function rowOf(t: Translate, run: RunRow, state: HomeState) {
  return {
    id: run.key,
    cells: {
      date: <span className="home-quiet">{shortDateTime(run.run_start, t("ui:locale"))}</span>,
      infrastructure: <span className="home-strong">{run.infrastructure}</span>,
      result: <Mark tone={run.status.tone}>{statusWords(t, run.status, state.now)}</Mark>,
      devices: <span className="home-quiet">{runDevicesWords(t, run)}</span>,
      compared: <Compared run={run} state={state} />,
    },
  };
}

type View = Readonly<{ filter: Filter; sort?: TableSort<RunSortKey> }>;

function Body({ state, runs, view, onSort }: { state: HomeState; runs: readonly RunRow[]; view: View; onSort: (sort: Sort) => void }) {
  const t = useText();
  if (state.token !== "present") return <Note>{t("home:token.waiting")}</Note>;
  const load = state.infrastructures;
  if (load.kind === "loading") return <Note>{t("home:loading")}</Note>;
  if (load.kind === "failed") return <Note>{failedWords(t, load)}</Note>;
  if (runs.length === 0) return <Note>{t("home:runs.empty")}</Note>;
  const shown = sortRunRows(filterRows(runs, view.filter), view.sort);
  if (shown.length === 0) return <Note>{t("home:runs.none")}</Note>;
  return (
    <Table
      label={t("home:runs.title")}
      columns={columns(t)}
      rows={shown.map((run) => rowOf(t, run, state))}
      sort={view.sort}
      onSort={onSort}
      density="snug"
      head="widget"
    />
  );
}

export type RunsWidgetProps = { state: HomeState; rows: number; onRows: (rows: number) => void; onSee: SeeRows };

export function RunsWidget({ state, rows, onRows, onSee }: RunsWidgetProps) {
  const t = useText();
  const [view, setView] = useState<View>({ filter: "all" });
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const load = state.infrastructures;
  const ready = state.token === "present" && load.kind === "ok";
  const runs = ready ? latestRuns(load.data.infrastructures, rows) : [];
  const shownKeys = sortRunRows(filterRows(runs, view.filter), view.sort).map((run) => run.key);
  useVisibleRows(body, shownKeys, onSee);
  return (
    <Widget
      name="collections"
      heading={t("home:runs.title")}
      grow
      busy={state.token === "present" && load.kind === "loading"}
      bodyRef={setBody}
      filter={
        runs.length > 0 ? (
          <StatusFilter
            name="collections-filter"
            label={t("home:filter.byResult")}
            filters={RUN_FILTERS}
            counts={filterCounts(runs, RUN_FILTERS)}
            value={view.filter}
            onChange={(filter) => setView((v) => ({ ...v, filter }))}
          />
        ) : undefined
      }
      action={<WidgetSettings name="collections" choices={HOME_RUNS} value={rows} after={t("home:settings.runs")} onChange={onRows} />}
    >
      <Body state={state} runs={runs} view={view} onSort={(sort) => setView((v) => ({ ...v, sort: sort as TableSort<RunSortKey> }))} />
    </Widget>
  );
}
