// Edit mode's surfaces as the diagram composes them: the edit palette (a column island, the tooltips to the right),
// the device bar with its hue volet open under it (the bar sits under its element here, so its volets open downward),
// a note bar's size list open under it, and the menu (a right click, a bar's "more"). The canvas's own hues need the canvas's
// styles (`--hue-*`), imported by the page.
import { Cable, EyeOff, Focus, Group, Image, Lock, MousePointer2, Pin, Shapes, Spline, SquareCode, StickyNote, Table, Bold, Italic } from "lucide-react";
import { useState } from "react";
import { IconButton, Island, Menu, Separator } from "../../ui";
import { useText } from "../../i18n";
import { TEXT_SIZES } from "../../state/bars";
import type { BarButton } from "../../state/bars";
import { VoletButton } from "../../edit/Volets";
import { Row, Section } from "../Specimen";
import "../../edit/edit.css";

function Palette() {
  const t = useText();
  const [connector, setConnector] = useState(false);
  const tip = "right" as const;
  return (
    <figure className="page-specimen">
      <Island name="edit-tools" layout="column" role="toolbar" aria-orientation="vertical" aria-label={t("edit:palette.label")}>
        <IconButton label={t("edit:palette.select")} icon={<MousePointer2 />} shortcut="V" tooltipPlacement={tip} pressed={!connector} onClick={() => setConnector(false)} />
        <Separator orientation="horizontal" />
        <IconButton label={t("edit:palette.cable")} icon={<Cable />} shortcut="L" tooltipPlacement={tip} disabled disabledReason={t("edit:palette.cableSoon")} />
        <IconButton label={t("edit:palette.connector")} icon={<Spline />} shortcut="K" tooltipPlacement={tip} pressed={connector} onClick={() => setConnector(!connector)} />
        <Separator orientation="horizontal" />
        <IconButton label={t("edit:palette.note")} icon={<StickyNote />} shortcut="N" tooltipPlacement={tip} />
        <IconButton label={t("edit:palette.shape")} icon={<Shapes />} shortcut="S" tooltipPlacement={tip} />
        <IconButton label={t("edit:palette.table")} icon={<Table />} shortcut="T" tooltipPlacement={tip} />
        <IconButton label={t("edit:palette.image")} icon={<Image />} shortcut="I" tooltipPlacement={tip} />
        <IconButton label={t("edit:palette.code")} icon={<SquareCode />} shortcut="B" tooltipPlacement={tip} />
        <Separator orientation="horizontal" />
        <IconButton label={t("edit:palette.group")} icon={<Group />} shortcut="G" tooltipPlacement={tip} disabled disabledReason={t("edit:palette.groupNeeds")} />
      </Island>
      <figcaption>{t("primitives:edit.palette")}</figcaption>
    </figure>
  );
}

const noop = (): void => undefined;

