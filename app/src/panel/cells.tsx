// The cells of the interface table: each column's value in words, with in focus a second line in label size (duplex
// under the speed, the native VLAN under the trunk, the aggregate and its member mark under the port, the vendor
// reason under the state); the neighbour as a quiet link to its device (the address names it), its port muted; the
// raw description in label size, ink-3, cut (two lines in focus). A missing value is a dash in ink-3.
import type { ReactNode } from "react";
import { Link, Mark } from "../ui";
import type { Translate } from "../i18n";
import type { ColumnKey, InterfaceRow, Width } from "../state/panel";
import { addressWords, DASH, duplexWords, lastChangeWords, modeWords, nativeWords, neighbourParts, roleWords, speedWords, stateWords } from "./words";

export const Muted = ({ children }: { children: ReactNode }) => <span className="panel-muted">{children}</span>;
const Dash = () => <Muted>{DASH}</Muted>;
/** A value and, in focus, its second line. */
function Stacked({ value, line, focus }: { value: ReactNode; line?: ReactNode; focus: boolean }) {
  return (
    <>
      {value}
      {focus && line !== undefined && line !== null ? <span className="panel-line">{line}</span> : null}
    </>
  );
}

const memberTone = (status: string | null): "ok" | "error" | "neutral" => (status === "bundled" ? "ok" : status === "down" || status === "suspended" ? "error" : "neutral");

/** Under the port in focus: its aggregate (the mark says the member's state), else what the port is when it is not a
 *  physical port (its type, its parent, its context) and its roles (heartbeat, peer link); a dash when nothing. */
function PortCell({ row, focus, t }: { row: InterfaceRow; focus: boolean; t: Translate }) {
  const facts = [
    row.type === "physical" ? "" : t(`panel:interfaces.type.${row.type}`),
    row.parent ? t("panel:interfaces.parent", { port: row.parent }) : "",
    row.context ? t("panel:interfaces.context", { context: row.context }) : "",
    ...row.roles.map((role) => roleWords(t, role)),
  ].filter(Boolean);
  const words = facts.length ? <Muted>{facts.join(t("panel:interfaces.lineJoin"))}</Muted> : null;
  const line = row.aggregate ? (
    <>
      <Mark tone={memberTone(row.aggregate.status)}>{row.aggregate.name}</Mark>
      {words ? <Muted>{t("panel:interfaces.lineJoin")}</Muted> : null}
      {words}
    </>
  ) : (
    (words ?? <Dash />)
  );
  return <Stacked value={<span className="panel-port">{row.name}</span>} line={line} focus={focus} />;
}

function StateCell({ row, focus, t }: { row: InterfaceRow; focus: boolean; t: Translate }) {
  return <Stacked value={<Mark tone={row.tone}>{stateWords(t, row.state)}</Mark>} line={row.reason ? <span className="panel-reason">{row.reason}</span> : undefined} focus={focus} />;
}

function SpeedCell({ row, focus, t }: { row: InterfaceRow; focus: boolean; t: Translate }) {
  const speed = speedWords(t, row.speedMbps);
  const duplex = duplexWords(t, row.duplex);
  return <Stacked value={speed ?? <Dash />} line={speed ? (duplex ?? <Dash />) : undefined} focus={focus} />;
}

function ModeCell({ row, width, t }: { row: InterfaceRow; width: Width; t: Translate }) {
  const mode = modeWords(t, row.mode);
  const native = nativeWords(t, row.mode);
  if (mode === null) return <Dash />;
  if (width === "focus") return <Stacked value={mode} line={native ?? undefined} focus />;
  return (
    <>
      {mode}
      {native ? `${t("panel:interfaces.listJoin")}${native}` : ""}
    </>
  );
}

function NeighbourCell({ row, href, t }: { row: InterfaceRow; href: (hostname: string) => string; t: Translate }) {
  const parts = neighbourParts(row);
  if (!parts.length) return null;
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part.hostname}\u0000${part.port}\u0000${index}`} className="panel-neighbour">
          {index ? t("panel:interfaces.listJoin") : ""}
          <Link href={href(part.hostname)} variant="quiet">
            {part.hostname}
          </Link>
          {part.port ? <Muted> {part.port}</Muted> : null}
        </span>
      ))}
    </>
  );
}

export type CellContext = Readonly<{ t: Translate; width: Width; href: (hostname: string) => string }>;

/** The cell of a column for a row. */
export function cellOf(key: ColumnKey, row: InterfaceRow, { t, width, href }: CellContext): ReactNode {
  const focus = width === "focus";
  switch (key) {
    case "port": return <PortCell row={row} focus={focus} t={t} />;
    case "state": return <StateCell row={row} focus={focus} t={t} />;
    case "speed": return <SpeedCell row={row} focus={focus} t={t} />;
    case "media": return row.media ?? <Dash />;
    case "mode": return <ModeCell row={row} width={width} t={t} />;
    case "addresses": return addressWords(t, row.addresses, row.vrf) ?? <Dash />;
    case "mac": return row.mac ?? <Dash />;
    case "lastChange": return lastChangeWords(t, row.lastChange) ?? <Dash />;
    case "neighbour": return <NeighbourCell row={row} href={href} t={t} />;
    case "description": return row.description ? <span className="panel-description">{row.description}</span> : null;
  }
}
