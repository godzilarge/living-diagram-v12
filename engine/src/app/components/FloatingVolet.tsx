// Les volets de la barre contextuelle (lot 4 de docs/11) : ce qu'un bouton à volet propose. Une légende (le réglage et
// la valeur posée, « ambre → violet » au survol), puis le choix : les douze teintes et « défaut » (la grille de
// l'inspecteur, `HueGrid`), une piste de crans (le gabarit `.seg` de l'inspecteur), aligner et répartir en deux rangées,
// la position d'une étiquette (3 × 3, `PositionGrid`), ou un petit menu (nouveau groupe, ajouter à). Rien ne s'écrit
// ici : chaque choix remonte à la barre (`onPick`), qui l'exécute par les commandes du store.
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround, Group, SquareDashedMousePointer } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { POSITIONS, STYLE_LABEL } from "../../canvas/groups";
import { HUES, HUE_LABEL } from "../../canvas/hues";
import type { HueName } from "../../canvas/hues";
import type { BarAlign, BarButton, Choice, Volet } from "../state/floating";
import { HueGrid, PositionGrid } from "../ui/inspector";
import { Glyph } from "./floating-faces";
import { iconOf } from "./floating-faces";

const ALIGN_ICON: Record<BarAlign, ReactNode> = {
  left: <AlignStartVertical />, center: <AlignCenterVertical />, right: <AlignEndVertical />, top: <AlignStartHorizontal />, middle: <AlignCenterHorizontal />, bottom: <AlignEndHorizontal />,
  "distribute-horizontal": <AlignHorizontalSpaceAround />, "distribute-vertical": <AlignVerticalSpaceAround />,
};

/** Les flèches dans une grille de boutons (`cols` colonnes) : le focus se déplace, rien ne se choisit. */
function moveFocus(event: KeyboardEvent<HTMLElement>, cols: number): void {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
  if (!step) return;
  event.preventDefault();
  event.stopPropagation();
  const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button"));
  const at = all.indexOf(document.activeElement as HTMLElement);
  const next = all[Math.min(all.length - 1, Math.max(0, at + step))];
  if (next) next.focus();
}

const Caption = ({ label, value }: { label: string; value: string }) => <div className="volet-cap"><span>{label}</span><b>{value}</b></div>;

/** Le corps d'un volet ; `onTip` : montrer (ou cacher) l'infobulle d'une case d'alignement. */
export function VoletBody({ button, onPick, onTip }: { button: BarButton; onPick: (value: string | null) => void; onTip: (el: HTMLElement | null, label: string, keys: string) => void }) {
  const { t } = useTranslation("shell");
  const volet = button.volet as Volet;
  const [preview, setPreview] = useState<string | null>(null);
  if (volet.kind === "hue") {
    const shown = volet.value || volet.inherited;
    const posed = shown ? HUE_LABEL[shown as HueName] || shown : t("fbar.hueMixed");
    return (
      <>
        <Caption label={t("fbar.hue")} value={preview && preview !== shown ? posed + " → " + (HUE_LABEL[preview as HueName] || preview) : posed} />
        <HueGrid label={t("fbar.hue")} hues={HUES} names={HUE_LABEL} value={volet.value as HueName | null} inherited={volet.inherited as HueName | null}
          allowDefault={volet.allowDefault} defaultLabel={t("fbar.typeDefault")} onPreview={setPreview} onPick={(hue) => onPick(hue)} />
      </>
    );
  }
  if (volet.kind === "choice") {
    const current = volet.options.find((o) => o.value === volet.value);
    const label = (o: Choice | undefined): string => (o ? o.label : volet.value);
    return (
      <>
        <Caption label={volet.title} value={preview && preview !== volet.value ? label(current) + " → " + label(volet.options.find((o) => o.value === preview)) : label(current)} />
        <div className="seg volet-seg" role="radiogroup" aria-label={volet.title} onKeyDown={(event) => moveFocus(event, volet.options.length)} onPointerLeave={() => setPreview(null)}>
          {volet.options.map((o, i) => {
            const on = o.value === volet.value;
            return (
              <button key={o.value} type="button" role="radio" className="seg-item" aria-checked={on ? "true" : "false"} aria-label={o.label} tabIndex={on || (!current && i === 0) ? 0 : -1}
                onClick={() => onPick(o.value)} onPointerEnter={() => setPreview(o.value)} onFocus={() => setPreview(o.value)} onBlur={() => setPreview(null)}>
                {o.glyph ? <Glyph name={o.glyph} value={o.value} /> : o.icon ? iconOf(o.icon) : <span>{o.label}</span>}
                {o.num ? <span className="seg-num">{o.num}</span> : null}
              </button>
            );
          })}
        </div>
      </>
    );
  }
  if (volet.kind === "align") {
    const cols = volet.rows[0].length;
    return (
      <>
        <Caption label={button.label} value={t("fbar.items", { count: volet.count })} />
        <div className={"align-grid cols-" + cols} role="group" aria-label={button.label} onKeyDown={(event) => moveFocus(event, cols)}>
          {volet.rows.flat().map((cell, i) => (
            <button key={cell.mode} type="button" className={"vgrid-item" + (cell.distribute ? " dist" : "")} aria-label={cell.label} aria-keyshortcuts={cell.aria} tabIndex={i === 0 ? 0 : -1}
              onClick={() => onPick(cell.mode)} onPointerEnter={(event) => onTip(event.currentTarget, cell.label, cell.keys)} onPointerLeave={() => onTip(null, "", "")}
              onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) onTip(event.currentTarget, cell.label, cell.keys); }} onBlur={() => onTip(null, "", "")}>
              {ALIGN_ICON[cell.mode]}
            </button>
          ))}
        </div>
      </>
    );
  }
  if (volet.kind === "position") {
    return (
      <>
        <Caption label={button.label} value={(STYLE_LABEL[volet.value] || volet.value) + (preview && preview !== volet.value ? " → " + (STYLE_LABEL[preview] || preview) : "")} />
        <PositionGrid label={button.label} options={POSITIONS} names={STYLE_LABEL} value={volet.value as typeof POSITIONS[number]} onPreview={setPreview} onPick={(value) => onPick(value)} />
      </>
    );
  }
  return (
    <div className="vmenu" role="menu" aria-label={button.label} onKeyDown={(event) => moveFocus(event, 1)}>
      <button type="button" role="menuitem" className="vmenu-item" onClick={() => onPick("new")}><Group aria-hidden="true" /><span>{volet.hosts.length > 1 ? t("fbar.newGroupOf", { count: volet.hosts.length }) : t("fbar.newGroup")}</span></button>
      {volet.groups.length ? <><div className="vmenu-sep" role="separator" /><div className="vmenu-label">{t("fbar.addTo")}</div></> : null}
      {volet.groups.map((g) => <button key={g.id} type="button" role="menuitem" className="vmenu-item" tabIndex={-1} onClick={() => onPick(g.id)}><SquareDashedMousePointer aria-hidden="true" /><span>{g.label}</span></button>)}
    </div>
  );
}
