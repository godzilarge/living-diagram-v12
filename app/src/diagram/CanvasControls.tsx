// The canvas controls (design/comps/shell/index.html, `.ctl`): zoom out, the zoom as a word (a click goes back to
// 100 %), zoom in | show everything, the grid, the overview | edit (brick 6). Each tooltip says its key; the page
// listens to them (`useShellKeys`). The grid and the overview are browser preferences.
import { Grid3x3, Map as MapIcon, Maximize, Pencil, ZoomIn, ZoomOut } from "lucide-react";
import { Button, IconButton, Island, Separator } from "../ui";
import { useText } from "../i18n";
import type { DiagramCommands } from "../state/useDiagram";
import { percentOf } from "../state/zoom";

export type CanvasControlsProps = {
  zoom: number;
  grid: boolean;
  minimap: boolean;
  commands: Pick<DiagramCommands, "zoomIn" | "zoomOut" | "zoomReset" | "fit">;
  onGrid: () => void;
  onMinimap: () => void;
};

export function CanvasControls({ zoom, grid, minimap, commands, onGrid, onMinimap }: CanvasControlsProps) {
  const t = useText();
  return (
    <Island name="canvas-controls" layout="bar" role="toolbar" aria-label={t("diagram:controls.label")} className="diagram-controls">
      <IconButton label={t("diagram:controls.zoomOut")} icon={<ZoomOut />} shortcut={"−"} tooltipPlacement="top" onClick={commands.zoomOut} />
      <Button tooltip={t("diagram:controls.zoomReset")} shortcut="0" className="diagram-zoom" onClick={commands.zoomReset}>
        {t("diagram:controls.zoom", { value: percentOf(zoom) })}
      </Button>
      <IconButton label={t("diagram:controls.zoomIn")} icon={<ZoomIn />} shortcut="+" tooltipPlacement="top" onClick={commands.zoomIn} />
      <Separator />
      <IconButton label={t("diagram:controls.fit")} icon={<Maximize />} shortcut="F" tooltipPlacement="top" onClick={commands.fit} />
      <IconButton label={t("diagram:controls.grid")} icon={<Grid3x3 />} pressed={grid} shortcut="G" tooltipPlacement="top" onClick={onGrid} />
      <IconButton label={t("diagram:controls.minimap")} icon={<MapIcon />} pressed={minimap} shortcut="N" tooltipPlacement="top" onClick={onMinimap} />
      <Separator />
      <IconButton
        label={t("diagram:controls.edit")}
        icon={<Pencil />}
        pressed={false}
        disabled
        disabledReason={t("diagram:controls.editSoon")}
        tooltipPlacement="top"
      />
    </Island>
  );
}
