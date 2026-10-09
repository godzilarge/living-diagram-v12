// Les réglages d'affichage de la toile, en bas à gauche : la grille, l'aimant (un glissé s'aligne sur la grille), la
// minimap, le thème. Les actions (annuler, cadrer, aligner) sont dans la barre d'outils, en haut (Toolbar). Des préférences du navigateur (state/prefs.ts), pas de la vue : l'adresse ne les porte pas.
import { Grid3x3, Magnet, Map, Moon, Sun } from "lucide-react";
import { useStore } from "../state/store";
import { Button, Toggle } from "../ui";

export function Controls() {
  const { state, commands } = useStore();
  const p = state.prefs;
  const dark = p.theme === "dark";
  return (
    <div className="controls glass" role="toolbar" aria-label="affichage de la toile">
      <Toggle className="toggle btn-icon" pressed={p.grid} onClick={() => commands.setPrefs({ grid: !p.grid })} title="afficher la grille" aria-label="afficher la grille"><Grid3x3 /></Toggle>
      <Toggle className="toggle btn-icon" pressed={p.snap} onClick={() => commands.setPrefs({ snap: !p.snap })} title="aimanter les glissés à la grille" aria-label="aimanter les glissés à la grille"><Magnet /></Toggle>
      <Toggle className="toggle btn-icon" pressed={p.minimap} onClick={() => commands.setPrefs({ minimap: !p.minimap })} title="vue d'ensemble (minimap)" aria-label="vue d'ensemble"><Map /></Toggle>
      <span className="controls-sep" aria-hidden="true" />
      <Button variant="ghost" icon onClick={() => commands.setPrefs({ theme: dark ? "light" : "dark" })} title={dark ? "thème clair" : "thème sombre"} aria-label={dark ? "passer au thème clair" : "passer au thème sombre"}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
