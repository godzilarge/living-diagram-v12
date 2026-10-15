// Ce que la page pose sur la toile, en pixels d'écran : la barre du haut et la bande des runs ; le panneau à droite
// quand une fiche est ouverte. Une seule source pour la zone visible (revue de session, D3) : le cadrage et le centrage
// (Canvas.tsx), la pastille des repères (GuideLayer.tsx, une marge de plus), et le repli de la barre contextuelle
// (FloatingBar.tsx, qui mesure en plus la recherche, la barre d'outils, la bande et le panneau dans la page).
export const CHROME = { top: 56, bottom: 84 } as const;
/** La largeur que le cadrage réserve au panneau ouvert. */
export const PANEL_W = 400;
/** La marge de la pastille des repères dans la zone visible. */
export const CHROME_MARGIN = 8;
