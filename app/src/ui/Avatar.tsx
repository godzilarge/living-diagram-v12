// An avatar (DESIGN.md, Components, Avatar): a 22 px square, sunken, a 1 px line-2 inset, the initial of a declared
// author in ink-2 (ink-4 in a disabled control); "?" for an author left blank. Decorative: the name is said next to it
// (a feed) or by its control (the user button).
import "./Avatar.css";

/** What an avatar shows for a blank name: nobody is guessed. */
export const UNKNOWN_INITIAL = "?";

/** The initial of a name, upper-cased in the page's own way; "?" for a blank name. */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase() : UNKNOWN_INITIAL;
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="ui-avatar" aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
