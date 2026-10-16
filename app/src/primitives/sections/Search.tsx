// The search palette, open in the flow of the page (`inline`: no scrim, no portal) under the search button that
// names it (open: the hover fill): its four bands, the current row walked by the arrows, a row under the pointer
// (forced), a cut group's "more" row, the detail of a device; Escape keeps the text, as the rule says.
import { ArrowDown, ArrowLeftRight, ArrowUp, CornerDownLeft, Crosshair, Ellipsis, EthernetPort, Group } from "lucide-react";
import { useRef, useState } from "react";
import { Alerts, Button, Facts, IconButton, Island, Palette, PaletteActions, PaletteHeading, PaletteSubheading, Shortcut } from "../../ui";
import { SearchButton } from "../../shell/ShellTools";
import type { PaletteGroup, PaletteSegment } from "../../ui";
import { useText } from "../../i18n";
import type { Translate } from "../../i18n";
import { MODEL, PALETTE_DESTINATIONS, PALETTE_MORE, PALETTE_DEVICES, PALETTE_PORTS, PALETTE_QUERY, PALETTE_SITE } from "../sample";
import { Section } from "../Specimen";

const ID = "primitives-palette";

/** A name cut around the sample's query, the matched part marked. */
const cut = (text: string): PaletteSegment[] =>
  text.split(new RegExp(`(${PALETTE_QUERY})`)).filter(Boolean).map((part) => ({ text: part, hit: part === PALETTE_QUERY }));

function groups(t: Translate): PaletteGroup[] {
  return [
    {
      id: "devices",
      label: t("primitives:palette.devices"),
      count: PALETTE_DEVICES.length,
      rows: PALETTE_DEVICES.map((host, index) => ({ id: host, icon: <ArrowLeftRight />, name: cut(host), detail: t("primitives:palette.kindSite", { site: host.slice(0, 4) }), force: index === 1 ? ("hover" as const) : undefined })),
    },
    {
      id: "ports",
      label: t("primitives:palette.ports"),
      count: PALETTE_PORTS.length + PALETTE_MORE,
      rows: [
        ...PALETTE_PORTS.map((p) => ({ id: `${p.host}:${p.port}`, icon: <EthernetPort />, name: cut(t("primitives:palette.portOf", { port: p.port, host: p.host })), detail: t("primitives:palette.towards", { host: p.to }) })),
        { id: "more:ports", icon: <Ellipsis />, name: t("primitives:palette.more", { count: PALETTE_MORE }), variant: "more" as const },
      ],
    },
    {
      id: "groups",
      label: t("primitives:palette.groups"),
      count: 1,
      rows: [{ id: "group", icon: <Group />, name: t("primitives:palette.group"), detail: t("primitives:palette.members", { count: 2 }) }],
    },
  ];
}

export function SearchSection() {
  const t = useText();
  const [query, setQuery] = useState(PALETTE_QUERY);
  const [scope, setScope] = useState("all");
  const [at, setAt] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const all = groups(t);
  const shown = scope === "all" ? all : all.filter((group) => group.id === scope);
  const rows = shown.flatMap((group) => group.rows);
  const step = (direction: 1 | -1) => setAt((current) => (rows.length ? (current + direction + rows.length) % rows.length : 0));
  const scopes = [
    { id: "all", label: t("primitives:palette.all"), count: 6 + PALETTE_MORE },
    { id: "devices", label: t("primitives:palette.devices"), count: 3 },
    { id: "ports", label: t("primitives:palette.ports"), count: PALETTE_PORTS.length + PALETTE_MORE },
    { id: "groups", label: t("primitives:palette.groups"), count: 1 },
  ];
  const facts = [
    { label: t("primitives:panel.model"), value: MODEL },
    { label: t("primitives:panel.system"), value: "NX-OS 10.4.2" },
    { label: t("primitives:panel.cables"), value: "16" },
    { label: t("primitives:panel.mlagPair"), value: PALETTE_DEVICES[1] },
  ];
  return (
    <Section id="palette" heading={t("primitives:palette.title")} note={t("primitives:palette.note")}>
      <div className="page-palette">
        <Island name="palette-host" layout="bar">
          <SearchButton search={{ open: true, controls: ID, onOpen: () => undefined, ref: trigger }} />
        </Island>
        <Palette
          id={ID}
          inline
          open
          label={t("primitives:palette.label")}
          query={query}
          onQuery={setQuery}
          inputLabel={t("primitives:palette.input")}
          placeholder={t("primitives:palette.placeholder")}
          escapeKey={t("ui:keys.escape")}
          scopesLabel={t("primitives:palette.scopes")}
          scopes={scopes}
          scope={scope}
          onScope={(next) => {
            setScope(next);
            setAt(0);
          }}
          onScopeStep={(direction) => {
            const index = scopes.findIndex((s) => s.id === scope);
            setScope(scopes[(index + direction + scopes.length) % scopes.length].id);
            setAt(0);
          }}
          groups={shown}
          active={rows[at]?.id ?? null}
          onMove={step}
          onChoose={(id) => setAt(Math.max(0, rows.findIndex((row) => row.id === id)))}
          onClose={() => undefined}
          detail={
            <>
              <PaletteHeading tile={<ArrowLeftRight />} name={PALETTE_DEVICES[0]} sub={t("primitives:palette.sub", { site: PALETTE_SITE })} />
              <Facts size="snug" items={facts} />
              <Alerts size="snug" label={t("primitives:panel.toCheck")} items={[{ id: "a", tone: "error", text: t("primitives:palette.alert") }]} />
              <PaletteSubheading>{t("primitives:palette.destinations")}</PaletteSubheading>
              <Facts size="snug" items={PALETTE_DESTINATIONS.map((d) => ({ label: d.ports, value: d.host }))} />
              <PaletteActions>
                <Button variant="primary">{t("primitives:palette.openPanel")}</Button>
                <IconButton variant="line" label={t("primitives:palette.centre")} icon={<Crosshair />} tooltipPlacement="top" />
              </PaletteActions>
            </>
          }
          hints={[
            { id: "walk", keys: [<Shortcut key="up" icon={<ArrowUp />} />, <Shortcut key="down" icon={<ArrowDown />} />], label: t("primitives:palette.walk") },
            { id: "open", keys: [<Shortcut key="enter" icon={<CornerDownLeft />} />], label: t("primitives:palette.open") },
            { id: "centre", keys: [<Shortcut key="shift" keys={[t("ui:keys.shift")]} />, <Shortcut key="enter" icon={<CornerDownLeft />} />], label: t("primitives:palette.centreHint") },
            { id: "scope", keys: [<Shortcut key="tab" keys={[t("ui:keys.tab")]} />], label: t("primitives:palette.scope") },
          ]}
          total={t("primitives:palette.results", { count: 6 + PALETTE_MORE })}
        />
      </div>
    </Section>
  );
}
