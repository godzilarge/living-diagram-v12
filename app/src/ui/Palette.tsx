// The search palette (DESIGN.md, Search palette): a layer 752 px wide, 104 px from the top, over the scrim that
// covers the map and the islands. Four bands under a hairline each: the input row (the search icon, a field without
// border at headline size with the accent caret, the Escape chip), the scope row (the tab strip, `Rail`, commanding
// the list's tab panel), the body (the grouped list on the left, the detail column of 288 px on the right), the foot
// (the shortcuts and the total). A result row is the option row of a list (`Option.css`), 36 px: the kind's icon, the
// name with its matched parts at 650, the detail in label ink-3; the keyboard position on accent-weak with the Enter
// chip in place of its detail; never a rail (a position, not a view). A cut group ends with a "more" row in ink-3.
// The focus stays in the field (a combobox naming the current option, `aria-activedescendant`); the palette takes its
// keys before the page: ↑ ↓ walk the rows, Enter chooses, Shift+Enter chooses the other way (centre the view), Tab and
// Shift+Tab change the scope, Escape closes. A hidden live region says `status` after each keystroke. It opens with
// the scrim's fade and an 8 px rise, and closes at once; the focus goes back to `returnFocus` without its tooltip.
// `inline` shows it in the flow of a page (the primitives page): no portal, no scrim, Tab walks the page, the field
// shows the ring.
import { FloatingPortal } from "@floating-ui/react";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { Icon } from "./Icon";
import { Rail, tabIdOf } from "./Rail";
import type { RailItem } from "./Rail";
import { Scrim } from "./Scrim";
import { Shortcut } from "./Shortcut";
import { quietFocus } from "./Tooltip";
import "./Option.css";
import "./Panel.css";
import "./Palette.css";

export type PaletteSegment = Readonly<{ text: string; hit: boolean }>;
export type PaletteRow = Readonly<{
  id: string;
  icon: ReactNode;
  /** The name, or its parts with the matched ones marked (set at 650). */
  name: string | readonly PaletteSegment[];
  detail?: string | null;
  /** "more": the row that stands for the rows beyond the group's window, in ink-3. */
  variant?: "more";
  /** Shows the hover without the pointer (the primitives page). */
  force?: "hover";
}>;
export type PaletteGroup = Readonly<{ id: string; label: string; count: number; rows: readonly PaletteRow[] }>;
export type PaletteHint = Readonly<{ id: string; keys: readonly ReactNode[]; label: string }>;

export type PaletteProps = {
  /** Named by the trigger's `aria-controls`. */
  id: string;
  /** The dialog's accessible name. */
  label: string;
  open: boolean;
  inline?: boolean;
  query: string;
  onQuery: (text: string) => void;
  inputLabel: string;
  placeholder?: string;
  /** The Escape key's name, in the page's language. */
  escapeKey: string;
  scopesLabel: string;
  scopes: readonly RailItem[];
  scope: string;
  onScope: (id: string) => void;
  /** Tab (1) and Shift+Tab (-1). */
  onScopeStep: (direction: 1 | -1) => void;
  groups: readonly PaletteGroup[];
  /** The current row's id. */
  active: string | null;
  /** ↓ (1) and ↑ (-1). */
  onMove: (direction: 1 | -1) => void;
  /** Enter or a click (`alternate` false), Shift+Enter (`alternate` true). */
  onChoose: (id: string, alternate: boolean) => void;
  onClose: () => void;
  /** What the list says when it has no row (what one can search, nothing found, an unreadable expression). */
  message?: ReactNode;
  detail?: ReactNode;
  hints: readonly PaletteHint[];
  total?: string;
  /** What the live region says after a keystroke (the total, or the message). */
  status?: string;
  /** Where the focus goes back when the palette closes (its trigger). */
  returnFocus?: RefObject<HTMLElement | null>;
};

const optionId = (id: string, index: number): string => `${id}-option-${index}`;

/** The name of a row, its matched parts strong. */
function Name({ name }: { name: PaletteRow["name"] }) {
  if (typeof name === "string") return <span className="ui-palette-name">{name}</span>;
  return (
    <span className="ui-palette-name">
      {name.map((part, index) => (part.hit ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))}
    </span>
  );
}

type RowProps = { row: PaletteRow; domId: string; on: boolean; onChoose: (id: string, alternate: boolean) => void };

function Row({ row, domId, on, onChoose }: RowProps) {
  return (
    <div
      id={domId}
      className="ui-option ui-palette-row"
      role="option"
      aria-selected={on}
      data-active={on ? "" : undefined}
      data-variant={row.variant}
      data-force={row.force}
      data-row={row.id}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => onChoose(row.id, event.shiftKey)}
    >
      <Icon>{row.icon}</Icon>
      <Name name={row.name} />
      {on ? (
        <span className="ui-palette-enter" aria-hidden="true">
          <Shortcut icon={<CornerDownLeft />} />
        </span>
      ) : row.detail ? (
        <span className="ui-palette-detail">{row.detail}</span>
      ) : null}
    </div>
  );
}

type ListProps = Pick<PaletteProps, "id" | "groups" | "active" | "onChoose" | "message" | "label" | "scope">;

