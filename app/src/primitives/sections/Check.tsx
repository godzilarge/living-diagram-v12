// Check's primitives (brick 7a, design/comps/shell/control.html; the tiles and the register by rule of 2026-10-24): the
// code chip, the hollow mark and a mark said in a cell, the source lines, the quiet zero, the severity toggles of a
// widget's header (one off), the register by rule with two sections, an open row and its targets, a coverage table
// with centred topic columns under a band of facts, and four small tiles to move, resize and enlarge.
import { Cable, EthernetPort, Layers, Search } from "lucide-react";
import { useState } from "react";
import { Button, Code, Field, Mark, Register, RegisterTargets, SourceLine, Table, Tiles, Widget, WidgetToggles, Zero } from "../../ui";
import { Facts } from "../../ui";
import type { Tiles as TilesValue } from "../../state/tiles";
import { useText } from "../../i18n";
import { DEVICE } from "../sample";
import { Row, Section, Specimen } from "../Specimen";

/** Identifiers only: the codes, ports and hosts a register names (the sentences come from the catalogue). */
const CODES = Object.freeze({ error: "aggregate_below_min_links", warning: "multiple_observed_neighbors", info: "neighbor_unknown" });
const TOPICS = ["interfaces", "aggregates", "lldp", "cdp", "system", "ha"] as const;

function SampleRegister() {
  const t = useText();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(["a"]));
  const toggle = (id: string) => setOpen((current) => (current.has(id) ? new Set([...current].filter((x) => x !== id)) : new Set([...current, id])));
  const row = (id: string, tone: "error" | "warning", code: string, count: number) => ({
    id,
    tone,
    title: t(`control:codes.${code as "link_down"}`, { count }),
    code,
    detail: (
      <RegisterTargets
        label={t("control:verdicts.targets")}
        targets={[
          { id: "1", icon: <Layers />, label: t("control:targets.port", { host: DEVICE, port: "port-channel101" }), href: "#check" },
          { id: "2", icon: <EthernetPort />, label: t("control:targets.port", { host: DEVICE, port: "Eth1/1" }), href: "#check" },
          { id: "3", icon: <Cable />, label: t("control:targets.cable", { a: t("control:targets.port", { host: DEVICE, port: "Eth1/2" }), b: t("control:targets.port", { host: "sep93bb92c0ad60", port: "Port 1" }) }), href: null },
        ]}
      />
    ),
  });
  return (
    <Register
      label={t("control:verdicts.title")}
      columns={{ mark: t("control:verdicts.columns.mark"), verdict: t("control:verdicts.columns.verdict"), code: t("control:verdicts.columns.code"), open: t("control:verdicts.columns.open") }}
      groups={[
        { id: "cables", label: t("control:sections.cables"), count: 8, rows: [row("b", "warning", CODES.warning, 8)] },
        { id: "aggregates", label: t("control:sections.aggregates"), count: 2, rows: [row("a", "error", CODES.error, 2)] },
      ]}
      open={open}
      onToggle={toggle}
    />
  );
}

/** Four small tiles, 3 × 3 each, side by side: moved, resized, refused on a taken place (state of the page only). */
const SAMPLE_TILES: TilesValue = Object.freeze({
  verdicts: Object.freeze({ x: 0, y: 0, w: 3, h: 3 }),
  coverage: Object.freeze({ x: 3, y: 0, w: 3, h: 3 }),
  sources: Object.freeze({ x: 6, y: 0, w: 3, h: 3 }),
  delivery: Object.freeze({ x: 9, y: 0, w: 3, h: 3 }),
});

function SampleTiles() {
  const t = useText();
  const [tiles, setTiles] = useState<TilesValue>(SAMPLE_TILES);
  // the last button of each tile lifts it over the page (no scrim here: the state alone), Reduce puts it back
  const [enlarged, setEnlarged] = useState<keyof TilesValue | null>(null);
  const tile = (id: keyof TilesValue, heading: string, count: number) => {
    const on = enlarged === id;
    const enlarge = { on, label: t(on ? "control:tile.reduce" : "control:tile.enlarge"), onToggle: () => setEnlarged(on ? null : id) };
    return (
      <Widget key={id} name={`tile-${id}`} heading={heading} count={count} handle enlarge={enlarge}>
        <Mark tone={id === "verdicts" ? "error" : "neutral"}>{count}</Mark>
      </Widget>
    );
  };
  return (
    <Tiles tiles={tiles} onChange={setTiles} enabled={!enlarged} enlarged={enlarged} label={t("control:tile.grid")}>
      {tile("verdicts", t("control:verdicts.title"), 26)}
      {tile("coverage", t("control:coverage.title"), 7)}
      {tile("sources", t("control:sources.title"), 22)}
      {tile("delivery", t("control:delivery.title"), 8)}
    </Tiles>
  );
}

