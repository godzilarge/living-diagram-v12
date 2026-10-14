// Une ligne pour la zone live de l'application : ce qui vient d'être sélectionné, pour un lecteur d'écran, dans la
// langue de la page (2026-10-10, lot 8 de la langue ; `/view` garde la sienne, en français, dans `shell/inspect.ts`).
import { KIND_LABEL as ANNOTATION_KIND } from "../../canvas/annotations";
import { haModeText } from "../../canvas/format";
import { beamLabel, clusterLabel } from "../../canvas/geometry";
import { aggregateOf, beamOf, clusterOf, endLabel, entityOf } from "../../canvas/model";
import type { Model, Selection } from "../../canvas/types";
import { t } from "../../i18n";
import { counts, kindsOf, size } from "./selection";
import type { Multi } from "./selection";

function labelOf(model: Model, selection: Selection): string {
  switch (selection.kind) {
    case "link": { const link = model.linkById.get(selection.id); return link ? endLabel(link.a) + " ↔ " + endLabel(link.b) : ""; }
    case "node": return selection.id;
    case "aggregate": { const agg = aggregateOf(model, selection); return agg ? agg.hostname + " · " + agg.name : ""; }
    case "beam": { const beam = beamOf(model, selection); return beam ? beamLabel(beam, true) : ""; }
    case "group": { const group = model.groupById.get(selection.id); return group ? group.label : ""; }
    case "annotation": { const a = model.annotationById.get(selection.id); return a ? ANNOTATION_KIND[a.content.kind] || a.content.kind : ""; }
    case "connector": { const c = model.connectorById.get(selection.id); return c ? c.label || c.id : ""; }
    default: { const cluster = clusterOf(model, selection); return cluster ? clusterLabel(cluster, haModeText) : ""; }
  }
}

/** Une sélection mixte en mots : « 2 équipements, 1 annotation ». */
export function itemsText(multi: Multi): string {
  const n = counts(multi);
  return kindsOf(multi).map((kind) => t(`shell:items.${kind}`, { count: n[kind] })).join(", ");
}

export function describe(model: Model, selection: Selection | null, multi?: Multi): string {
  if (!selection && multi && size(multi) >= 2) return t("shell:live.many", { items: itemsText(multi) });
  if (!selection || !entityOf(model, selection)) return "";
  return t("shell:live.selected", { kind: t(("shell:live.kind." + selection.kind) as never), label: labelOf(model, selection) });
}
