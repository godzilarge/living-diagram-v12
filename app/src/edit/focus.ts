// Where the focus goes back when an edit layer lets go of it (Escape on a contextual bar, the context menu closed):
// the selected element of the map, else the map itself.
export function focusMap(): void {
  const node = document.querySelector<HTMLElement>(".react-flow__node.selected") ?? document.querySelector<HTMLElement>(".diagram-canvas");
  node?.focus({ preventScroll: true });
}

/** The image types the intent's image store takes (the v1's rule): the palette's image tool, the bar's "replace". */
export const IMAGE_TYPES = "image/png,image/jpeg,image/webp";
