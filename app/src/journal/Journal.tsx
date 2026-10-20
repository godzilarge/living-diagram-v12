// The Log view (brick 7, direction J1 "the feed and its facets", design in DESIGN.md, Layout): who changed what in
// the intent, when, on which infrastructure. The ground covers the map (the canvas stays mounted underneath, inert);
// under the top row, one reading column centred, 1280 px at most: the Filters island on the left, the Log island (its header:
// the title, how many, where, the zone of the clocks, the period, the search, the export, the help; under it, an
// object's history or a link to an entry; its body: the feed by day, read further on reaching its foot). What it reads
// comes from `useJournal` (held by the Diagram: the pages, the rows unfolded, the active row and the scroll survive a
// trip to the Diagram); it renders and sends commands, never a network call.
import { History, Link2, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Model } from "@engine/canvas/types";
import { Button, feedRowOf, Icon, IconButton, Island, Mark } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { DEFAULT_VIEW, formatHash, formatSearch } from "../state/address";
import type { Address, ViewState } from "../state/address";
import { byDay, DEFAULT_FILTERS, entriesOf, filtered, firstEntry, fold } from "../state/journal";
import type { JournalFilters, JournalItem } from "../state/journal";
import { firstRef } from "../state/journal-text";
import type { RefKind } from "../state/journal-text";
import type { JournalHook } from "../state/useJournal";
import type { DetailActions } from "./Detail";
import { JournalFacets } from "./Facets";
import { JournalFeed } from "./Feed";
import { JournalTools } from "./JournalTools";
import { objectName, presenceOf, targetOf, wordsOf } from "./rows";
import { objectsName } from "./words";
import { causeWords, goneWords, linkWords, posedWords, scopeWords, shownWords, subtitleWords, totalWords } from "./words";
import "./journal.css";

export type JournalProps = Readonly<{
  hook: JournalHook;
  filters: JournalFilters;
  address: Address;
  view: ViewState;
  model: Model | null;
  setJournal: (patch: Partial<JournalFilters>) => void;
  showFromJournal: (kind: RefKind, id: string) => void;
}>;

/** Copies a text to the clipboard; false when the browser refuses. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Under the header: the history of one object (removable) and the link to an entry ("show the latest"). */
function Context({ t, f, name, link, setJournal }: { t: Translate; f: JournalFilters; name: string; link: string; setJournal: JournalProps["setJournal"] }) {
  if (!f.objects.length && f.rev === null) return null;
  return (
    <div className="journal-context">
      {f.objects.length ? (
        <span className="journal-context-part" data-journal-history="">
          <Icon>
            <History />
          </Icon>
          <span>{t("journal:ui.historyOf", { name })}</span>
          <IconButton label={t("journal:ui.leaveHistory")} icon={<X />} onClick={() => setJournal({ objects: [] })} />
        </span>
      ) : null}
      {f.rev !== null ? (
        <span className="journal-context-part" data-journal-link="">
          <Icon>
            <Link2 />
          </Icon>
          <span>{link}</span>
          <Button variant="line" onClick={() => setJournal({})}>
            {t("journal:ui.latest")}
          </Button>
        </span>
      ) : null}
    </div>
  );
}

