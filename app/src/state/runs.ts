// The archived collections of an infrastructure as the shell walks them (the v1's `shell/timeline.ts` rules): in the
// order of their start, the current one marked, the one it is compared with marked "compared". Stepping right compares
// to the run one leaves; stepping left, or opening a run from the band, compares to the run before the target;
// "compare with" picks any earlier run, or none. The address carries `from` once a run is open; a run named without it
// opens compared with the run before it (`useDiagram`, unlike the v1). Pure, tested under Node.
import type { RunEntry } from "../api/run";

export type Target = Readonly<{ runId: string; from: string }>;

export const indexOf = (runs: readonly RunEntry[], runId: string): number => runs.findIndex((run) => run.run_id === runId);
export const previousOf = (runs: readonly RunEntry[], runId: string): RunEntry | null => {
  const at = indexOf(runs, runId);
  return at > 0 ? runs[at - 1] : null;
};
export const nextOf = (runs: readonly RunEntry[], runId: string): RunEntry | null => {
  const at = indexOf(runs, runId);
  return at >= 0 && at + 1 < runs.length ? runs[at + 1] : null;
};
const previousId = (runs: readonly RunEntry[], runId: string): string => previousOf(runs, runId)?.run_id ?? "";

/** The latest run, compared with the one before it: what one sees on arrival. */
export const latestTarget = (runs: readonly RunEntry[]): Target | null => {
  const last = runs[runs.length - 1];
  return last ? { runId: last.run_id, from: previousId(runs, last.run_id) } : null;
};

/** A run opened from the band: compared with the run before it. */
export const openTarget = (runs: readonly RunEntry[], runId: string): Target | null =>
  indexOf(runs, runId) < 0 ? null : { runId, from: previousId(runs, runId) };

/** One step from the current run: right compares to the run one leaves, left to the run before the target. */
export function stepTarget(runs: readonly RunEntry[], current: string, direction: -1 | 1): Target | null {
  const at = indexOf(runs, current);
  const target = at < 0 ? undefined : runs[at + direction];
  if (!target) return null;
  return { runId: target.run_id, from: direction > 0 ? current : previousId(runs, target.run_id) };
}

export type BandRun = Readonly<{ run: RunEntry; current: boolean; compared: boolean }>;

/** The band's runs: shown only when there are at least two (an island hides when it has nothing to say). */
export const bandOf = (runs: readonly RunEntry[], current: string, from: string): readonly BandRun[] =>
  runs.length < 2 ? [] : runs.map((run) => ({ run, current: run.run_id === current, compared: run.run_id === from }));

/** The runs "compare with" offers: every run before the current one, the latest first. */
export const compareChoices = (runs: readonly RunEntry[], current: string): readonly RunEntry[] => {
  const at = indexOf(runs, current);
  return at <= 0 ? [] : runs.slice(0, at).reverse();
};
