// What a button of a contextual bar opens (DESIGN.md, Contextual bars; the approved mockup's volets): a popover hung
// 12 px from the bar, its first control under its trigger, above the bar (below it when the bar sits under its
// element). By kind: the hues (a row of the canvas's twelve swatches, the posed one on the rail, "type default" when
// the element can go back to it), a list of values (a column of words, the current one on the rail), align and
// distribute (a row of icons, then snap to a grid), a menu (the "more" and "group" choices), the code block's languages
// (code, then network configuration; "looks like X, apply" when the text says another one) and its fonts. A choice
// closes the volet and runs (`runBar`, through `run`). The arrows walk a row or a column; Escape closes it.
import { Button, IconButton, Menu, Popover, Separator, Swatch } from "../ui";
import type { MenuRow } from "../ui";
import { hueLabel } from "@engine/canvas/hues";
import { CODE_FONTS } from "@engine/app/code/geometry";
import { LANGUAGES, LANGUAGE_LABEL, detectLanguage } from "@engine/app/code/languages";
import type { BarAlign } from "@engine/app/state/floating";
import type { Placement } from "@floating-ui/react";
import type { ReactNode } from "react";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import { ALIGN_MODES, DISTRIBUTE_MODES, HUE_CHOICES } from "../state/bars";
import type { BarButton, Volet } from "../state/bars";
import { BAR_GAP } from "../state/bar-place";
import { alignIcon, barIcon, gridIcon } from "./icons";
import { useToolbarKeys } from "./useToolbarKeys";

/** Runs a button of the bar (`id`) with a choice (`value`: a hue, a size, a mode, a menu entry; null: none). */
export type Run = (id: string, value: string | null) => void;

type VoletOf<K extends Volet["kind"]> = Extract<Volet, { kind: K }>;

const layoutOf = (volet: Volet): "bar" | "column" | "list" =>
  volet.kind === "hues" || volet.kind === "align" ? "bar" : volet.kind === "list" ? "column" : "list";

function labelOf(t: Translate, volet: Volet): string {
  switch (volet.kind) {
    case "hues": return t("edit:volet.hues");
    case "align": return t("edit:volet.align");
    case "codeLanguage": return t("edit:volet.language");
    case "codeFont": return t("edit:volet.font");
    default: return volet.title;
  }
}

/** A row or a column of controls the arrows walk (the volet's own popover lays them out). */
function Walk({ orientation, label, children }: { orientation: "horizontal" | "vertical"; label: string; children: ReactNode }) {
  const keys = useToolbarKeys<HTMLDivElement>(orientation);
  return (
    <div ref={keys.ref} className="edit-walk" role="toolbar" aria-orientation={orientation} aria-label={label} onFocus={keys.onFocus} onKeyDown={keys.onKeyDown}>
      {children}
    </div>
  );
}

function Hues({ volet, tip, choose }: { volet: VoletOf<"hues">; tip: Placement; choose: (value: string | null) => void }) {
  const t = useText();
  return (
    <Walk orientation="horizontal" label={t("edit:volet.hues")}>
      {HUE_CHOICES.map((hue) => (
        <IconButton key={hue} label={hueLabel(hue)} icon={<Swatch swatch={hue} />} pressed={volet.value === hue} tooltipPlacement={tip} onClick={() => choose(hue)} />
      ))}
      {volet.allowDefault ? (
        <>
          <Separator />
          <Button pressed={volet.value === null} onClick={() => choose(null)}>
            {t("edit:bar.hueDefault")}
          </Button>
        </>
      ) : null}
    </Walk>
  );
}

function List({ volet, choose }: { volet: VoletOf<"list">; choose: (value: string) => void }) {
  return (
    <Walk orientation="vertical" label={volet.title}>
      {volet.options.map((option) => (
        <Button key={option.value} pressed={option.value === volet.value} className="edit-volet-choice" onClick={() => choose(option.value)}>
          {option.label}
        </Button>
      ))}
    </Walk>
  );
}

