// Les mots de la toile : libellés des statuts, sources, sortes, résolutions, changements, et la mise en texte des
// valeurs (vitesse, écart entre deux runs, détails d'un contrôle). Pur, sans DOM. Les mots viennent du catalogue
// `common` (i18n, 2026-10-10) : français dans `/view` et `ld render`, la langue choisie dans l'application.
import { i18n, labelMap, t } from "../i18n/core";
import { endLabel } from "./model";

export const SOURCE_LABEL = labelMap("common:source", ["lldp", "cdp", "description"]);
export const STATUS_LABEL = labelMap("common:status", ["confirmed", "observed_only", "documented_only"]);
export const KIND_LABEL = labelMap("common:kind", ["device", "external", "stub"]);
/** L'état de collecte d'un équipement, en mots (la fiche et la bulle disent la même chose). */
export const COLLECTION_LABEL = labelMap("common:collection", ["success", "unreachable", "failed", "partial", "not_collected"]);
/** Le mode d'un cluster HA, en mots. */
export const HA_MODE_LABEL = labelMap("common:haMode", ["active_passive", "active_active", "standalone", "other"]);
/** Le type d'une interface en mots (recherche, fiches). */
export const IFACE_TYPE_LABEL = labelMap("common:ifaceType", ["physical", "aggregate", "subinterface", "svi", "loopback", "tunnel", "management", "other"]);
/** Le mode d'un cluster HA en mots ; un mode inconnu reste tel qu'enregistré. */
export const haModeText = (mode: string): string => HA_MODE_LABEL[mode] || mode;
/** La gravité d'un contrôle, en mots (le point coloré ne suffit pas : WCAG 1.4.1). */
export const SEVERITY_LABEL = labelMap("common:severity", ["error", "warning", "info"]);
/** Le type d'un équipement en pastille : un mot court (`PILL_MAX`), le libellé complet est dans icons.ts. */
export const TYPE_SHORT_LABEL = labelMap("common:typeShort", ["switch", "router", "firewall", "load_balancer", "wireless_controller", "server", "other"]);
export const RESOLUTION_LABEL = labelMap("common:resolution", ["hostname", "hostname_casefold", "reported_hostname", "address", "stub"]);
// Le diff (B3) : ce qu'un élément est devenu depuis la run d'avant.
export const DIFF_LABEL = labelMap("common:diff", ["added", "removed", "changed"]);
export const EVENT_LABEL = labelMap("common:event", ["rebooted", "flapped"]); // un seul mot partout ; `flapped` reste à confirmer (docs/07 Q4)

// La forme courte d'un nom de port, pour les listes (« Te1/0/1 » plutôt que « TenGigabitEthernet1/0/1 ») : l'usage des
// CLI réseau, seulement quand le préfixe est suivi d'un chiffre ; tout autre nom reste tel quel. Affichage seul : le
// nom complet reste l'identité (infobulle, en-tête, recherche).
const PORT_SHORT: readonly [string, string][] = [
  ["HundredGigE", "Hu"], ["FortyGigabitEthernet", "Fo"], ["TwentyFiveGigE", "Twe"], ["TenGigabitEthernet", "Te"], ["FiveGigabitEthernet", "Fi"],
  ["TwoGigabitEthernet", "Tw"], ["AppGigabitEthernet", "Ap"], ["GigabitEthernet", "Gi"], ["FastEthernet", "Fa"], ["Ethernet", "Eth"],
  ["port-channel", "Po"], ["Port-channel", "Po"], ["Bundle-Ether", "BE"],
];
export function shortPort(name: string | null | undefined): string {
  if (!name) return "";
  for (const [long, short] of PORT_SHORT) if (name.startsWith(long) && /^\d/.test(name.slice(long.length))) return short + name.slice(long.length);
  return name;
}

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
  if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) return t("common:format.elements", { count: value.length });
  return plain(value);
}

