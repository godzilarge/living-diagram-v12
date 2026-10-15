// Les volets du texte de la barre contextuelle (lots 4 bis et 16 bis de docs/11) : la taille libre (« − n + », un champ,
// puis la police : sans / mono d'un texte, les quatre polices d'un bloc de code), la couleur du texte (l'encre, la teinte
// de l'objet, ou l'une des douze), la position (alignements d'une note ou d'une forme, d'un tableau ; neuf positions,
// dedans ou dehors, pour un groupe ; place le long du tracé et côté pour l'étiquette d'un connecteur). Les gabarits des
// volets existants (`.volet-cap`, `.seg`, `.stepper`, la grille des teintes, la grille 3 × 3) : aucune direction
// visuelle nouvelle. Rien ne s'écrit ici : chaque choix remonte (`onPick`, une valeur `clé:valeur`), la barre l'exécute.
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { labelMap } from "../../i18n";
import { POSITIONS, STYLE_LABEL } from "../../canvas/groups";
import { HUES, HUE_LABEL } from "../../canvas/hues";
import type { HueName } from "../../canvas/hues";
import type { Volet } from "../state/floating";
import { SIZE_MAX, SIZE_MIN, clampSize } from "../state/sizes";
import { LABEL_MARKS } from "../state/text-format";
import { colorWord } from "../state/text-bar";
import { HueGrid, PositionGrid } from "../ui/inspector";
import { FontList } from "./CodeVolets";

type Pick = (value: string) => void;
const Caption = ({ label, value }: { label: string; value: string }) => <div className="volet-cap"><span>{label}</span><b>{value}</b></div>;

/** Les flèches dans une piste : le focus se déplace, rien ne se choisit (comme les autres volets). */
function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  event.stopPropagation();
  const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button"));
  const next = all[Math.min(all.length - 1, Math.max(0, all.indexOf(document.activeElement as HTMLElement) + step))];
  if (next) next.focus();
}

/** Une piste de choix exclusifs (mots ou icônes) ; `value` `null` : mixte, aucun n'est coché. */
function Track({ label, value, options, onPick }: { label: string; value: string | null; options: { value: string; label: string; icon?: ReactNode }[]; onPick: (value: string) => void }) {
  return (
    <div className="seg volet-seg" role="radiogroup" aria-label={label} onKeyDown={moveFocus}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" className="seg-item" aria-checked={on ? "true" : "false"} aria-label={o.label} title={o.icon ? o.label : undefined}
            tabIndex={on || (value === null && i === 0) ? 0 : -1} onClick={() => onPick(o.value)}>
            {o.icon || <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Un nombre libre dans un pas à pas : « − », le champ (Entrée ou quitter applique), « + » ; `null` : mixte (« — »). */
export function Stepper({ label, value, min, max, unit, onStep, onSet }: { label: string; value: number | null; min: number; max: number; unit: string; onStep: (dir: 1 | -1) => void; onSet: (value: number) => void }) {
  const { t } = useTranslation("shell");
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => { setText(value === null ? "" : String(value)); }, [value]);
  const apply = (): void => { const n = Number(text.replace(",", ".")); if (text.trim() && Number.isFinite(n) && n !== value) onSet(Math.min(max, Math.max(min, Math.round(n)))); };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step" aria-label={t("fbar.less", { what: label })} disabled={value !== null && value <= min} onClick={() => onStep(-1)}><Minus aria-hidden="true" /></button>
      <input className="step-val step-input" inputMode="numeric" aria-label={label + " (" + unit + ")"} value={text} placeholder="—" spellCheck={false}
        onChange={(event) => setText(event.target.value)} onBlur={apply} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } }} />
      <button type="button" className="step" aria-label={t("fbar.more", { what: label })} disabled={value !== null && value >= max} onClick={() => onStep(1)}><Plus aria-hidden="true" /></button>
    </div>
  );
}

/** La taille libre, puis la police. Sur une sélection mixte, « − » et « + » changent chaque taille d'un pixel. */
function SizeVolet({ volet, onPick }: { volet: Extract<Volet, { kind: "textSize" }>; onPick: Pick }) {
  const { t } = useTranslation("shell");
  const step = (dir: 1 | -1): void => onPick(volet.value === null ? "delta:" + dir : "size:" + clampSize(volet.value + dir));
  const fonts = [{ value: "sans", label: t("fbar.fonts.sans") as string }, { value: "mono", label: t("fbar.fonts.mono") as string }];
  return (
    <>
      <Caption label={t("fbar.textSize")} value={volet.value === null ? t("fbar.hueMixed") : volet.value + " px"} />
      <div className="order-row">
        <span className="order-label">{t("fbar.size")}</span>
        <Stepper label={t("fbar.textSize")} value={volet.value} min={SIZE_MIN} max={SIZE_MAX} unit="px" onStep={step} onSet={(n) => onPick("size:" + n)} />
      </div>
      <div className="volet-rule" aria-hidden="true" />
      {volet.fonts === "code"
        ? <FontList value={volet.font || ""} inVolet onPick={(id) => onPick("font:" + id)} />
        : <Track label={t("fbar.font")} value={volet.font} options={fonts} onPick={(font) => onPick("font:" + font)} />}
    </>
  );
}

