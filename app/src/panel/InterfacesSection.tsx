// The interfaces of a device (design/comps/shell/index.html, `.s-ports`): the scope (cabled ports, every port: rail
// buttons with their counts), the text filter, in focus the column chooser; a line that says which columns the
// next width adds; the sortable table at the width's columns (32 px rows; 44 px two-line rows in focus). Scope,
// filter, sort and hidden columns are transient: the page keeps them while the panel is open.
import { Columns3, ListFilter } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { Button, Checklist, Count, Field, IconButton, Popover, Table } from "../ui";
import type { Column, Sort } from "../ui";
import { useText } from "../i18n";
import { COLUMNS, columnsFor, countCabled, filterRows, hiddenColumns, sortRows } from "../state/panel";
import type { ColumnKey, InterfaceRow, Scope, Width } from "../state/panel";
import { cellOf } from "./cells";
import { MoreLine } from "./MoreLine";
import { columnWords, shownWords } from "./words";

export type TableState = Readonly<{ scope: Scope; query: string; sort: Sort | null; hidden: ReadonlySet<ColumnKey> }>;
export const INITIAL_TABLE: TableState = Object.freeze({ scope: "cabled", query: "", sort: null, hidden: new Set<ColumnKey>() });

export type InterfacesSectionProps = {
  rows: readonly InterfaceRow[];
  width: Width;
  table: TableState;
  onTable: (next: TableState) => void;
  /** The address of a device, for the neighbour links. */
  href: (hostname: string) => string;
};

/** The chooser of the focus columns: a checklist, one item per column but the port, the shown ones checked. */
function ColumnChooser({ hidden, onHidden }: { hidden: ReadonlySet<ColumnKey>; onHidden: (next: ReadonlySet<ColumnKey>) => void }) {
  const t = useText();
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(hidden);
    if (checked) next.delete(key as ColumnKey);
    else next.add(key as ColumnKey);
    onHidden(next);
  };
  return (
    <Popover
      name="panel-columns"
      label={t("panel:interfaces.columns")}
      trigger={(props) => <IconButton {...props} label={t("panel:interfaces.columns")} icon={<Columns3 />} variant="line" tooltipPlacement="bottom-end" />}
    >
      <Checklist
        name="panel-columns"
        label={t("panel:interfaces.columnsShown")}
        items={COLUMNS.filter((key) => key !== "port").map((key) => ({ id: key, label: columnWords(t, key, "focus"), checked: !hidden.has(key) }))}
        onToggle={toggle}
      />
    </Popover>
  );
}

export function InterfacesSection({ rows, width, table, onTable, href }: InterfacesSectionProps) {
  const t = useText();
  const cabled = countCabled(rows);
  const shown = useMemo(() => sortRows(filterRows(rows, table.scope, table.query, (row) => shownWords(t, row)), table.sort), [rows, table, t]);
  const keys = columnsFor(width, table.hidden);
  const columns: Column[] = keys.map((key) => ({ key, label: columnWords(t, key, width), sortable: true }));
  const context = { t, width, href };
  const tableRows = shown.map((row) => ({ id: row.id, cells: Object.fromEntries(keys.map((key) => [key, cellOf(key, row, context)])) as Record<string, ReactNode> }));
  const set = (patch: Partial<TableState>) => onTable({ ...table, ...patch });
  if (!rows.length) return <p className="panel-note">{t("panel:interfaces.none")}</p>;
  return (
    <div className="panel-ports" data-width={width}>
      {/* `data-anchor`: the column chooser's popover opens under this bar, aligned on its end, not under the whole panel */}
      <div className="panel-ports-bar" data-bar="panel-ports" data-anchor="">
        <div className="panel-scope" role="group" aria-label={t("panel:interfaces.scope")}>
          <Button pressed={table.scope === "cabled"} onClick={() => set({ scope: "cabled" })}>
            {t("panel:interfaces.cabled")} <Count value={cabled} />
          </Button>
          <Button pressed={table.scope === "all"} onClick={() => set({ scope: "all" })}>
            {t("panel:interfaces.all")} <Count value={rows.length} />
          </Button>
        </div>
        <Field
          label={t("panel:interfaces.filterLabel")}
          placeholder={t("panel:interfaces.filter")}
          icon={<ListFilter />}
          value={table.query}
          onChange={(event) => set({ query: event.target.value })}
          className="panel-filter"
        />
        {width === "focus" ? <ColumnChooser hidden={table.hidden} onHidden={(hidden) => set({ hidden })} /> : null}
      </div>
      {width !== "focus" ? <MoreLine width={width} hidden={hiddenColumns(width)} /> : null}
      {shown.length ? (
        <div className="panel-ports-scroll">
          <Table
            label={t("panel:interfaces.title")}
            columns={columns}
            rows={tableRows}
            sort={table.sort ?? undefined}
            onSort={(sort) => set({ sort })}
            density={width === "focus" ? "regular" : "compact"}
            wrap={width === "focus"}
          />
        </div>
      ) : (
        <p className="panel-note">{t("panel:interfaces.noMatch")}</p>
      )}
    </div>
  );
}
