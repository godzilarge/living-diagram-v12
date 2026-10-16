// The address is the view state (a principle of the project): the `?` part carries the run (`infrastructure`,
// `run_id`, `from`), the `#` part the view (the mode, the canvas toggles, the hidden statuses, the selected element by
// identity, never by rank). The same keys as the v1 (`engine/src/app/state/address.ts`) so a link written by one opens
// in the other: `#node=`, `#link=`, `#beam=`, `#cluster=`, `#aggregate=`, `#group=`, `#annotation=`, `#connector=`;
// `stubs=1`, `ports=1`, `speeds=1`, `beams=1`, `pins=0`, `notes=0`, `oper=1`, `diff=0`; `hide=` (repeatable), `only=`,
// `mask=`; `mode=control` or `mode=journal` (absent = diagram). An unreadable entry is ignored: a truncated link never
// keeps the page from showing. The v1's Log filters (`jq`, `jau`…) are not read here: they move with brick 7. Pure.

export type Address = Readonly<{ infrastructure: string; runId: string; from: string }>;
export type ViewMode = "diagram" | "control" | "journal";
export type ViewState = Readonly<{
  mode: ViewMode;
  showStubs: boolean;
  showPorts: boolean;
  showSpeeds: boolean;
  showBeams: boolean;
  showPins: boolean;
  showNotes: boolean;
  showOper: boolean;
  showDiff: boolean;
  hide: readonly string[];
  only: string;
  hiddenStatuses: readonly string[];
}>;
export type SelectionToken = Readonly<{ kind: string; token: string }>;
export type ParsedHash = Readonly<{ view: ViewState; selection: SelectionToken | null }>;

export const SELECTION_KEYS = ["node", "link", "aggregate", "beam", "cluster", "group", "annotation", "connector"] as const;
export const STATUSES = ["confirmed", "observed_only", "documented_only"] as const;
const MODES: readonly ViewMode[] = ["diagram", "control", "journal"];

export const DEFAULT_VIEW: ViewState = Object.freeze({
  mode: "diagram",
  showStubs: false,
  showPorts: false,
  showSpeeds: false,
  showBeams: false,
  showPins: true,
  showNotes: true,
  showOper: false,
  showDiff: true,
  hide: [],
  only: "",
  hiddenStatuses: [],
});

/** Where `/next/` opens: the diagram when the address names an infrastructure, else the home. */
export const routeOf = (search: string): "home" | "diagram" => (parseSearch(search).infrastructure ? "diagram" : "home");

export function parseSearch(search: string): Address {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return { infrastructure: params.get("infrastructure") ?? "", runId: params.get("run_id") ?? "", from: params.get("from") ?? "" };
}

export function formatSearch(address: Address): string {
  if (!address.infrastructure) return "";
  const params = new URLSearchParams({ infrastructure: address.infrastructure });
  if (address.runId) params.set("run_id", address.runId);
  if (address.from) params.set("from", address.from);
  return `?${params.toString()}`;
}

function pairs(hash: string): [string, string][] {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const out: [string, string][] = [];
  for (const part of body.split("&")) {
    const cut = part.indexOf("=");
    if (cut <= 0) continue;
    try {
      out.push([part.slice(0, cut), decodeURIComponent(part.slice(cut + 1))]);
    } catch {
      // an entry that is not valid percent-encoding is ignored
    }
  }
  return out;
}

const isMode = (value: string): value is ViewMode => (MODES as readonly string[]).includes(value);
const isStatus = (value: string): boolean => (STATUSES as readonly string[]).includes(value);
const isSelectionKey = (value: string): boolean => (SELECTION_KEYS as readonly string[]).includes(value);

function applyPair(view: ViewState, key: string, value: string): ViewState {
  switch (key) {
    case "mode": return { ...view, mode: isMode(value) ? value : "diagram" };
    case "stubs": return { ...view, showStubs: value === "1" };
    case "ports": return { ...view, showPorts: value === "1" };
    case "speeds": return { ...view, showSpeeds: value === "1" };
    case "beams": return { ...view, showBeams: value === "1" };
    case "pins": return { ...view, showPins: value !== "0" };
    case "notes": return { ...view, showNotes: value !== "0" };
    case "oper": return { ...view, showOper: value === "1" };
    case "diff": return { ...view, showDiff: value !== "0" };
    case "hide": return value.trim() ? { ...view, hide: [...view.hide, value] } : view;
    case "only": return { ...view, only: value };
    case "mask": return { ...view, hiddenStatuses: value.split(",").filter(isStatus) };
    default: return view;
  }
}

export function parseHash(hash: string): ParsedHash {
  let view: ViewState = DEFAULT_VIEW;
  let selection: SelectionToken | null = null;
  for (const [key, value] of pairs(hash)) {
    if (isSelectionKey(key)) selection = selection ?? { kind: key, token: value };
    else view = applyPair(view, key, value);
  }
  return { view: Object.freeze(view), selection };
}

export function formatHash(view: ViewState, selection: SelectionToken | null): string {
  const parts: string[] = [];
  if (view.mode !== "diagram") parts.push(`mode=${view.mode}`);
  if (view.showStubs) parts.push("stubs=1");
  if (view.showPorts) parts.push("ports=1");
  if (view.showSpeeds) parts.push("speeds=1");
  if (view.showBeams) parts.push("beams=1");
  if (!view.showPins) parts.push("pins=0");
  if (!view.showNotes) parts.push("notes=0");
  if (view.showOper) parts.push("oper=1");
  if (!view.showDiff) parts.push("diff=0");
  view.hide.forEach((rule) => parts.push(`hide=${encodeURIComponent(rule)}`));
  if (view.only) parts.push(`only=${encodeURIComponent(view.only)}`);
  if (view.hiddenStatuses.length) parts.push(`mask=${view.hiddenStatuses.join(",")}`);
  if (selection) parts.push(`${selection.kind}=${encodeURIComponent(selection.token)}`);
  return parts.length ? `#${parts.join("&")}` : "";
}

export const sameView = (a: ViewState, b: ViewState): boolean => formatHash(a, null) === formatHash(b, null);
