// The line above the interface table that says which columns the next width adds and which icon shows them (the
// mockup's `.more`): one sentence from the catalogue whose `<widen/>` and `<focus/>` marks become the two icons.
import { ChevronsLeftRight, Maximize2 } from "lucide-react";
import { Icon } from "../ui";
import { useText } from "../i18n";
import type { ColumnKey, Width } from "../state/panel";

const MARK = /<(widen|focus)\/>/g;

/** The sentence split on its icon marks, in order. */
export function piecesOf(sentence: string): readonly (Readonly<{ kind: "text"; text: string }> | Readonly<{ kind: "icon"; icon: "widen" | "focus" }>)[] {
  const out: (Readonly<{ kind: "text"; text: string }> | Readonly<{ kind: "icon"; icon: "widen" | "focus" }>)[] = [];
  let at = 0;
  for (const match of sentence.matchAll(MARK)) {
    if (match.index > at) out.push({ kind: "text", text: sentence.slice(at, match.index) });
    out.push({ kind: "icon", icon: match[1] as "widen" | "focus" });
    at = match.index + match[0].length;
  }
  if (at < sentence.length) out.push({ kind: "text", text: sentence.slice(at) });
  return out;
}

export function MoreLine({ width, hidden }: { width: Width; hidden: readonly ColumnKey[] }) {
  const t = useText();
  if (!hidden.length) return null;
  const sentence = width === "compact" ? t("panel:interfaces.moreCompact") : t("panel:interfaces.moreWide");
  return (
    <p className="panel-more">
      {piecesOf(sentence).map((piece, index) =>
        piece.kind === "text" ? (
          <span key={index}>{piece.text}</span>
        ) : (
          <span key={index} className="panel-more-icon">
            <Icon>{piece.icon === "widen" ? <ChevronsLeftRight /> : <Maximize2 />}</Icon>
          </span>
        ),
      )}
    </p>
  );
}
