// La recherche et la période de la vue Journal. La recherche part 250 ms après la dernière frappe (l'adresse et le
// serveur ne voient pas chaque touche) ; `/` ou Ctrl+K lui donnent le focus, sauf quand un dialogue est ouvert ;
// Échap la vide. « exporter » écrit toutes les entrées des filtres posés dans un fichier CSV (journal-csv.ts), lues par
// le store ; ici, seulement le fichier remis au navigateur. La période est un choix exclusif : un fond relevé qui glisse d'un choix à l'autre (jamais en cyan).
import { Download, Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PERIOD_LABEL, PERIODS } from "../../state/journal";
import { useStore } from "../../state/store";
import { useThumb } from "./shared";

const SEARCH_DELAY = 250; // ms

export function Tools() {
  const { state, commands } = useStore();
  const f = state.view.journal;
  const [text, setText] = useState(f.q);
  const input = useRef<HTMLInputElement>(null);
  const period = useThumb<HTMLDivElement>(f.period);
  const [exporting, setExporting] = useState(false);
  const [said, setSaid] = useState("");
  const exportCsv = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true); setSaid("export en cours…");
    const result = await commands.exportJournal();
    setExporting(false);
    if (!result.ok) { setSaid("export impossible : " + result.message); return; }
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = result.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaid(result.count + (result.count > 1 ? " entrées exportées" : " entrée exportée") + (result.truncated ? " (limite atteinte : affinez les filtres)" : ""));
  };
  const dialogs = useRef(false); // un dialogue ouvert (menu, palette des types, accueil) garde le clavier
  dialogs.current = state.menuOpen || state.colorsOpen || state.connectOpen;
  useEffect(() => { setText(f.q); }, [f.q]); // l'adresse modifiée à la main, ou « effacer les filtres »
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
  return (
    <div className="j-tools">
      <label className="j-search">
        <SearchIcon aria-hidden="true" />
        <input ref={input} type="search" value={text} spellCheck={false} placeholder="équipement, groupe, auteur, texte d'une note…" aria-label="rechercher dans le journal"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape" && text) { event.preventDefault(); event.stopPropagation(); setText(""); commands.setJournal({ q: "" }); } }} />
        {text ? <button type="button" className="j-clear" title="vider (Échap)" aria-label="vider la recherche" onClick={() => { setText(""); commands.setJournal({ q: "" }); input.current?.focus(); }}><X /></button> : null}
      </label>
      <div className="j-period j-choices" ref={period} role="group" aria-label="période">
        {PERIODS.map((p) => <button key={p} type="button" aria-pressed={f.period === p ? "true" : "false"} onClick={() => commands.setJournal({ period: p })}>{PERIOD_LABEL[p]}</button>)}
      </div>
      <button type="button" className="j-export" onClick={() => { void exportCsv(); }} aria-disabled={exporting ? "true" : undefined} title="exporter les entrées filtrées en CSV">
        <Download aria-hidden="true" />{exporting ? "export…" : "CSV"}
      </button>
      <span className="sr-only" aria-live="polite">{said}</span>
    </div>
  );
}