export function Journal({ hook, filters: f, address, view, model, setJournal, showFromJournal }: JournalProps) {
  const t = useText();
  const [now] = useState(Date.now);
  const { load, ui, setUi } = hook;
  const page = load.kind === "idle" ? null : load.page;
  const busy = load.kind === "loading";
  const more = load.kind === "ready" && load.more;
  const current = address.infrastructure;
  const words = useMemo(() => wordsOf(f.q), [f.q]);
  const items = useMemo(() => (page ? fold(page.entries) : []), [page]);
  const language = t("ui:locale");
  // the day titles follow the page's language
  const days = useMemo(() => (language ? byDay(items, now) : []), [items, now, language]);
  const narrowed = filtered(f);
  const all = f.infrastructure === "*";
  const target = targetOf(items, f.rev, page?.start_missing ?? false);
  const active = ui.active && items.some((item) => item.key === ui.active) ? ui.active : (target?.key ?? items[0]?.key ?? null);
  const [said, setSaid] = useState("");

  const presence = useMemo(() => presenceOf(model), [model]);
  const hrefOf = useCallback(
    (infrastructure: string, kind: RefKind, id: string): string => {
      const selection = { kind, token: id };
      if (infrastructure === current) return formatSearch(address) + formatHash({ ...view, mode: "diagram" }, selection);
      return formatSearch({ infrastructure, runId: "", from: "" }) + formatHash(DEFAULT_VIEW, selection);
    },
    [address, view, current],
  );
  const actions = useMemo<DetailActions>(
    () => ({
      presence,
      hrefOf,
      show: (infrastructure, kind, id) => {
        if (infrastructure !== current) return false;
        showFromJournal(kind, id);
        return true;
      },
      history: (object, infrastructure) => setJournal({ ...DEFAULT_FILTERS, infrastructure: infrastructure === current ? "" : infrastructure, objects: [object.id] }),
      copy: copyText,
    }),
    [presence, hrefOf, current, showFromJournal, setJournal],
  );
  const onToggle = useCallback((key: string) => {
    const open = hook.ui.open;
    setUi({ open: open.includes(key) ? open.filter((k) => k !== key) : [...open, key] });
  }, [hook.ui.open, setUi]);
  const onActive = useCallback((key: string) => setUi({ active: key }), [setUi]);
  // "o": the first object the entry cites, in the Diagram; another infrastructure opens its page; a gone one says so
  const onShow = useCallback(
    (item: JournalItem) => {
      const entry = firstEntry(item);
      const ref = firstRef(entry);
      if (!ref) return;
      if (!presence(entry.infrastructure, ref.ref, ref.id)) return setSaid(t("journal:ui.nothingToShow", { name: ref.text, gone: goneWords(t, ref.ref) }));
      if (entry.infrastructure === current) return showFromJournal(ref.ref, ref.id);
      window.location.assign(hrefOf(entry.infrastructure, ref.ref, ref.id));
    },
    [presence, current, showFromJournal, hrefOf, t],
  );

  // the scroll: given back on arrival (once a page is there), kept on leaving
  const body = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const scrolled = useRef(ui.scroll);
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !page || !body.current) return;
    restored.current = true;
    body.current.scrollTop = ui.scroll;
  }, [page, ui.scroll]);
  useEffect(() => () => setUi({ scroll: scrolled.current }), [setUi]);

  // a link to an entry: the row is marked, focused and brought into view, once per link
  const reached = useRef<string | null>(null);
  useEffect(() => {
    const goal = target && f.rev !== null ? `${target.key}|${f.rev}` : null;
    if (!target || !goal || reached.current === goal || !body.current) return;
    const el = feedRowOf(body.current, target.key);
    if (!el) return;
    reached.current = goal;
    setUi({ active: target.key });
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center" });
  });

  // "older entries" from the button: the focus goes to the first entry that came (the button may go at the last page)
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const at = pending.current;
    if (at === null || !page || page.entries.length <= at || !body.current) return;
    pending.current = null;
    const reachedItem = items.find((item) => entriesOf(item).includes(page.entries[at]));
    const el = reachedItem ? feedRowOf(body.current, reachedItem.key) : null;
    if (reachedItem && el) {
      setUi({ active: reachedItem.key });
      el.focus();
    }
  }, [page, items, setUi]);
  const loadMore = (): void => {
    if (!page || more) return;
    pending.current = page.entries.length;
    hook.loadMore();
  };
  // the rest is read on reaching the foot of the feed (the focus stays); again after each page, if it is too short
  const next = page?.next ?? null;
  const count = page?.entries.length ?? 0;
  const { loadMore: readMore } = hook;
  useEffect(() => {
    const box = body.current, end = foot.current;
    if (!box || !end || !next || more || busy || typeof IntersectionObserver === "undefined") return undefined;
    const watch = new IntersectionObserver((seen) => (seen.some((s) => s.isIntersecting) ? readMore() : undefined), { root: box, rootMargin: "0px 0px 600px 0px" });
    watch.observe(end);
    return () => watch.disconnect();
  }, [next, count, more, busy, readMore]);

  const status = load.kind === "failed" && !page ? t("journal:ui.unreadableStatus") : !page ? t("journal:ui.reading") : totalWords(t, page.total, narrowed);
  const subtitle = subtitleWords(t, status, scopeWords(t, f, current), now);
  const clearFilters = (): void => setJournal({ q: "", authors: [], categories: [], actions: [], objects: [], period: "all", from: "", to: "" });
  const posed = posedWords(t, f, now);
  return (
    <div className="journal" data-journal="">
      <div className="journal-column">
        <Island name="journal" as="section" className="journal-main" aria-labelledby="journal-title" aria-busy={busy ? "true" : undefined}>
          <header className="journal-island-head journal-head" data-bar="journal-head" data-anchor="">
            <div className="journal-title">
              <h2 id="journal-title">{t("journal:ui.title")}</h2>
              <span className="journal-subtitle" aria-live="polite">
                {subtitle}
              </span>
            </div>
            <JournalTools filters={f} now={now} onChange={setJournal} exportCsv={hook.exportCsv} />
          </header>
          <Context t={t} f={f} name={objectsName(t, f.objects, page?.entries ?? [], model)} link={f.rev !== null ? linkWords(t, f.rev, page) : ""} setJournal={setJournal} />
          <div className="journal-body" ref={body} onScroll={(event) => (scrolled.current = event.currentTarget.scrollTop)}>
            <span className="ui-visually-hidden" aria-live="polite">
              {said}
            </span>
            {page && page.unreadable ? (
              <p className="journal-warn">
                <Mark tone="warning">{t("journal:ui.unreadable", { count: page.unreadable })}</Mark>
              </p>
            ) : null}
            {load.kind === "failed" ? (
              <div className="journal-state" role="alert">
                <p className="journal-state-title">
                  <Mark tone="error">{t("journal:ui.failedTitle")}</Mark>
                </p>
                <p className="journal-state-detail">{t("journal:ui.failedDetail", { message: causeWords(t, load.cause) })}</p>
                <Button variant="line" icon={<RotateCw />} onClick={hook.reload}>
                  {t("journal:ui.retry")}
                </Button>
              </div>
            ) : null}
            {load.kind === "ready" && !page?.entries.length ? (
              <div className="journal-state" data-journal-empty="">
                {narrowed ? (
                  <>
                    <p className="journal-state-title">{t("journal:ui.noMatchTitle")}</p>
                    {posed ? <p className="journal-state-detail">{posed}</p> : null}
                    <Button variant="line" onClick={clearFilters}>
                      {t("journal:ui.clearFilters")}
                    </Button>
                  </>
                ) : (
                  <p className="journal-state-detail">{t("journal:ui.emptyLog")}</p>
                )}
              </div>
            ) : null}
            {page && page.entries.length ? (
              <>
                <JournalFeed
                  days={days}
                  now={now}
                  open={ui.open}
                  active={active}
                  target={target?.key ?? null}
                  all={all}
                  busy={busy}
                  words={words}
                  actions={actions}
                  onToggle={onToggle}
                  onActive={onActive}
                  onShow={onShow}
                />
                <div className="journal-foot" ref={foot}>
                  {page.next ? (
                    <Button variant="line" loading={more} onClick={loadMore}>
                      {more ? t("journal:ui.readingMore") : t("journal:ui.older")}
                    </Button>
                  ) : (
                    <span className="journal-foot-start">{t("journal:ui.start")}</span>
                  )}
                  <span>{shownWords(t, page, f.rev)}</span>
                  <span className="journal-foot-note">{t("journal:ui.helpTwo")}</span>
                </div>
              </>
            ) : null}
          </div>
        </Island>
        {/* after the Log in the DOM (Tab reaches the search and the feed first), drawn on the left (journal.css) */}
        <JournalFacets filters={f} page={hook.facets} current={current} onChange={setJournal} onClearAll={() => setJournal({ ...DEFAULT_FILTERS })} />
      </div>
    </div>
  );
}
