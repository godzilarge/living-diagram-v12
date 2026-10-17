// The diagram page's search: the palette open or not, its trigger (the focus comes back to it), its sources (the run
// shown, the infrastructures the context island lists, the current one, the actions of the shell with their words),
// and what a chosen result does here: an element is selected and its panel opens, or it is selected and centred (a
// removed device, a neighbour never collected, "centre the view"); another infrastructure opens its page; an action
// runs the shell's command; the query's own action hides the devices the expression designates (the view's rule), and
// "show the hidden devices" lifts every rule. Sources are memoised; the search runs on every keystroke without another cache.
import { useCallback, useMemo, useRef, useState } from "react";
import type { Model, Selection } from "@engine/canvas/types";
import { useText } from "../i18n";
import type { Prefs } from "../prefs";
import type { DiagramState } from "../state/diagram";
import type { KnownInfrastructure } from "../state/useInfrastructures";
import { compareChoices } from "../state/runs";
import type { Sources } from "../state/search";
import type { DiagramCommands } from "../state/useDiagram";
import type { Choice, SearchPaletteProps } from "../search/SearchPalette";
import type { SearchControl } from "../shell/ShellTools";
import { closeOpenLayers } from "../shell/closeLayers";
import { actionSources } from "../search/words";

export const PALETTE_ID = "search-palette";

type SearchOptions = Readonly<{
  state: DiagramState;
  model: Model | null;
  infrastructures: readonly KnownInfrastructure[];
  commands: DiagramCommands;
  prefs: Prefs;
  setPrefs: (next: Prefs) => void;
  onInfrastructure: (name: string) => void;
  /** How many devices the view hides (the palette offers to show them). */
  hidden: number;
}>;

/** The selected element's name, for "centre the view on…": a device, a group, an HA cluster. */
function selectedName(model: Model | null, selection: Selection | null): string | null {
  if (!model || !selection) return null;
  if (selection.kind === "node") return selection.id;
  if (selection.kind === "group") return model.groupById.get(selection.id)?.label ?? null;
  if (selection.kind === "cluster") return model.clusterById.get(selection.id)?.raw.cluster_name || null;
  return null;
}

export function useSearch({ state, model, infrastructures, commands, prefs, setPrefs, onInfrastructure, hidden }: SearchOptions) {
  const t = useText();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [now] = useState(Date.now);
  const language = t("ui:locale");
  const selected = selectedName(model, state.selection);
  const runs = state.runs;
  const current = state.address.runId;
  const actions = useMemo(
    () => actionSources(t, { selected, grid: prefs.grid, minimap: prefs.minimap, editing: state.editing, hidden, runs: runs ?? [], current, compare: compareChoices(runs ?? [], current), now }),
    // the words follow the language (`t` changes identity at every render)
    [language, selected, prefs.grid, prefs.minimap, state.editing, hidden, runs, current, now],
  );
  const sources = useMemo<Sources>(
    () => ({ model, infrastructures, current: state.address.infrastructure, actions }),
    [model, infrastructures, state.address.infrastructure, actions],
  );
  const onChoose = useCallback(
    ({ hit, how }: Choice) => {
      switch (hit.kind) {
        case "infrastructure":
          if (!hit.current) onInfrastructure(hit.name);
          return;
        case "action":
          if (hit.id === "grid") return setPrefs({ ...prefs, grid: !prefs.grid });
          if (hit.id === "minimap") return setPrefs({ ...prefs, minimap: !prefs.minimap });
          if (hit.id === "edit") return commands.toggleEdit();
          if (hit.id === "hideMatches") return hit.rule ? commands.edit.hideRule(hit.rule) : undefined;
          if (hit.id === "showHidden") return commands.edit.showAll();
          if (hit.id === "openRun") return hit.runId ? commands.openFromBand(hit.runId) : undefined;
          if (hit.id === "compareRun") return hit.runId ? commands.compareTo(hit.runId) : undefined;
          return commands[hit.id]();
        default: {
          const onMap = how === "reveal" || (hit.kind === "device" && (hit.removed || hit.nodeKind === "stub"));
          return onMap ? commands.reveal(hit.selection) : commands.openElement(hit.selection);
        }
      }
    },
    [commands, prefs, setPrefs, onInfrastructure],
  );
  const onOpen = useCallback(() => closeOpenLayers(() => setOpen(true)), []);
  const onClose = useCallback(() => setOpen(false), []);
  const control: SearchControl = { open, controls: PALETTE_ID, onOpen, ref: trigger };
  const palette: SearchPaletteProps = { id: PALETTE_ID, open, onClose, sources, onChoose, returnFocus: trigger };
  return { control, palette };
}
