// What the context island says of the diff: the engine's own total ("14 changes") and, for its tooltip, every part
// of that total that is not zero, so the number is always accounted for: devices, cables, interfaces, aggregates,
// MLAG domains, HA clusters added, removed or changed; checks appeared and resolved; coverage changed; reboots and
// flaps (`diffCount` in the engine sums exactly these). Nothing without a diff. Pure.
import { DIFF_SECTIONS, diffCount } from "@engine/canvas/model";
import type { Model } from "@engine/canvas/types";

export const DIFF_PARTS = [...DIFF_SECTIONS, "checksAppeared", "checksResolved", "coverage", "rebooted", "flapped"] as const;
export type DiffPart = (typeof DIFF_PARTS)[number];
export type DiffFacts = Readonly<{ total: number; parts: readonly Readonly<{ part: DiffPart; count: number }>[]; since: string }>;

const sum = (part: Readonly<{ added: number; removed: number; changed: number }>): number => part.added + part.removed + part.changed;

export function diffFactsOf(model: Pick<Model, "diff">): DiffFacts | null {
  const diff = model.diff;
  if (!diff) return null;
  const s = diff.summary;
  const counts: Record<DiffPart, number> = {
    nodes: sum(s.nodes), interfaces: sum(s.interfaces), links: sum(s.links), aggregates: sum(s.aggregates), mlag_domains: sum(s.mlag_domains), ha_clusters: sum(s.ha_clusters),
    checksAppeared: s.checks.appeared, checksResolved: s.checks.resolved, coverage: s.coverage.changed, rebooted: s.events.rebooted, flapped: s.events.flapped,
  };
  const parts = DIFF_PARTS.filter((part) => counts[part] > 0).map((part) => ({ part, count: counts[part] }));
  return { total: diffCount(diff), parts, since: diff.before.start_datetime };
}
