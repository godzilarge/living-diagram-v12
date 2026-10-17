// A menu (DESIGN.md, Menu): a vertical list of word rows, for the context menu, a contextual bar's "more" and "group"
// volets, the code block's language and font lists, a tool's choices. A row is the option row of a list (`Option.css`,
// one definition with Select and Palette): 32 px, in sentence case, the hover fill under the pointer, the keyboard position on
// accent-weak; an optional shortcut chip on the right; a chosen value carries the check in accent-ink (a
// `menuitemradio`); a `danger` row turns to the error text on hover (no fill: one definition with the controls); a
// separator row is a hairline; a heading row names the rows under it in label size, ink-3. Keys: ↑ ↓ Home End move the
// focus between rows, Enter and Space choose, a letter goes to the next row it starts; Escape is the holder's
// (`onEscape`). `focusOnOpen`: the first row takes the focus on mount (the context menu), or the menu itself (a volet:
// the arrows then start from the top), or nothing.
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent, Ref } from "react";
import { useMergeRefs } from "@floating-ui/react";
import { Icon } from "./Icon";
import { Shortcut } from "./Shortcut";
import "./Option.css";
import "./Menu.css";

export type MenuItem = Readonly<{
  kind?: "item";
  id: string;
  label: string;
  /** The keys, already in the page's language (`["Ctrl", "C"]`). */
  shortcut?: readonly string[];
  /** `aria-keyshortcuts` (`Control+C`). */
  keys?: string;
  /** A choice: true for the chosen value (the check), false for the others; left out, a plain action. */
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
}>;
export type MenuRow = MenuItem | Readonly<{ kind: "separator" }> | Readonly<{ kind: "heading"; label: string }>;

export type MenuProps = Omit<HTMLAttributes<HTMLDivElement>, "style" | "title" | "onSelect" | "role"> & {
  /** The menu's accessible name. */
  label: string;
  rows: readonly MenuRow[];
  onChoose: (id: string) => void;
  onEscape?: () => void;
  focusOnOpen?: "first" | "menu" | "none";
  /** The menu draws its own surface (a layer of its own: the context menu); in a popover it does not. */
  surface?: boolean;
  ref?: Ref<HTMLDivElement>;
};

const isItem = (row: MenuRow): row is MenuItem => row.kind === undefined || row.kind === "item";

/** The rows the keyboard walks, in order. */
function itemsOf(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>("[data-menu-item]")) : [];
}

/** Where a key sends the focus, from `at` (-1: nowhere yet), or null when the key is not the menu's. */
function nextIndex(key: string, at: number, count: number): number | null {
  if (!count) return null;
  if (key === "ArrowDown") return at < 0 ? 0 : (at + 1) % count;
  if (key === "ArrowUp") return at < 0 ? count - 1 : (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The next row after `at` whose words start with `letter` (typeahead), or -1. */
function matchIndex(labels: readonly string[], letter: string, at: number): number {
  const wanted = letter.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (at + step + labels.length) % labels.length;
    if (labels[index].toLocaleLowerCase().startsWith(wanted)) return index;
  }
  return -1;
}

export function Menu({ label, rows, onChoose, onEscape, focusOnOpen = "none", surface = false, className, ref, ...rest }: MenuProps) {
  const own = useRef<HTMLDivElement>(null);
  const merged = useMergeRefs([ref, own]);
  // the keyboard position (accent-weak), set by the keys only: a row under the pointer takes the hover fill instead
  const [active, setActive] = useState<number | null>(null);
  const items = rows.filter(isItem);

  useEffect(() => {
    if (focusOnOpen === "first") itemsOf(own.current)[0]?.focus({ preventScroll: true });
    else if (focusOnOpen === "menu") own.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);

  const move = (index: number): void => {
    setActive(index);
    itemsOf(own.current)[index]?.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    rest.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const at = itemsOf(own.current).indexOf(document.activeElement as HTMLElement);
    const next = nextIndex(event.key, at, items.length);
    if (next !== null) {
      event.preventDefault();
      event.stopPropagation();
      move(next);
      return;
    }
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const found = matchIndex(items.map((item) => item.label), event.key, at);
      if (found >= 0) {
        event.preventDefault();
        move(found);
      }
    }
  };
  let index = -1;
  return (
    <div
      {...rest}
      ref={merged}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={["ui-menu", className ?? ""].join(" ").trim()}
      data-surface={surface ? "" : undefined}
      onKeyDown={onKeyDown}
      onPointerMove={() => (active === null ? undefined : setActive(null))}
    >
      {rows.map((row, at) => {
        if (row.kind === "separator") return <div key={`separator-${at}`} className="ui-menu-separator" role="separator" />;
        if (row.kind === "heading") return <div key={`heading-${at}`} className="ui-menu-heading" role="presentation">{row.label}</div>;
        index += 1;
        const mine = index;
        return <MenuRowButton key={row.id} item={row} active={active === mine} onChoose={onChoose} />;
      })}
    </div>
  );
}

function MenuRowButton({ item, active, onChoose }: { item: MenuItem; active: boolean; onChoose: (id: string) => void }) {
  const choose = (): void => {
    if (!item.disabled) onChoose(item.id);
  };
  return (
    <button
      type="button"
      role={item.checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={item.checked === undefined ? undefined : item.checked}
      aria-disabled={item.disabled ? "true" : undefined}
      aria-keyshortcuts={item.keys}
      tabIndex={-1}
      className="ui-option ui-menu-item"
      data-menu-item=""
      data-value={item.id}
      data-active={active ? "" : undefined}
      data-danger={item.danger ? "" : undefined}
      onClick={choose}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        choose();
      }}
    >
      <span className="ui-option-text">{item.label}</span>
      {item.shortcut?.length ? <Shortcut keys={item.shortcut} /> : null}
      {item.checked ? (
        <span className="ui-option-check">
          <Icon>
            <Check />
          </Icon>
        </span>
      ) : null}
    </button>
  );
}
