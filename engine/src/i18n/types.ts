// Les clés typées : `t("bar.devices")` est vérifié par `tsc` contre les catalogues français, la référence. Une clé
// absente ou mal écrite ne compile pas. Les catalogues sont lus comme types seulement : le noyau n'embarque que
// `common` (`/view` n'a besoin que de lui), l'application ajoute les autres.
type Fr = {
  common: typeof import("./locales/fr/common.json");
  shell: typeof import("./locales/fr/shell.json");
  panel: typeof import("./locales/fr/panel.json");
  journal: typeof import("./locales/fr/journal.json");
  checks: typeof import("./locales/fr/checks.json");
};

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "shell";
    resources: Fr;
  }
}

export {}; // un module : la déclaration ci-dessus augmente i18next, elle ne le remplace pas
