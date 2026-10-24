// Cables and sources (design/comps/shell/control.html): the run's cables as the header's count, then one row per
// combination of sources the model knows, the cable's stroke before the sources in words (solid confirmed, dotted
// documented only, dashed observed only), its status in words, its count; 32 px rows (the mockup's `.mini`). A tile of
// Check's grid: its header moves it, its last button enlarges it.
import { useMemo } from "react";
import type { Model } from "@engine/canvas/types";
import { SourceLine, Table, Widget } from "../ui";
import type { Column, WidgetEnlarge } from "../ui";
import { useText } from "../i18n";
import { Note } from "../shell/Note";
import type { Translate } from "../i18n";
import { sourceRows } from "../state/control";
import type { SourceRow } from "../state/control";

function columns(t: Translate): Column[] {
  return [
    { key: "sources", label: t("control:sources.columns.sources") },
    { key: "status", label: t("control:sources.columns.status") },
    { key: "cables", label: t("control:sources.columns.cables"), align: "end", fit: true },
  ];
}

function rowOf(t: Translate, row: SourceRow) {
  return {
    id: row.id,
    cells: {
      sources: (
        <span className="control-quiet">
          <SourceLine kind={row.line}>{t(`control:sources.combo.${row.combo}`)}</SourceLine>
        </span>
      ),
      status: <span className="control-muted">{t(`control:sources.status.${row.status}`)}</span>,
      cables: row.count,
    },
  };
}

export function SourcesWidget({ model, enlarge }: { model: Model; enlarge: WidgetEnlarge }) {
  const t = useText();
  const rows = useMemo(() => sourceRows(model.combos), [model]);
  return (
    <Widget
      name="sources"
      heading={t("control:sources.title")}
      count={model.links.length}
      handle
      enlarge={enlarge}
    >
      {rows.length === 0 ? (
        <Note>{t("control:sources.empty")}</Note>
      ) : (
        <Table label={t("control:sources.title")} columns={columns(t)} rows={rows.map((row) => rowOf(t, row))} density="compact" />
      )}
    </Widget>
  );
}
