// Check's primitives (brick 7a, design/comps/shell/control.html): the code chip, the hollow mark and a mark said in
// a cell, the source lines, the quiet zero, the severity toggles of a widget's header (one off), the register with a
// group heading, an open row and its targets, a coverage table with centred topic columns under a band of facts.
import { Cable, EthernetPort, Layers, Search } from "lucide-react";
import { useState } from "react";
import { Button, Code, Field, Mark, Register, RegisterTargets, SourceLine, Table, Widget, WidgetToggles, Zero } from "../../ui";
import { Facts } from "../../ui";
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
  const row = (id: string, tone: "error" | "warning", code: string, count: number, family: "aggregates" | "cables") => ({
    id,
    tone,
    title: t(`control:codes.${code as "link_down"}`, { count }),
    meta: (
      <>
        <Code>{code}</Code>
        {t(`control:rules.${family}`)}
      </>
    ),
    count,
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
      columns={{ mark: t("control:verdicts.columns.mark"), verdict: t("control:verdicts.columns.verdict"), count: t("control:verdicts.columns.count"), open: t("control:verdicts.columns.open") }}
      groups={[
        { id: "error", label: t("control:verdicts.severity.error"), count: 2, rows: [row("a", "error", CODES.error, 2, "aggregates")] },
        { id: "warning", label: t("control:verdicts.severity.warning"), count: 8, rows: [row("b", "warning", CODES.warning, 8, "cables")] },
      ]}
      open={open}
      onToggle={toggle}
    />
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
    </Section>
  );
}
