// The home's primitives: the widget (with its segmented filter and its settings, a relaxed sortable table whose names
// are links; without controls, a snug table, a foot note), the avatar, the state mark alone and with its words, the outlined icon button of the free slot,
// the link in its three forms.
import { ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Avatar, Icon, IconButton, IconLink, Link, LogoMark, Mark, Segmented, Table, Widget } from "../../ui";
import type { Sort, Tone } from "../../ui";
import { useText } from "../../i18n";
import { AUTHORS, DEVICE, INFRASTRUCTURES } from "../sample";
import { Row, Section, Specimen } from "../Specimen";

const STATES: readonly { key: "completed" | "partial" | "failed"; tone: Tone }[] = [
  { key: "completed", tone: "neutral" },
  { key: "partial", tone: "warning" },
  { key: "failed", tone: "error" },
];

function InfrastructureTable() {
  const t = useText();
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "ascending" });
  const columns = [
    { key: "name", label: t("home:infrastructures.columns.name"), link: true, cut: true, sortable: true },
    { key: "status", label: t("home:infrastructures.columns.status"), sortable: true },
    { key: "go", label: t("home:infrastructures.columns.open"), hideLabel: true, fit: true },
  ];
  const rows = INFRASTRUCTURES.map((name, index) => ({
    id: name,
    href: `#${name}`,
    cells: {
      name: <span className="page-strong">{name}</span>,
      status: <Mark tone={STATES[index].tone}>{t(`home:status.${STATES[index].key}`)}</Mark>,
      go: (
        <span className="page-muted">
          <Icon>
            <ChevronRight />
          </Icon>
        </span>
      ),
    },
  }));
  const ordered = sort.direction === "ascending" ? rows : [...rows].reverse();
  return <Table label={t("home:infrastructures.title")} columns={columns} rows={ordered} sort={sort} onSort={setSort} density="relaxed" head="widget" onRowClick={() => undefined} />;
}

/** The filter of a widget's header: each state with its count, a zero in ink-4 that stays a choice. */
function Filter() {
  const t = useText();
  const [value, setValue] = useState("all");
  const counts: Readonly<Record<string, number>> = { all: 3, completed: 1, partial: 1, failed: 1, stale: 0 };
  const options = Object.entries(counts).map(([key, count]) => {
    const label = t(`home:filter.${key as "all"}`);
    return { value: key, label, count, said: t("home:filter.said", { label, value: count }) };
  });
  return <Segmented name="widget-filter" label={t("home:filter.byStatus")} options={options} value={value} onChange={setValue} />;
}

function RunsTable() {
  const t = useText();
  const columns = [
    { key: "infrastructure", label: t("home:runs.columns.infrastructure") },
    { key: "devices", label: t("home:runs.columns.devices") },
  ];
  const rows = INFRASTRUCTURES.map((name, index) => ({ id: name, cells: { infrastructure: name, devices: t("home:runs.devices", { count: 14 + index * 17 }) } }));
  return <Table label={t("home:runs.title")} columns={columns} rows={rows} density="snug" head="widget" />;
}

export function Widgets() {
  const t = useText();
  return (
    <Section id="widgets" heading={t("primitives:widgets.title")} note={t("primitives:widgets.note")}>
      <Row>
        <figure className="page-specimen page-widget">
          <Widget
            name="widget-action"
            heading={t("home:infrastructures.title")}
            count={INFRASTRUCTURES.length}
            filter={<Filter />}
            action={<IconButton label={t("home:settings.label")} icon={<SlidersHorizontal />} tooltipPlacement="bottom-end" />}
          >
            <InfrastructureTable />
          </Widget>
          <figcaption>{t("primitives:widgets.widget")}</figcaption>
        </figure>
        <figure className="page-specimen page-widget">
          <Widget name="widget-plain" heading={t("home:runs.title")} foot={t("home:unreadable", { count: 2 })}>
            <RunsTable />
          </Widget>
          <figcaption>{t("primitives:widgets.widgetPlain")}</figcaption>
        </figure>
      </Row>
      <Row>
        <Specimen name="avatars" caption={t("primitives:widgets.avatars")}>
          {AUTHORS.map((author) => (
            <Avatar key={author} name={author} />
          ))}
          <IconButton label={AUTHORS[0]} icon={<Avatar name={AUTHORS[0]} />} />
        </Specimen>
        <Specimen name="marks" caption={t("primitives:widgets.marks")} layout="panel">
          <span className="page-group">
            {STATES.map((state) => (
              <Mark key={state.key} tone={state.tone} />
            ))}
            <Mark tone="ok" />
            {STATES.map((state) => (
              <Mark key={`${state.key}-words`} tone={state.tone}>
                {t(`home:status.${state.key}`)}
              </Mark>
            ))}
            <Mark tone="error">{6}</Mark>
            <Mark tone="warning">{21}</Mark>
          </span>
        </Specimen>
        <Specimen name="links" caption={t("primitives:widgets.links")} layout="panel">
          <span className="page-group">
            <Link href={`#${DEVICE}`}>{DEVICE}</Link>
            <Link href={`#${DEVICE}`} data-force="focus">
              {DEVICE}
            </Link>
            <Link href={`#${INFRASTRUCTURES[0]}`} variant="quiet">
              <span className="page-strong">{INFRASTRUCTURES[0]}</span>
            </Link>
            <IconLink href="#widgets" label={t("shell:home")} icon={<LogoMark />} />
          </span>
        </Specimen>
        <Specimen name="outlined" caption={t("primitives:widgets.outlined")}>
          <IconButton variant="line" label={t("home:slot.add")} icon={<Plus />} />
          <IconButton variant="line" label={t("home:slot.add")} icon={<Plus />} disabled disabledReason={t("home:slot.addSoon")} />
        </Specimen>
      </Row>
    </Section>
  );
}
