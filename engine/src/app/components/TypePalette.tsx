// Le volet « palette des types » (docs/10) : pour chaque type du contrat, sa teinte dans cette infrastructure, qui l'a
// choisie, quand ; douze pastilles pour la changer, « défaut » pour revenir à celle du moteur. Une intention partagée,
// enregistrée sous le nom de l'écrivain ; sans nom, le volet se lit seulement.
import { X } from "lucide-react";
import type { MouseEvent } from "react";
import { defaultHue, hueLabel, hueOfType } from "../../canvas/hues";
import { LABEL as ICON_LABEL, TYPES } from "../../canvas/icons";
import { useEditable, useModel, useStore } from "../state/store";
import { Button, Dialog } from "../ui";
import { Swatches } from "./cards/Swatches";
import { TypeIcon, WriteHint, dateText } from "./cards/shared";

export function TypePalette() {
  const { dispatch, commands } = useStore();
  const model = useModel();
  const canWrite = useEditable();
  if (!model) return null;
  const close = (): void => dispatch({ type: "colors", open: false });
  const onBackdrop = (event: MouseEvent<HTMLDivElement>): void => { if (event.target === event.currentTarget) close(); };
  return (
    <div className="sheet palette-sheet" onClick={onBackdrop}>
      <Dialog label="palette des types" className="sheet-card glass palette-types" onClose={close}>
        <h1>Palette des types</h1>
        <Button variant="ghost" icon className="panel-close" aria-label="fermer" onClick={close}><X /></Button>
        <p className="lead">La teinte de chaque type, pour toute l'infrastructure et pour tout le monde. Un équipement peut avoir la sienne, depuis sa fiche.</p>
        {canWrite ? null : <WriteHint action="changer une teinte" />}
        <ul className="type-rows">
          {TYPES.map((type) => {
            const set = model.colorByType.get(type), hue = hueOfType(model, type);
            return (
              <li key={type} className="type-row">
                <TypeIcon type={type} hue={hue} />
                <div className="type-row-text">
                  <b>{ICON_LABEL[type]}</b>
                  <span className="hint">{set ? hueLabel(set.hue) + " · " + set.author + ", le " + dateText(set.at) : "par défaut : " + hueLabel(defaultHue(type))}</span>
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
