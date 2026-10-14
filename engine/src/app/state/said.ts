// Un texte que l'état garde sans langue (2026-10-10, revue de l'interface bilingue, M2) : une clé du catalogue et ses
// valeurs, ou une réponse de l'API, écrits au moment de les montrer (`sayText`). Un avertissement, un échec gardé dans
// l'état suit ainsi un changement de langue, comme les libellés d'annuler (`history.Label`).
import { t } from "../../i18n";
import { explain } from "../../shell/http";

export type Said = { key: string; values?: Record<string, string | number | Said> } | { status: number; body: unknown };

/** Un texte du catalogue (`espace:clé`), ses valeurs pouvant être d'autres textes sans langue. */
export const said = (key: string, values?: Record<string, string | number | Said>): Said => (values ? { key, values } : { key });
/** Ce qu'une réponse de l'API refuse, dit par `explain` dans la langue du moment. */
export const answer = (status: number, body: unknown): Said => ({ status, body });

export function sayText(text: Said): string {
  if ("status" in text) return explain(text.status, text.body);
  const values = Object.fromEntries(Object.entries(text.values || {}).map(([name, value]) => [name, typeof value === "object" ? sayText(value) : value]));
  return t(text.key as never, values as never) as unknown as string;
}
