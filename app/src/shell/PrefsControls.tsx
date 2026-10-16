// The three browser preferences as segmented choices (theme, accent, language): the settings popover of the shell
// and the switcher of the primitives page use the same rows.
import { Segmented } from "../ui";
import { LANGUAGES } from "../i18n";
import type { Language } from "../i18n";
import { useText } from "../i18n";
import { ACCENTS, THEMES } from "../prefs";
import type { Accent, Prefs, Theme } from "../prefs";
import "./PrefsControls.css";

export type PrefsControlsProps = {
  prefs: Prefs;
  language: Language;
  onChange: (prefs: Prefs) => void;
  layout?: "rows" | "inline";
};

export function PrefsControls({ prefs, language, onChange, layout = "rows" }: PrefsControlsProps) {
  const t = useText();
  const rows = [
    {
      id: "theme",
      label: t("shell:prefs.theme"),
      control: (
        <Segmented
          name="theme"
          label={t("shell:prefs.theme")}
          options={THEMES.map((value) => ({ value, label: t(`shell:prefs.themes.${value}`) }))}
          value={prefs.theme}
          onChange={(value) => onChange({ ...prefs, theme: value as Theme })}
        />
      ),
    },
    {
      id: "accent",
      label: t("shell:prefs.accent"),
      control: (
        <Segmented
          name="accent"
          label={t("shell:prefs.accent")}
          options={ACCENTS.map((value) => ({ value, label: t(`shell:prefs.accents.${value}`) }))}
          value={prefs.accent}
          onChange={(value) => onChange({ ...prefs, accent: value as Accent })}
        />
      ),
    },
    {
      id: "language",
      label: t("shell:prefs.language"),
      control: (
        <Segmented
          name="language"
          label={t("shell:prefs.language")}
          options={LANGUAGES.map((value) => ({ value, label: t(`shell:prefs.languages.${value}`) }))}
          value={language}
          onChange={(value) => onChange({ ...prefs, language: value as Language })}
        />
      ),
    },
  ];
  return (
    <div className="prefs" data-layout={layout}>
      {rows.map((row) => (
        <div key={row.id} className="prefs-row">
          <span className="prefs-label">{row.label}</span>
          {row.control}
        </div>
      ))}
    </div>
  );
}
