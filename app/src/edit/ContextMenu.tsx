// The context menu (a right click in edit mode; the v1's menu, `@engine/app/state/context`): what the click aimed at
// offers (the map, a device, a group, an annotation and its cell, a connector), as a Menu in a layer of its own at the
// click point, kept 8 px inside the viewport. The focus enters its first row; an entry runs (`runMenu`) and closes it;
// Escape (the focus back to the map), a press outside, the wheel, a resize or leaving the window close it. Its words
// come from the v1's catalogues, which follow the page's language.
import { useEffect, useLayoutEffect, useRef } from "react";
import { menuItems } from "@engine/app/state/context";
import type { MenuItem as V1Item } from "@engine/app/state/context";
import { GRID_MIN, movableCount } from "@engine/app/state/floating";
import type { Toile } from "@engine/app/canvas/toile";
import { Menu } from "../ui";
import type { MenuRow } from "../ui";
import { useText } from "../i18n";
import type { ContextMenuState } from "../state/diagram";
import type { EditCommands } from "../state/edit-commands";
import { runMenu } from "../state/bar-actions";
import { focusMap } from "./focus";
import "./edit.css";

/** The menu keeps this far from the viewport's edges. */
const MARGIN = 8;

export type ContextMenuProps = {
  menu: ContextMenuState;
  toile: Toile;
  /** The selected devices (the selection a menu entry may act on). */
  hosts: readonly string[];
  hasSelection: boolean;
  edit: EditCommands;
  onClose: () => void;
};

/** A v1 entry as a row: its written keys (`Ctrl+C`) as a chip, its `aria-keyshortcuts`, its check, its danger. */
const rowOf = (item: V1Item): MenuRow =>
  item.sep ? { kind: "separator" } : { id: item.id, label: item.label, shortcut: item.keys ? item.keys.split("+") : undefined, keys: item.aria, checked: item.checked, danger: item.danger };

function rowsOf(menu: ContextMenuState, toile: Toile, hosts: readonly string[], hasSelection: boolean, editable: boolean): MenuRow[] {
  const model = toile.model, picked = toile.state.multi, target = menu.target;
  const count = picked.hosts.length + picked.annotations.length + picked.connectors.length + picked.groups.length;
  // "snap to a grid" when the target belongs to a selection of three elements at least that can be laid out
  const inPicked = target.kind === "node" ? picked.hosts.includes(target.id) : target.kind === "annotation" ? picked.annotations.includes(target.id) : false;
  const grid = inPicked && movableCount(model, picked).count >= GRID_MIN;
  const items = menuItems(target, model, { editable, selectedHosts: [...hosts], hasSelection, pinned: (host) => model.pinByHost.has(host), items: count, grid });
  return items.map(rowOf);
}

export function ContextMenu({ menu, toile, hosts, hasSelection, edit, onClose }: ContextMenuProps) {
  const t = useText();
  const ref = useRef<HTMLDivElement>(null);
  const rows = rowsOf(menu, toile, hosts, hasSelection, edit.canWrite());

  // at the click point, moved back inside the viewport when it lacks room (CSSOM, never a style attribute)
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const x = Math.max(MARGIN, Math.min(menu.at.x, window.innerWidth - element.offsetWidth - MARGIN));
    const y = Math.max(MARGIN, Math.min(menu.at.y, window.innerHeight - element.offsetHeight - MARGIN));
    element.style.setProperty("--menu-x", `${Math.round(x)}px`);
    element.style.setProperty("--menu-y", `${Math.round(y)}px`);
  }, [menu]);

  useEffect(() => {
    const down = (event: PointerEvent): void => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  if (!rows.some((row) => row.kind !== "separator")) return null;
  const escape = (): void => {
    onClose();
    focusMap();
  };
  return (
    <Menu
      ref={ref}
      surface
      label={t("edit:menu.label")}
      rows={rows}
      focusOnOpen="first"
      className="context-menu"
      data-layer="context-menu"
      onEscape={escape}
      onContextMenu={(event) => event.preventDefault()}
      onChoose={(id) => {
        onClose();
        runMenu(menu.target, id, menu.plan, edit, toile.model, hosts);
      }}
    />
  );
}
