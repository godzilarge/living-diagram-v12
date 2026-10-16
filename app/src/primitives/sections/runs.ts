// Three runs of the sample infrastructure, their dates written in the page's language (Intl, UTC: deterministic).
import { useText } from "../../i18n";
import type { SelectOption } from "../../ui";

const RUN_DATES = ["2026-01-05T02:00:00Z", "2026-01-12T02:00:00Z", "2026-01-19T02:00:00Z"];

export function useRuns(): readonly SelectOption[] {
  const t = useText();
  const format = new Intl.DateTimeFormat(t("ui:locale"), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return RUN_DATES.map((iso) => ({ value: iso, label: format.format(new Date(iso)) }));
}