function SampleCoverage() {
  const t = useText();
  const columns = [
    { key: "device", label: t("control:coverage.columns.device"), cut: true },
    { key: "collection", label: t("control:coverage.columns.collection") },
    ...TOPICS.map((topic) => ({ key: topic, label: t(`control:coverage.topics.${topic}`), align: "center" as const, fit: true })),
  ];
  const marks = (failed: boolean) =>
    Object.fromEntries(TOPICS.map((topic) => [topic, topic === "ha" ? <Mark tone="off" said={t("control:coverage.topic.absent")} /> : <Mark tone={failed && topic === "cdp" ? "warning" : "neutral"} said={t("control:coverage.topic.success")} />]));
  const rows = [
    { id: "a", cells: { device: DEVICE, collection: <Mark>{t("control:coverage.status.success")}</Mark>, ...marks(false) } },
    { id: "b", cells: { device: "dc01-core-02", collection: <Mark tone="warning">{t("control:coverage.status.partial")}</Mark>, ...marks(true) } },
  ];
  return <Table label={t("control:coverage.title")} columns={columns} rows={rows} density="compact" />;
}

export function CheckSection() {
  const t = useText();
  const [shown, setShown] = useState({ error: true, warning: true, info: false });
  const toggles = (
    <WidgetToggles name="check-severities" label={t("control:verdicts.severities")}>
      <Button pressed={shown.error} count={{ value: 2, tone: "error" }} onClick={() => setShown((s) => ({ ...s, error: !s.error }))}>
        {t("control:verdicts.severity.error")}
      </Button>
      <Button pressed={shown.warning} count={{ value: 8, tone: "warning" }} onClick={() => setShown((s) => ({ ...s, warning: !s.warning }))}>
        {t("control:verdicts.severity.warning")}
      </Button>
      <Button pressed={shown.info} count={{ value: 34 }} onClick={() => setShown((s) => ({ ...s, info: !s.info }))}>
        {t("control:verdicts.severity.info")}
      </Button>
    </WidgetToggles>
  );
  return (
    <Section id="check" heading={t("primitives:check.title")} note={t("primitives:check.note")}>
      <Row>
        <Specimen name="codes" caption={t("primitives:check.codes")} layout="panel">
          <span className="page-group">
            <Code>{CODES.error}</Code>
            <Code>{CODES.info}</Code>
          </span>
        </Specimen>
        <Specimen name="check-marks" caption={t("primitives:check.marks")} layout="panel">
          <span className="page-group">
            <Mark />
            <Mark tone="warning" />
            <Mark tone="off" />
            <Zero />
          </span>
        </Specimen>
        <Specimen name="source-lines" caption={t("primitives:check.lines")} layout="panel">
          <span className="page-group">
            <SourceLine kind="solid">{t("control:sources.combo.lldpCdpDescription")}</SourceLine>
            <SourceLine kind="dotted">{t("control:sources.combo.description")}</SourceLine>
            <SourceLine kind="dashed">{t("control:sources.combo.lldp")}</SourceLine>
          </span>
        </Specimen>
      </Row>
      <Row>
        <figure className="page-specimen page-check-register">
          <Widget name="check-register" heading={t("control:verdicts.title")} count={44} toggles={toggles} action={<Field label={t("control:verdicts.filter")} placeholder={t("control:verdicts.placeholder")} icon={<Search />} />}>
            <SampleRegister />
          </Widget>
          <figcaption>{t("primitives:check.register")}</figcaption>
        </figure>
        <figure className="page-specimen page-check-side">
          <Widget
            name="check-coverage"
            heading={t("control:coverage.title")}
            count={2}
            band={
              <Facts
                layout="strip"
                items={[
                  { label: t("control:coverage.facts.scope"), value: t("control:coverage.facts.scopeValue", { count: 2 }) },
                  { label: t("control:coverage.facts.partial"), value: <Mark tone="warning">{1}</Mark> },
                  { label: t("control:coverage.facts.unreachable"), value: <Zero /> },
                ]}
              />
            }
          >
            <SampleCoverage />
          </Widget>
          <figcaption>{t("primitives:check.coverage")}</figcaption>
        </figure>
      </Row>
      <Row>
        <figure className="page-specimen page-check-tiles">
          <SampleTiles />
          <figcaption>{t("primitives:check.tiles")}</figcaption>
        </figure>
      </Row>
    </Section>
  );
}
