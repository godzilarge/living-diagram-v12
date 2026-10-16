// The three browser preferences (theme, accent, language) as rows of rail buttons, as the approved mockup draws the
// settings (design/comps/shell/shell-settings-1440.png): the chosen value carries the rail, each accent its swatch.
// The settings popover of the shell and the switcher of the primitives page use the same rows.
import { Button } from "../ui";
import type { Language } from "../i18n";
import { useText } from "../i18n";
import type { TextKey } from "../i18n";
import { ACCENTS, THEMES } from "../prefs";
import type { Prefs } from "../prefs";
import "./PrefsControls.css";

/** French first, as in the mockup. */
const LANGUAGE_ORDER: readonly Language[] = ["fr", "en"];

export type PrefsControlsProps = {
  prefs: Prefs;
  language: Language;
  onChange: (prefs: Prefs) => void;
  layout?: "rows" | "inline";
};

type Choice = Readonly<{ value: string; text: TextKey; swatch?: string }>;

function Row({ id, label, choices, value, onPick }: { id: string; label: string; choices: readonly Choice[]; value: string; onPick: (value: string) => void }) {
  const t = useText();
  return (
    <div className="prefs-row">
      <span className="prefs-label" id={`prefs-${id}`}>
        {label}
      </span>
      <div className="prefs-choices" role="group" aria-labelledby={`prefs-${id}`} data-bar={`prefs-${id}`}>
        {choices.map((choice) => (
          <Button
            key={choice.value}
            pressed={choice.value === value}
            icon={choice.swatch ? <span className="prefs-swatch" data-swatch={choice.swatch} /> : undefined}
            onClick={() => onPick(choice.value)}
          >
            {t(choice.text)}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function PrefsControls({ prefs, language, onChange, layout = "rows" }: PrefsControlsProps) {
  const t = useText();
  return (
    <div className="prefs" data-layout={layout}>
      <Row
        id="theme"
        label={t("shell:prefs.theme")}
        choices={THEMES.map((value) => ({ value, text: `shell:prefs.themes.${value}` as const }))}
        value={prefs.theme}
        onPick={(value) => onChange({ ...prefs, theme: value as Prefs["theme"] })}
      />
      <Row
        id="accent"
        label={t("shell:prefs.accent")}
        choices={ACCENTS.map((value) => ({ value, text: `shell:prefs.accents.${value}` as const, swatch: value }))}
        value={prefs.accent}
        onPick={(value) => onChange({ ...prefs, accent: value as Prefs["accent"] })}
      />
      <Row
        id="language"
        label={t("shell:prefs.language")}
        choices={LANGUAGE_ORDER.map((value) => ({ value, text: `shell:prefs.languages.${value}` as const }))}
        value={language}
        onPick={(value) => onChange({ ...prefs, language: value as Language })}
      />
    </div>
  );
}
