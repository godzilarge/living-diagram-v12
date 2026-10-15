// Les volets de la barre contextuelle (lot 4 de docs/11) : ce qu'un bouton à volet propose. Une légende (le réglage et
// la valeur posée, « ambre → violet » au survol), puis le choix : les douze teintes et « défaut » (la grille de
// l'inspecteur, `HueGrid`), une piste de crans (le gabarit `.seg` de l'inspecteur), aligner et répartir en deux rangées,
// la position d'une étiquette (3 × 3, `PositionGrid`), ou un petit menu (nouveau groupe, ajouter à). Rien ne s'écrit
// ici : chaque choix remonte à la barre (`onPick`), qui l'exécute par les commandes du store. Sous les alignements,
// « mettre en grille » (lot 8 de docs/11, prototype validé) : colonnes (− / +), ordre (par nom ou à l'écran), puis
// l'action ; l'en-tête dit le résultat (« 12 → 4 × 3 ») et survoler la section montre chaque place à venir.
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround, Group, LayoutGrid, Minus, Plus, SquareDashedMousePointer } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GRID_ORDERS } from "../../canvas/align";
import type { GridOrder } from "../../canvas/align";
import { POSITIONS, STYLE_LABEL } from "../../canvas/groups";
import { HUES, HUE_LABEL } from "../../canvas/hues";
import type { HueName } from "../../canvas/hues";
import type { BarAlign, BarButton, Choice, Volet } from "../state/floating";
import { HueGrid, PositionGrid } from "../ui/inspector";
import { Glyph } from "./floating-faces";
import { CodeVolet } from "./CodeVolets";
import { TextVolet } from "./TextVolets";
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

/** Ce que la barre donne au volet pour « mettre en grille » : le compte, les colonnes et rangées, l'ordre, et quoi faire. */
export interface GridControls {
  count: number; cols: number; rows: number; order: GridOrder;
  setCols: (cols: number) => void; setOrder: (order: GridOrder) => void;
  /** Montrer (ou effacer) l'aperçu ; `at` : les réglages survolés, pas encore choisis. */
  preview: (on: boolean, at?: { cols?: number; order?: GridOrder }) => void;
  run: () => void;
}

/** La section « mettre en grille » du volet : deux réglages nommés, puis l'action pleine largeur avec son raccourci. */
function GridSection({ grid }: { grid: GridControls }) {
  const { t } = useTranslation("shell");
  const on = (): void => grid.preview(true), off = (): void => grid.preview(false);
  const hover = { onPointerEnter: on, onPointerLeave: off };
  return (
    <>
      <div className="volet-rule" aria-hidden="true" />
      <div className="order-row">
        <span className="order-label" id="grid-cols-label">{t("fbar.gridColumns")}</span>
        <div className="stepper" role="group" aria-labelledby="grid-cols-label">
          <button type="button" className="step" aria-label={t("fbar.gridFewer")} disabled={grid.cols <= 1} onClick={() => grid.setCols(grid.cols - 1)} {...hover}><Minus aria-hidden="true" /></button>
          {/* la région live lit « 4 colonnes » en entier (un `aria-label` sur un span générique n'est pas lu : audit du 2026-10-15) */}
          <span className="step-val" aria-live="polite"><span aria-hidden="true">{grid.cols}</span><span className="sr-only">{t("fbar.gridColumnsCount", { count: grid.cols })}</span></span>
          <button type="button" className="step" aria-label={t("fbar.gridMore")} disabled={grid.cols >= grid.count} onClick={() => grid.setCols(grid.cols + 1)} {...hover}><Plus aria-hidden="true" /></button>
        </div>
      </div>
      <div className="order-row">
        <span className="order-label">{t("fbar.gridOrder")}</span>
        <div className="seg volet-seg grid-order" role="radiogroup" aria-label={t("fbar.gridOrderLabel")} onKeyDown={(event) => moveFocus(event, GRID_ORDERS.length)}>
          {GRID_ORDERS.map((o) => {
            const chosen = o === grid.order;
            return (
              <button key={o} type="button" role="radio" className="seg-item" aria-checked={chosen ? "true" : "false"} tabIndex={chosen ? 0 : -1}
                onClick={() => grid.setOrder(o)} onPointerEnter={() => grid.preview(true, { order: o })} onPointerLeave={off}>
                <span>{t(`fbar.gridOrders.${o}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="grid-go" data-role="grid" aria-keyshortcuts="Alt+G" onClick={grid.run} {...hover}
        onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) on(); }} onBlur={off}>
        <LayoutGrid aria-hidden="true" /><span className="grid-go-label">{t("fbar.grid")}</span><span className="grid-go-keys">Alt+G</span>
      </button>
    </>
  );
}

/** Le corps d'un volet ; `onTip` : montrer (ou cacher) l'infobulle d'une case d'alignement. */
export function VoletBody({ button, onPick, onTip, grid }: { button: BarButton; onPick: (value: string | null) => void; onTip: (el: HTMLElement | null, label: string, keys: string) => void; grid?: GridControls }) {
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
    const gridded = volet.grid && grid && grid.count >= 3 ? grid : null;
    return (
      <>
        <Caption label={button.label} value={gridded ? t("fbar.gridResult", { total: gridded.count, cols: gridded.cols, rows: gridded.rows }) : t("fbar.items", { count: volet.count })} />
        <div className={"align-grid cols-" + cols} role="group" aria-label={button.label} onKeyDown={(event) => moveFocus(event, cols)}>
          {volet.rows.flat().map((cell, i) => (
            <button key={cell.mode} type="button" className={"vgrid-item" + (cell.distribute ? " dist" : "")} aria-label={cell.label} aria-keyshortcuts={cell.aria} tabIndex={i === 0 ? 0 : -1}
              onClick={() => onPick(cell.mode)} onPointerEnter={(event) => onTip(event.currentTarget, cell.label, cell.keys)} onPointerLeave={() => onTip(null, "", "")}
              onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) onTip(event.currentTarget, cell.label, cell.keys); }} onBlur={() => onTip(null, "", "")}>
              {ALIGN_ICON[cell.mode]}
            </button>
          ))}
        </div>
        {gridded ? <GridSection grid={gridded} /> : null}
      </>
    );
  }
  if (volet.kind === "codeLanguage" || volet.kind === "codeFont") return <CodeVolet volet={volet} onPick={onPick} />; // lot 16
  if (volet.kind === "textSize" || volet.kind === "textColor" || volet.kind === "textPosition") return <TextVolet volet={volet} onPick={onPick} />; // lot 4 bis
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
