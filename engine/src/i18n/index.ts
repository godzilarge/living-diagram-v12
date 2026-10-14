// La langue de l'application : le noyau (`core.ts`, `common` en français, sans React), plus les espaces de
// l'application (`shell`, `panel`, `journal`, `checks`) et l'anglais. React lit l'instance par
// `I18nextProvider` (App.tsx), pas par le greffon global : le noyau reste sans React pour `/view`.
import { addLanguage, browserLanguages, effectiveLanguage, setLanguage } from "./core";
import type { Language } from "./core";
import enCommon from "./locales/en/common.json";
import frPanel from "./locales/fr/panel.json";
import frShell from "./locales/fr/shell.json";
import enPanel from "./locales/en/panel.json";
import enShell from "./locales/en/shell.json";
import frJournal from "./locales/fr/journal.json";
import enJournal from "./locales/en/journal.json";
import frChecks from "./locales/fr/checks.json";
import enChecks from "./locales/en/checks.json";

addLanguage("fr", { shell: frShell, panel: frPanel, journal: frJournal, checks: frChecks });
addLanguage("en", { common: enCommon, shell: enShell, panel: enPanel, journal: enJournal, checks: enChecks });

export * from "./core";

/** Pose la langue retenue (le choix, sinon celle du navigateur) avant tout rendu qui la lit, et `lang` sur la racine
 *  pour le lecteur d'écran et la césure. Appelée au démarrage et au choix dans le menu, **avant** de changer l'état :
 *  le rendu qui suit est déjà dans la nouvelle langue, même pour un composant qui lit `t` sans le hook (revue, M2). */
export function applyLanguage(chosen: Language | null): Language {
  const language = effectiveLanguage(chosen, browserLanguages());
  setLanguage(language);
  if (typeof document !== "undefined") document.documentElement.lang = language;
  return language;
}
