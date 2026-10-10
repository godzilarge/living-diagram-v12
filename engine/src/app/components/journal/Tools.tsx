// La recherche, la période et l'export de la vue Journal. La recherche part 250 ms après la dernière frappe (l'adresse
// et le serveur ne voient pas chaque touche) ; `/` ou Ctrl+K lui donnent le focus, sauf quand un dialogue est ouvert ;
// Échap la vide. La période est un choix exclusif (`radiogroup` : un fond relevé glisse d'un choix à l'autre, jamais en
// cyan) ; « Plage » ouvre un volet de deux dates (revue Impeccable du 2026-10-10 : un audit se fait entre deux jours,
// pas seulement « depuis 7 jours »). « CSV » écrit toutes les entrées des filtres posés dans un fichier
// (journal-csv.ts), lues par le store ; ici, le fichier remis au navigateur et le résultat dit à côté du bouton (il
// n'était dit qu'au lecteur d'écran : un export raté passait inaperçu).
import { CalendarRange, Check, Download, Search as SearchIcon, TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { localDay, PERIOD_LABEL, PERIODS, rangeLabel } from "../../state/journal";
import type { Period } from "../../state/journal";
import { useStore } from "../../state/store";
import { radioKeys, useThumb } from "./shared";

const SEARCH_DELAY = 250; // ms
const SAID_MS = 6000; // un export réussi se dit, puis s'efface ; un échec reste jusqu'au geste suivant
type Said = { tone: "ok" | "warn" | "error" | "busy"; text: string } | null;

/** Le volet de la plage : deux dates (bornes comprises), « Appliquer », Échap ou un clic dehors referment. */
function RangePanel({ from, to, onApply, onClose }: { from: string; to: string; onApply: (from: string, to: string) => void; onClose: () => void }) {
  const [a, setA] = useState(from), [b, setB] = useState(to);
  const box = useRef<HTMLFormElement>(null), first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const away = (event: PointerEvent): void => { if (box.current && !box.current.contains(event.target as Node) && !(event.target as HTMLElement).closest(".j-range-open")) onClose(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const bad = !!a && !!b && a > b, note = "j-range-note-" + useId().replace(/:/g, "");
  const ready = (!!a || !!b) && !bad && (!a || !!localDay(a)) && (!b || !!localDay(b));
  return (
    <form ref={box} className="j-range" aria-label="plage de dates" onSubmit={(event) => { event.preventDefault(); if (ready) onApply(a, b); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      <label><span>Du</span><input ref={first} type="date" value={a} max={b || undefined} onChange={(event) => setA(event.target.value)} /></label>
      <label><span>Au</span><input type="date" value={b} min={a || undefined} aria-invalid={bad ? "true" : undefined} aria-describedby={note} onChange={(event) => setB(event.target.value)} /></label>
      <p id={note} className={"j-range-note" + (bad ? " bad" : "")} role={bad ? "alert" : undefined}>{bad ? "La fin précède le début." : "Jours compris, en heure locale ; une borne seule suffit."}</p>
      <div className="j-range-actions">
        <button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-primary" aria-disabled={ready ? undefined : "true"}>Appliquer</button>
      </div>
    </form>
  );
}

export function Tools() {
  const { state, commands } = useStore();
  const f = state.view.journal;
  const [text, setText] = useState(f.q);
  const [focused, setFocused] = useState(false);
  const [ranging, setRanging] = useState(false);
  const input = useRef<HTMLInputElement>(null), rangeButton = useRef<HTMLButtonElement>(null);
  const period = useThumb<HTMLDivElement>(f.period + f.from + f.to);
  const [said, setSaid] = useState<Said>(null);
  const exporting = said?.tone === "busy";
  useEffect(() => {
    if (!said || said.tone === "error" || said.tone === "busy") return undefined;
    const timer = setTimeout(() => setSaid(null), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);
  const exportCsv = async (): Promise<void> => {
    if (exporting) return;
    setSaid({ tone: "busy", text: "export en cours…" });
    const result = await commands.exportJournal();
    if (!result.ok) { setSaid({ tone: "error", text: "Export impossible : " + result.message }); return; }
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = result.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const n = result.count + (result.count > 1 ? " entrées exportées" : " entrée exportée");
    setSaid(result.truncated ? { tone: "warn", text: n + " (limite atteinte : affinez les filtres)" } : { tone: "ok", text: n });
  };
  const dialogs = useRef(false); // un dialogue ouvert (menu, palette des types, accueil) garde le clavier
  dialogs.current = state.menuOpen || state.colorsOpen || state.connectOpen;
  useEffect(() => { setText(f.q); }, [f.q]); // l'adresse modifiée à la main, ou « Effacer les filtres »
  useEffect(() => {
    if (text === f.q) return;
    const timer = setTimeout(() => commands.setJournal({ q: text }), SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [text, f.q, commands]);
  useEffect(() => { // `/` ou Ctrl+K : la recherche du journal
    const onKey = (event: KeyboardEvent): void => {
      const el = event.target as HTMLElement | null;
      const typing = !!el && (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable);
      if (dialogs.current) return;
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) { event.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pick = (p: Period): void => { setRanging(false); commands.setJournal({ period: p, from: "", to: "" }); };
  const closeRange = (): void => { setRanging(false); rangeButton.current?.focus(); };
  const radio = (on: boolean) => ({ role: "radio", "aria-checked": on ? "true" : "false", tabIndex: on ? 0 : -1 } as const);
  const range = f.period === "range";
  return (
    <div className="j-tools">
      <label className="j-search">
        <SearchIcon aria-hidden="true" />
        <input ref={input} type="search" value={text} spellCheck={false} placeholder="équipement, groupe, auteur, note…" aria-label="rechercher dans le journal"
          aria-keyshortcuts="/ Control+K" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape" && text) { event.preventDefault(); event.stopPropagation(); setText(""); commands.setJournal({ q: "" }); } }} />
        {text ? <button type="button" className="j-clear" title="vider (Échap)" aria-label="vider la recherche" onClick={() => { setText(""); commands.setJournal({ q: "" }); input.current?.focus(); }}><X /></button>
          : !focused ? <kbd className="j-kbd" aria-hidden="true">/</kbd> : null}
      </label>
      <div className="j-period-box">
        <div className="j-period j-choices" ref={period} role="radiogroup" aria-label="période" onKeyDown={radioKeys}>
          {PERIODS.map((p) => <button key={p} type="button" {...radio(f.period === p)} onClick={() => pick(p)}>{PERIOD_LABEL[p]}</button>)}
          <button ref={rangeButton} type="button" className="j-range-open" {...radio(range)} aria-haspopup="dialog" aria-expanded={ranging ? "true" : "false"}
            onClick={() => setRanging((open) => !open)} title="entre deux dates">
            <CalendarRange aria-hidden="true" />{range ? rangeLabel(f.from, f.to, Date.now()) : PERIOD_LABEL.range}
          </button>
        </div>
        {ranging ? <RangePanel from={f.from} to={f.to} onClose={closeRange}
          onApply={(from, to) => { commands.setJournal({ period: "range", from, to }); closeRange(); }} /> : null}
      </div>
      <button type="button" className="j-export" onClick={() => { void exportCsv(); }} aria-disabled={exporting ? "true" : undefined} title="exporter les entrées filtrées en CSV">
        <Download aria-hidden="true" />{exporting ? "Export…" : "CSV"}
      </button>
      <span className={"j-said" + (said ? " tone-" + said.tone : "")} aria-live="polite" role="status" title={said && said.tone !== "busy" ? said.text : undefined}>
        {said && said.tone === "ok" ? <Check aria-hidden="true" /> : said && (said.tone === "error" || said.tone === "warn") ? <TriangleAlert aria-hidden="true" /> : null}
        {said ? said.text : ""}
      </span>
    </div>
  );
}
