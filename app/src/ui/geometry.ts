// The distances DESIGN.md gives in words, for the positioning code (floating-ui takes numbers, not CSS variables),
// and the motion tokens read at run time (so reduced motion reaches the scripts too).
/** Every floating surface keeps this far from the viewport (Layout). */
export const EDGE = 16;
/** Between two islands (Layout). */
export const ISLAND_GAP = 12;
/** A tooltip sits this far from its control (Tooltip, Placement). */
export const TOOLTIP_OFFSET = 8;
/** A popover opens 8 px below the island that holds its trigger (the settings popover)… */
export const POPOVER_ISLAND_OFFSET = 8;
/** …or 16 px below a trigger that sits in no island. */
export const POPOVER_OFFSET = 16;
/** A toast hides itself after this long unless hovered (Toast). */
export const TOAST_DURATION = 6000;
/** The fallbacks of the motion tokens (`--motion-*` in tokens.css; a test keeps them equal). */
export const MOTION_FALLBACK = { "tooltip-delay": 350, tooltip: 150, popover: 200 } as const;

/** A motion token in milliseconds, as the page computes it (1 ms, 0 ms under reduced motion). */
export function motionMs(name: keyof typeof MOTION_FALLBACK): number {
  const fallback = MOTION_FALLBACK[name];
  if (typeof document === "undefined") return fallback;
  return toMs(getComputedStyle(document.documentElement).getPropertyValue(`--motion-${name}`), fallback);
}

/** A CSS time in milliseconds: the browser may hand back `350ms` or `0.35s`. */
export function toMs(time: string, fallback: number): number {
  const match = /^\s*(-?[\d.]+)(ms|s)\s*$/.exec(time);
  if (!match) return fallback;
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}
