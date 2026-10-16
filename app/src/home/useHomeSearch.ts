// The home's search: the same palette as the diagram's, with the infrastructures alone (the home knows their size);
// choosing one opens its diagram on its last collection that gave data, as the Infrastructures widget's rows do.
import { useCallback, useMemo, useRef, useState } from "react";
import { infraRows } from "../state/home";
import type { HomeState } from "../state/useHome";
import type { Scope, Sources } from "../state/search";
import type { Choice, SearchPaletteProps } from "../search/SearchPalette";
import type { SearchControl } from "../shell/ShellTools";
import { closeOpenLayers } from "../shell/closeLayers";

export const HOME_PALETTE_ID = "search-palette";
const HOME_SCOPES: readonly Scope[] = ["all", "infrastructures"];

export function useHomeSearch(state: HomeState) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const load = state.infrastructures;
  // the most recent collection first, as the widget lists them; recomputed when the list is read again
  const rows = useMemo(() => (load.kind === "ok" ? infraRows(load.data.infrastructures, Date.now(), import.meta.env.BASE_URL) : []), [load]);
  const sources = useMemo<Sources>(() => ({ model: null, infrastructures: rows.map((row) => ({ name: row.name, devices: row.devices })), current: "", actions: [] }), [rows]);
  const onChoose = useCallback(
    ({ hit }: Choice) => {
      const row = hit.kind === "infrastructure" ? rows.find((r) => r.name === hit.name) : undefined;
      if (row) window.location.assign(row.href);
    },
    [rows],
  );
  const onOpen = useCallback(() => closeOpenLayers(() => setOpen(true)), []);
  const onClose = useCallback(() => setOpen(false), []);
  const control: SearchControl = { open, controls: HOME_PALETTE_ID, onOpen, ref: trigger };
  const palette: SearchPaletteProps = { id: HOME_PALETTE_ID, open, onClose, sources, scopes: HOME_SCOPES, home: true, onChoose, returnFocus: trigger };
  return { control, palette };
}
