// A widget's own choice (DESIGN.md, Widget header): the settings icon button, last in the header, opens a popover
// under the header with one row of rail buttons, as the settings popover draws them: "Show the last 6 · 12 · 25 · 50
// · 100 collections". The value is a browser preference (`ld-prefs`), never an intent, never in the address.
import { SlidersHorizontal } from "lucide-react";
import { IconButton, Popover } from "../ui";
import { useText } from "../i18n";
import { ChoiceRow } from "../shell/PrefsControls";

export type WidgetSettingsProps = {
  /** The widget's name: the popover's measurement name and the row's id. */
  name: string;
  choices: readonly number[];
  value: number;
  /** What the rows are ("collections"). */
  after: string;
  onChange: (value: number) => void;
};

export function WidgetSettings({ name, choices, value, after, onChange }: WidgetSettingsProps) {
  const t = useText();
  const label = t("home:settings.label");
  return (
    <Popover
      name={`${name}-settings`}
      label={label}
      trigger={(props) => <IconButton {...props} label={label} icon={<SlidersHorizontal />} tooltipPlacement="bottom-end" />}
    >
      <div className="prefs" data-layout="inline">
        <ChoiceRow
          id={`${name}-rows`}
          label={t("home:settings.showLast")}
          choices={choices.map((choice) => ({ value: String(choice), label: String(choice) }))}
          value={String(value)}
          after={after}
          onPick={(picked) => onChange(Number(picked))}
        />
      </div>
    </Popover>
  );
}
