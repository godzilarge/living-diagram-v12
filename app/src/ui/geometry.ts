// The distances DESIGN.md gives in words, for the positioning code (floating-ui takes numbers, not CSS variables).
/** Every floating surface keeps this far from the viewport (Layout). */
export const EDGE = 16;
/** Between two islands (Layout). */
export const ISLAND_GAP = 12;
/** A tooltip sits this far from its control (Tooltip, Placement). */
export const TOOLTIP_OFFSET = 8;
/** The delay before a tooltip shows (Tooltip, Placement), and its fade (motion.tooltip). */
export const TOOLTIP_DELAY = 350;
export const TOOLTIP_FADE = 150;
/** A popover opens this far from its trigger: 8 px below the island that holds it (the settings popover). */
export const POPOVER_OFFSET = 16;
export const POPOVER_FADE = 200;
