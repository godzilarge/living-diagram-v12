// Before the search palette opens over the page: an open list or popover (the infrastructure or the collection
// choice, the settings) closes first, as Escape would close it, so that closing the palette never uncovers it. The
// layers listen to Escape on the document (floating-ui's `useDismiss`); nothing is sent when none is open, since
// Escape on the page lets go of the selection. `then` runs once the layer has closed and given its focus back (the
// next frame), so that the palette takes the focus after it; at once when nothing was open.
const PALETTE = "palette";

export function closeOpenLayers(then: () => void): void {
  const open = typeof document !== "undefined" && Array.from(document.querySelectorAll("[data-layer]")).some((layer) => layer.getAttribute("data-layer") !== PALETTE);
  if (!open) return then();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  requestAnimationFrame(() => then());
}
