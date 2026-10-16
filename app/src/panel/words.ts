// The panel's words on the values of `state/panel.ts`: a port's state, speed and duplex, mode and VLANs, addresses,
// MAC, last change, the collection of a device, its kind, a duration, an alert's sentence and what it names. Every
// sentence comes from the catalogue, values interpolated, never assembled here; identifiers (ports, hostnames,
// descriptions) stay as the data says them.
import { shortPort } from "@engine/canvas/format";
import type { Model } from "@engine/canvas/types";
import type { CheckCode, CollectionStatus, Duplex, EvidenceSource, HaMode, HaRole, HaState, InterfaceRole, IpAddress, MemberStatus } from "@engine/contracts/snapshot";
import type { Translate } from "../i18n";
import type { AlertGroup, ColumnKey, InterfaceRow, Mode, RefName, StateWord, Width } from "../state/panel";
import { isEveryVlan, vlanRangesText } from "../state/panel";
import { dateAndClock } from "../state/time";

export const DASH = "—";

export const stateWords = (t: Translate, state: StateWord): string => t(`panel:interfaces.state.${state}`);

/** "10 G", "2.5 G", "100 M": a speed read in Mbit/s as the mockup writes it. */
export function speedWords(t: Translate, mbps: number | null): string | null {
  if (mbps === null) return null;
  if (mbps >= 1000) {
    const g = Math.round(mbps / 100) / 10;
    return t("panel:interfaces.speedG", { value: Number.isInteger(g) ? String(g) : g.toFixed(1) });
  }
  return t("panel:interfaces.speedM", { value: mbps });
}

export const duplexWords = (t: Translate, duplex: Duplex | null): string | null => (duplex === null ? null : t(`panel:interfaces.duplex.${duplex}`));

/** The mode in words: "Trunk 10, 20, 100-110" (the native VLAN apart, `nativeWords`), "Access 10", "Routed"… */
export function modeWords(t: Translate, mode: Mode): string | null {
  switch (mode.kind) {
    case "access": return mode.vlan === null ? t("panel:interfaces.mode.accessNoVlan") : t("panel:interfaces.mode.access", { vlan: mode.vlan });
    case "trunk": return mode.allowed === null ? t("panel:interfaces.mode.trunkNoVlans") : isEveryVlan(mode.allowed) ? t("panel:interfaces.mode.trunkAll") : t("panel:interfaces.mode.trunk", { vlans: vlanRangesText(mode.allowed) });
    case "routed": return t("panel:interfaces.mode.routed");
    case "none": return t("panel:interfaces.mode.none");
    case "vlan": return t("panel:interfaces.mode.vlan", { vlan: mode.vlan });
    default: return null;
  }
}
export const nativeWords = (t: Translate, mode: Mode): string | null => (mode.kind === "trunk" && mode.native !== null ? t("panel:interfaces.mode.native", { vlan: mode.native }) : null);

/** "10.0.0.11/24, VRF management": the addresses and the VRF (the global table is not said). */
export function addressWords(t: Translate, addresses: readonly IpAddress[], vrf: string | null): string | null {
  const parts = addresses.map((a) => t("panel:interfaces.address", { address: a.address, prefix: a.prefix }));
  if (vrf !== null && vrf !== "default") parts.push(t("panel:interfaces.vrf", { vrf }));
  return parts.length ? parts.join(t("panel:interfaces.listJoin")) : null;
}

/** "never", "6 days ago": the age of a port's last change. */
export function lastChangeWords(t: Translate, age: number | "never" | null): string | null {
  if (age === null) return null;
  if (age === "never") return t("panel:interfaces.never");
  const relative = new Intl.RelativeTimeFormat(t("ui:locale"), { numeric: "always", style: "long" });
  if (age < 3600) return relative.format(-Math.max(1, Math.floor(age / 60)), "minute");
  if (age < 86_400) return relative.format(-Math.floor(age / 3600), "hour");
  return relative.format(-Math.floor(age / 86_400), "day");
}

/** "12 d 4 h", "3 h 20 min", "45 min", "30 s": a duration in two units at most (a device's uptime). */
export function durationWords(t: Translate, seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  const d = Math.floor(seconds / 86_400), h = Math.floor((seconds % 86_400) / 3600), m = Math.floor((seconds % 3600) / 60);
  const parts = d ? [t("panel:duration.days", { value: d }), h ? t("panel:duration.hours", { value: h }) : ""] : h ? [t("panel:duration.hours", { value: h }), m ? t("panel:duration.minutes", { value: m }) : ""] : m ? [t("panel:duration.minutes", { value: m })] : [t("panel:duration.seconds", { value: Math.floor(seconds) })];
  return parts.filter(Boolean).join(t("panel:duration.join"));
}

