// A zero in a column of counts or facts (DESIGN.md, Chips and counts, Zero): the figure in ink-4, decorative, at the
// size of its context; the value is still said to assistive technologies by a hidden copy.
import "./control.css";
import "./Zero.css";

export function Zero() {
  return (
    <span className="ui-zero">
      <span aria-hidden="true">0</span>
      <span className="ui-visually-hidden">0</span>
    </span>
  );
}
