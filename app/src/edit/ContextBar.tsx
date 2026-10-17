// The contextual bar (DESIGN.md, Contextual bars; the approved mockup's device bar and note bar): an island over the
// selected element, 12 px above it and centred on it, flipped 12 px under it when the top islands are near
// (`state/bar-place.ts`), never outside the zone the shell leaves free (no bar then, until the view brings the
// element back). Its buttons come from `state/bars.ts` (words, icon, state, what they open) and run through
// `state/bar-actions.ts`; a button that opens a volet is a popover trigger (`Volets.tsx`). Rendered inside the v1 canvas
// (a child of `Flow`): it reads the toile (selection, geometry, version), the gestures (`gate`: it hides during one
// and comes back 120 ms after) and the React Flow view, positioned through the CSSOM (`--bar-x`, `--bar-y`), never a
// style attribute. A toolbar: ← → walk its buttons, Escape gives the focus back to the map. No bar for a cable, a
// cluster, nothing selected, or while a tool is armed.
import { useMergeRefs } from "@floating-ui/react";
import { useStoreApi } from "@xyflow/react";
import type { Ref } from "react";
import { memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FloatingHost } from "@engine/app/canvas/Flow";
import type { Toile } from "@engine/app/canvas/toile";
import type { Gate } from "@engine/app/canvas/gate";
import { anchorOf, selectionKey, targetOf } from "@engine/app/state/floating";
import type { Geometry, Target } from "@engine/app/state/floating";
import { Button, FileInput, IconButton, Island, Separator } from "../ui";
import { i18n, useText } from "../i18n";
import type { Tool } from "../state/diagram";
import type { EditCommands } from "../state/edit-commands";
import { barLabel, entriesOf } from "../state/bars";
import type { BarButton, BarEntry } from "../state/bars";
import { runBar } from "../state/bar-actions";
import { placeBar, toScreen, zoneOf } from "../state/bar-place";
import type { Rect } from "../state/bar-place";
import { barIcon } from "./icons";
import { useToolbarKeys } from "./useToolbarKeys";
import { VoletButton } from "./Volets";
import type { Run } from "./Volets";
import { IMAGE_TYPES } from "./focus";
import "./edit.css";

/** After a gesture, the bar comes back this long after (the v1's rhythm). */
const RETURN_MS = 120;

export type ContextBarProps = {
  edit: EditCommands;
  /** Counts the intent writes the canvas accepted: the model changed in place, the buttons are read again. */
  revision: number;
  tool: Tool | null;
};

/** Where the toile has drawn each element, in the plan (the v1's geometry). */
const geometryOf = (toile: Toile): Geometry => ({
  node: (host) => {
    const centre = toile.state.positions.get(host), box = toile.boxes.get(host);
    return centre && box ? { x: centre.x - box.w / 2, y: centre.y - box.h / 2, w: box.w, h: box.h } : null;
  },
  annotation: (id) => toile.frames.get(id) ?? null,
  connector: (id) => toile.ends.get(id) ?? null,
  group: (id) => toile.groupFrames.get(id) ?? null,
});

