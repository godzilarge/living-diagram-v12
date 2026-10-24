// The Check view (DESIGN.md, Check view; the approved mockup design/comps/shell/control.html, direction A "the
// register", its widgets on the free grid of tiles chosen at the bench design/rounds/2026-10-24-grille/, G3): under the
// diagram's top row, a space that scrolls holds the four widgets as tiles, each moved by its header and resized by its
// handles; the layout is a browser preference (`checkTiles`, given and written by the page). A tile's last button
// enlarges it over the space (over the scrim); its button or Escape reduces it; enlarged, the grid's gestures are off.
// It renders the run's model and the archived runs; nothing is read here. A target of a verdict is an address the
// diagram page listens to.
import { useCallback, useEffect, useState } from "react";
import type { Model } from "@engine/canvas/types";
import type { RunEntry } from "../api/run";
import { useText } from "../i18n";
import { Scrim, Tiles } from "../ui";
import type { WidgetEnlarge } from "../ui";
import type { Address, ViewState } from "../state/address";
import type { TileId, Tiles as TilesValue } from "../state/tiles";
import { CoverageWidget } from "./CoverageWidget";
import { DeliveryWidget } from "./DeliveryWidget";
import { SourcesWidget } from "./SourcesWidget";
import { VerdictsWidget } from "./VerdictsWidget";
import "./control.css";

export type ControlViewProps = {
  model: Model;
  address: Address;
  view: ViewState;
  runs: readonly RunEntry[] | null;
  now: number;
  /** The layout of the tiles (`ld-prefs.checkTiles`) and its writer. */
  tiles: TilesValue;
  onTiles: (next: TilesValue) => void;
};

/** The tile enlarged (transient: neither stored nor in the address); Escape reduces it, unless a layer is open (the
 *  search palette, a popover: Escape closes it first). The shell's keys take Escape first and do nothing in Check. */
function useEnlarged() {
  const [enlarged, setEnlarged] = useState<TileId | null>(null);
  useEffect(() => {
    if (!enlarged) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[data-layer]")) setEnlarged(null);
    };
    // at the capture phase: a tooltip shown on the focused button takes Escape for itself otherwise
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enlarged]);
  return [enlarged, setEnlarged] as const;
}

export function ControlView({ model, address, view, runs, now, tiles, onTiles }: ControlViewProps) {
  const t = useText();
  const [enlarged, setEnlarged] = useEnlarged();
  const enlarge = useCallback(
    (id: TileId): WidgetEnlarge => {
      const on = enlarged === id;
      return {
        on,
        label: t(on ? "control:tile.reduce" : "control:tile.enlarge"),
        shortcut: on ? t("ui:keys.escape") : undefined,
        onToggle: () => setEnlarged(on ? null : id),
      };
    },
    [enlarged, setEnlarged, t],
  );
  return (
    <main className="control-space" aria-label={t("control:space")} data-enlarged={enlarged ? "" : undefined}>
      <Tiles tiles={tiles} onChange={onTiles} enabled={!enlarged} enlarged={enlarged} label={t("control:tile.grid")}>
        <VerdictsWidget key="verdicts" model={model} address={address} view={view} enlarge={enlarge("verdicts")} />
        <CoverageWidget key="coverage" model={model} enlarge={enlarge("coverage")} />
        <SourcesWidget key="sources" model={model} enlarge={enlarge("sources")} />
        <DeliveryWidget key="delivery" model={model} runs={runs} runId={address.runId} now={now} enlarge={enlarge("delivery")} />
      </Tiles>
      <Scrim open={!!enlarged} onDismiss={() => setEnlarged(null)} />
    </main>
  );
}
