// Le choix de la langue : un choix exclusif dont chaque option est écrite dans sa propre langue (« English » se lit
// sans lire le français). Une préférence du navigateur (state/prefs.ts) : rien dans l'adresse, un lien partagé reste
// le même d'une langue à l'autre. Dans le menu et sur l'accueil (le menu est derrière l'accueil tant qu'il est ouvert).
import { useTranslation } from "react-i18next";
import { LANGUAGES, LANGUAGE_NAMES } from "../../i18n";
import type { Language } from "../../i18n";
import { useStore } from "../state/store";
import { Segmented } from "../ui/inspector";

export function LanguageSwitch() {
  const { commands } = useStore();
  const { t, i18n } = useTranslation();
  const options = LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value], lang: value }));
  return (
    <div className="language-switch">
      <span className="language-label">{t("language.label")}</span>
      <Segmented<Language> label={t("language.label")} options={options} value={i18n.language as Language} onPick={(language) => commands.setPrefs({ language })} />
    </div>
  );
}
