// A table (DESIGN.md, Layout): body text, a label-size head in ink-3 with sortable headers (`aria-sort`), 44 px rows
// (32 in a compact panel) with a hairline rule, the hovered row on ground, the current row on accent-weak. The head
// sticks when the table scrolls inside a panel. A clickable row takes the focus (Tab) and answers Enter and Space.
// Cells are text or nodes: never HTML from data.
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import "./Table.css";

export type SortDirection = "ascending" | "descending";
export type Column = Readonly<{ key: string; label: string; align?: "start" | "end"; sortable?: boolean }>;
export type Row = Readonly<{ id: string; cells: Readonly<Record<string, ReactNode>>; current?: boolean }>;
export type Sort = Readonly<{ key: string; direction: SortDirection }>;

export type TableProps = {
  label: string;
  columns: readonly Column[];
  rows: readonly Row[];
  sort?: Sort;
  onSort?: (sort: Sort) => void;
  density?: "regular" | "compact";
  onRowClick?: (id: string) => void;
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
    <th scope="col" aria-sort={column.sortable ? (state ?? "none") : undefined} data-align={column.align ?? "start"}>
      {column.sortable && onSort ? (
        <button type="button" className="ui-th" onClick={() => onSort({ key: column.key, direction: next })}>
          {column.label}
          <SortIcon state={state} />
        </button>
      ) : (
        <span className="ui-th">{column.label}</span>
      )}
    </th>
  );
}

export function Table({ label, columns, rows, sort, onSort, density = "regular", onRowClick }: TableProps) {
  return (
    <table className="ui-table" aria-label={label} data-density={density}>
      <thead>
        <tr>
          {columns.map((column) => (
            <Head key={column.key} column={column} sort={sort} onSort={onSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            aria-current={row.current ? "true" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            data-clickable={onRowClick ? "" : undefined}
            onClick={onRowClick ? () => onRowClick(row.id) : undefined}
            onKeyDown={onRowClick ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onRowClick(row.id);
              }
            } : undefined}
          >
            {columns.map((column) => (
              <td key={column.key} data-align={column.align ?? "start"}>
                {row.cells[column.key] ?? null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
