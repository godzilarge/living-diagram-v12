// The Infrastructures widget: every archived infrastructure, the most recent collection first, or in the order of a
// column; a filter over the collection status in the header (the count beside the title stays the total). Its name is
// a link to the diagram on its last collection that gave data (Tab reaches it; Ctrl+click opens a tab), and a click
// anywhere on the row follows the same address. Without a usable token, the token field takes the table's place.
// Archive entries the server could not read are counted at its foot. Sort and filter are transient.
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Icon, Mark, Table, Widget } from "../ui";
import type { Column, Sort } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { filterCounts, filterRows, INFRA_FILTERS, infraRows, sortInfraRows } from "../state/home";
import type { InfraRow, InfraSortKey, StatusFilter as Filter, TableSort } from "../state/home";
import { shortDateTime } from "../state/time";
import type { HomeState } from "../state/useHome";
import { Note } from "./Feedback";
import { StatusFilter } from "./StatusFilter";
import { TokenForm } from "./TokenForm";
import { DASH, failedWords, statusWords, unreadableWords } from "./words";

/** A count of checks: the mark and the number in the state colour; zero in ink-4, decorative. */
function CheckCount({ value, tone }: { value: number; tone: "error" | "warning" }) {
  return <span className="home-check">{value > 0 ? <Mark tone={tone}>{value}</Mark> : <span className="home-zero">{0}</span>}</span>;
}

/** The "to check" cell: what it shows is decorative; a screen reader hears the sentence. */
function Checks({ row }: { row: InfraRow }) {
  const t = useText();
  if (row.errors === null || row.warnings === null)
    return (
      <>
        <span className="home-zero" aria-hidden="true">
          {DASH}
        </span>
        <span className="ui-visually-hidden">{t("home:infrastructures.unread")}</span>
      </>
    );
  const said = t("home:infrastructures.checksSaid", {
    errors: t("home:infrastructures.errors", { count: row.errors }),
    warnings: t("home:infrastructures.warnings", { count: row.warnings }),
  });
  return (
    <span className="home-checks">
      <span className="home-checks-shown" aria-hidden="true">
        <CheckCount value={row.errors} tone="error" />
        <CheckCount value={row.warnings} tone="warning" />
      </span>
      <span className="ui-visually-hidden">{said}</span>
    </span>
  );
}

function columns(t: Translate): Column[] {
  return [
    { key: "name", label: t("home:infrastructures.columns.name"), link: true, cut: true, sortable: true },
    { key: "devices", label: t("home:infrastructures.columns.devices"), align: "end", sortable: true },
    { key: "last", label: t("home:infrastructures.columns.last"), sortable: true },
    { key: "status", label: t("home:infrastructures.columns.status"), sortable: true },
    { key: "check", label: t("home:infrastructures.columns.check"), align: "end", sortable: true },
    { key: "go", label: t("home:infrastructures.columns.open"), hideLabel: true, fit: true },
  ];
}

function rowOf(t: Translate, row: InfraRow, now: number) {
  return {
    id: row.href,
    href: row.href,
    cells: {
      name: <span className="home-name">{row.name}</span>,
      devices: row.devices ?? DASH,
      last: shortDateTime(row.lastStart, t("ui:locale")),
      status: <Mark tone={row.status.tone}>{statusWords(t, row.status, now)}</Mark>,
      check: <Checks row={row} />,
      go: (
        <span className="home-go" data-recent={row.recent ? "" : undefined}>
          <Icon>
            <ChevronRight />
          </Icon>
        </span>
      ),
    },
  };
}

type View = Readonly<{ filter: Filter; sort?: TableSort<InfraSortKey> }>;

function Body({ state, view, onSort, onConnect }: { state: HomeState; view: View; onSort: (sort: Sort) => void; onConnect: (token: string) => void }) {
  const t = useText();
  if (state.token !== "present") return <TokenForm refused={state.token === "refused"} onConnect={onConnect} />;
  const load = state.infrastructures;
  if (load.kind === "loading") return <Note>{t("home:loading")}</Note>;
  if (load.kind === "failed") return <Note>{failedWords(t, load)}</Note>;
  if (load.data.infrastructures.length === 0) return <Note>{t("home:infrastructures.empty")}</Note>;
  const rows = sortInfraRows(filterRows(infraRows(load.data.infrastructures, state.now), view.filter), view.sort);
  if (rows.length === 0) return <Note>{t("home:infrastructures.none")}</Note>;
  return (
    <Table
      label={t("home:infrastructures.title")}
      columns={columns(t)}
      rows={rows.map((row) => rowOf(t, row, state.now))}
      sort={view.sort}
      onSort={onSort}
      density="relaxed"
      head="widget"
      onRowClick={(href) => window.location.assign(href)}
    />
  );
}

export function InfrastructuresWidget({ state, onConnect }: { state: HomeState; onConnect: (token: string) => void }) {
  const t = useText();
  const [view, setView] = useState<View>({ filter: "all" });
  const load = state.infrastructures;
  const ready = state.token === "present" && load.kind === "ok" && load.data.infrastructures.length > 0;
  const rows = ready ? infraRows(load.data.infrastructures, state.now) : [];
  return (
    <Widget
      name="infrastructures"
      heading={t("home:infrastructures.title")}
      count={state.token === "present" && load.kind === "ok" ? load.data.infrastructures.length : undefined}
      busy={state.token === "present" && load.kind === "loading"}
      filter={
        ready ? (
          <StatusFilter
            name="infrastructures-filter"
            label={t("home:filter.byStatus")}
            filters={INFRA_FILTERS}
            counts={filterCounts(rows, INFRA_FILTERS)}
            value={view.filter}
            onChange={(filter) => setView((v) => ({ ...v, filter }))}
          />
        ) : undefined
      }
      foot={state.token === "present" ? unreadableWords(t, load) : undefined}
    >
      <Body state={state} view={view} onSort={(sort) => setView((v) => ({ ...v, sort: sort as TableSort<InfraSortKey> }))} onConnect={onConnect} />
    </Widget>
  );
}