const COLLECTED = ["success", "partial", "failed", "unreachable", "not_collected"] as const;
/** "Succeeded on 19 Jan 2026 at 02:00": a device's collection and the run it belongs to. */
export function collectionWords(t: Translate, status: CollectionStatus | null, runStart: string): string | null {
  if (status === null || !(COLLECTED as readonly string[]).includes(status)) return null;
  const { date, time } = dateAndClock(runStart, t("ui:locale"));
  const word = t(`panel:identity.collected.${status}`);
  return date ? t("panel:identity.collectionOn", { status: word, date: t("diagram:context.runWords", { date, time }) }) : word;
}

const TYPES = ["switch", "router", "firewall", "load_balancer", "wireless_controller", "server", "other"] as const;
type TypeWord = (typeof TYPES)[number];
/** The kind of a device, in words: its type, else what it is to the collection. */
export function kindWords(t: Translate, node: Pick<Model["nodes"][number], "kind" | "type">): string {
  if (node.kind === "stub") return t("panel:kind.stub");
  if (node.kind === "external") return t("panel:kind.external");
  const type: TypeWord = node.type && (TYPES as readonly string[]).includes(node.type) ? (node.type as TypeWord) : "other";
  return t(`panel:kind.${type}`);
}

/** "Cisco N9K-C93180YC-FX": the hardware; else the system; else the kind. */
export function subheadingWords(t: Translate, node: Pick<Model["nodes"][number], "kind" | "type" | "vendor" | "model" | "os_name" | "os_version">): string {
  const hardware = [node.vendor, node.model].filter(Boolean).join(" ");
  const system = [node.os_name, node.os_version].filter(Boolean).join(" ");
  return hardware || system || kindWords(t, node);
}

const MEMBER_STATUSES = ["bundled", "suspended", "standby", "individual", "down", "not_in_use"] as const;
export const memberStatusWords = (t: Translate, status: MemberStatus | null): string | null =>
  status !== null && (MEMBER_STATUSES as readonly string[]).includes(status) ? t(`panel:interfaces.memberStatus.${status}`) : status;

const HA_MODES = ["active_passive", "active_active", "standalone", "other"] as const;
export const haModeWords = (t: Translate, mode: HaMode | string): string => ((HA_MODES as readonly string[]).includes(mode) ? t(`panel:ha.modes.${mode as HaMode}`) : mode);
const HA_ROLES = ["primary", "secondary", "active", "standby", "member"] as const;
export const haRoleWords = (t: Translate, role: HaRole | string): string => ((HA_ROLES as readonly string[]).includes(role) ? t(`panel:ha.roles.${role as HaRole}`) : role);
const HA_STATES = ["up", "down", "unknown"] as const;
export const haStateWords = (t: Translate, state: HaState | string): string => ((HA_STATES as readonly string[]).includes(state) ? t(`panel:ha.states.${state as HaState}`) : state);

/** The header of a column, which focus says in full ("Port and aggregate", "Speed and duplex"). */
export function columnWords(t: Translate, key: ColumnKey, width: Width): string {
  if (width === "focus" && key === "port") return t("panel:interfaces.columnName.portAggregate");
  if (width === "focus" && key === "speed") return t("panel:interfaces.columnName.speedDuplex");
  return t(`panel:interfaces.columnName.${key}`);
}

/** Every check code of the contract, each with its sentence in `panel:checks` (a test holds the three aligned). */
export const CODES: readonly CheckCode[] = [
  "neighbor_name_case_differs", "neighbor_resolved_by_reported_hostname", "neighbor_resolved_by_address", "neighbor_name_ambiguous", "neighbor_unknown",
  "remote_port_is_mac", "remote_port_is_aggregate", "description_unparseable", "description_ha_unresolved", "description_disagrees_with_observed",
  "multiple_observed_neighbors", "one_way_observation", "self_observation", "documented_not_observed", "aggregate_member_not_bundled",
  "aggregate_below_min_links", "aggregate_protocol_mismatch", "mlag_downstream_inconsistent", "mlag_pair_direct_link", "ha_member_down",
  "ha_view_mismatch", "heartbeat_link_not_observed", "link_oper_mismatch", "link_speed_mismatch", "native_vlan_mismatch", "link_down",
  "documented_port_without_transceiver", "device_unreachable", "device_partial_collection", "parent_interface_unknown", "interface_member_unknown",
  "aggregate_interface_unknown", "aggregate_member_unknown", "local_interface_unknown", "ha_member_unknown", "heartbeat_interface_unknown",
  "vrf_default_case", "reported_hostname_differs", "device_without_task", "documents_without_task",
];
const KNOWN_CODES: ReadonlySet<string> = new Set(CODES);

/** An alert's sentence: the catalogue's for a code the page knows; for a code the server knows and the page does not,
 *  the meaning the server embeds (in its own language); else "N other checks". Never the code itself. */
export function alertWords(t: Translate, group: AlertGroup, catalogue: Model["catalogue"]): string {
  if (KNOWN_CODES.has(group.code)) return t(`panel:checks.${group.code as CheckCode}`, { count: group.count });
  const meaning = catalogue[group.code]?.meaning;
  return meaning ? meaning : t("panel:toCheck.other", { count: group.count });
}

