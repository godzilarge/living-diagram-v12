// The frame every panel shares (design/comps/shell/index.html, `.panel`): the Panel primitive at the chosen width
// with the five header actions of the mockup: widen (W, a toggle with the rail), focus (Shift+F, a toggle), centre the
// view (C), more (history, copy, pin: with later bricks), close (Escape). The frame renders what it is given; the
// page decides the width and listens to the keys.
import { ChevronsLeftRight, Crosshair, Ellipsis, Maximize2, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton, Panel } from "../ui";
import type { PanelWidth } from "../ui";
import { useText } from "../i18n";

export type PanelActions = Readonly<{
  onWiden: () => void;
  onFocus: () => void;
  onCentre: () => void;
  onClose: () => void;
}>;

export type PanelFrameProps = {
  heading: string;
  subheading?: string;
  tile: ReactNode;
  width: PanelWidth;
  actions: PanelActions;
  children: ReactNode;
};

export function PanelFrame({ heading, subheading, tile, width, actions, children }: PanelFrameProps) {
  const t = useText();
  const wide = width !== "compact";
  const focus = width === "focus";
  const header = (
    <>
      <IconButton label={wide && !focus ? t("panel:actions.narrow") : t("panel:actions.widen")} icon={<ChevronsLeftRight />} pressed={wide && !focus} shortcut="W" onClick={actions.onWiden} />
      <IconButton
        label={focus ? t("panel:actions.leaveFocus") : t("panel:actions.focus")}
        icon={<Maximize2 />}
        pressed={focus}
        shortcut={`${t("ui:keys.shift")} F`}
        onClick={actions.onFocus}
      />
      <IconButton label={t("panel:actions.centre")} icon={<Crosshair />} shortcut="C" tooltipPlacement="bottom-end" onClick={actions.onCentre} />
      <IconButton label={t("panel:actions.more")} icon={<Ellipsis />} disabled disabledReason={t("panel:actions.moreSoon")} tooltipPlacement="bottom-end" />
      <IconButton label={t("panel:actions.close")} icon={<X />} shortcut={t("ui:keys.escape")} tooltipPlacement="bottom-end" onClick={actions.onClose} />
    </>
  );
  return (
    <Panel name="panel" heading={heading} label={t("panel:label", { name: heading })} subheading={subheading} tile={tile} actions={header} width={width}>
      {children}
    </Panel>
  );
}
