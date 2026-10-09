// Les facettes de la vue Journal : l'infrastructure (un choix exclusif : « Toutes » puis chacune par son nom, un fond
// relevé qui glisse sous le choix), les catégories et les auteurs (des bascules cumulables : une coche et un fond léger
// de la teinte de la catégorie, jamais le cyan plein). Elles ne bougent jamais (Orhan,
// 2026-10-09 : « les sous-menus bougent selon ce qui est sélectionné ») : le serveur rend toujours les mêmes valeurs
// dans le même ordre (par nom), un compte tombé à 0 est grisé à sa place ; « Autres » est là dès qu'il existe dans le
// journal ; pendant une lecture ou après un échec, les dernières facettes lues restent affichées.
import { Check } from "lucide-react";
import { useRef } from "react";
import type { ReactNode } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "../../state/journal";
import type { JournalFacet, JournalPage } from "../../state/journal";
import { useStore } from "../../state/store";
import { ICON, useThumb } from "./shared";

const countOf = (facets: JournalFacet[], value: string): number => (facets.find((f) => f.value === value) || { count: 0 }).count;
const byName = (a: string, b: string): number => a.localeCompare(b, "fr", { sensitivity: "base" });

/** Le titre d'une section, et « effacer » quand une bascule y est allumée (la rangée a sa hauteur : rien ne bouge). */
function Head({ title, onClear }: { title: string; onClear: (() => void) | null }) {
  return (
    <div className="j-side-head"><h2>{title}</h2>
      {onClear ? <button type="button" className="j-reset" onClick={onClear} aria-label={"effacer le filtre " + title.toLowerCase()}>effacer</button> : null}
    </div>
  );
}

export function Facets() {
  const { state, commands } = useStore();
  const f = state.view.journal;
  const live = state.journal.kind === "ready" || state.journal.kind === "loading" ? state.journal.page : null;
  const last = useRef<JournalPage | null>(null);
  if (live) last.current = live;
  const page = live || last.current;
  const current = state.address.infrastructure;
  const scope = f.infrastructure === "*" ? "*" : f.infrastructure || current;
  const infras = page ? page.infrastructures : [];
  // « Toutes » d'abord, puis chaque infrastructure par son nom, au même retrait ; celle qu'on regarde porte un point.
  const names = Array.from(new Set(infras.map((i) => i.value).concat(current ? [current] : []))).sort(byName);
  const thumb = useThumb<HTMLUListElement>(scope + "|" + names.join("\n"));
  const toggleIn = <T extends string>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : list.concat(value));
  const facetButton = (pressed: boolean, label: ReactNode, count: number | null, onClick: () => void, key: string, extra = "", title?: string): ReactNode => (
    <li key={key}><button type="button" className={"j-facet " + extra + (count === 0 && !pressed ? " zero" : "")} aria-pressed={pressed ? "true" : "false"} onClick={onClick} title={title}>
      <span className="j-facet-label">{label}</span>{extra.includes("j-toggle") ? <Check className="j-check" aria-hidden="true" /> : null}
      <span className="sr-only"> : </span><span className="j-facet-count">{count === null ? "" : count}</span>
    </button></li>
  );
  const name = (text: string): ReactNode => <span className="j-facet-text">{text}</span>;
  const authors = page ? page.authors : [];
  const missing = f.authors.filter((a) => !authors.some((x) => x.value === a)); // un auteur de l'adresse inconnu ici reste retirable
  const shown = CATEGORIES.filter((c) => c !== "other" || (page && page.categories.some((x) => x.value === c)) || f.categories.includes(c));
  const infraLabel = (value: string): ReactNode => (value === current
    ? <>{name(value)}<span className="j-here" title="ouverte dans le Diagramme" /><span className="sr-only"> (ouverte)</span></> : name(value));
  return (
    <aside className="j-side" aria-label="filtres du journal">
      <section>
        <Head title="Infrastructure" onClear={null} />
        <ul className="j-choices" ref={thumb}>
          {facetButton(scope === "*", name("Toutes"), page ? infras.reduce((n, i) => n + i.count, 0) : null, () => commands.setJournal({ infrastructure: "*" }), "all", "choice")}
          {names.map((value) => facetButton(scope === value, infraLabel(value), page ? countOf(infras, value) : null,
            () => commands.setJournal({ infrastructure: value === current ? "" : value }), "i-" + value, "choice", value))}
        </ul>
      </section>
      <section>
        <Head title="Catégories" onClear={f.categories.length ? () => commands.setJournal({ categories: [] }) : null} />
        <ul>{shown.map((c) => facetButton(
          f.categories.includes(c), <><span className={"j-cat cat-" + c}>{ICON[c]}</span>{name(CATEGORY_LABEL[c])}</>, page ? countOf(page.categories, c) : null,
          () => commands.setJournal({ categories: toggleIn(f.categories, c) }), c, "j-toggle cat-" + c))}</ul>
      </section>
      <section>
        <Head title="Auteurs" onClear={f.authors.length ? () => commands.setJournal({ authors: [] }) : null} />
        {authors.length || missing.length ? <ul>
          {authors.map((a) => facetButton(f.authors.includes(a.value), name(a.value), a.count, () => commands.setJournal({ authors: toggleIn(f.authors, a.value) }), "a-" + a.value, "j-toggle", a.value))}
          {missing.map((a) => facetButton(true, name(a), 0, () => commands.setJournal({ authors: toggleIn(f.authors, a) }), "m-" + a, "j-toggle", a))}
        </ul> : <p className="j-empty-facet">{page ? "aucun" : "…"}</p>}
      </section>
    </aside>
  );
}
