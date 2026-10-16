// The icon of a result's kind, in the row and in the detail's tile: a device by its type (the panel's tile), a port,
// a group, an HA cluster, a note or a code block, an infrastructure, an action by what it does (the canvas
// controls' icons where they have one).
import { Boxes, Crosshair, EthernetPort, GitCompare, Grid3x3, Group, History, Map as MapIcon, Maximize, Network, SquareCode, StickyNote, ZoomIn } from "lucide-react";
import type { ReactNode } from "react";
import { deviceTile } from "../panel/DevicePanel";
import type { ActionId, Hit } from "../state/search";
import { nodeOf } from "./words";

const ACTION_ICONS: Readonly<Record<ActionId, ReactNode>> = {
  fit: <Maximize />,
  center: <Crosshair />,
  zoomReset: <ZoomIn />,
  grid: <Grid3x3 />,
  minimap: <MapIcon />,
  openRun: <History />,
  compareRun: <GitCompare />,
};

export function hitIcon(hit: Hit): ReactNode {
  switch (hit.kind) {
    case "device": return deviceTile(nodeOf(hit));
    case "port": return <EthernetPort />;
    case "group": return <Group />;
    case "cluster": return <Boxes />;
    case "note": return hit.noteKind === "code" ? <SquareCode /> : <StickyNote />;
    case "infrastructure": return <Network />;
    case "action": return ACTION_ICONS[hit.id];
  }
}
