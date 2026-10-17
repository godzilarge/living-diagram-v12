// The edit palette (DESIGN.md, Navigation: Edit palette; the approved mockup's `.edit-tools`): a column island 16 px
// from the left edge, nine tools in four groups (select | declare a cable, connector | note, shape, table, image, code
// block | group), each an icon with its words and its key in a tooltip to the right. Select carries the rail when no
// tool is armed, the connector while it is armed; the insertion tools insert at the centre of the view; shape asks
// rectangle or ellipse in a menu hung to its right; image opens the file input it holds (`[data-image-file]`, which
// `pickImage` and the key I click); group needs a device of the run in the selection. Declaring a cable waits for its
// lot (disabled, the reason in its tooltip). It shows in edit mode only and rises 4 px as it comes.
import { Cable, Group, Image, MousePointer2, Shapes, Spline, SquareCode, StickyNote, Table } from "lucide-react";
import { FileInput, IconButton, Island, Menu, Popover, Separator } from "../ui";
import { useText } from "../i18n";
import type { Tool } from "../state/diagram";
import type { EditCommands } from "../state/edit-commands";
import { BAR_GAP } from "../state/bar-place";
import { useToolbarKeys } from "./useToolbarKeys";
import { IMAGE_TYPES } from "./focus";
import "./edit.css";

export type EditPaletteProps = {
  tool: Tool | null;
  /** A device of the run is selected: the group tool can make a group of the selection. */
  canGroup: boolean;
  edit: EditCommands;
};

export function EditPalette({ tool, canGroup, edit }: EditPaletteProps) {
  const t = useText();
  const keys = useToolbarKeys<HTMLElement>("vertical");
  const tip = "right" as const;
  return (
    <>
      <Island
        name="edit-tools"
        layout="column"
        role="toolbar"
        aria-orientation="vertical"
        aria-label={t("edit:palette.label")}
        className="edit-palette"
        ref={keys.ref}
        onFocus={keys.onFocus}
        onKeyDown={keys.onKeyDown}
      >
        <IconButton label={t("edit:palette.select")} icon={<MousePointer2 />} shortcut="V" tooltipPlacement={tip} pressed={tool === null} onClick={() => edit.setTool(null)} />
        <Separator orientation="horizontal" />
        <IconButton label={t("edit:palette.cable")} icon={<Cable />} shortcut="L" tooltipPlacement={tip} disabled disabledReason={t("edit:palette.cableSoon")} />
        <IconButton label={t("edit:palette.connector")} icon={<Spline />} shortcut="K" tooltipPlacement={tip} pressed={tool === "connector"} onClick={() => edit.toggleTool("connector")} />
        <Separator orientation="horizontal" />
        <IconButton label={t("edit:palette.note")} icon={<StickyNote />} shortcut="N" tooltipPlacement={tip} onClick={() => edit.usePalette("note")} />
        <Popover
          name="shapes"
          label={t("edit:palette.shapes")}
          anchor="trigger"
          gap={BAR_GAP}
          placement="right-start"
          layout="list"
          trigger={(props) => <IconButton {...props} opener label={t("edit:palette.shape")} icon={<Shapes />} shortcut="S" tooltipPlacement={tip} />}
        >
          {(close) => (
            <Menu
              label={t("edit:palette.shapes")}
              focusOnOpen="menu"
              rows={[
                { id: "rectangle", label: t("edit:palette.rectangle") },
                { id: "ellipse", label: t("edit:palette.ellipse") },
              ]}
              onChoose={(id) => {
                close();
                edit.usePalette("shape", id === "ellipse" ? "ellipse" : "rectangle");
              }}
            />
          )}
        </Popover>
        <IconButton label={t("edit:palette.table")} icon={<Table />} shortcut="T" tooltipPlacement={tip} onClick={() => edit.usePalette("table")} />
        <IconButton label={t("edit:palette.image")} icon={<Image />} shortcut="I" tooltipPlacement={tip} onClick={() => edit.usePalette("image")} />
        <IconButton label={t("edit:palette.code")} icon={<SquareCode />} shortcut="B" tooltipPlacement={tip} onClick={() => edit.usePalette("code")} />
        <Separator orientation="horizontal" />
        <IconButton
          label={t("edit:palette.group")}
          icon={<Group />}
          shortcut="G"
          tooltipPlacement={tip}
          disabled={!canGroup}
          disabledReason={t("edit:palette.groupNeeds")}
          onClick={() => edit.usePalette("group")}
        />
      </Island>
      <FileInput data-image-file="" accept={IMAGE_TYPES} onFile={(file) => edit.annotationImage(file)} />
    </>
  );
}
