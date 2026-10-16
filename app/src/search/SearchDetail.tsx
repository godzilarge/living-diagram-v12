// The detail column of the search palette (design/comps/shell/index.html at `data-state="search"`, `.pal-preview`):
// what the current result is, before it is opened. A device: its tile and name, its kind, vendor and site; its model,
// system, cables and MLAG pair; its first alert in words; where its cables lead. A port, a group, an HA cluster, a
// note, an infrastructure, an action: the same grammar with their own facts. A fact without a value is left out.
// The primary button opens (the panel, the infrastructure, the action); "centre the view" selects and centres.
import { Crosshair } from "lucide-react";
import type { ReactNode } from "react";
import { Alerts, Button, Facts, IconButton, Mark, PaletteActions, PaletteHeading, PaletteSubheading } from "../ui";
import type { Alert, Fact } from "../ui";
import { useText } from "../i18n";
import type { Translate } from "../i18n";
import type { Model } from "@engine/canvas/types";
import { alertWords, haModeWords, haRoleWords, speedWords, stateWords } from "../panel/words";
import type { Detail, Hit } from "../state/search";
import { deviceSubWords, foldPorts, rowName } from "./words";
import { hitIcon } from "./icons";

export type DetailActions = Readonly<{ onOpen: () => void; onReveal: (() => void) | null }>;

const present = (facts: readonly (Fact | null)[]): Fact[] => facts.filter((fact): fact is Fact => fact !== null && fact.value !== null && fact.value !== "");

function DeviceBody({ t, detail, model }: { t: Translate; detail: Extract<Detail, { kind: "device" }>; model: Model }) {
  const { node } = detail;
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  const cables = detail.removedCables ? t("panel:identity.cablesRemoved", { count: detail.cables, removed: detail.removedCables }) : String(detail.cables);
  const facts = present([
    node.model ? { label: t("panel:identity.model"), value: node.model } : null,
    system ? { label: t("panel:identity.system"), value: system } : null,
    node.kind === "stub" ? null : { label: t("panel:identity.cables"), value: cables },
    detail.mlagPeers.length ? { label: t("panel:identity.mlagPair"), value: detail.mlagPeers.join(t("panel:mlag.join")) } : null,
  ]);
  // a removed device and its first alert, in words: the sentence in ink, only the mark in the state colour
  const alerts: Alert[] = [
    ...(node.ghost ? [{ id: "removed", tone: "neutral" as const, text: t("search:detail.removed") }] : []),
    ...(detail.alert ? [{ id: detail.alert.code, tone: detail.alert.tone, text: alertWords(t, detail.alert, model.catalogue) }] : []),
  ];
  const destinations = detail.destinations.map((d): Fact => ({ label: foldPorts(t, d.ports), value: d.known ? d.hostname : <span className="search-muted">{d.hostname}</span> }));
  return (
    <>
      {facts.length ? <Facts size="snug" items={facts} /> : null}
      {alerts.length ? <Alerts size="snug" label={t("panel:toCheck.title")} items={alerts} /> : null}
      {destinations.length ? (
        <>
          <PaletteSubheading>{t("search:detail.destinations", { count: detail.cables })}</PaletteSubheading>
          <Facts size="snug" items={destinations} />
        </>
      ) : null}
    </>
  );
}

function PortBody({ t, detail }: { t: Translate; detail: Extract<Detail, { kind: "port" }> }) {
  const row = detail.row;
  const neighbour = row.neighbours[0];
  const facts = present([
    { label: t("panel:interfaces.columnName.state"), value: <Mark tone={row.tone}>{stateWords(t, row.state)}</Mark> },
    { label: t("panel:interfaces.columnName.speed"), value: speedWords(t, row.speedMbps) },
    neighbour ? { label: t("panel:interfaces.columnName.neighbour"), value: [neighbour.hostname, neighbour.port].filter(Boolean).join(" ") } : null,
    row.description ? { label: t("panel:interfaces.columnName.description"), value: <span className="search-muted">{row.description}</span> } : null,
  ]);
  return <Facts size="snug" items={facts} />;
}

