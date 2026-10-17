// The search palette of a page (brick 4, design/comps/shell/index.html at `data-state="search"`): what the text finds
// in the sources the page gives (`state/search.ts`), grouped by kind under the tabs, each group cut to its window
// with a "more" row the arrows reach, the current result's detail on the right. It keeps the text between two
// openings; the tab and the windows go back to their defaults when it closes; a new text or a new tab puts the
// current row back on the first. It renders and reports: choosing a result closes the palette and hands the result
// to the page (`onChoose`), which opens it; it never calls the API and never touches the canvas.
import { ArrowDown, ArrowUp, CornerDownLeft, Ellipsis } from "lucide-react";
import { useMemo, useState } from "react";
import type { RefObject } from "react";
import { Palette, Shortcut } from "../ui";
import type { PaletteGroup, PaletteHint, RailItem } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { countOf, detailOf, groupsIn, rowsIn, search, SCOPES, segmentsOf, showMore, stepActive } from "../state/search";
import type { Hit, Results, Row, Scope, Shown, Sources } from "../state/search";
import { hitIcon } from "./icons";
import { SearchDetail } from "./SearchDetail";
import { messageWords, rowDetail, rowName, scopeWords, totalWords } from "./words";
import "./search.css";

/** A result chosen: opened (Enter, the primary button) or shown on the map (Shift+Enter, "centre the view"). */
export type Choice = Readonly<{ hit: Hit; how: "open" | "reveal" }>;

export type SearchPaletteProps = {
  id: string;
  open: boolean;
  onClose: () => void;
  sources: Sources;
  /** The tabs the page offers (the home: all and infrastructures). */
  scopes?: readonly Scope[];
  /** The home: what one can search there is an infrastructure. */
  home?: boolean;
  onChoose: (choice: Choice) => void;
  returnFocus: RefObject<HTMLElement | null>;
};

/** Tab and Shift+Tab over the tabs the page offers, every tab a choice whatever its count. */
export function stepIn(scopes: readonly Scope[], scope: Scope, direction: 1 | -1): Scope {
  const at = Math.max(0, scopes.indexOf(scope));
  return scopes[(at + direction + scopes.length) % scopes.length];
}

function paletteGroups(t: Translate, results: Results, scope: Scope, shown: Shown): PaletteGroup[] {
  return groupsIn(results, scope, shown).map((group) => ({
    id: group.scope,
    label: scopeWords(t, group.scope),
    count: group.hits.length + group.more,
    rows: [
      ...group.hits.map((hit) => ({ id: hit.key, icon: hitIcon(hit), name: segmentsOf(rowName(t, hit), results.terms), detail: rowDetail(t, hit) })),
      ...(group.more ? [{ id: `more:${group.scope}`, icon: <Ellipsis />, name: t("search:more", { count: group.more }), variant: "more" as const }] : []),
      // the query's own action, under the devices it designates, out of the group's count
      ...(group.tail ? [{ id: group.tail.key, icon: hitIcon(group.tail), name: segmentsOf(rowName(t, group.tail), results.terms), detail: rowDetail(t, group.tail) }] : []),
    ],
  }));
}

function hints(t: Translate, home: boolean): PaletteHint[] {
  return [
    { id: "walk", keys: [<Shortcut key="up" icon={<ArrowUp />} />, <Shortcut key="down" icon={<ArrowDown />} />], label: t("search:hints.walk") },
    { id: "open", keys: [<Shortcut key="enter" icon={<CornerDownLeft />} />], label: t("search:hints.open") },
    ...(home ? [] : [{ id: "centre", keys: [<Shortcut key="shift" keys={[t("ui:keys.shift")]} />, <Shortcut key="enter" icon={<CornerDownLeft />} />], label: t("search:hints.centre") }]),
    { id: "scope", keys: [<Shortcut key="tab" keys={[t("ui:keys.tab")]} />], label: t("search:hints.scope") },
  ];
}

const opensOnMap = (hit: Hit): boolean => hit.kind !== "infrastructure" && hit.kind !== "action";
const isHit = (row: Row | undefined): row is Hit => !!row && row.kind !== "more";

export function SearchPalette({ id, open, onClose, sources, scopes = SCOPES, home = false, onChoose, returnFocus }: SearchPaletteProps) {
  const t = useText();
  const language = t("ui:locale");
  const [text, setText] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [shown, setShown] = useState<Shown>({});
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(sources, text), [sources, text]);
  const rows = useMemo(() => rowsIn(results, scope, shown), [results, scope, shown]);
  // the words follow the language (`t` changes identity at every render)
  const groups = useMemo(() => paletteGroups(t, results, scope, shown), [results, scope, shown, language]);
  const at = Math.min(active, Math.max(0, rows.length - 1));
  const row = rows[at];
  const hit = isHit(row) ? row : null;
  const detail = hit ? detailOf(sources.model, hit) : null;
  const restart = (): void => {
    setShown({});
    setActive(0);
  };
  const close = () => {
    setScope("all");
    restart();
    onClose();
  };
  const choose = (chosen: Hit, how: Choice["how"]) => {
    close();
    onChoose({ hit: chosen, how });
  };
  /** Enter, a click, Shift+Enter: a "more" row shows the next page (the current row stays on its first row). */
  const chooseRow = (key: string, alternate: boolean) => {
    const index = rows.findIndex((r) => r.key === key);
    const chosen = rows[index];
    if (!chosen) return;
    if (chosen.kind === "more") {
      setShown(showMore(scope, shown, chosen.scope));
      setActive(index);
    } else choose(chosen, alternate && opensOnMap(chosen) ? "reveal" : "open");
  };
  const items: RailItem[] = scopes.map((s) => ({ id: s, label: scopeWords(t, s), count: results.empty ? undefined : countOf(results, s) }));
  const message = messageWords(t, results, scope, rows.length, home);
  const total = totalWords(t, results);
  return (
    <Palette
      id={id}
      label={t("search:label")}
      open={open}
      query={text}
      onQuery={(next) => {
        setText(next);
        restart();
      }}
      inputLabel={t("search:input")}
      placeholder={t("search:placeholder")}
      escapeKey={t("ui:keys.escape")}
      scopesLabel={t("search:scopesLabel")}
      scopes={items}
      scope={scope}
      onScope={(next) => {
        setScope(next as Scope);
        restart();
      }}
      onScopeStep={(direction) => {
        setScope(stepIn(scopes, scope, direction));
        restart();
      }}
      groups={groups}
      active={row?.key ?? null}
      onMove={(direction) => setActive(stepActive(at, rows.length, direction))}
      onChoose={chooseRow}
      onClose={close}
      message={
        message ? (
          <div className="search-message">
            <p className="search-message-main" data-error={results.error ? "" : undefined}>
              {message.text}
            </p>
            {message.hint ? <p className="search-message-hint">{message.hint}</p> : null}
          </div>
        ) : undefined
      }
      detail={
        <SearchDetail
          hit={hit}
          detail={detail}
          model={sources.model}
          actions={{ onOpen: () => hit && choose(hit, "open"), onReveal: hit && detail && opensOnMap(hit) ? () => choose(hit, "reveal") : null }}
        />
      }
      hints={hints(t, home)}
      total={total ?? undefined}
      status={results.empty ? "" : results.error || results.total === 0 ? (message?.text ?? "") : (total ?? "")}
      returnFocus={returnFocus}
    />
  );
}
