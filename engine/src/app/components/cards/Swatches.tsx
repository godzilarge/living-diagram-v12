// La rangée des douze teintes nommées (docs/10) : une pastille par teinte, la teinte choisie marquée, celle héritée
// (du type, ou du moteur) cerclée ; « défaut » retire le choix et rend la teinte du dessus. Jamais de valeur libre.
import { HUES, HUE_LABEL } from "../../../canvas/hues";
import type { HueName } from "../../../canvas/hues";
import { useTranslation } from "react-i18next";

export function Swatches({ value, effective, onPick }: { value: string | null; effective: HueName | null; onPick: (hue: HueName | null) => void }) {
  const { t } = useTranslation("panel");
  return (
    <div className="swatches" role="group" aria-label={t("hue")}>
      {HUES.map((hue) => (
        <button key={hue} type="button" className={"swatch hue-" + hue + (value === null && hue === effective ? " inherited" : "")} aria-label={HUE_LABEL[hue]} title={HUE_LABEL[hue]}
          aria-pressed={value === hue ? "true" : "false"} onClick={() => onPick(hue)} />
      ))}
      <button type="button" className="swatch-default" aria-pressed={value === null ? "true" : "false"} title={effective ? t("swatches.backTo", { hue: HUE_LABEL[effective] }) : t("swatches.backToAny")} onClick={() => onPick(null)}>{t("swatches.default")}</button>
    </div>
  );
}