function GroupBody({ t, detail }: { t: Translate; detail: Extract<Detail, { kind: "group" }> }) {
  const absent = detail.members.filter((host) => !detail.present.includes(host));
  const facts = present([
    detail.description ? { label: t("search:detail.description"), value: detail.description } : null,
    detail.present.length ? { label: t("search:detail.present"), value: detail.present.join(t("search:detail.join")) } : null,
    absent.length ? { label: t("search:detail.absent"), value: <span className="search-muted">{absent.join(t("search:detail.join"))}</span> } : null,
  ]);
  return facts.length ? <Facts size="snug" items={facts} /> : null;
}

function ClusterBody({ t, detail }: { t: Translate; detail: Extract<Detail, { kind: "cluster" }> }) {
  const facts: Fact[] = [
    { label: t("panel:ha.mode"), value: haModeWords(t, detail.mode) },
    ...detail.members.map((member): Fact => ({ label: haRoleWords(t, member.role), value: member.hostname })),
  ];
  return <Facts size="snug" items={facts} />;
}

function NoteBody({ t, detail }: { t: Translate; detail: Extract<Detail, { kind: "note" }> }) {
  const start = Math.max(0, detail.line - 1);
  return (
    <>
      <div className="search-lines">
        {detail.lines.map((line, index) => (
          <p key={index} data-hit={start + index === detail.line ? "" : undefined}>
            {line}
          </p>
        ))}
      </div>
      {detail.anchor ? <Facts size="snug" items={[{ label: t("search:detail.anchor"), value: detail.anchor }]} /> : null}
    </>
  );
}

/** The heading of the detail: the kind's tile, the name, the kind words. */
function heading(t: Translate, detail: Detail, hit: Hit): Readonly<{ name: string; sub: string | null }> {
  switch (detail.kind) {
    case "device": return { name: detail.node.hostname, sub: deviceSubWords(t, detail.node) };
    case "port": return { name: hit.kind === "port" ? hit.name : rowName(t, hit), sub: detail.hostname };
    case "group": return { name: detail.label, sub: t("search:detail.group") };
    case "cluster": return { name: rowName(t, hit), sub: t("panel:kind.cluster") };
    case "note": return { name: rowName(t, hit), sub: t(detail.noteKind === "code" ? "search:row.code" : "search:row.note") };
    case "infrastructure":
      return { name: detail.name, sub: detail.current ? t("search:detail.currentInfrastructure") : detail.devices === null ? t("search:detail.infrastructure") : t("search:row.devices", { count: detail.devices }) };
    case "action": return { name: rowName(t, hit), sub: t("search:detail.action") };
  }
}

function openWords(t: Translate, detail: Detail): string {
  if (detail.kind === "infrastructure") return t(detail.current ? "search:detail.stay" : "search:detail.openInfrastructure");
  if (detail.kind === "action") return t("search:detail.run");
  return t("search:detail.open");
}

type SearchDetailProps = { hit: Hit | null; detail: Detail | null; model: Model | null; actions: DetailActions };

export function SearchDetail({ hit, detail, model, actions }: SearchDetailProps) {
  const t = useText();
  if (!hit) return null;
  if (!detail) return <p className="search-muted search-gone">{t("search:detail.gone")}</p>;
  const { name, sub } = heading(t, detail, hit);
  let body: ReactNode = null;
  if (detail.kind === "device" && model) body = <DeviceBody t={t} detail={detail} model={model} />;
  else if (detail.kind === "port") body = <PortBody t={t} detail={detail} />;
  else if (detail.kind === "group") body = <GroupBody t={t} detail={detail} />;
  else if (detail.kind === "cluster") body = <ClusterBody t={t} detail={detail} />;
  else if (detail.kind === "note") body = <NoteBody t={t} detail={detail} />;
  return (
    <>
      <PaletteHeading tile={hitIcon(hit)} name={name} sub={sub} />
      {body}
      <PaletteActions>
        <Button variant="primary" onClick={actions.onOpen}>
          {openWords(t, detail)}
        </Button>
        {actions.onReveal ? <IconButton variant="line" label={t("search:detail.centre")} icon={<Crosshair />} onClick={actions.onReveal} tooltipPlacement="top" /> : null}
      </PaletteActions>
    </>
  );
}

