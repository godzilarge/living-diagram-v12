// The views island (design/comps/shell/index.html, `.views`): the view strip (Diagram; Check with its open errors,
// else warnings, in the state colour; Log), then the layer choice L1 / L2 / L3. The current view carries the rail;
// Check, L2 and L3 come with later bricks: disabled, their tooltip says so.
import type { Model } from "@engine/canvas/types";
import { Button, Island, Rail, Separator } from "../ui";
import { useText } from "../i18n";
import type { ViewMode } from "../state/address";
import { checkCount } from "./words";

export function ViewsIsland({ model, value, onView }: { model: Model | null; value: ViewMode; onView: (mode: ViewMode) => void }) {
  const t = useText();
  const count = checkCount(t, model);
  return (
    <Island name="views" layout="strip">
      <Rail
        name="view"
        label={t("diagram:views.label")}
        value={value}
        onChange={(mode) => onView(mode as ViewMode)}
        items={[
          { id: "diagram", label: t("diagram:views.diagram") },
          {
            id: "control",
            label: t("diagram:views.control"),
            disabled: true,
            disabledReason: t("diagram:views.controlSoon"),
            ...(count ? { count: count.count, countTone: count.tone, countLabel: count.label } : {}),
          },
          { id: "journal", label: t("diagram:views.journal") },
        ]}
      />
      <Separator />
      <div className="diagram-layers" role="group" aria-label={t("diagram:views.layer")} data-bar="layers">
        <Button pressed>{t("diagram:views.l1")}</Button>
        <Button pressed={false} disabled tooltip={t("diagram:views.l2Soon")}>
          {t("diagram:views.l2")}
        </Button>
        <Button pressed={false} disabled tooltip={t("diagram:views.l3Soon")}>
          {t("diagram:views.l3")}
        </Button>
      </div>
    </Island>
  );
}
