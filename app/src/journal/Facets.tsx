// The Log's filters (DESIGN.md, Facets), in their island: the infrastructure (exclusive: "All" then each by its name,
// the one of the Diagram said "open"), the categories, the actions, the authors (cumulative). The values never move:
// the server gives them in a fixed order, a count fallen to 0 stays at its place in ink-4, an author of the address
// unknown here stays, removable; during a read or after a failure the last facets read stay.
import { CirclePlus, Ellipsis, Group, Move, Palette, Pencil, Spline, StickyNote, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Facets, IconButton, Island } from "../ui";
import type { FacetGroup } from "../ui";
import { useText } from "../i18n";
import type { JournalFacet, JournalPage } from "../api/journal";
import { ACTIONS, CATEGORIES, filtered, locale } from "../state/journal";
import type { JournalAction, JournalCategory, JournalFilters } from "../state/journal";
import { facetSaid } from "./words";

export const CATEGORY_ICON: Readonly<Record<JournalCategory, ReactNode>> = {
  positions: <Move />,
  colors: <Palette />,
  groups: <Group />,
  annotations: <StickyNote />,
  connectors: <Spline />,
  other: <Ellipsis />,
};
const ACTION_ICON: Readonly<Record<JournalAction, ReactNode>> = { created: <CirclePlus />, modified: <Pencil />, deleted: <Trash2 /> };

const countOf = (facets: readonly JournalFacet[], value: string): number => facets.find((f) => f.value === value)?.count ?? 0;
const toggled = <T extends string>(list: readonly T[], value: T): T[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
const byName = (a: string, b: string): number => a.localeCompare(b, locale(), { sensitivity: "base" });

export type JournalFacetsProps = Readonly<{
  filters: JournalFilters;
  /** The last page read (its facets), null before the first. */
  page: JournalPage | null;
  /** The infrastructure open in the Diagram. */
  current: string;
  onChange: (patch: Partial<JournalFilters>) => void;
  onClearAll: () => void;
}>;

export function JournalFacets({ filters: f, page, current, onChange, onClearAll }: JournalFacetsProps) {
  const t = useText();
  const read = (facets: readonly JournalFacet[] | undefined, value: string): number | null => (page && facets ? countOf(facets, value) : null);
  const scope = f.infrastructure === "*" ? "*" : f.infrastructure || current;
  const infras = page?.infrastructures ?? [];
  const names = [...new Set([...infras.map((i) => i.value), ...(current ? [current] : [])])].sort(byName);
  const all = page ? infras.reduce((n, i) => n + i.count, 0) : null;
  const clear = (title: string, on: boolean, patch: Partial<JournalFilters>) =>
    on ? { label: t("journal:ui.clear"), said: t("journal:ui.clearFilter", { title: title.toLocaleLowerCase(locale()) }), onClear: () => onChange(patch) } : null;
  const shownCategories = CATEGORIES.filter((c) => c !== "other" || (page?.categories.some((x) => x.value === c) ?? false) || f.categories.includes(c));
  const authors = page?.authors ?? [];
  const missing = f.authors.filter((a) => !authors.some((x) => x.value === a));
  const titles = { infrastructure: t("journal:ui.infrastructure"), categories: t("journal:ui.categories"), actions: t("journal:ui.action"), authors: t("journal:ui.authors") };
  const groups: FacetGroup[] = [
    {
      id: "infrastructure",
      title: titles.infrastructure,
      kind: "exclusive",
      value: scope,
      onChange: (value) => onChange({ infrastructure: value === "*" ? "*" : value === current ? "" : value }),
      options: [
        { value: "*", label: t("journal:ui.all"), count: all, said: facetSaid(t, t("journal:ui.all"), all) },
        ...names.map((name) => {
          const note = name === current ? t("journal:ui.open") : undefined;
          return { value: name, label: name, note, count: read(infras, name), said: facetSaid(t, name, read(infras, name), note) };
        }),
      ],
    },
    {
      id: "category",
      title: titles.categories,
      kind: "cumulative",
      value: f.categories,
      onToggle: (value) => onChange({ categories: toggled(f.categories, value as JournalCategory) }),
      clear: clear(titles.categories, f.categories.length > 0, { categories: [] }),
      options: shownCategories.map((c) => {
        const label = t(`journal:category.${c}`);
        return { value: c, label, icon: CATEGORY_ICON[c], count: read(page?.categories, c), said: facetSaid(t, label, read(page?.categories, c)) };
      }),
    },
    {
      id: "action",
      title: titles.actions,
      kind: "cumulative",
      value: f.actions,
      onToggle: (value) => onChange({ actions: toggled(f.actions, value as JournalAction) }),
      clear: clear(titles.actions, f.actions.length > 0, { actions: [] }),
      options: ACTIONS.map((a) => {
        const label = t(`journal:action.${a}`);
        return { value: a, label, icon: ACTION_ICON[a], count: read(page?.actions, a), said: facetSaid(t, label, read(page?.actions, a)) };
      }),
    },
    {
      id: "author",
      title: titles.authors,
      kind: "cumulative",
      value: f.authors,
      onToggle: (value) => onChange({ authors: toggled(f.authors, value) }),
      clear: clear(titles.authors, f.authors.length > 0, { authors: [] }),
      empty: page ? t("journal:ui.noAuthor") : undefined,
      options: [...authors.map((a) => a.value), ...missing].map((name) => {
        const count = page ? countOf(authors, name) : null;
        return { value: name, label: name, avatar: name, count, said: facetSaid(t, name, count) };
      }),
    },
  ];
  const narrowed = filtered(f) || f.infrastructure !== "";
  return (
    <Island name="facets" as="aside" className="journal-facets" aria-label={t("journal:ui.filters")}>
      <header className="journal-island-head" data-bar="facets-head">
        <h2>{t("journal:ui.filtersTitle")}</h2>
        <span className="journal-island-tools">
          <IconButton label={t("journal:ui.clearAll")} icon={<X />} disabled={!narrowed} disabledReason={t("journal:ui.nothingToClear")} onClick={onClearAll} tooltipPlacement="bottom-end" />
        </span>
      </header>
      <div className="journal-facets-body">
        <Facets label={t("journal:ui.filters")} groups={groups} />
      </div>
    </Island>
  );
}
