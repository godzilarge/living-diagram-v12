// La molette sur la toile de l'application (D2 de docs/11, révisée le 2026-10-14 : elle zoome, React Flow). Avec Ctrl
// (ou Cmd), React Flow traite le cran comme un pincement de pavé tactile (pas ×10) : un cran de souris (100)
// quadruplait le zoom. Ici, un cran de souris zoome comme la molette seule (×1,15), un pincement garde son pas. Pur, testé sous Node (`LDApp.wheel`) ; la page lit l'événement et pose la vue.

/** Les petits pas d'un pavé tactile (pincement) : sous cette valeur absolue de `deltaY` en pixels. */
const PINCH_BELOW = 10;

/** Le zoom après un cran de molette tenu avec Ctrl : vers l'avant (deltaY < 0) on s'approche ; borné. */
export function wheelZoom(zoom: number, deltaY: number, deltaMode: number, min: number, max: number): number {
  const unit = deltaMode === 1 ? 0.05 : deltaMode === 2 ? 1 : 0.002; // lignes, pages, pixels (comme d3-zoom)
  const pinch = deltaMode === 0 && Math.abs(deltaY) < PINCH_BELOW;
  const next = zoom * Math.pow(2, -deltaY * unit * (pinch ? 10 : 1));
  return Math.min(max, Math.max(min, next));
}

/** La vue qui garde sous le pointeur (`px`, `py`, à l'écran, relatif à la toile) le même point du plan. */
export function zoomAround(view: { x: number; y: number; zoom: number }, zoom: number, px: number, py: number): { x: number; y: number; zoom: number } {
  return { zoom, x: px - ((px - view.x) * zoom) / view.zoom, y: py - ((py - view.y) * zoom) / view.zoom };
}

export const wheel = { wheelZoom, zoomAround };
