// Ce que montrent les boutons de la barre contextuelle (lot 4 de docs/11) : une icône Lucide, une pastille de teinte
// (un disque coupé quand la sélection en mêle deux), ou un glyphe dessiné ici, au trait, 16 × 16, qui montre la valeur
// posée (remplissage, bordure, coins, pointes, tracé…) : on lit l'état sans ouvrir. Les glyphes du prototype validé le
// 2026-10-14, recopiés en SVG pur (attributs de présentation : jamais de style en ligne, CSP).
import { ALargeSmall, AlignStartVertical, ArrowRightLeft, BetweenHorizontalEnd, BetweenVerticalEnd, Bold, CopyPlus, EyeOff, Focus, Group, ImageUp, Layers, Lock, LockOpen,
  MoveUpRight, Paintbrush, PanelTop, Pin, PinOff, SquareDashedMousePointer, StickyNote, TextAlignCenter, TextAlignEnd, TextAlignStart, TextCursorInput, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Face, GlyphName, IconName } from "../state/floating";

const ICONS: Record<IconName, ReactNode> = {
  textSize: <ALargeSmall />, bold: <Bold />, alignLeft: <TextAlignStart />, alignCenter: <TextAlignCenter />, alignRight: <TextAlignEnd />, layers: <Layers />,
  lock: <Lock />, unlock: <LockOpen />, duplicate: <CopyPlus />, delete: <Trash2 />, editLabel: <TextCursorInput />, addRow: <BetweenHorizontalEnd />,
  addColumn: <BetweenVerticalEnd />, header: <PanelTop />, replace: <ImageUp />, reverse: <ArrowRightLeft />, selectMembers: <SquareDashedMousePointer />,
  paint: <Paintbrush />, pin: <Pin />, unpin: <PinOff />, group: <Group />, note: <StickyNote />, connect: <MoveUpRight />, hide: <EyeOff />, isolate: <Focus />,
  align: <AlignStartVertical />,
};
export const iconOf = (name: IconName): ReactNode => ICONS[name];

const DASH: Record<string, string | undefined> = { solid: undefined, dashed: "3.2 2", dotted: "0.1 2.6", none: "0.1 2.6" };
const LINE_DASH: Record<string, string | undefined> = { solid: undefined, dashed: "3.5 2.5", dotted: "0.1 3" };
const FILL: Record<string, number> = { 25: 0.3, 50: 0.6, 100: 1 };
const RADIUS: Record<string, number> = { 0: 0, 6: 3, 12: 6, 24: 9 };
const POS_X: Record<string, number> = { left: 5, right: 11 }, POS_Y: Record<string, number> = { top: 5.5, bottom: 10.5 };

function draw(name: GlyphName, value: string): ReactNode {
  const line = (d: string, extra: Record<string, string | number | undefined> = {}) => <path className="g-line" d={d} {...extra} />;
  switch (name) {
    case "fill": {
      const level = FILL[value] || 0;
      return <>{level ? <rect className="g-tint" x={2.5} y={2.5} width={11} height={11} rx={2} fillOpacity={level} /> : null}
        <rect className="g-line" x={2.5} y={2.5} width={11} height={11} rx={2} strokeOpacity={0.55} />{level ? null : line("M3.5 12.5L12.5 3.5", { strokeOpacity: 0.55 })}</>;
    }
    case "border":
      return <><rect className="g-line" x={2.5} y={2.5} width={11} height={11} rx={2} strokeDasharray={DASH[value]} strokeOpacity={value === "none" ? 0.35 : 1} />{value === "none" ? line("M3 13L13 3") : null}</>;
    case "corners": { const k = RADIUS[value] ?? Math.min(9, Number(value) / 2); return line(k ? `M3 14V${3 + k}A${k} ${k} 0 0 1 ${3 + k} 3H14` : "M3 14V3H14"); }
    case "heads":
      return <>{line(`M${value === "start" || value === "both" ? 5 : 2} 8H${value === "end" || value === "both" ? 11 : 14}`)}
        {value === "end" || value === "both" ? <path className="g-fill" d="M14.5 8L10 5V11Z" /> : null}
        {value === "start" || value === "both" ? <path className="g-fill" d="M1.5 8L6 5V11Z" /> : null}</>;
    case "route": return line(value === "elbow" ? "M3 13H8V3H13" : value === "curve" ? "M3 13C9 13 7 3 13 3" : "M3 13L13 3");
    case "width": return line("M2.5 8H13.5", { strokeWidth: 0.6 + Number(value) * 0.9 });
    case "stroke": return line("M2 8H14", { strokeDasharray: LINE_DASH[value] });
    case "widths": return <>{line("M2.5 3.5H13.5", { strokeWidth: 1 })}{line("M2.5 7.5H13.5", { strokeWidth: 1.8 })}{line("M2.5 12H13.5", { strokeWidth: 2.8 })}</>;
    case "strokes": return <>{line("M2.5 3.5H13.5")}{line("M2.5 8H13.5", { strokeDasharray: "3 2.2" })}{line("M2.5 12.5H13.5", { strokeDasharray: "0.1 2.6" })}</>;
    case "shape": return value === "ellipse" ? <ellipse className="g-line" cx={8} cy={8} rx={6} ry={4.8} /> : <rect className="g-line" x={2} y={3.5} width={12} height={9} rx={2} />;
    case "opacity": return <><circle className="g-line" cx={8} cy={8} r={5.5} /><path className="g-fill" d="M8 2.5A5.5 5.5 0 0 1 8 13.5Z" fillOpacity={Number(value) / 100} /></>;
    case "plane": return value === "back"
      ? <><rect className="g-line" x={5.5} y={2.5} width={8} height={8} rx={1.5} /><rect className="g-fill" x={2.5} y={5.5} width={8} height={8} rx={1.5} fillOpacity={0.35} /></>
      : <><rect className="g-line" x={2.5} y={5.5} width={8} height={8} rx={1.5} strokeOpacity={0.55} /><rect className="g-fill" x={5.5} y={2.5} width={8} height={8} rx={1.5} /></>;
    case "position": {
      const [v, h] = value.includes("_") ? value.split("_") : POS_Y[value] !== undefined ? [value, ""] : ["", value];
      return <><rect className="g-line" x={2} y={2.5} width={12} height={11} rx={2} strokeOpacity={0.55} /><circle className="g-fill" cx={POS_X[h] ?? 8} cy={POS_Y[v] ?? 8} r={1.8} /></>;
    }
  }
  return null;
}

/** Un glyphe dessiné (16 × 16, au trait de l'encre courante ; `g-tint` à la teinte de l'objet). */
export const Glyph = ({ name, value }: { name: GlyphName; value: string }) => <svg viewBox="0 0 16 16" className="glyph" aria-hidden="true">{draw(name, value)}</svg>;

/** Le visage d'un bouton. */
export function FaceOf({ face }: { face: Face }) {
  if (face.kind === "icon") return <>{ICONS[face.icon]}</>;
  if (face.kind === "glyph") return <Glyph name={face.glyph} value={face.value} />;
  if (face.hues.length < 2) return <span className={"fb-hue hue-" + (face.hues[0] || "slate")} aria-hidden="true" />;
  return (
    <svg viewBox="0 0 14 14" className="fb-mix" aria-hidden="true">
      <path className={"hue-" + face.hues[0]} d="M7 0.5A6.5 6.5 0 0 0 7 13.5Z" />
      <path className={"hue-" + face.hues[1]} d="M7 0.5A6.5 6.5 0 0 1 7 13.5Z" />
      <circle className="fb-mix-ring" cx={7} cy={7} r={6.5} />
    </svg>
  );
}
