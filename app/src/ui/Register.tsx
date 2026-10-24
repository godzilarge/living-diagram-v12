// The register (DESIGN.md, Register): Check's verdicts, from the approved mockup's `.reg`, at the relaxed density of a
// list one opens (Orhan, 2026-10-21). A table on the widget's paper, its 32 px head sticking: severity mark | verdict
// | count | chevron. Group rows are section headings inside the body (words and count in label size ink-3, 12 px of
// air above, the hairline below). Each row is 56 px on two lines (the sentence at 500, then the code chip and the
// rule's family in label size ink-3) and opens: a click, Enter or Space on the focused row turns its chevron and shows
// a detail row under it, which the open row's hairline gives way to. The detail is usually `RegisterTargets`: what
// the verdict concerns, each a Link to the element. Uses the Table's styles (one grammar for every table).
import { ChevronRight } from "lucide-react";
import { Fragment, useId } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import { Link } from "./Link";
import { Mark } from "./Mark";
import type { MarkTone } from "./Mark";
import "./Table.css";
import "./Register.css";

export type RegisterRow = Readonly<{
  id: string;
  tone: MarkTone;
  /** The sentence, first line. */
  title: ReactNode;
  /** The second line, label size ink-3: a code chip and words. */
  meta: ReactNode;
  count: ReactNode;
  detail: ReactNode;
}>;
export type RegisterGroup = Readonly<{ id: string; label: string; count: ReactNode; rows: readonly RegisterRow[] }>;
/** The columns' words: the mark, the verdict, the count, the chevron (the first and last said, not shown). */
export type RegisterColumns = Readonly<{ mark: string; verdict: string; count: string; open: string }>;

export type RegisterProps = {
  label: string;
  columns: RegisterColumns;
  groups: readonly RegisterGroup[];
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
};

/** A plain click on a row toggles it (a link inside follows itself). */
function rowClick(event: MouseEvent<HTMLTableRowElement>, toggle: () => void) {
  if ((event.target as Element | null)?.closest("a")) return;
  toggle();
}

/** Enter or Space on the focused row (never on a link inside it) toggles it. */
export function registerRowKey(event: Pick<KeyboardEvent<HTMLTableRowElement>, "key" | "target" | "currentTarget" | "preventDefault">, toggle: () => void) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  toggle();
}

function Row({ row, open, base, onToggle }: { row: RegisterRow; open: boolean; base: string; onToggle: (id: string) => void }) {
  const detailId = `${base}-${row.id}`;
  const toggle = () => onToggle(row.id);
  return (
    <>
      <tr
        className="ui-register-row"
        data-row={row.id}
        data-clickable=""
        data-open={open ? "" : undefined}
        tabIndex={0}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={(event) => rowClick(event, toggle)}
        onKeyDown={(event) => registerRowKey(event, toggle)}
      >
        <td data-key="mark" data-fit="">
          <Mark tone={row.tone} />
        </td>
        <td data-key="verdict">
          <span className="ui-register-what">
            <span className="ui-register-title">{row.title}</span>
            <span className="ui-register-meta">{row.meta}</span>
          </span>
        </td>
        <td data-key="count" data-align="end" data-fit="">
          {row.count}
        </td>
        <td data-key="open" data-fit="">
          <span className="ui-register-chevron">
            <Icon>
              <ChevronRight />
            </Icon>
          </span>
        </td>
      </tr>
      {open ? (
        <tr className="ui-register-detail" id={detailId}>
          <td colSpan={4}>{row.detail}</td>
        </tr>
      ) : null}
    </>
  );
}

export function Register({ label, columns, groups, open, onToggle }: RegisterProps) {
  const base = useId();
  return (
    <table className="ui-table ui-register" aria-label={label} data-density="relaxed" data-head="widget">
      <thead>
        <tr>
          <th scope="col" data-key="mark" data-fit="">
            <span className="ui-th ui-visually-hidden">{columns.mark}</span>
          </th>
          <th scope="col" data-key="verdict">
            <span className="ui-th">{columns.verdict}</span>
          </th>
          <th scope="col" data-key="count" data-align="end" data-fit="">
            <span className="ui-th">{columns.count}</span>
          </th>
          <th scope="col" data-key="open" data-fit="">
            <span className="ui-th ui-visually-hidden">{columns.open}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <Fragment key={group.id}>
            <tr className="ui-register-group" data-group={group.id}>
              <th scope="colgroup" colSpan={4}>
                <span className="ui-register-group-label">{group.label}</span>
                <span className="ui-register-group-count">{group.count}</span>
              </th>
            </tr>
            {group.rows.map((row) => (
              <Row key={row.id} row={row} open={open.has(row.id)} base={base} onToggle={onToggle} />
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export type RegisterTarget = Readonly<{ id: string; icon: ReactNode; label: string; href: string | null }>;

/** What a verdict concerns: one 28 px line per thing, its kind's icon in ink-3, a Link to it (words when the run
 *  cannot select it). */
export function RegisterTargets({ label, targets }: { label: string; targets: readonly RegisterTarget[] }) {
  return (
    <ul className="ui-register-targets" aria-label={label}>
      {targets.map((target) => (
        <li key={target.id}>
          <span className="ui-register-target-icon">
            <Icon>{target.icon}</Icon>
          </span>
          {target.href ? <Link href={target.href}>{target.label}</Link> : <span className="ui-register-target-words">{target.label}</span>}
        </li>
      ))}
    </ul>
  );
}