function DeviceBar() {
  const t = useText();
  const [hue, setHue] = useState<string | null>("slate");
  const hueButton: BarButton = { id: "hue", label: t("edit:bar.hueOf", { value: hue ?? "slate" }), icon: null, swatch: hue ?? "slate" };
  const align: BarButton = { id: "align", label: t("edit:bar.align"), icon: "align" };
  const more: BarButton = { id: "more", label: t("edit:bar.more"), icon: "more" };
  const items = [
    { id: "note", label: t("edit:bar.moreNote") },
    { id: "connect", label: t("edit:bar.moreConnect") },
    { id: "copy", label: t("edit:bar.moreCopy") },
  ];
  return (
    <figure className="page-specimen" data-caption="above">
      <Island name="context-bar" layout="bar" role="toolbar" aria-label={t("edit:bar.label", { what: t("primitives:edit.device") })}>
        <VoletButton button={hueButton} volet={{ kind: "hues", value: hue, inherited: "slate", allowDefault: true }} below run={(_id, value) => setHue(value)} defaultOpen />
        <Separator />
        <IconButton label={t("edit:bar.unpin")} icon={<Pin />} pressed shortcut="P" tooltipPlacement="bottom" />
        <IconButton label={t("edit:bar.lock")} icon={<Lock />} disabled disabledReason={t("edit:bar.lockSoon")} tooltipPlacement="bottom" />
        <Separator />
        <IconButton label={t("edit:bar.group")} icon={<Group />} shortcut="G" tooltipPlacement="bottom" />
        <VoletButton button={align} volet={{ kind: "align", count: 3, modes: ["left", "center", "right", "top", "middle", "bottom", "distribute-horizontal", "distribute-vertical"], grid: true }} below run={noop} />
        <Separator />
        <IconButton label={t("edit:bar.hide")} icon={<EyeOff />} shortcut="H" tooltipPlacement="bottom" />
        <IconButton label={t("edit:bar.isolate")} icon={<Focus />} tooltipPlacement="bottom" />
        <Separator />
        <VoletButton button={more} volet={{ kind: "menu", title: t("edit:bar.more"), items }} below run={noop} />
      </Island>
      <figcaption>{t("primitives:edit.bar")}</figcaption>
    </figure>
  );
}

function NoteBar() {
  const t = useText();
  const [size, setSize] = useState(14);
  const px = (value: number): string => t("edit:bar.px", { value });
  const sizeButton: BarButton = { id: "text_size", label: t("edit:bar.textSizeOf", { value: px(size) }), icon: null, value: String(size) };
  return (
    <figure className="page-specimen" data-caption="above">
      <Island name="note-bar" layout="bar" role="toolbar" aria-label={t("edit:bar.label", { what: t("edit:bar.kinds.note") })}>
        <VoletButton
          button={sizeButton}
          volet={{ kind: "list", title: t("edit:volet.sizes"), value: String(size), options: TEXT_SIZES.map((value) => ({ value: String(value), label: px(value) })) }}
          below
          run={(_id, value) => setSize(Number(value))}
          defaultOpen
        />
        <Separator />
        <IconButton label={t("edit:bar.bold")} icon={<Bold />} pressed shortcut={[t("ui:keys.ctrl"), "B"].join(" ")} tooltipPlacement="bottom" />
        <IconButton label={t("edit:bar.italic")} icon={<Italic />} disabled disabledReason={t("edit:bar.italicSoon")} tooltipPlacement="bottom" />
      </Island>
      <figcaption>{t("primitives:edit.sizes")}</figcaption>
    </figure>
  );
}

function MenuSpecimen() {
  const t = useText();
  const [route, setRoute] = useState("straight");
  const routes = ["straight", "elbow", "curve"] as const;
  return (
    <figure className="page-specimen">
      <Menu
        surface
        label={t("edit:menu.label")}
        onChoose={(id) => (routes.includes(id as (typeof routes)[number]) ? setRoute(id) : undefined)}
        rows={[
          { id: "note", label: t("edit:bar.moreNote") },
          { id: "connect", label: t("edit:bar.moreConnect") },
          { id: "copy", label: t("edit:bar.moreCopy"), shortcut: [t("ui:keys.ctrl"), "C"] },
          { kind: "separator" },
          { kind: "heading", label: t("edit:volet.route") },
          ...routes.map((id) => ({ id, label: t(`edit:bar.routes.${id}`), checked: route === id })),
          { kind: "separator" },
          { id: "delete", label: t("edit:bar.delete"), danger: true, shortcut: [t("edit:keys.delete")] },
        ]}
      />
      <figcaption>{t("primitives:edit.menu")}</figcaption>
    </figure>
  );
}

export function EditSection() {
  const t = useText();
  return (
    <Section id="edit" heading={t("primitives:edit.title")} note={t("primitives:edit.note")} room="popover">
      <Row>
        <Palette />
        <DeviceBar />
      </Row>
      <Row>
        <NoteBar />
        <MenuSpecimen />
      </Row>
    </Section>
  );
}
