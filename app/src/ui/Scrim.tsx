// The scrim (DESIGN.md, Elevation): the faded map behind the search palette and the focus panel; a click on it
// closes what it serves. It covers its containing block (the viewport, unless a parent contains fixed elements).
import "./Scrim.css";

export function Scrim({ open, onDismiss }: { open: boolean; onDismiss?: () => void }) {
  return <div className="ui-scrim" data-open={open ? "" : undefined} aria-hidden="true" onClick={onDismiss} />;
}
