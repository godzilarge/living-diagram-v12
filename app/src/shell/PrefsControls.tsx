// The three browser preferences (theme, accent, language) as rows of rail buttons, as the approved mockup draws the
// settings (design/comps/shell/shell-settings-1440.png): the chosen value carries the rail, each accent its swatch.
// The settings popover of the shell, the switcher of the primitives page and the settings of a home widget use the
// same rows (`ChoiceRow`).
import { useId } from "react";
import { Button, Swatch } from "../ui";
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

export type Choice = Readonly<{ value: string; label: string; swatch?: string }>;

export type ChoiceRowProps = {
  id: string;
  /** The words before the choices ("Theme", "Show the last"). */
  label: string;
  choices: readonly Choice[];
  value: string;
  onPick: (value: string) => void;
  /** The words after the choices ("collections"), read with the label as the group's name. */
  after?: string;
};

/** One row of rail buttons: the label, the choices (the chosen one with the rail), optionally the words after them.
 *  The settings of the shell and the settings of a home widget are rows of this. */
export function ChoiceRow({ id, label, choices, value, onPick, after }: ChoiceRowProps) {
  const labelId = `${useId()}-${id}`; // unique: the primitives page shows these rows twice
  return (
    <div className="prefs-row">
      <span className="prefs-label" id={labelId}>
        {label}
      </span>
      <div className="prefs-choices" role="group" aria-labelledby={after ? `${labelId} ${labelId}-after` : labelId} data-bar={`prefs-${id}`}>
        {choices.map((choice) => (
          <Button
            key={choice.value}
            pressed={choice.value === value}
            icon={choice.swatch ? <Swatch swatch={choice.swatch} /> : undefined}
            onClick={() => onPick(choice.value)}
          >
            {choice.label}
          </Button>
        ))}
      </div>
      {after ? (
        <span className="prefs-label prefs-after" id={`${labelId}-after`}>
          {after}
        </span>
      ) : null}
    </div>
  );
}

const choicesOf = (t: (key: TextKey) => string, values: readonly string[], text: (value: string) => TextKey, swatch = false): Choice[] =>
  values.map((value) => ({ value, label: t(text(value)), swatch: swatch ? value : undefined }));

export function PrefsControls({ prefs, language, onChange, layout = "rows" }: PrefsControlsProps) {
  const t = useText();
  return (
    <div className="prefs" data-layout={layout}>
      <ChoiceRow
        id="theme"
        label={t("shell:prefs.theme")}
        choices={choicesOf(t, THEMES, (value) => `shell:prefs.themes.${value as Prefs["theme"]}`)}
        value={prefs.theme}
        onPick={(value) => onChange({ ...prefs, theme: value as Prefs["theme"] })}
      />
      <ChoiceRow
        id="accent"
        label={t("shell:prefs.accent")}
        choices={choicesOf(t, ACCENTS, (value) => `shell:prefs.accents.${value as Prefs["accent"]}`, true)}
        value={prefs.accent}
        onPick={(value) => onChange({ ...prefs, accent: value as Prefs["accent"] })}
      />
      <ChoiceRow
        id="language"
        label={t("shell:prefs.language")}
        choices={choicesOf(t, LANGUAGE_ORDER, (value) => `shell:prefs.languages.${value as Language}`)}
        value={language}
        onPick={(value) => onChange({ ...prefs, language: value as Language })}
      />
    </div>
  );
}
