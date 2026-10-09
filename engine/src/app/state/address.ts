// L'adresse est l'état de vue (principe du projet) : la partie `?` porte la run (`infrastructure`, `run_id`, `from`,
// comme `/view`), le fragment `#` porte la vue (bascules, règles, élément sélectionné par identité, jamais par rang).
// Les mêmes clés que `/view` : `#node=`, `#link=`, `#beam=`, `#cluster=`, `#aggregate=`, `#group=`, `stubs=1`, `ports=1`,
// `diff=0` ; les couches de l'application (panneau Affichage) : `speeds=1`, `beams=1`, `pins=0`, `notes=0` ; en plus, `hide=` (répétable), `only=`, `mask=` (statuts masqués). Une entrée illisible est ignorée :
// un lien tronqué n'empêche jamais la page de s'afficher. Pur, testé sous Node.
import type { Address, SelectionToken, ViewState } from "./types";

export const SELECTION_KEYS = ["node", "link", "aggregate", "beam", "cluster", "group", "annotation", "connector"];
export const STATUSES = ["confirmed", "observed_only", "documented_only"];

export const defaultView = (): ViewState => ({ showStubs: false, showPorts: false, showSpeeds: false, showBeams: false, showPins: true, showNotes: true, showDiff: true, hide: [], only: "", hiddenStatuses: [] });

export function parseSearch(search: string): Address {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return { infrastructure: params.get("infrastructure") || "", runId: params.get("run_id") || "", from: params.get("from") || "" };
}

export function formatSearch(address: Address): string {
  if (!address.infrastructure) return "";
  const params = new URLSearchParams({ infrastructure: address.infrastructure });
  if (address.runId) params.set("run_id", address.runId);
  if (address.from) params.set("from", address.from);
  return "?" + params.toString();
}

function pairs(hash: string): [string, string][] {
  const out: [string, string][] = [];
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of body.split("&")) {
    const cut = part.indexOf("=");
    if (cut <= 0) continue;
    try { out.push([part.slice(0, cut), decodeURIComponent(part.slice(cut + 1))]); } catch (error) { continue; }
  }
  return out;
}

export interface ParsedHash { view: ViewState; selection: SelectionToken | null }

export function parseHash(hash: string): ParsedHash {
  const view = defaultView();
  let selection: SelectionToken | null = null;
  for (const [key, value] of pairs(hash)) {
    if (key === "stubs") view.showStubs = value === "1";
    else if (key === "ports") view.showPorts = value === "1";
    else if (key === "speeds") view.showSpeeds = value === "1";
    else if (key === "beams") view.showBeams = value === "1";
    else if (key === "pins") view.showPins = value !== "0";
    else if (key === "notes") view.showNotes = value !== "0";
    else if (key === "diff") view.showDiff = value !== "0";
    else if (key === "hide" && value.trim()) view.hide = view.hide.concat(value);
    else if (key === "only") view.only = value;
    else if (key === "mask") view.hiddenStatuses = value.split(",").filter((st) => STATUSES.includes(st));
    else if (SELECTION_KEYS.includes(key) && !selection) selection = { kind: key, token: value };
  }
  return { view, selection };
}

export function formatHash(view: ViewState, selection: SelectionToken | null): string {
  const parts: string[] = [];
  if (view.showStubs) parts.push("stubs=1");
  if (view.showPorts) parts.push("ports=1");
  if (view.showSpeeds) parts.push("speeds=1");
  if (view.showBeams) parts.push("beams=1");
  if (!view.showPins) parts.push("pins=0");
  if (!view.showNotes) parts.push("notes=0");
  if (!view.showDiff) parts.push("diff=0");
  view.hide.forEach((rule) => parts.push("hide=" + encodeURIComponent(rule)));
  if (view.only) parts.push("only=" + encodeURIComponent(view.only));
  if (view.hiddenStatuses.length) parts.push("mask=" + view.hiddenStatuses.join(","));
  if (selection) parts.push(selection.kind + "=" + encodeURIComponent(selection.token));
  return parts.length ? "#" + parts.join("&") : "";
}

export const address = { parseSearch, formatSearch, parseHash, formatHash, defaultView, SELECTION_KEYS, STATUSES };
