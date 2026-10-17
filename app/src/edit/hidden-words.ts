// The words of a row of the hidden devices' menu (DESIGN.md, Edit palette): one row per rule of the view, as the
// gesture that wrote it. An exact rule (H on a selection) says its names, as written: one, two or three joined by a
// comma, past three the first two "and N others"; an expression (the search, or the address by hand) says itself and
// the devices of the run it keeps out ("ADMIN · 50 devices", "· no device" when it keeps none out); the isolation says
// so ("Isolated: core · 12 hidden"). Every sentence comes from the catalogue, values interpolated.
import type { Translate } from "../i18n";
import type { HiddenRule } from "../state/hidden";

const SHOWN = 3;

/** The names of an exact rule as the row says them: all of them up to three, else the first two and the rest counted. */
function namesWords(t: Translate, names: readonly string[]): string {
  if (names.length <= SHOWN) return names.join(", ");
  return t("edit:palette.hiddenOthers", { names: names.slice(0, 2).join(", "), count: names.length - 2 });
}

/** The rule as the row names it: its names for an exact rule, the expression as written otherwise. */
const ruleWords = (t: Translate, row: HiddenRule): string => (row.named ? namesWords(t, row.named) : row.rule);

/** A row's label: the names of an exact rule, an expression with its count, or the isolation with what it hides. */
export function hiddenRuleWords(t: Translate, row: HiddenRule): string {
  const rule = ruleWords(t, row);
  const count = row.hosts.length;
  if (row.kind === "only") return t("edit:palette.hiddenIsolated", { rule, count });
  if (row.named) return rule;
  return count ? t("edit:palette.hiddenRuleCount", { rule, count }) : t("edit:palette.hiddenRuleNone", { rule });
}