function Align({ volet, tip, pick }: { volet: VoletOf<"align">; tip: Placement; pick: Run }) {
  const t = useText();
  const button = (mode: BarAlign) => (
    <IconButton key={mode} label={t(`edit:bar.alignModes.${mode}`)} icon={alignIcon(mode)} tooltipPlacement={tip} onClick={() => pick("align", mode)} />
  );
  const spread = DISTRIBUTE_MODES.filter((mode) => volet.modes.includes(mode));
  return (
    <Walk orientation="horizontal" label={t("edit:volet.align")}>
      {ALIGN_MODES.filter((mode) => volet.modes.includes(mode)).map(button)}
      {spread.length ? <Separator /> : null}
      {spread.map(button)}
      {volet.grid ? (
        <>
          <Separator />
          <IconButton label={t("edit:bar.grid")} icon={gridIcon()} shortcut={[t("edit:keys.alt"), "G"].join(" ")} tooltipPlacement={tip} onClick={() => pick("grid", null)} />
        </>
      ) : null}
    </Walk>
  );
}

/** The languages: the one the text looks like first (when it is another), then code, then network configuration. */
function languageRows(t: Translate, volet: VoletOf<"codeLanguage">): MenuRow[] {
  const found = detectLanguage(volet.text);
  const suggest = found.id !== volet.value && found.id !== "plain" ? found.id : null;
  const group = (network: boolean): MenuRow[] =>
    LANGUAGES.filter((language) => language.network === network).map((language) => ({ id: language.id, label: LANGUAGE_LABEL[language.id], checked: language.id === volet.value }));
  return [
    ...(suggest ? [{ id: suggest, label: t("edit:volet.looksLike", { language: LANGUAGE_LABEL[suggest] }) }, { kind: "separator" as const }] : []),
    { kind: "heading", label: t("edit:volet.codeGroup") },
    ...group(false),
    { kind: "heading", label: t("edit:volet.networkGroup") },
    ...group(true),
  ];
}

function VoletBody({ volet, tip, choose, pick }: { volet: Volet; tip: Placement; choose: (value: string | null) => void; pick: Run }) {
  const t = useText();
  switch (volet.kind) {
    case "hues": return <Hues volet={volet} tip={tip} choose={choose} />;
    case "list": return <List volet={volet} choose={choose} />;
    case "align": return <Align volet={volet} tip={tip} pick={pick} />;
    case "menu": return <Menu label={volet.title} focusOnOpen="menu" rows={volet.items} onChoose={choose} />;
    case "codeLanguage": return <Menu label={t("edit:volet.language")} focusOnOpen="menu" rows={languageRows(t, volet)} onChoose={choose} />;
    case "codeFont":
      return <Menu label={t("edit:volet.font")} focusOnOpen="menu" rows={CODE_FONTS.map((font) => ({ id: font.id, label: font.family, checked: font.id === volet.value }))} onChoose={choose} />;
  }
}

/** The face of a button that opens a volet (the mockup's `.opener`): its swatch, its value or its icon, and the chevron
 *  that says it opens (the "more" ellipsis says it alone). */
function openerFace(button: BarButton) {
  if (button.swatch) return { icon: <Swatch swatch={button.swatch} />, text: null };
  if (button.value !== undefined) return { icon: null, text: button.value };
  return { icon: button.icon ? barIcon(button.icon) : null, text: null };
}

export type VoletButtonProps = { button: BarButton; volet: Volet; below: boolean; run: Run; defaultOpen?: boolean };

export function VoletButton({ button, volet, below, run, defaultOpen }: VoletButtonProps) {
  const t = useText();
  const tip: Placement = below ? "bottom" : "top";
  const face = openerFace(button);
  const chevron = button.id !== "more";
  return (
    <Popover
      name={`volet-${button.id}`}
      label={labelOf(t, volet)}
      anchor="trigger"
      gap={BAR_GAP}
      placement={below ? "bottom-start" : "top-start"}
      layout={layoutOf(volet)}
      defaultOpen={defaultOpen}
      trigger={(props) => (
        <Button
          {...props}
          icon={face.icon}
          chevron={chevron}
          aria-label={button.label}
          tooltip={button.label}
          shortcut={button.shortcut?.join(" ")}
          tooltipPlacement={tip}
          className="edit-opener"
          data-face={face.text !== null ? "value" : chevron ? "icon" : "only"}
        >
          {face.text}
        </Button>
      )}
    >
      {(close) => (
        <VoletBody
          volet={volet}
          tip={tip}
          choose={(value) => {
            close();
            run(button.id, value);
          }}
          pick={(id, value) => {
            close();
            run(id, value);
          }}
        />
      )}
    </Popover>
  );
}
