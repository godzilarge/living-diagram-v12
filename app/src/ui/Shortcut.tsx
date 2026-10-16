// A keyboard shortcut (DESIGN.md, Chips and counts): label size, ink-3, a 1 px line-2 border, 20 px high. The key
// names come translated (`Ctrl`, `Maj`, `Échap`).
import "./Shortcut.css";

export function Shortcut({ keys }: { keys: readonly string[] }) {
  return <kbd className="ui-shortcut">{keys.join(" ")}</kbd>;
}
