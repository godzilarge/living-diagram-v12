// Les réglages d'affichage de la toile, en bas à gauche : la grille, l'aimant (un glissé s'aligne sur la grille), les
// repères d'alignement (lot 8 de docs/11 : un glissé s'aligne sur les objets voisins ; allumés par défaut), la minimap,
// le thème. Les actions (annuler, cadrer, aligner) sont dans la barre d'outils, en haut (Toolbar). Des préférences du navigateur (state/prefs.ts), pas de la vue : l'adresse ne les porte pas.
import { Grid3x3, Magnet, Map, Moon, RulerDimensionLine, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "../state/store";
import { Button, Toggle } from "../ui";

export function Controls() {
  const { state, commands } = useStore();
  const { t } = useTranslation();
  const p = state.prefs;
  const dark = p.theme === "dark";
  return (
    <div className="controls glass" role="toolbar" aria-label={t("controls.label")}>
      <Toggle className="toggle btn-icon" pressed={p.grid} onClick={() => commands.setPrefs({ grid: !p.grid })} title={t("controls.grid")} aria-label={t("controls.grid")}><Grid3x3 /></Toggle>
      <Toggle className="toggle btn-icon" pressed={p.snap} onClick={() => commands.setPrefs({ snap: !p.snap })} title={t("controls.snap")} aria-label={t("controls.snap")}><Magnet /></Toggle>
      <Toggle className="toggle btn-icon" pressed={p.guides} onClick={() => commands.setPrefs({ guides: !p.guides })} title={t("controls.guidesTitle")} aria-label={t("controls.guides")}><RulerDimensionLine /></Toggle>
      <Toggle className="toggle btn-icon" pressed={p.minimap} onClick={() => commands.setPrefs({ minimap: !p.minimap })} title={t("controls.minimapTitle")} aria-label={t("controls.minimap")}><Map /></Toggle>
      <span className="controls-sep" aria-hidden="true" />
      <Button variant="ghost" icon onClick={() => commands.setPrefs({ theme: dark ? "light" : "dark" })} title={dark ? t("controls.lightTitle") : t("controls.darkTitle")} aria-label={dark ? t("controls.toLight") : t("controls.toDark")}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
