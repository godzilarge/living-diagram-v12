// La pastille sur la toile (canvas/pill.ts pour sa géométrie ; `.pill` est la même en HTML) : une capsule de 20,
// détourée du fond (elle coupe le bord de la carte ou le câble dessous), une icône ou un point de tête, un texte en
// capitales à chasse fixe. La couleur vient du ton (`tone-*`, canvas.css), jamais d'un style en ligne.
import type { ComponentType, SVGProps } from "react";
import { PILL_DOT, PILL_H, PILL_ICON, PILL_LEAD_GAP, PILL_PAD, pillWidth } from "../../canvas/pill";

export type Tone = "neutral" | "info" | "muted" | "ok" | "danger" | "warning" | "structure" | "accent" | "observed" | "documented" | "added" | "changed" | "removed";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface PillProps {
  /** Coin haut gauche, en unités du dessin. */
  x: number; y: number; text: string; tone: Tone;
  icon?: Icon; dot?: string | null; dashed?: boolean; className?: string;
}

/** Le texte en capitales, mis en forme ici (pas par `text-transform` : la largeur se calcule sur ce qui est écrit). */
export const pillText = (text: string): string => text.toUpperCase();

export function PillSvg({ x, y, text, tone, icon: Glyph, dot, dashed, className }: PillProps) {
  const label = pillText(text);
  const w = pillWidth(label, Glyph ? "icon" : dot ? "dot" : null);
  const lead = Glyph ? PILL_ICON + PILL_LEAD_GAP : dot ? PILL_DOT + PILL_LEAD_GAP : 0;
  const classes = ["pill-svg", "tone-" + tone, dashed ? "dashed" : "", className || ""].filter(Boolean).join(" ");
  return (
    <g className={classes}>
      <rect className="pill-knock" x={x - 2} y={y - 2} width={w + 4} height={PILL_H + 4} rx={(PILL_H + 4) / 2} />
      <rect className="pill-box" x={x + 0.5} y={y + 0.5} width={w - 1} height={PILL_H - 1} rx={(PILL_H - 1) / 2} />
      {Glyph ? <Glyph x={x + PILL_PAD} y={y + (PILL_H - PILL_ICON) / 2} width={PILL_ICON} height={PILL_ICON} className="pill-icon" aria-hidden="true" /> : null}
      {dot ? <circle className={"pill-dot severity-" + dot} cx={x + PILL_PAD + PILL_DOT / 2} cy={y + PILL_H / 2} r={PILL_DOT / 2} /> : null}
      <text x={x + PILL_PAD + lead} y={y + 14}>{label}</text>
    </g>
  );
}

/** La largeur que `PillSvg` occupera pour ce texte. */
export const pillSvgWidth = (text: string, lead: "icon" | "dot" | null = null): number => pillWidth(pillText(text), lead);
