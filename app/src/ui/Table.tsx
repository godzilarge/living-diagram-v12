// A table (DESIGN.md, Layout): body text, a label-size head in ink-3 with sortable headers (`aria-sort`), 44 px rows
// (32 in a compact panel; 40 `snug` and 56 `relaxed` on the home widgets) with a hairline rule; the head is 28 px, 32
// in a widget (`head="widget"`), and sticks when the table scrolls inside its surface. A clickable row takes the hover
// fill (ground) and the pointer; the current row is on accent-weak. A row without an address takes the focus (Tab) and
// answers Enter and Space; a row with one (`href`) shows it as a quiet Link in its `link` column, which Tab reaches,
// and a click elsewhere on the row follows the same address through `onRowClick`. A `cut` column takes a quarter of
// the table and cuts its text with an ellipsis. Each row carries its id (`data-row`), for what reports the rows on
// screen; each cell its column's key (`data-key`), for a surface that sizes its columns; a `center` column (a mark
// alone under a short header) pads its head and cells 2 px on both sides, so neighbouring headers never touch. Cells are text or nodes:
// never HTML from data. `wrap` lets the cells of a table break on two lines (the focus panel) instead of cutting.
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import { Link } from "./Link";
import "./Table.css";

export type SortDirection = "ascending" | "descending";
/** `fit`: as narrow as its content (a chevron); `hideLabel`: the label is said, not shown; `link`: the cell is the
 *  row's address; `cut`: a quarter of the table, the text cut with an ellipsis (a name of any length). */
export type Column = Readonly<{
  key: string;
  label: string;
  align?: "start" | "end" | "center";
  sortable?: boolean;
  fit?: boolean;
  hideLabel?: boolean;
  link?: boolean;
  cut?: boolean;
}>;
export type Density = "compact" | "snug" | "regular" | "relaxed";
export type Row = Readonly<{ id: string; cells: Readonly<Record<string, ReactNode>>; current?: boolean; href?: string }>;
export type Sort = Readonly<{ key: string; direction: SortDirection }>;

export type TableProps = {
  label: string;
  columns: readonly Column[];
  rows: readonly Row[];
  sort?: Sort;
  onSort?: (sort: Sort) => void;
  density?: Density;
  /** `widget`: the 32 px head of a home widget. */
  head?: "regular" | "widget";
  onRowClick?: (id: string) => void;
  /** The cells may break on a second line (the focus panel's 44 px rows). */
  wrap?: boolean;
};

function SortIcon({ state }: { state: SortDirection | null }) {
  return (
    <span className="ui-sort" data-on={state ? "" : undefined}>
      <Icon>{state === "ascending" ? <ArrowUp /> : state === "descending" ? <ArrowDown /> : <ChevronsUpDown />}</Icon>
    </span>
  );
}

function Head({ column, sort, onSort }: { column: Column; sort?: Sort; onSort?: (sort: Sort) => void }) {
  const state = sort?.key === column.key ? sort.direction : null;
  const next: SortDirection = state === "ascending" ? "descending" : "ascending";
  return (
    <th scope="col" aria-sort={column.sortable ? (state ?? "none") : undefined} {...cellData(column)}>
      {column.sortable && onSort ? (
        <button type="button" className="ui-th" onClick={() => onSort({ key: column.key, direction: next })}>
          {column.label}
          <SortIcon state={state} />
        </button>
      ) : (
        <span className={column.hideLabel ? "ui-th ui-visually-hidden" : "ui-th"}>{column.label}</span>
      )}
    </th>
  );
}

const cellData = (column: Column) => ({
  "data-key": column.key,
  "data-align": column.align ?? "start",
  "data-fit": column.fit ? "" : undefined,
  "data-cut": column.cut ? "" : undefined,
});

/** A plain click on a row (a link inside follows itself; a modified click is the link's, a new tab). */
function rowClick(event: MouseEvent<HTMLTableRowElement>, open: () => void) {
  const target = event.target as Element | null;
  if (target?.closest("a") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  open();
}

function rowKey(event: KeyboardEvent<HTMLTableRowElement>, open: () => void) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  open();
}

function BodyRow({ row, columns, onRowClick }: { row: Row; columns: readonly Column[]; onRowClick?: (id: string) => void }) {
  const open = onRowClick ? () => onRowClick(row.id) : undefined;
  const focusable = !!open && !row.href;
  return (
    <tr
      aria-current={row.current ? "true" : undefined}
      data-row={row.id}
      tabIndex={focusable ? 0 : undefined}
      data-clickable={open ? "" : undefined}
      onClick={open ? (event) => rowClick(event, open) : undefined}
      onKeyDown={focusable ? (event) => rowKey(event, open) : undefined}
    >
      {columns.map((column) => (
        <td key={column.key} {...cellData(column)}>
          {column.link && row.href ? (
            <Link href={row.href} variant="quiet">
              {row.cells[column.key] ?? null}
            </Link>
          ) : (
            (row.cells[column.key] ?? null)
          )}
        </td>
      ))}
    </tr>
  );
}

export function Table({ label, columns, rows, sort, onSort, density = "regular", head = "regular", onRowClick, wrap }: TableProps) {
  return (
    <table className="ui-table" aria-label={label} data-density={density} data-head={head} data-wrap={wrap ? "" : undefined}>
      <thead>
        <tr>
          {columns.map((column) => (
            <Head key={column.key} column={column} sort={sort} onSort={onSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <BodyRow key={row.id} row={row} columns={columns} onRowClick={onRowClick} />
        ))}
      </tbody>
    </table>
  );
}
