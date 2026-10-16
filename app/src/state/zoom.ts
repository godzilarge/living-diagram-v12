// The zoom of the canvas as the shell's controls ask for it: a step in or out keeps the point at the centre of the
// visible area where it is; "back to 100 %" does the same at zoom 1. The bounds are the canvas's own (`Flow.tsx`:
// 0.05 to 6). Pure, tested under Node; the canvas applies the view it is given.

export type View = Readonly<{ x: number; y: number; zoom: number }>;
export type Area = Readonly<{ width: number; height: number }>;
/** What the shell leaves around the visible area: the islands above and below (the v1's `CHROME`, kept). */
export type Insets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 6;
export const ZOOM_STEP = 1.2;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The view at `zoom`, the centre of the visible area (the canvas less the insets) kept in place. */
export function zoomTo(view: View, zoom: number, area: Area, insets: Insets): View {
  const next = clampZoom(zoom);
  const cx = insets.left + (area.width - insets.left - insets.right) / 2;
  const cy = insets.top + (area.height - insets.top - insets.bottom) / 2;
  const ratio = next / view.zoom;
  return { zoom: next, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

export const zoomIn = (view: View, area: Area, insets: Insets): View => zoomTo(view, view.zoom * ZOOM_STEP, area, insets);
export const zoomOut = (view: View, area: Area, insets: Insets): View => zoomTo(view, view.zoom / ZOOM_STEP, area, insets);

/** The zoom as the control says it: a whole percentage, never 0. */
export const percentOf = (zoom: number): number => Math.max(1, Math.round(zoom * 100));