/** What an alert names, as the detail line: ports and aggregates (another device's with its name), a cable by its
 *  local port and the other end, devices; empty when the alert names only the device itself. */
export function alertRefsWords(t: Translate, refs: readonly RefName[], hostname: string): string | null {
  const parts = refs.map((ref) => {
    if (ref.kind === "cable" && ref.remote) return t("panel:toCheck.cableRef", { port: shortPort(ref.name), host: ref.remote.hostname, remotePort: shortPort(ref.remote.port) });
    if (ref.kind === "device") return ref.hostname;
    const name = ref.kind === "aggregate" ? ref.name : shortPort(ref.name);
    return ref.hostname === hostname ? name : t("panel:toCheck.elsewhere", { host: ref.hostname, name });
  });
  return parts.length ? parts.join(t("panel:toCheck.refsJoin")) : null;
}

/** "2 errors, 3 warnings, 1 note": the counts after the "To check" heading, zeros left out. */
export function severityWords(t: Translate, counts: Readonly<{ error: number; warning: number; info: number }>): string | null {
  const parts = [
    counts.error ? t("panel:toCheck.errors", { count: counts.error }) : "",
    counts.warning ? t("panel:toCheck.warnings", { count: counts.warning }) : "",
    counts.info ? t("panel:toCheck.notes", { count: counts.info }) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(t("panel:toCheck.join")) : null;
}

const SOURCES = ["lldp", "cdp", "description"] as const;
/** A witness's source in words ("LLDP", "CDP", "description"); an unknown one stays as written. */
export const sourceWords = (t: Translate, source: EvidenceSource | string): string => ((SOURCES as readonly string[]).includes(source) ? t(`panel:identity.sources.${source as EvidenceSource}`) : source);

const ROLES = ["heartbeat", "mlag_peer_link"] as const;
export const roleWords = (t: Translate, role: InterfaceRole | string): string => ((ROLES as readonly string[]).includes(role) ? t(`panel:interfaces.role.${role as InterfaceRole}`) : role);

/** The words the table shows for a row, for the filter to match them too (state, duplex, mode, native VLAN, last
 *  change, type, roles): the page's language. */
export function shownWords(t: Translate, row: InterfaceRow): string {
  return [stateWords(t, row.state), duplexWords(t, row.duplex), modeWords(t, row.mode), nativeWords(t, row.mode), lastChangeWords(t, row.lastChange),
    row.type === "physical" ? "" : t(`panel:interfaces.type.${row.type}`), ...row.roles.map((role) => roleWords(t, role))].filter(Boolean).join("\n");
}

/** A value of the contract in a "before → after" line: a known word (collection, state, mode, duplex, status) in the
 *  page's language, a list joined, a count for a list of objects, "changed" for an object, a dash for nothing. */
export function changeValueWords(t: Translate, path: string, value: unknown): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return t("panel:changes.empty");
  if (Array.isArray(value)) return value.some((v) => v && typeof v === "object") ? t("panel:changes.items", { count: value.length }) : value.map((v) => changeValueWords(t, path, v)).join(t("panel:interfaces.listJoin"));
  if (typeof value === "object") return path === "stack" && "member_count" in value ? t("panel:identity.stackMembers", { count: Number((value as { member_count: unknown }).member_count) }) : t("panel:changes.object");
  const text = String(value);
  if (typeof value === "boolean") return t(`panel:changes.value.${value ? "true" : "false"}`);
  if (path === "collection" && (COLLECTED as readonly string[]).includes(text)) return t(`panel:identity.collected.${text as CollectionStatus}`);
  if ((path === "oper_status" || path === "oper") && text in STATE_OF_OPER) return stateWords(t, STATE_OF_OPER[text]);
  if (path === "admin_status") return text === "down" ? stateWords(t, "adminDown") : stateWords(t, "up");
  if (path === "duplex" && (["full", "half", "unknown"] as readonly string[]).includes(text)) return t(`panel:interfaces.duplex.${text as Duplex}`);
  if (path === "switchport_mode") return modeWords(t, text === "access" ? { kind: "access", vlan: null } : text === "trunk" ? { kind: "trunk", allowed: null, native: null } : text === "routed" ? { kind: "routed" } : text === "none" ? { kind: "none" } : { kind: "unknown" }) ?? text;
  if (path === "status" && (["confirmed", "observed_only", "documented_only"] as readonly string[]).includes(text)) return t(`panel:changes.value.${text as "confirmed"}`);
  return text;
}
const STATE_OF_OPER: Readonly<Record<string, StateWord>> = { up: "up", down: "down", testing: "testing", unknown: "unknown", dormant: "dormant", not_present: "notPresent", lower_layer_down: "lowerLayerDown" };

/** The neighbour cell's parts: the device and, muted, its short port. */
export const neighbourParts = (row: InterfaceRow): readonly Readonly<{ hostname: string; port: string }>[] => row.neighbours.map((n) => ({ hostname: n.hostname, port: shortPort(n.port) }));

export { shortPort };
