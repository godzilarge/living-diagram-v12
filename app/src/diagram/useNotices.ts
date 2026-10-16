// What the diagram says in a toast (DESIGN.md, Toast; one at a time): the parts a collection opened without (once,
// when it is ready), a selection the address names that the collection does not hold (then forgotten), a line of the
// placement host ("3 devices placed and memorized").
import { useCallback, useEffect, useRef } from "react";
import { currentToast, showToast } from "../ui";
import type { Translate } from "../i18n";
import type { RunState } from "../state/diagram";
import { missingWords } from "./words";

export type Notices = Readonly<{ onWantedMissing: (token: string) => void; onNote: (text: string) => void }>;

export function useNotices(t: Translate, run: RunState, dropWanted: () => void): Notices {
  const text = useRef(t);
  text.current = t;
  useEffect(() => {
    if (run.kind === "ready" && run.missing.length > 0) showToast({ tone: "warning", message: missingWords(text.current, run.missing) });
  }, [run]);
  const onWantedMissing = useCallback(
    (token: string) => {
      showToast({ tone: "warning", message: text.current("diagram:state.notFound", { token }) });
      dropWanted();
    },
    [dropWanted],
  );
  // a line of the placement host never covers a warning still on screen (one toast at a time)
  const onNote = useCallback((note: string) => {
    if (currentToast()?.tone === "warning") return;
    showToast({ message: note });
  }, []);
  return { onWantedMissing, onNote };
}