/** La couleur du texte : l'encre du thème, la teinte de l'objet, puis les douze teintes. */
function ColorVolet({ volet, onPick }: { volet: Extract<Volet, { kind: "textColor" }>; onPick: Pick }) {
  const { t } = useTranslation("shell");
  const [preview, setPreview] = useState<string | null>(null);
  const hue = volet.value && volet.value !== "ink" && volet.value !== "hue" ? volet.value : null;
  const words = [{ value: "ink", label: t("fbar.textColors.ink") }, { value: "hue", label: t("fbar.textColors.hue") }];
  return (
    <>
      <Caption label={t("fbar.textColor")} value={colorWord(volet.value) + (preview && preview !== volet.value ? " → " + colorWord(preview) : "")} />
      <Track label={t("fbar.textColor")} value={hue ? null : volet.value} options={words} onPick={(color) => onPick("color:" + color)} />
      <HueGrid label={t("fbar.textColor")} hues={HUES} names={HUE_LABEL} value={hue as HueName | null} inherited={null} allowDefault={false} onPreview={setPreview} onPick={(next) => { if (next) onPick("color:" + next); }} />
    </>
  );
}

// les mots des alignements, ceux des fiches (`panel:words`)
const WORDS = labelMap("panel:words", ["left", "center", "right", "top", "middle", "bottom"]);
const H_ICONS: Record<string, ReactNode> = { left: <AlignHorizontalJustifyStart />, center: <AlignHorizontalJustifyCenter />, right: <AlignHorizontalJustifyEnd /> };
const V_ICONS: Record<string, ReactNode> = { top: <AlignVerticalJustifyStart />, middle: <AlignVerticalJustifyCenter />, bottom: <AlignVerticalJustifyEnd /> };

/** La position : selon la famille de la sélection (boîte, tableau, groupe, connecteur). */
function PositionVolet({ volet, onPick }: { volet: Extract<Volet, { kind: "textPosition" }>; onPick: Pick }) {
  const { t } = useTranslation(["shell", "panel"]);
  const p = volet.value, mixed = t("fbar.hueMixed");
  if (volet.position === "group") {
    const placements = [{ value: "inside", label: t("panel:style.inside") }, { value: "outside", label: t("panel:style.outside") }];
    const position = p.position ?? null;
    return (
      <>
        <Caption label={t("fbar.labelPosition")} value={position === null ? mixed : STYLE_LABEL[position] || position} />
        <PositionGrid label={t("fbar.labelPosition")} options={POSITIONS} names={STYLE_LABEL} value={(position || "center") as typeof POSITIONS[number]} onPick={(value) => onPick("position:" + value)} />
        <Track label={t("panel:style.placementLabel")} value={p.placement ?? null} options={placements} onPick={(value) => onPick("placement:" + value)} />
      </>
    );
  }
  if (volet.position === "connector") {
    const marks = LABEL_MARKS.map((at, i) => ({ value: String(at), label: [t("fbar.marks.start"), t("fbar.marks.middle"), t("fbar.marks.end")][i] }));
    const sides = [{ value: "above", label: t("fbar.sides.above") }, { value: "on", label: t("fbar.sides.on") }, { value: "below", label: t("fbar.sides.below") }];
    const at = p.at ?? null;
    return (
      <>
        <Caption label={t("fbar.labelPlace")} value={at === null ? mixed : at + " %"} />
        <Track label={t("fbar.labelPlace")} value={at === null ? null : String(at)} options={marks} onPick={(value) => onPick("at:" + value)} />
        <div className="order-row">
          <span className="order-label">{t("fbar.labelAt")}</span>
          <Stepper label={t("fbar.labelPlace")} value={at} min={0} max={100} unit="%" onStep={(dir) => onPick("at:" + Math.min(100, Math.max(0, (at ?? 50) + dir * 5)))} onSet={(n) => onPick("at:" + n)} />
        </div>
        <Track label={t("fbar.labelSide")} value={p.side ?? null} options={sides} onPick={(value) => onPick("side:" + value)} />
      </>
    );
  }
  const align = p.align ?? null, valign = p.valign ?? null;
  const h = ["left", "center", "right"].map((value) => ({ value, label: WORDS[value], icon: H_ICONS[value] }));
  const v = ["top", "middle", "bottom"].map((value) => ({ value, label: WORDS[value], icon: V_ICONS[value] }));
  return (
    <>
      <Caption label={t("fbar.textPosition")} value={align === null ? mixed : WORDS[align] + (volet.position === "box" && valign ? " · " + WORDS[valign] : "")} />
      <Track label={t("panel:style.alignH")} value={align} options={h} onPick={(value) => onPick("align:" + value)} />
      {volet.position === "box" ? <Track label={t("panel:style.alignV")} value={valign} options={v} onPick={(value) => onPick("valign:" + value)} /> : null}
    </>
  );
}

/** Le corps d'un volet du texte. */
export function TextVolet({ volet, onPick }: { volet: Extract<Volet, { kind: "textSize" | "textColor" | "textPosition" }>; onPick: Pick }) {
  if (volet.kind === "textSize") return <SizeVolet volet={volet} onPick={onPick} />;
  if (volet.kind === "textColor") return <ColorVolet volet={volet} onPick={onPick} />;
  return <PositionVolet volet={volet} onPick={onPick} />;
}
