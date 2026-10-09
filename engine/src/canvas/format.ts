// Les mots de la toile : libellés des statuts, sources, sortes, résolutions, changements, et la mise en texte des
// valeurs (vitesse, écart entre deux runs, détails d'un contrôle). Pur, sans DOM.
import { endLabel } from "./model";

export const SOURCE_LABEL: Record<string, string> = { lldp: "LLDP", cdp: "CDP", description: "Description" };
export const STATUS_LABEL: Record<string, string> = { confirmed: "confirmé", observed_only: "observé seul", documented_only: "documenté seul" };
export const KIND_LABEL: Record<string, string> = { device: "équipement collecté", external: "équipement d'une autre infra", stub: "voisin inconnu" };
/** L'état de collecte d'un équipement, en mots (la fiche et la bulle disent la même chose). */
export const COLLECTION_LABEL: Record<string, string> = { success: "réussie", unreachable: "injoignable", failed: "en échec", partial: "partielle", not_collected: "non collecté" };
/** Le mode d'un cluster HA, en mots. */
export const HA_MODE_LABEL: Record<string, string> = { active_passive: "actif-passif", active_active: "actif-actif", standalone: "autonome", other: "autre" };
/** La gravité d'un contrôle, en mots (le point coloré ne suffit pas : WCAG 1.4.1). */
export const SEVERITY_LABEL: Record<string, string> = { error: "erreur", warning: "avertissement", info: "info" };
/** Le type d'un équipement en pastille : un mot court (`PILL_MAX`), le libellé complet est dans icons.ts. */
export const TYPE_SHORT_LABEL: Record<string, string> = { switch: "switch", router: "routeur", firewall: "firewall", load_balancer: "répartiteur", wireless_controller: "WLC", server: "serveur", other: "autre" };
export const RESOLUTION_LABEL: Record<string, string> = {
  hostname: "nom exact", hostname_casefold: "nom, à la casse près", reported_hostname: "nom annoncé par l'équipement",
  address: "adresse (IP ou MAC)", stub: "non résolu : voisin inconnu",
};
// Le diff (B3) : ce qu'un élément est devenu depuis la run d'avant.
export const DIFF_LABEL: Record<string, string> = { added: "ajouté", removed: "retiré", changed: "changé" };
export const EVENT_LABEL: Record<string, string> = { rebooted: "redémarré", flapped: "flap" }; // un seul mot partout ; `flapped` reste à confirmer (docs/07 Q4)

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

// Une durée lue en secondes (l'uptime d'un équipement), en deux unités au plus : « 12 j 4 h », « 3 h 20 min », « 45 min », « 30 s ».
export function durationText(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  if (d) return d + " j" + (h ? " " + h + " h" : "");
  if (h) return h + " h" + (m ? " " + m + " min" : "");
  return m ? m + " min" : Math.floor(seconds) + " s";
}

// Une vitesse lue en Mbit/s, écrite comme on la lit : « 10 Gb/s », « 2,5 Gb/s », « 100 Mb/s » ; non lue, elle reste null.
export function speedText(mbps: number | null | undefined): string | null {
  if (mbps === null || mbps === undefined) return null;
  return mbps >= 1000 ? String(mbps / 1000).replace(".", ",") + " Gb/s" : mbps + " Mb/s";
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
  const protocols = link.sources.filter((src) => OBSERVED_SOURCE[src]).map((src) => src.toUpperCase()).join(" et ");
  const parts: string[] = [];
  if (seen) parts.push("Observé en " + protocols + " depuis " + seen + ".");
  else parts.push("Aucune observation LLDP ni CDP : ce câble n'existe que par les descriptions d'interface.");
  parts.push(written ? "Documenté par la description de " + written + "." : "Aucune description ne le documente.");
  if (link.checks.some((c) => c.code === "description_disagrees_with_observed")) parts.push("Attention : une description ne concorde pas avec l'observé, voir le contrôle ci-dessous.");
  return parts.join(" ");
}

export const format = { plain, brief, shortPort, speedText, durationText, elapsedText, whyText, SOURCE_LABEL, STATUS_LABEL, KIND_LABEL, RESOLUTION_LABEL, DIFF_LABEL, EVENT_LABEL, COLLECTION_LABEL, HA_MODE_LABEL, SEVERITY_LABEL, TYPE_SHORT_LABEL };
