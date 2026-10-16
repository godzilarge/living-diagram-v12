// The diagram shell's words built from its state: a collection in full ("19 Jan 2026, 02:00") and as a word on the
// band ("19 Jan"), its status, the band's runs and the "compare with" choices, the "changes" button and its tooltip,
// the Check count, the parts of a run that could not be read, why the page has no diagram. Every sentence comes from
// the catalogue, values interpolated, never assembled here.
import type { Model } from "@engine/canvas/types";
import type { Missing, RunEntry } from "../api/run";
import type { Translate } from "../i18n";
import type { Tone, RunBandItem, SelectOption } from "../ui";
import type { DiagramState } from "../state/diagram";
import type { DiffFacts } from "../state/diff-facts";
import type { BandRun } from "../state/runs";
import { dateAndClock, dayMonth } from "../state/time";
import type { Cause } from "../state/useHome";

const STATUSES = ["completed", "partial", "failed", "running"] as const;
type StatusKey = (typeof STATUSES)[number] | "unknown";

const statusKey = (status: string): StatusKey => ((STATUSES as readonly string[]).includes(status) ? (status as StatusKey) : "unknown");

export function statusWords(t: Translate, status: string): string {
  return t(`diagram:band.status.${statusKey(status)}`);
}

/** "19 Jan 2026, 02:00": a collection's start, as the run choice and the band's tooltips say it. */
export function runWords(t: Translate, iso: string): string {
  const { date, time } = dateAndClock(iso, t("ui:locale"));
  return date ? t("diagram:context.runWords", { date, time }) : iso;
}

/** The run choice's options: the latest first. */
export function runOptions(t: Translate, runs: readonly RunEntry[]): SelectOption[] {
  return [...runs].reverse().map((run) => ({ value: run.run_id, label: runWords(t, run.run_start) }));
}

export function bandItems(t: Translate, band: readonly BandRun[], now: number): RunBandItem[] {
  const locale = t("ui:locale");
  return band.map(({ run, current, compared }) => {
    const values = { date: runWords(t, run.run_start), status: statusWords(t, run.run_status) };
    return {
      id: run.run_id,
      label: dayMonth(run.run_start, locale, now) || run.run_id,
      tooltip: compared ? t("diagram:band.comparedRun", values) : t("diagram:band.run", values),
      current,
      compared,
    };
  });
}

/** "Compare with…": none first, then every earlier run as a day, the latest first. */
export function compareOptions(t: Translate, choices: readonly RunEntry[], now: number): SelectOption[] {
  const locale = t("ui:locale");
  return [{ value: "", label: t("diagram:band.none") }, ...choices.map((run) => ({ value: run.run_id, label: dayMonth(run.run_start, locale, now) || run.run_id }))];
}

/** The "changes" button: the engine's total, and in its tooltip every part of it that is not zero, since the compared
 *  run ("1 device, 5 cables, 1 HA cluster, 1 check appeared, 1 coverage change, 1 reboot since 12 Jan"). */
export function changesWords(t: Translate, facts: DiffFacts, now: number): Readonly<{ label: string; tooltip: string }> {
  const date = dayMonth(facts.since, t("ui:locale"), now);
  const label = t("diagram:context.changes", { count: facts.total });
  if (facts.total === 0 || facts.parts.length === 0) return { label, tooltip: t("diagram:context.noChange", { date }) };
  const parts = facts.parts.map(({ part, count }) => t(`diagram:context.parts.${part}`, { count })).join(t("diagram:context.partsJoin"));
  return { label, tooltip: t("diagram:context.changesDetail", { parts, date }) };
}

export type CheckCount = Readonly<{ count: number; tone: Tone; label: string }>;

/** The count next to Check: the open errors in red, else the warnings in amber, nothing at zero. */
export function checkCount(t: Translate, model: Pick<Model, "severityCounts"> | null): CheckCount | null {
  const errors = model?.severityCounts.get("error") ?? 0;
  if (errors > 0) return { count: errors, tone: "error", label: t("diagram:views.errors", { count: errors }) };
  const warnings = model?.severityCounts.get("warning") ?? 0;
  if (warnings > 0) return { count: warnings, tone: "warning", label: t("diagram:views.warnings", { count: warnings }) };
  return null;
}

/** "Not read with this collection: the ingestion report, the memorized placement." */
export function missingWords(t: Translate, missing: readonly Missing[]): string {
  return t("diagram:state.missingSaid", { parts: missing.map((part) => t(`diagram:state.missing.${part}`)).join(", ") });
}

export function causeWords(t: Translate, cause: Cause): string {
  if (cause === "unreachable") return t("diagram:state.unreachable");
  if (cause === "invalid") return t("diagram:state.invalid");
  return t("diagram:state.failed", { status: cause });
}

/** What the page shows in place of the diagram: the token to type, a sentence, or nothing (the diagram). */
export type Blocked = Readonly<{ kind: "token"; refused: boolean }> | Readonly<{ kind: "sentence"; text: string }>;

export function blockedOf(t: Translate, state: Pick<DiagramState, "token" | "run" | "runs" | "runsCause">): Blocked | null {
  if (state.token !== "present") return { kind: "token", refused: state.token === "refused" };
  if (state.run.kind === "failed") return { kind: "sentence", text: causeWords(t, state.run.cause) };
  if (state.runs === null && state.runsCause !== null) return { kind: "sentence", text: causeWords(t, state.runsCause) };
  if (state.runs !== null && state.runs.length === 0) return { kind: "sentence", text: t("diagram:state.noRuns") };
  return null;
}
