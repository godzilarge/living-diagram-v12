// The filter in a widget's header (DESIGN.md, Widget header): the segmented choice over the list's states, each
// segment with its count. A segment at zero stays a choice: the list then says that nothing matches.
import { Segmented } from "../ui";
import { useText } from "../i18n";
import type { StatusFilter as Filter } from "../state/home";

export type StatusFilterProps = {
  name: string;
  label: string;
  filters: readonly Filter[];
  counts: Readonly<Record<string, number>>;
  value: Filter;
  onChange: (value: Filter) => void;
};

export function StatusFilter({ name, label, filters, counts, value, onChange }: StatusFilterProps) {
  const t = useText();
  const options = filters.map((filter) => {
    const words = t(`home:filter.${filter}`);
    const count = counts[filter] ?? 0;
    return { value: filter, label: words, count, said: t("home:filter.said", { label: words, value: count }) };
  });
  return <Segmented name={name} label={label} options={options} value={value} onChange={(next) => onChange(next as Filter)} />;
}