// L'écart entre deux runs, lu dans `elapsed_seconds`, signé : « 7 j plus tard », « 3 h plus tôt » ; nul quand les deux
// runs ont le même début (une run comparée à elle-même).
export function elapsedText(seconds: number): string {
  if (seconds === 0) return t("common:format.sameStart");
  const abs = Math.abs(seconds);
  const amount = abs >= 86400 ? Math.round(abs / 8640) / 10 + " " + t("common:format.day") : abs >= 3600 ? Math.round(abs / 360) / 10 + " " + t("common:format.hour") : Math.round(abs / 60) + " " + t("common:format.minute");
  return t(seconds < 0 ? "common:format.earlier" : "common:format.later", { amount });
}

// Une durée lue en secondes (l'uptime d'un équipement), en deux unités au plus : « 12 j 4 h », « 3 h 20 min », « 45 min », « 30 s ».
export function durationText(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  const day = t("common:format.day"), hour = t("common:format.hour"), minute = t("common:format.minute");
  if (d) return d + " " + day + (h ? " " + h + " " + hour : "");
  if (h) return h + " " + hour + (m ? " " + m + " " + minute : "");
  return m ? m + " " + minute : Math.floor(seconds) + " " + t("common:format.second");
}

// Une vitesse lue en Mbit/s, écrite comme on la lit : « 10 Gb/s », « 2,5 Gb/s » (« 2.5 Gb/s » en anglais), « 100 Mb/s » ;
// non lue, elle reste null.
export function speedText(mbps: number | null | undefined): string | null {
  if (mbps === null || mbps === undefined) return null;
  return mbps >= 1000 ? String(mbps / 1000).replace(".", i18n.language === "fr" ? "," : ".") + " Gb/s" : mbps + " Mb/s";
}

/** Ce que les sources d'un câble ont à dire de lui, en une phrase : qui l'a observé (LLDP, CDP), qui l'a documenté. */
export interface SourcedLink { sources: string[]; checks: { code: string }[]; raw: { evidence: { source: string; witness: { hostname: string; interface: string | null } }[] } }
const OBSERVED_SOURCE: Record<string, boolean> = { lldp: true, cdp: true };

// La phrase ne dit que ce que les évidences disent : qui a observé, qui a documenté. « Confirmé » veut dire
// « observé et documenté », pas « toutes les descriptions concordent » : un désaccord lié au câble est signalé.
// `ports` à faux : les témoins par leur seul nom (la fiche de l'application montre déjà les deux bouts juste au-dessus).
export function whyText(link: SourcedLink, ports = true): string {
  const witnesses = (keep: (source: string) => boolean): string => Array.from(new Set(link.raw.evidence.filter((e) => keep(e.source)).map((e) => (ports ? endLabel(e.witness) : e.witness.hostname)))).join(", ");
  const seen = witnesses((src) => OBSERVED_SOURCE[src]);
  const written = witnesses((src) => !OBSERVED_SOURCE[src]);
  const protocols = link.sources.filter((src) => OBSERVED_SOURCE[src]).map((src) => src.toUpperCase()).join(t("common:why.and"));
  const parts: string[] = [];
  parts.push(seen ? t("common:why.observed", { protocols, witnesses: seen }) : t("common:why.notObserved"));
  parts.push(written ? t("common:why.documented", { witnesses: written }) : t("common:why.undocumented"));
  if (link.checks.some((c) => c.code === "description_disagrees_with_observed")) parts.push(t("common:why.disagrees"));
  return parts.join(" ");
}

export const format = { plain, brief, shortPort, speedText, durationText, elapsedText, whyText, SOURCE_LABEL, STATUS_LABEL, KIND_LABEL, RESOLUTION_LABEL, DIFF_LABEL, EVENT_LABEL, COLLECTION_LABEL, HA_MODE_LABEL, SEVERITY_LABEL, TYPE_SHORT_LABEL };
