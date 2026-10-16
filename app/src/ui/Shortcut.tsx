// A keyboard shortcut (DESIGN.md, Chips and counts): label size, ink-3, a 1 px line-2 border, 20 px high. The key
// names come translated (`Ctrl`, `Maj`, `Échap`); a key drawn rather than named (↑, ↓, Enter) is an icon at the
// label's size, decorative: the words around the chip say what it does.
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import "./Shortcut.css";

export function Shortcut({ keys, icon }: { keys?: readonly string[]; icon?: ReactNode }) {
  return <kbd className="ui-shortcut">{icon ? <Icon>{icon}</Icon> : (keys ?? []).join(" ")}</kbd>;
}
