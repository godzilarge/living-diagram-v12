// The coverage of the collection (design/comps/shell/control.html, the right column's first widget): the devices in
// scope as the header's count, a band of facts (in scope, answered, partial, unreachable; failed when there is one),
// then one row per device: its collection (a mark and its word) and one mark per topic (grey collected, the warning
// mark failed, hollow not asked), 32 px rows under a 28 px head (the mockup's `.mini`). Device and collection sort
// (transient); the snapshot's order by default. A tile of Check's grid: its header moves it, its last button enlarges it.
import { useMemo, useState } from "react";
import type { Model } from "@engine/canvas/types";
import { Facts, Mark, Table, Widget, Zero } from "../ui";
import type { Column, Fact, Sort, WidgetEnlarge } from "../ui";
import { useText } from "../i18n";
import { Note } from "../shell/Note";
import type { Translate } from "../i18n";
import { coverageFacts, coverageRows, sortCoverage, TOPIC_TONE, TOPICS } from "../state/control";
import type { CoverageFacts, CoverageRow, CoverageSort } from "../state/control";
import { collectionWords, topicSaid, topicWords } from "./words";

function columns(t: Translate): Column[] {
  return [
    { key: "device", label: t("control:coverage.columns.device"), cut: true, sortable: true },
    { key: "collection", label: t("control:coverage.columns.collection"), sortable: true },
    ...TOPICS.map((topic): Column => ({ key: topic, label: topicWords(t, topic), align: "center", fit: true })),
  ];
}

function rowOf(t: Translate, row: CoverageRow) {
  const topics = Object.fromEntries(TOPICS.map((topic) => [topic, <Mark key={topic} tone={TOPIC_TONE[row.topics[topic]]} said={topicSaid(t, topic, row.topics[topic])} />]));
  return { id: row.hostname, cells: { device: row.hostname, collection: <Mark tone={row.tone}>{collectionWords(t, row.status)}</Mark>, ...topics } };
}

/** A count in the band: in its state with its mark, a zero quiet. */
const stateCount = (value: number, tone: "warning" | "error") => (value ? <Mark tone={tone}>{value}</Mark> : <Zero />);

function bandFacts(t: Translate, facts: CoverageFacts): Fact[] {
  return [
    { label: t("control:coverage.facts.scope"), value: t("control:coverage.facts.scopeValue", { count: facts.scope }) },
    { label: t("control:coverage.facts.answered"), value: String(facts.answered) },
    { label: t("control:coverage.facts.partial"), value: stateCount(facts.partial, "warning") },
    { label: t("control:coverage.facts.unreachable"), value: stateCount(facts.unreachable, "error") },
    ...(facts.failed ? [{ label: t("control:coverage.facts.failed"), value: stateCount(facts.failed, "error") }] : []),
  ];
}

export function CoverageWidget({ model, enlarge }: { model: Model; enlarge: WidgetEnlarge }) {
  const t = useText();
  const rows = useMemo(() => coverageRows(model.coverage), [model]);
  const facts = useMemo(() => coverageFacts(model.coverage), [model]);
  const [sort, setSort] = useState<CoverageSort | null>(null);
  const shown = sortCoverage(rows, sort);
  return (
    <Widget
      name="coverage"
      heading={t("control:coverage.title")}
      count={model.coverage.length}
      handle
      enlarge={enlarge}
      band={<Facts label={t("control:coverage.facts.label")} layout="strip" items={bandFacts(t, facts)} />}
    >
      {rows.length === 0 ? (
        <Note>{t("control:coverage.empty")}</Note>
      ) : (
        <Table
          label={t("control:coverage.title")}
          columns={columns(t)}
          rows={shown.map((row) => rowOf(t, row))}
          sort={sort ?? undefined}
          onSort={(next: Sort) => setSort(next as CoverageSort)}
          density="compact"
        />
      )}
    </Widget>
  );
}