/** The tab panel of the current scope: the message, or the listbox of the grouped rows. */
function List({ id, groups, active, onChoose, message, label, scope }: ListProps) {
  const headingBase = useId();
  let index = -1;
  return (
    <div className="ui-palette-list" id={`${id}-panel`} role="tabpanel" aria-labelledby={tabIdOf(`${id}-panel`, scope)}>
      {groups.length === 0 && message ? <div className="ui-palette-message">{message}</div> : null}
      <div id={`${id}-list`} role="listbox" aria-label={label}>
        {groups.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`${headingBase}-${group.id}`}>
            <div className="ui-palette-group" id={`${headingBase}-${group.id}`}>
              <span>{group.label}</span>
              <span className="ui-palette-group-count">{group.count}</span>
            </div>
            {group.rows.map((row) => {
              index += 1;
              return <Row key={row.id} row={row} domId={optionId(id, index)} on={row.id === active} onChoose={onChoose} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The flat index of the current row, -1 when there is none. */
function activeIndex(groups: readonly PaletteGroup[], active: string | null): number {
  return active === null ? -1 : groups.flatMap((group) => group.rows).findIndex((row) => row.id === active);
}

function useKeys(props: PaletteProps, input: RefObject<HTMLInputElement | null>) {
  const { onMove, onScopeStep, onChoose, onClose, active, inline } = props;
  return (event: KeyboardEvent<HTMLDivElement>) => {
    const inField = event.target === input.current;
    if (event.key === "Escape") onClose();
    // in the flow of a page Tab keeps walking the page; floating, the palette holds the focus and Tab changes the tab
    else if (event.key === "Tab" && !inline) {
      onScopeStep(event.shiftKey ? -1 : 1);
      input.current?.focus();
    } else if (inField && (event.key === "ArrowDown" || event.key === "ArrowUp")) onMove(event.key === "ArrowDown" ? 1 : -1);
    else if (inField && event.key === "Enter" && active !== null) onChoose(active, event.shiftKey);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
}

function Layer(props: PaletteProps) {
  const { id, label, inline, query, onQuery, inputLabel, placeholder, escapeKey, scopesLabel, scopes, scope, onScope, groups, active, detail, hints, total, status } = props;
  const input = useRef<HTMLInputElement>(null);
  const keys = useKeys(props, input);
  const at = activeIndex(groups, active);
  useEffect(() => {
    if (!inline) input.current?.focus();
  }, [inline]);
  // the current row stays in view; the first one shows its group's heading too
  useLayoutEffect(() => {
    const list = document.getElementById(`${id}-panel`);
    if (!list) return;
    if (at <= 0) list.scrollTop = 0;
    else document.getElementById(optionId(id, at))?.scrollIntoView({ block: "nearest" });
  }, [id, at]);
  return (
    <div id={id} className="ui-palette" role="dialog" aria-modal={inline ? undefined : true} aria-label={label} data-layer="palette" data-inline={inline ? "" : undefined} onKeyDown={keys}>
      <div className="ui-palette-input">
        <span className="ui-palette-input-icon">
          <Icon>
            <Search />
          </Icon>
        </span>
        <input
          ref={input}
          className="ui-palette-field"
          role="combobox"
          aria-label={inputLabel}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={at >= 0 ? optionId(id, at) : undefined}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <Shortcut keys={[escapeKey]} />
      </div>
      <div className="ui-palette-scopes">
        <Rail
          label={scopesLabel}
          name="palette-scopes"
          items={scopes}
          value={scope}
          controls={`${id}-panel`}
          onChange={(next) => {
            onScope(next);
            input.current?.focus();
          }}
        />
      </div>
      <div className="ui-palette-body">
        <List id={id} groups={groups} active={active} onChoose={props.onChoose} message={props.message} label={label} scope={scope} />
        <div className="ui-palette-preview">{detail}</div>
      </div>
      <div className="ui-palette-foot">
        {hints.map((hint) => (
          <span key={hint.id} className="ui-palette-hint">
            {hint.keys}
            {hint.label}
          </span>
        ))}
        {total ? <span className="ui-palette-total">{total}</span> : null}
      </div>
      <div className="ui-visually-hidden" aria-live="polite">
        {status}
      </div>
    </div>
  );
}

export function Palette(props: PaletteProps) {
  const { open, inline, returnFocus, onClose } = props;
  // closed: the focus goes back to the trigger (never to the page's body), without opening its tooltip
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) quietFocus(returnFocus?.current);
    wasOpen.current = open;
  }, [open, returnFocus]);
  if (!open) return null;
  if (inline) return <Layer {...props} />;
  return (
    <FloatingPortal>
      <Scrim open onDismiss={onClose} />
      <Layer {...props} />
    </FloatingPortal>
  );
}

/** The head of the detail column: the kind's tile (40 px), the name at headline size, its kind words in caption ink-3. */
export function PaletteHeading({ tile, name, sub }: { tile: ReactNode; name: string; sub?: string | null }) {
  return (
    <div className="ui-palette-heading">
      <span className="ui-panel-tile" aria-hidden="true">
        {tile}
      </span>
      <div className="ui-palette-heading-text">
        <p className="ui-palette-heading-name">{name}</p>
        {sub ? <p className="ui-palette-heading-sub">{sub}</p> : null}
      </div>
    </div>
  );
}

/** A sub-heading of the detail column (label size, 600): "Where its 16 cables lead". */
export function PaletteSubheading({ children }: { children: ReactNode }) {
  return <p className="ui-palette-subheading">{children}</p>;
}

/** The actions of the detail column, at its foot: the primary button and the outlined "centre the view". */
export function PaletteActions({ children }: { children: ReactNode }) {
  return (
    <div className="ui-palette-actions" data-bar="palette-actions">
      {children}
    </div>
  );
}
