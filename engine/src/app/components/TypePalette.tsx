// Le volet « palette des types » (docs/10) : pour chaque type du contrat, sa teinte dans cette infrastructure, qui l'a
// choisie, quand ; douze pastilles pour la changer, « défaut » pour revenir à celle du moteur. Une intention partagée,
// enregistrée sous le nom de l'écrivain ; sans nom, le volet se lit seulement.
import { X } from "lucide-react";
import type { MouseEvent } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { defaultHue, hueLabel, hueOfType } from "../../canvas/hues";
import { LABEL as ICON_LABEL, TYPES } from "../../canvas/icons";
import { useEditable, useModel, useStore } from "../state/store";
import { Button, Dialog } from "../ui";
import { Swatches } from "./cards/Swatches";
import { TypeIcon, WriteHint, dateText } from "./cards/shared";

// La date d'une teinte ne se coupe jamais en deux lignes (« 2026- / 10-10 » : revue d'usage, B7) : elle entre dans la
// phrase comme un bloc insécable.
const MARK = "\u0001";
function stamped(text: string, date: string): ReactNode {
  const [before, after = ""] = text.split(MARK);
  return <>{before}<span className="nowrap">{date}</span>{after}</>;
}

export function TypePalette() {
  const { dispatch, commands } = useStore();
  const model = useModel();
  const canWrite = useEditable();
  const { t } = useTranslation();
  if (!model) return null;
  const close = (): void => dispatch({ type: "colors", open: false });
  const onBackdrop = (event: MouseEvent<HTMLDivElement>): void => { if (event.target === event.currentTarget) close(); };
  return (
    <div className="sheet palette-sheet" onClick={onBackdrop}>
      <Dialog label={t("palette.label")} className="sheet-card glass palette-types" onClose={close}>
        <h1>{t("palette.title")}</h1>
        <Button variant="ghost" icon className="panel-close" aria-label={t("palette.close")} onClick={close}><X /></Button>
        <p className="lead">{t("palette.lead")}</p>
        {canWrite ? null : <WriteHint action={t("palette.toEdit")} />}
        <ul className="type-rows">
          {TYPES.map((type) => {
            const set = model.colorByType.get(type), hue = hueOfType(model, type);
            return (
              <li key={type} className="type-row">
                <TypeIcon type={type} hue={hue} />
                <div className="type-row-text">
                  <b>{ICON_LABEL[type]}</b>
                  <span className="hint">{set ? stamped(t("palette.set", { hue: hueLabel(set.hue), author: set.author, at: MARK }), dateText(set.at)) : t("palette.default", { hue: hueLabel(defaultHue(type)) })}</span>
                </div>
                {canWrite ? <Swatches value={set ? set.hue : null} effective={hue} onPick={(next) => commands.colorType(type, next)} /> : null}
              </li>
            );
          })}
        </ul>
      </Dialog>
    </div>
  );
}
