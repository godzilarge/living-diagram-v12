// The Log header's tools: the period (a segmented choice; "Range" opens two dates under the header), the search (it
// leaves 250 ms after the last keystroke: neither the address nor the server see every key; `/` gives it the focus
// unless a field or a layer holds the keys; Escape empties it), the CSV export (its result said in a toast) and the
// help (the shortcuts and what the log keeps). Dates are written YYYY-MM-DD in both languages: an audit register is
// never ambiguous.
import { ArrowDown, ArrowUp, CircleHelp, Download, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Button, Field, IconButton, Popover, Segmented, Shortcut, showToast } from "../ui";
import { useText } from "../i18n";
import type { JournalFilters, Period } from "../state/journal";
import { localDay, PERIODS } from "../state/journal";
import type { JournalExport } from "../state/useJournal";
import { exportWords, periodWords } from "./words";

const SEARCH_DELAY = 250;
const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const typing = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || FIELDS.has(target.tagName));

/** The range's two days; Apply chooses the range, Cancel and Escape close. */
function RangeForm({ from, to, onApply, onClose }: { from: string; to: string; onApply: (from: string, to: string) => void; onClose: () => void }) {
  const t = useText();
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const malformed = (!!a && !localDay(a)) || (!!b && !localDay(b));
  const bad = !malformed && !!a && !!b && a > b;
  const ready = (!!a || !!b) && !bad && !malformed;
  const note = malformed ? t("journal:ui.rangeFormat") : bad ? t("journal:ui.rangeBad") : t("journal:ui.rangeNote");
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (ready) onApply(a, b);
  };
  const field = { placeholder: t("journal:ui.datePlaceholder"), inputMode: "numeric", maxLength: 10, spellCheck: false, autoComplete: "off" } as const;
  return (
    <form className="journal-range" onSubmit={submit}>
      <label className="journal-range-row">
        <span>{t("journal:ui.rangeFrom")}</span>
        <Field ref={first} {...field} label={t("journal:ui.rangeFrom")} value={a} onChange={(event) => setA(event.target.value.trim())} />
      </label>
      <label className="journal-range-row">
        <span>{t("journal:ui.rangeTo")}</span>
        <Field {...field} label={t("journal:ui.rangeTo")} value={b} onChange={(event) => setB(event.target.value.trim())} />
      </label>
      <p className="journal-range-note" data-bad={bad || malformed ? "" : undefined} role={bad || malformed ? "alert" : undefined}>
        {note}
      </p>
      <div className="journal-range-actions">
        <Button onClick={onClose}>{t("journal:ui.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={!ready}>
          {t("journal:ui.apply")}
        </Button>
      </div>
    </form>
  );
}

function Help() {
  const t = useText();
  const keys: readonly [ReactNode, string][] = [
    [<Shortcut key="slash" keys={["/"]} />, t("journal:ui.keySearch")],
    [<span key="arrows" className="journal-keys-pair"><Shortcut icon={<ArrowUp />} /><Shortcut icon={<ArrowDown />} /></span>, t("journal:ui.keyPrevNext")],
    [<Shortcut key="enter" keys={[t("journal:ui.keyEnter")]} />, t("journal:ui.keyUnfold")],
    [<Shortcut key="o" keys={[t("journal:ui.keyO")]} />, t("journal:ui.keyShow")],
    [<Shortcut key="escape" keys={[t("journal:ui.keyEscape")]} />, t("journal:ui.keyClear")],
  ];
  return (
    <div className="journal-help">
      <h3>{t("journal:ui.helpTitle")}</h3>
      <dl className="journal-keys">
        {keys.map(([chip, what]) => (
          <div key={what}>
            <dt>{chip}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <ul className="journal-help-notes">
        <li>{t("journal:ui.helpOne")}</li>
        <li>{t("journal:ui.helpTwo")}</li>
        <li>{t("journal:ui.helpThree")}</li>
        <li>{t("journal:ui.helpFour")}</li>
      </ul>
    </div>
  );
}

export type JournalToolsProps = Readonly<{
  filters: JournalFilters;
  now: number;
  onChange: (patch: Partial<JournalFilters>) => void;
  exportCsv: () => Promise<JournalExport>;
}>;

/** Hands a file to the browser. */
function save(csv: string, name: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function JournalTools({ filters: f, now, onChange, exportCsv }: JournalToolsProps) {
  const t = useText();
  const [text, setText] = useState(f.q);
  const [exporting, setExporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // the address edited by hand, or "clear the filters": the field follows
  useEffect(() => setText(f.q), [f.q]);
  useEffect(() => {
    if (text === f.q) return undefined;
    const timer = window.setTimeout(() => onChange({ q: text }), SEARCH_DELAY);
    return () => window.clearTimeout(timer);
  }, [text, f.q, onChange]);
  // `/`: the log's search, unless a field or an open layer holds the keys
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || document.querySelector("[data-layer]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const runExport = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    const result = await exportCsv();
    setExporting(false);
    if (result.ok) save(result.csv, result.name);
    showToast({ tone: result.ok ? (result.truncated ? "warning" : "neutral") : "error", message: exportWords(t, result) });
  };
  const options = [
    ...PERIODS.map((p: Period) => ({ value: p, label: t(`journal:period.${p}`) })),
    {
      value: "range",
      label: f.period === "range" ? periodWords(t, "range", f, now) : t("journal:period.range"),
      popover: {
        label: t("journal:ui.range"),
        name: "journal-range",
        content: (close: () => void) => (
          <RangeForm
            from={f.from}
            to={f.to}
            onClose={close}
            onApply={(from, to) => {
              onChange({ period: "range", from, to });
              close();
            }}
          />
        ),
      },
    },
  ];
  return (
    <span className="journal-island-tools">
      <Segmented name="journal-period" label={t("journal:ui.period")} options={options} value={f.period} onChange={(p) => onChange({ period: p as Period, from: "", to: "" })} />
      <Field
        ref={input}
        className="journal-search"
        type="search"
        icon={<Search />}
        label={t("journal:ui.searchLabel")}
        placeholder={t("journal:ui.placeholder")}
        spellCheck={false}
        aria-keyshortcuts="/"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !text) return;
          event.preventDefault();
          event.stopPropagation();
          setText("");
          onChange({ q: "" });
        }}
      />
      <IconButton label={t("journal:ui.export")} icon={<Download />} loading={exporting} onClick={() => void runExport()} />
      <Popover
        label={t("journal:ui.helpTitle")}
        name="journal-help"
        trigger={(props) => <IconButton {...props} label={t("journal:ui.helpOpen")} icon={<CircleHelp />} tooltipPlacement="bottom-end" />}
      >
        <Help />
      </Popover>
    </span>
  );
}
