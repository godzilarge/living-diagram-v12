// Three runs of the sample infrastructure, their dates written in the page's language (Intl, UTC: deterministic).
import { useText } from "../../i18n";
import type { RunBandItem, SelectOption } from "../../ui";

const RUN_DATES = ["2026-01-05T02:00:00Z", "2026-01-12T02:00:00Z", "2026-01-19T02:00:00Z"];

export function useRuns(): readonly SelectOption[] {
  const t = useText();
  const format = new Intl.DateTimeFormat(t("ui:locale"), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return RUN_DATES.map((iso) => ({ value: iso, label: format.format(new Date(iso)) }));
}

/** The same runs on the band: the last one current, the one before it compared. */
export function useBandRuns(): readonly RunBandItem[] {
  const t = useText();
  const day = new Intl.DateTimeFormat(t("ui:locale"), { day: "numeric", month: "short", timeZone: "UTC" });
  const full = new Intl.DateTimeFormat(t("ui:locale"), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const status = t("diagram:band.status.completed");
  return RUN_DATES.map((iso, index) => {
    const compared = index === RUN_DATES.length - 2;
    const values = { date: full.format(new Date(iso)), status };
    return {
      id: iso,
      label: day.format(new Date(iso)),
      tooltip: compared ? t("diagram:band.comparedRun", values) : t("diagram:band.run", values),
      current: index === RUN_DATES.length - 1,
      compared,
    };
  });
}
