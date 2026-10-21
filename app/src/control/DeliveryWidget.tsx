// Delivery (design/comps/shell/control.html): where the collection comes from and what B1 made of it, the collection's
// day as the header's caption: the exporter, the contract, when the archive received it, the devices, the findings of
// the input contract, the normalizations, the descriptions left unread, the neighbours left unresolved; a fact the
// data does not say is left out. "Ingestion report" waits for the bench: disabled.
import { FileText } from "lucide-react";
import type { Model } from "@engine/canvas/types";
import type { RunEntry } from "../api/run";
import { Facts, IconButton, Widget } from "../ui";
import { useText } from "../i18n";
import { deliveryOf } from "../state/control";
import { dayMonth } from "../state/time";
import { deliveryFacts } from "./words";

export function DeliveryWidget({ model, runs, runId, now }: { model: Model; runs: readonly RunEntry[] | null; runId: string; now: number }) {
  const t = useText();
  const delivery = deliveryOf(model, runs, runId);
  const day = dayMonth(delivery.runStart, t("ui:locale"), now);
  return (
    <Widget
      name="delivery"
      heading={t("control:delivery.title")}
      count={day || undefined}
      action={<IconButton label={t("control:delivery.report")} icon={<FileText />} disabled disabledReason={t("control:soon")} tooltipPlacement="bottom-end" />}
    >
      <Facts label={t("control:delivery.label")} items={deliveryFacts(t, delivery)} />
    </Widget>
  );
}
