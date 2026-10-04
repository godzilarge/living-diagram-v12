// Les mots de la toile : libellés des statuts, sources, sortes, résolutions, changements, et la mise en texte des
// valeurs (vitesse, écart entre deux runs, détails d'un contrôle). Pur, sans DOM.
import { endLabel } from "./model";

export const SOURCE_LABEL: Record<string, string> = { lldp: "LLDP", cdp: "CDP", description: "Description" };
export const STATUS_LABEL: Record<string, string> = { confirmed: "confirmé", observed_only: "observé seul", documented_only: "documenté seul" };
export const KIND_LABEL: Record<string, string> = { device: "équipement collecté", external: "équipement d'une autre infra", stub: "voisin inconnu" };
export const RESOLUTION_LABEL: Record<string, string> = {
  hostname: "nom exact", hostname_casefold: "nom, à la casse près", reported_hostname: "nom annoncé par l'équipement",
  address: "adresse (IP ou MAC)", stub: "non résolu : voisin inconnu",
};
// Le diff (B3) : ce qu'un élément est devenu depuis la run d'avant.
export const DIFF_LABEL: Record<string, string> = { added: "ajouté", removed: "retiré", changed: "changé" };
export const EVENT_LABEL: Record<string, string> = { rebooted: "redémarré", flapped: "flap" }; // un seul mot partout ; `flapped` reste à confirmer (docs/07 Q4)

const isEnd = (value: object): value is Record<string, unknown> & { hostname: string; interface: string | null } =>
  "hostname" in value && "interface" in value;

// Une valeur de `details` : texte, liste, ou bout de câble {hostname, interface}.
export function plain(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.map(plain).join(", ") : "—";
  if (typeof value === "object") {
    if (isEnd(value)) return endWithFacts(value);
    return Object.entries(value).map(([k, v]) => k + " : " + plain(v)).join(" ; ");
  }
  return String(value);
}

// Un bout de câble porteur de faits (R5 : `states`, `speeds`, `vlans`) : « sw-core-02 · Ethernet1/2 (oper_status down,
// oper_reason suspended by LACP) » ; l'état avant sa raison, le mode avant son VLAN, le reste trié ; un fait à null
// n'est pas écrit.
const FACT_ORDER = ["oper_status", "oper_reason", "speed_mbps", "switchport_mode", "vlan"];
const factRank = (key: string): number => (FACT_ORDER.includes(key) ? FACT_ORDER.indexOf(key) : FACT_ORDER.length);
function endWithFacts(value: Record<string, unknown> & { hostname: string; interface: string | null }): string {
  const facts = Object.entries(value)
    .filter(([k, v]) => k !== "hostname" && k !== "interface" && v !== null && v !== undefined)
    .sort((x, y) => factRank(x[0]) - factRank(y[0]) || (x[0] < y[0] ? -1 : 1));
  const label = endLabel(value);
  return facts.length ? label + " (" + facts.map(([k, v]) => k + " " + plain(v)).join(", ") + ")" : label;
}

// Une valeur avant / après d'un changement, en bref : une liste d'objets se compte (« 4 éléments »), le reste s'écrit.
export function brief(value: unknown): string {
  if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) return value.length + " élément" + (value.length > 1 ? "s" : "");
  return plain(value);
}

// L'écart entre deux runs, lu dans `elapsed_seconds`, signé : « 7 j plus tard », « 3 h plus tôt » ; nul quand les deux
// runs ont le même début (une run comparée à elle-même).
export function elapsedText(seconds: number): string {
  if (seconds === 0) return "même début de collecte";
  const abs = Math.abs(seconds);
  const amount = abs >= 86400 ? Math.round(abs / 8640) / 10 + " j" : abs >= 3600 ? Math.round(abs / 360) / 10 + " h" : Math.round(abs / 60) + " min";
  return amount + (seconds < 0 ? " plus tôt" : " plus tard");
}

// Une vitesse lue en Mbit/s, écrite comme on la lit : « 10 Gb/s », « 2,5 Gb/s », « 100 Mb/s » ; non lue, elle reste null.
export function speedText(mbps: number | null | undefined): string | null {
  if (mbps === null || mbps === undefined) return null;
  return mbps >= 1000 ? String(mbps / 1000).replace(".", ",") + " Gb/s" : mbps + " Mb/s";
}

export const format = { plain, brief, speedText, elapsedText, SOURCE_LABEL, STATUS_LABEL, KIND_LABEL, RESOLUTION_LABEL, DIFF_LABEL, EVENT_LABEL };
