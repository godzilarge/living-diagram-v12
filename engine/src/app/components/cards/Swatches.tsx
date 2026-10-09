// La rangée des douze teintes nommées (docs/10) : une pastille par teinte, la teinte choisie marquée, celle héritée
// (du type, ou du moteur) cerclée ; « défaut » retire le choix et rend la teinte du dessus. Jamais de valeur libre.
import { HUES, HUE_LABEL } from "../../../canvas/hues";
import type { HueName } from "../../../canvas/hues";

export function Swatches({ value, effective, onPick }: { value: string | null; effective: HueName | null; onPick: (hue: HueName | null) => void }) {
  return (
    <div className="swatches" role="group" aria-label="teinte">
      {HUES.map((hue) => (
        <button key={hue} type="button" className={"swatch hue-" + hue + (value === null && hue === effective ? " inherited" : "")} aria-label={HUE_LABEL[hue]} title={HUE_LABEL[hue]}
          aria-pressed={value === hue ? "true" : "false"} onClick={() => onPick(hue)} />
      ))}
      <button type="button" className="swatch-default" aria-pressed={value === null ? "true" : "false"} title={effective ? "revenir à la teinte du dessus : " + HUE_LABEL[effective] : "revenir à la teinte du dessus (type, ou défaut)"} onClick={() => onPick(null)}>défaut</button>
    </div>
  );
}
