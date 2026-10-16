// Which rows of a table are on screen in the widget's body that scrolls: an IntersectionObserver whose root is the
// body, over the rows' `data-row`. It reports the rows that came into view (in the order the page gives them: top to
// bottom for a first look) and those that left; when the rows change (a filter, a sort, more rows), every row it
// watched is reported gone before the new ones are watched, so a row taken off the list is never "on screen".
import { useEffect, useRef } from "react";
import type { SeeRows } from "../state/useHome";

export function useVisibleRows(root: HTMLElement | null, rowKeys: readonly string[], onSee: SeeRows): void {
  const report = useRef(onSee);
  report.current = onSee;
  const signature = rowKeys.join("\n");
  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const watched: string[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        const key = (entry: IntersectionObserverEntry) => entry.target.getAttribute("data-row") ?? "";
        const shown = entries.filter((entry) => entry.isIntersecting).map(key);
        const hidden = entries.filter((entry) => !entry.isIntersecting).map(key);
        report.current(shown, hidden);
      },
      { root },
    );
    for (const row of root.querySelectorAll("[data-row]")) {
      watched.push(row.getAttribute("data-row") ?? "");
      observer.observe(row);
    }
    return () => {
      observer.disconnect();
      report.current([], watched);
    };
  }, [root, signature]);
}
