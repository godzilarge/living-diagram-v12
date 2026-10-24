// The register (DESIGN.md, Register): Check's verdicts grouped by rule (V3, chosen at the bench on 2026-10-24). A table
// on the widget's paper, its 32 px head sticking: severity mark | verdict | code | chevron (the first and the last
// said, not shown). A section per rule family: its words in body strong, its count of checks in label ink-3 8 px after,
// on a 48 px row (16 px of air above a 32 px line), the hairline below, never hovered. A row is 44 px on one line: the
// state mark of its severity, the sentence (its number inside it), the `Code` chip left-aligned in its own column,
// the chevron. A row opens (a click, Enter or Space on the focused row): its chevron turns, its hairline gives way to a
// detail row aligned on the sentence, usually `RegisterTargets`. In a narrow tile (under 640 px) the code column gives
// way: the chip shows at the head of the open row's detail, the sentence may wrap (the stylesheet shows one or the
// other). Uses the Table's styles (one grammar for every table).
import { ChevronRight } from "lucide-react";
import { Fragment, useId } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Code } from "./Code";
import { Icon } from "./Icon";
import { Link } from "./Link";
import { Mark } from "./Mark";
import type { MarkTone } from "./Mark";
import "./Table.css";
import "./Register.css";

export type RegisterRow = Readonly<{
  id: string;
  tone: MarkTone;
  /** The sentence, its number inside it. */
  title: ReactNode;
  /** The check's code, set as a `Code` chip (never translated). */
  code: string;
  detail: ReactNode;
}>;
export type RegisterGroup = Readonly<{ id: string; label: string; count: ReactNode; rows: readonly RegisterRow[] }>;
/** The columns' words: the mark, the verdict, the code, the chevron (the first and last said, not shown). */
export type RegisterColumns = Readonly<{ mark: string; verdict: string; code: string; open: string }>;

export type RegisterProps = {
  label: string;
  columns: RegisterColumns;
  groups: readonly RegisterGroup[];
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
};

const SPAN = 4;

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
          <span className="ui-register-title">{row.title}</span>
        </td>
        <td data-key="code" data-fit="">
          <Code>{row.code}</Code>
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
          <td colSpan={SPAN}>
            <span className="ui-register-detail-code">
              <Code>{row.code}</Code>
            </span>
            {row.detail}
          </td>
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
          <th scope="col" data-key="code" data-fit="">
            <span className="ui-th">{columns.code}</span>
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
              <th scope="colgroup" colSpan={SPAN}>
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
