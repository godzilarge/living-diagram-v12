// The edit palette (DESIGN.md, Navigation: Edit palette; the approved mockup's `.edit-tools`): a column island 16 px
// from the left edge, nine tools in four groups (select | declare a cable, connector | note, shape, table, image, code
// block | group), each an icon with its words and its key in a tooltip to the right. Select carries the rail when no
// tool is armed, the connector while it is armed; the insertion tools insert at the centre of the view; shape asks
// rectangle or ellipse in a menu hung to its right; image opens the file input it holds (`[data-image-file]`, which
// `pickImage` and the key I click); group needs a device of the run in the selection. Declaring a cable waits for its
// lot (disabled, the reason in its tooltip). Its foot, past a hairline: the hidden devices (a menu hung to the right:
// one row per rule of the view, as the gesture that wrote it, a small cross on its right; then, when the run has any,
// the unknown neighbours, one gesture row that shows or hides them, `stubs=1` in the address; then "show all". A hiding
// is a view rule, a row lifts its rule as a whole, and this is the one place that lifts it), undo and redo. It shows
// in edit mode only and rises 4 px as it comes.
import { Cable, EyeOff, Group, Image, MousePointer2, Redo2, Shapes, Spline, SquareCode, StickyNote, Table, Undo2 } from "lucide-react";
import { FileInput, IconButton, Island, Menu, Popover, Separator } from "../ui";
import type { MenuRow } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import type { Tool } from "../state/diagram";
import type { EditCommands } from "../state/edit-commands";
import type { HiddenRule } from "../state/hidden";
import { BAR_GAP } from "../state/bar-place";
import { useToolbarKeys } from "./useToolbarKeys";
import { IMAGE_TYPES } from "./focus";
import { hiddenRuleWords, stubsRowWords } from "./hidden-words";
import "./edit.css";

export type EditPaletteProps = {
  tool: Tool | null;
  /** A device of the run is selected: the group tool can make a group of the selection. */
  canGroup: boolean;
  edit: EditCommands;
  /** The undo stack: can Ctrl+Z, can Ctrl+Y. */
  history: Readonly<{ undo: boolean; redo: boolean }>;
  /** The view's rules, each with the devices of the run it keeps out (state/hidden.ts). */
  hidden: readonly HiddenRule[];
  /** The devices the view hides in all (a device two rules keep out counts once). */
  hiddenCount: number;
  /** The run's unknown neighbours (stub nodes: announced by LLDP / CDP, never collected). */
  stubs: number;
  /** The view draws them (`stubs=1`). */
  showStubs: boolean;
};

export type EditPaletteFootProps = Pick<EditPaletteProps, "history" | "hidden" | "hiddenCount" | "stubs" | "showStubs"> & {
  edit: Pick<EditCommands, "showRule" | "showAll" | "showStubs" | "undo" | "redo">;
};

const TIP = "right" as const;
// a rule may hold any character: a row's id is its index, under a prefix the other rows cannot share
const RULE = "rule:";
const ALL = "all";
const STUBS = "stubs";

/** The menu's rows: the rules under their heading, then the unknown neighbours when the run has any, then "show all";
 *  a section with nothing in it is left out (no rule: neither the heading nor "show all", which would lift nothing). */
function hiddenRows(t: Translate, { hidden, stubs, showStubs }: Pick<EditPaletteFootProps, "hidden" | "stubs" | "showStubs">): MenuRow[] {
  const rules: MenuRow[] = hidden.length
    ? [{ kind: "heading", label: t("edit:palette.hidden") }, ...hidden.map((row, index): MenuRow => ({ id: RULE + index, label: hiddenRuleWords(t, row), verbatim: true, trailing: "lift" }))]
    : [];
  const neighbours: MenuRow[] = stubs ? [{ kind: "heading", label: t("edit:palette.stubs") }, { id: STUBS, label: stubsRowWords(t, stubs, showStubs) }] : [];
  const all: MenuRow[] = hidden.length ? [{ kind: "separator" }, { id: ALL, label: t("edit:palette.showAll") }] : [];
  return [...rules, ...neighbours, ...all];
}

/** The palette's foot (also on the primitives page): the hidden devices' menu, undo, redo. */
export function EditPaletteFoot({ history, hidden, hiddenCount, stubs, showStubs, edit }: EditPaletteFootProps) {
  const t = useText();
  const ctrl = t("ui:keys.ctrl");
  const label = hiddenCount ? t("edit:palette.hiddenCount", { count: hiddenCount }) : t("edit:palette.hidden");
  const rows = hiddenRows(t, { hidden, stubs, showStubs });
  return (
    <>
      <Separator orientation="horizontal" />
      <Popover
        name="hidden"
        label={t("edit:palette.hidden")}
        anchor="trigger"
        gap={BAR_GAP}
        placement="right-start"
        layout="list"
        trigger={(props) => (
          <IconButton {...props} opener label={label} icon={<EyeOff />} tooltipPlacement={TIP} disabled={!hidden.length && !stubs} disabledReason={t("edit:palette.hiddenNone")} />
        )}
      >
        {(close) => (
          <Menu
            label={t("edit:palette.hidden")}
            focusOnOpen="menu"
            rows={rows}
            onChoose={(id) => {
              close();
              if (id === ALL) edit.showAll();
              else if (id === STUBS) edit.showStubs(!showStubs);
              else {
                const row = hidden[Number(id.slice(RULE.length))];
                if (row) edit.showRule(row.rule);
              }
            }}
          />
        )}
      </Popover>
      <IconButton
        label={t("edit:palette.undo")}
        icon={<Undo2 />}
        shortcut={`${ctrl} Z`}
        aria-keyshortcuts="Control+Z"
        tooltipPlacement={TIP}
        disabled={!history.undo}
        disabledReason={t("edit:palette.undoNone")}
        onClick={() => edit.undo()}
      />
      <IconButton
        label={t("edit:palette.redo")}
        icon={<Redo2 />}
        shortcut={`${ctrl} Y`}
        aria-keyshortcuts="Control+Y"
        tooltipPlacement={TIP}
        disabled={!history.redo}
        disabledReason={t("edit:palette.redoNone")}
        onClick={() => edit.redo()}
      />
    </>
  );
}

export function EditPalette({ tool, canGroup, edit, history, hidden, hiddenCount, stubs, showStubs }: EditPaletteProps) {
  const t = useText();
  const keys = useToolbarKeys<HTMLElement>("vertical");
  const tip = TIP;
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
        <EditPaletteFoot history={history} hidden={hidden} hiddenCount={hiddenCount} stubs={stubs} showStubs={showStubs} edit={edit} />
      </Island>
      <FileInput data-image-file="" accept={IMAGE_TYPES} onFile={(file) => edit.annotationImage(file)} />
    </>
  );
}
