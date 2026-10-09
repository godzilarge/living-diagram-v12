// Les teintes nommées d'une couleur d'intention (docs/10) : douze noms que le contrat connaît, chacun avec sa valeur
// sombre et sa valeur claire dans les jetons (`--hue-*`), jamais une valeur libre. Les défauts par type vivent ici,
// pas dans le document : il ne porte que ce qui a été décidé. Pur : la toile, la fiche, la légende et les tests
// résolvent la même teinte (règle C0 : celle de l'équipement, sinon celle de son type, sinon le défaut du moteur).
import type { Model, ModelNode } from "./types";

export const HUES = ["blue", "sky", "indigo", "violet", "pink", "red", "orange", "amber", "lime", "green", "teal", "slate"] as const;
export type HueName = (typeof HUES)[number];
export const HUE_LABEL: Record<HueName, string> = {
  blue: "bleu", sky: "ciel", indigo: "indigo", violet: "violet", pink: "rose", red: "rouge", orange: "orange", amber: "ambre", lime: "citron", green: "vert", teal: "turquoise", slate: "ardoise",
};
export const FALLBACK_HUE: HueName = "slate";
/** La teinte par défaut de chaque type du contrat ; un type absent ou inconnu est ardoise. */
export const DEFAULT_HUE: Record<string, HueName> = {
  switch: "blue", router: "orange", firewall: "violet", load_balancer: "teal", wireless_controller: "green", server: "slate", other: "slate",
};
export const isHue = (value: unknown): value is HueName => typeof value === "string" && (HUES as readonly string[]).includes(value);
export const hueLabel = (hue: string): string => (isHue(hue) ? HUE_LABEL[hue] : hue);
export const defaultHue = (type: string | null | undefined): HueName => (type && DEFAULT_HUE[type]) || FALLBACK_HUE;
/** La teinte d'un type dans cette infrastructure : la palette des types, sinon le défaut du moteur. */
export function hueOfType(model: Pick<Model, "colorByType">, type: string | null | undefined): HueName {
  const set = type ? model.colorByType.get(type) : undefined;
  return set && isHue(set.hue) ? set.hue : defaultHue(type);
}
/** La teinte d'un équipement : la sienne, sinon celle de son type (règle C0). */
export function hueOfNode(model: Pick<Model, "colorByType" | "colorByHost">, node: Pick<ModelNode, "hostname" | "type">): HueName {
  const own = model.colorByHost.get(node.hostname);
  return own && isHue(own.hue) ? own.hue : hueOfType(model, node.type);
}

export const hues = { HUES, HUE_LABEL, DEFAULT_HUE, FALLBACK_HUE, isHue, hueLabel, defaultHue, hueOfType, hueOfNode };
