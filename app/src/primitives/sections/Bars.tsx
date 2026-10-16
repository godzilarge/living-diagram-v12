// Composed bars, as the shell will use them: the logo, the context (two choices and the diff summary), the views and
// layers strip, the tools, the canvas controls. Their controls must share one height, one centre line, two gaps.
import { Download, GitCompare, Grid3x3, Map as MapIcon, Maximize, Pencil, Search, Settings, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Island, LogoMark, Rail, Select, Separator, Shortcut } from "../../ui";
import { useText } from "../../i18n";
import { INFRASTRUCTURES } from "../sample";
import { Row, Section } from "../Specimen";
import { useRuns } from "./runs";

export function Bars() {
  const t = useText();
  const runs = useRuns();
  const [infrastructure, setInfrastructure] = useState(INFRASTRUCTURES[0]);
  const [run, setRun] = useState(runs[runs.length - 1].value);
  const [view, setView] = useState("diagram");
  const [grid, setGrid] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [edit, setEdit] = useState(false);
  const [layer, setLayer] = useState("l1");
  const ctrlK = [t("ui:keys.ctrl"), "K"];
  return (
    <Section id="bars" heading={t("primitives:bars.title")} note={t("primitives:bars.note")}>
      <Row>
        <Island name="brand" layout="bar">
          <IconButton label={t("shell:home")} icon={<LogoMark />} tooltipPlacement="bottom-start" />
        </Island>
        <Island name="context" layout="bar">
          <Select name="infrastructures" label={t("primitives:bars.infrastructure")} options={INFRASTRUCTURES.map((value) => ({ value, label: value }))} value={infrastructure} onChange={setInfrastructure} />
          <Select name="runs" label={t("primitives:bars.run")} options={runs} value={run} onChange={setRun} />
          <Separator />
          <Button icon={<GitCompare />} tooltip={t("primitives:bars.diffDetail", { devices: 4, cables: 10 })}>
            {t("primitives:bars.changes", { count: 14 })}
          </Button>
        </Island>
        <Island name="views" layout="strip">
          <Rail
            name="view"
            label={t("primitives:bars.view")}
            value={view}
            onChange={setView}
            items={[
              { id: "diagram", label: t("primitives:bars.diagram") },
              { id: "control", label: t("primitives:bars.control"), count: 6, countTone: "error", countLabel: t("primitives:bars.errors", { count: 6 }) },
              { id: "journal", label: t("primitives:bars.journal") },
            ]}
          />
          <Separator />
          <div className="page-layers" role="group" aria-label={t("primitives:bars.layer")} data-bar="layers">
            <Button pressed={layer === "l1"} onClick={() => setLayer("l1")}>{t("primitives:bars.l1")}</Button>
            <Button pressed={layer === "l2"} onClick={() => setLayer("l2")} disabled tooltip={t("primitives:bars.l2Soon")}>{t("primitives:bars.l2")}</Button>
            <Button pressed={layer === "l3"} onClick={() => setLayer("l3")} disabled tooltip={t("primitives:bars.l3Soon")}>{t("primitives:bars.l3")}</Button>
          </div>
        </Island>
        <Island name="tools" layout="bar">
          <Button icon={<Search />} aria-label={t("shell:search")} tooltip={t("shell:searchEverywhere")} shortcut={ctrlK.join(" ")}>
            <Shortcut keys={ctrlK} />
          </Button>
          <IconButton label={t("shell:export")} icon={<Download />} shortcut="E" />
          <IconButton label={t("shell:settings")} icon={<Settings />} pressed={false} tooltipPlacement="bottom-end" />
        </Island>
      </Row>
      <Row>
        <Island name="canvas-controls" layout="bar">
          <IconButton label={t("primitives:bars.zoomOut")} icon={<ZoomOut />} shortcut="-" />
          <Button tooltip={t("primitives:bars.zoomReset")}>{t("primitives:bars.zoom", { value: 62 })}</Button>
          <IconButton label={t("primitives:bars.zoomIn")} icon={<ZoomIn />} shortcut="+" />
          <Separator />
          <IconButton label={t("primitives:bars.fit")} icon={<Maximize />} shortcut="F" />
          <IconButton label={t("primitives:bars.grid")} icon={<Grid3x3 />} pressed={grid} onClick={() => setGrid(!grid)} shortcut="G" />
          <IconButton label={t("primitives:bars.minimap")} icon={<MapIcon />} pressed={minimap} onClick={() => setMinimap(!minimap)} shortcut="M" />
          <Separator />
          <IconButton label={t("primitives:bars.edit")} icon={<Pencil />} pressed={edit} onClick={() => setEdit(!edit)} shortcut="E" />
        </Island>
      </Row>
    </Section>
  );
}