/** No gesture under way, and none for 120 ms. */
function useSettled(gate: Gate): boolean {
  const busy = useSyncExternalStore(gate.subscribe, gate.busy, gate.busy);
  const [settled, setSettled] = useState(true);
  useEffect(() => {
    if (busy) {
      setSettled(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSettled(true), RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [busy]);
  return !busy && settled;
}

export function ContextBar(props: ContextBarProps) {
  const host = useContext(FloatingHost);
  return host ? <Bar {...props} toile={host.toile} gate={host.gate} /> : null;
}

function Bar({ toile, gate, edit, revision, tool }: ContextBarProps & { toile: Toile; gate: Gate }) {
  const t = useText();
  const language = i18n.language;
  const version = useSyncExternalStore(toile.subscribe, toile.version, toile.version);
  const settled = useSettled(gate);
  const store = useStoreApi();
  const model = toile.model;
  const { selection, multi } = toile.state;
  const key = selectionKey(selection, multi);
  const target = tool ? null : targetOf(model, selection, multi);
  // the buttons follow the model (changed in place: the version and the revision say so), the selection and the
  // language; never the view (a pan reads nothing here: `place` runs on its own)
  const entries = useMemo(() => (target ? entriesOf(t, model, target) : []), [model, key, version, revision, language, tool]);
  const label = target ? barLabel(t, target) : "";
  const island = useRef<HTMLElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [below, setBelow] = useState(false);
  const targetRef = useRef<Target | null>(target);
  targetRef.current = target;

  // the minimap, when shown, is an island inside the zone (bottom right in edit mode): a bar never covers it
  const islandIn = (area: HTMLElement): Rect | null => {
    const mini = area.querySelector(".react-flow__minimap");
    if (!mini) return null;
    const r = mini.getBoundingClientRect(), a = area.getBoundingClientRect();
    return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height };
  };
  // the place, from the view, the geometry and the bar's own width: set on the element, never in a style attribute
  const place = useCallback((): void => {
    const element = island.current, area = element?.parentElement, aimed = targetRef.current;
    if (!element || !area || !aimed) return;
    const [x, y, zoom] = store.getState().transform;
    const plane = anchorOf(aimed.kind === "multi" ? aimed.multi : toile.state.multi, geometryOf(toile));
    const spot = plane ? placeBar(toScreen(plane, { x, y, zoom }), element.offsetWidth, zoneOf(area.clientWidth, area.clientHeight, islandIn(area))) : null;
    if (!spot) {
      element.setAttribute("data-offscreen", "");
      return;
    }
    element.removeAttribute("data-offscreen");
    element.style.setProperty("--bar-x", `${spot.x}px`);
    element.style.setProperty("--bar-y", `${spot.y}px`);
    setBelow(spot.below);
  }, [store, toile]);
  useLayoutEffect(place);
  // a pan or a zoom moves the bar with its element, without a render
  useEffect(() => {
    let last = store.getState().transform;
    const unsubscribe = store.subscribe((state) => {
      if (state.transform === last) return;
      last = state.transform;
      place();
    });
    window.addEventListener("resize", place);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", place);
    };
  }, [store, place]);

  const run = useCallback<Run>((id, value) => {
    const aimed = targetRef.current;
    if (aimed) runBar(id, value, aimed, { commands: edit, model: toile.model, toile, pickFile: () => file.current?.click() });
  }, [edit, toile]);
  const replace = (picked: File): void => {
    const aimed = targetRef.current;
    if (aimed?.kind === "annotation") edit.annotationImage(picked, aimed.a.id);
  };

  if (!target || !settled || !entries.length) return null;
  return (
    <>
      <BarBody key={key} ref={island} label={label} entries={entries} below={below} run={run} />
      <FileInput ref={file} accept={IMAGE_TYPES} onFile={replace} />
    </>
  );
}

type BodyProps = { label: string; entries: readonly BarEntry[]; below: boolean; run: Run; ref: Ref<HTMLElement> };

/** The island and its buttons: rendered again when the buttons change, never on a pan. */
const BarBody = memo(function BarBody({ label, entries, below, run, ref }: BodyProps) {
  const keys = useToolbarKeys<HTMLElement>("horizontal");
  const merged = useMergeRefs([ref, keys.ref]);
  return (
    <Island
      name="context-bar"
      layout="bar"
      role="toolbar"
      aria-label={label}
      className="context-bar"
      ref={merged}
      onFocus={keys.onFocus}
      onKeyDown={keys.onKeyDown}
    >
      {entries.map((entry, at) => (entry.id === "sep" ? <Separator key={`sep-${at}`} /> : <BarControl key={entry.id} button={entry as BarButton} below={below} run={run} />))}
    </Island>
  );
}, (before, after) => before.entries === after.entries && before.below === after.below && before.label === after.label && before.run === after.run);

function BarControl({ button, below, run }: { button: BarButton; below: boolean; run: Run }) {
  if (button.volet) return <VoletButton button={button} volet={button.volet} below={below} run={run} />;
  const tip = below ? "bottom" : "top";
  const shortcut = button.shortcut?.join(" ");
  const keys = button.aria;
  if (!button.icon) {
    return (
      <Button tooltip={button.label} shortcut={shortcut} tooltipPlacement={tip} aria-label={button.label} aria-keyshortcuts={keys} pressed={button.pressed} disabled={button.disabled} onClick={() => run(button.id, null)}>
        {button.value ?? ""}
      </Button>
    );
  }
  return (
    <IconButton
      label={button.label}
      icon={barIcon(button.icon)}
      shortcut={shortcut}
      aria-keyshortcuts={keys}
      pressed={button.pressed}
      disabled={button.disabled}
      disabledReason={button.disabledReason}
      danger={button.danger}
      tooltipPlacement={tip}
      onClick={() => run(button.id, null)}
    />
  );
}
