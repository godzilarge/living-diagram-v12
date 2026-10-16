// The panel with its header actions and a sortable table, and a popover open under its trigger.
import { ArrowLeftRight, ChevronsLeftRight, Crosshair, Ellipsis, ListFilter, Maximize2, Search, Settings, X } from "lucide-react";
import { useState } from "react";
import { Button, Count, Field, IconButton, Island, Mark, Panel, PanelSection, Popover, Segmented, Table } from "../../ui";
import type { PanelWidth } from "../../ui";
import type { Sort } from "../../ui";
import { useText } from "../../i18n";
import { PrefsControls } from "../../shell/PrefsControls";
import { usePrefs } from "../../shell/usePrefs";
import { DEVICE, MODEL, PORTS } from "../sample";
import { Row, Section } from "../Specimen";

function PortTable() {
  const t = useText();
  const [sort, setSort] = useState<Sort>({ key: "port", direction: "ascending" });
  const [current, setCurrent] = useState(PORTS[0].port);
  const sorted = [...PORTS].sort((a, b) => {
    const order = a[sort.key as "port"].localeCompare(b[sort.key as "port"], undefined, { numeric: true });
    return sort.direction === "ascending" ? order : -order;
  });
  const columns = [
    { key: "port", label: t("primitives:panel.port"), sortable: true },
    { key: "state", label: t("primitives:panel.state"), sortable: true },
    { key: "speed", label: t("primitives:panel.speed"), sortable: true, align: "end" as const },
    { key: "neighbour", label: t("primitives:panel.neighbour"), sortable: true },
  ];
  const rows = sorted.map((port) => ({
    id: port.port,
    current: port.port === current,
    cells: {
      port: port.port,
      state: <Mark tone={port.state === "up" ? "ok" : "error"}>{t(`primitives:panel.${port.state}`)}</Mark>,
      speed: port.speed,
      neighbour: port.neighbour || <span className="page-muted">{t("primitives:panel.none")}</span>,
    },
  }));
  return <Table label={t("primitives:panel.interfaces")} columns={columns} rows={rows} sort={sort} onSort={setSort} density="compact" onRowClick={setCurrent} />;
}

export function Surfaces() {
  const t = useText();
  const { prefs, language, setPrefs } = usePrefs();
  const [scope, setScope] = useState("cabled");
  const [width, setWidth] = useState<PanelWidth>("compact");
  const actions = (
    <>
      <IconButton label={t("primitives:panel.widen")} icon={<ChevronsLeftRight />} pressed={false} shortcut="W" />
      <IconButton label={t("primitives:panel.focus")} icon={<Maximize2 />} pressed={false} />
      <IconButton label={t("primitives:tooltip.centre")} icon={<Crosshair />} shortcut="C" />
      <IconButton label={t("primitives:panel.more")} icon={<Ellipsis />} />
      <IconButton label={t("ui:close")} icon={<X />} shortcut={t("ui:keys.escape")} tooltipPlacement="bottom-end" />
    </>
  );
  return (
    <Section id="surfaces" heading={t("primitives:panel.title")} note={t("primitives:panel.note")} room="popover">
      <Row>
        <Panel name="panel" heading={DEVICE} subheading={MODEL} tile={<ArrowLeftRight />} actions={actions} width={width}>
          <PanelSection heading={t("primitives:panel.interfaces")} aside={t("primitives:panel.ports", { count: PORTS.length })}>
            <div className="page-panel-tools">
              <div className="page-scope" role="group" aria-label={t("primitives:inputs.scope")} data-bar="panel-scope">
                <Button pressed={scope === "cabled"} onClick={() => setScope("cabled")}>
                  {t("primitives:inputs.cabled")} <Count value={5} />
                </Button>
                <Button pressed={scope === "all"} onClick={() => setScope("all")}>
                  {t("primitives:inputs.all")} <Count value={PORTS.length} />
                </Button>
              </div>
              <Field label={t("primitives:inputs.filter")} placeholder={t("primitives:inputs.filter")} icon={<ListFilter />} />
            </div>
            <PortTable />
          </PanelSection>
        </Panel>
        <Island name="panel-width" layout="bar">
          <Segmented
            name="panel-width-choice"
            label={t("primitives:panel.width")}
            value={width}
            onChange={(value) => setWidth(value as PanelWidth)}
            options={[
              { value: "compact", label: t("primitives:panel.compact") },
              { value: "wide", label: t("primitives:panel.wide") },
              { value: "focus", label: t("primitives:panel.focusWidth") },
            ]}
          />
        </Island>
      </Row>
      <Row>
        <div className="page-popover-slot">
        <Island name="popover-layer-host" layout="bar">
          <Popover
            name="layer-popover"
            label={t("primitives:panel.palette")}
            defaultOpen
            elevation="layer"
            placement="bottom-start"
            trigger={(props, open) => <IconButton {...props} label={t("primitives:panel.palette")} icon={<Search />} pressed={open} />}
          >
            <p className="page-layer-note">{t("primitives:panel.layerNote")}</p>
          </Popover>
        </Island>
        </div>
        <div className="page-popover-slot">
        <Island name="popover-host" layout="bar">
          <Popover
            name="settings-popover"
            label={t("shell:settings")}
            defaultOpen
            placement="bottom-start"
            trigger={(props, open) => <IconButton {...props} label={t("shell:settings")} icon={<Settings />} pressed={open} />}
          >
            <PrefsControls prefs={prefs} language={language} onChange={setPrefs} />
          </Popover>
        </Island>
        </div>
      </Row>
    </Section>
  );
}
