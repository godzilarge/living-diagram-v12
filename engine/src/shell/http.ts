// Ce que les deux faces servies par le backend (`/view`, l'application à `/`) partagent pour parler à l'API : les
// routes, l'appel (jeton en `Authorization`, jamais dans l'adresse), la lecture d'une réponse en mots, et les deux
// rangements du navigateur : le jeton dans `sessionStorage` (l'onglet, pas le disque), le nom dans `localStorage`
// (une commodité, pas un secret). Aucun DOM ici.
import { i18n, t } from "../i18n/core";
export const TOKEN_KEY = "ld-api-token";
export const AUTHOR_KEY = "ld-author";
export const ROUTES = { runs: "/api/ingest/bundles", snapshot: "/api/snapshot", report: "/api/ingest/report", diff: "/api/diff", intent: "/api/intent", patches: "/api/intent/patches", placement: "/api/placement", assets: "/api/intent/assets", journal: "/api/intent/journal" };
export interface Answer { status: number; body: unknown }

function storage(): Storage | null {
  try { return globalThis.sessionStorage || null; } catch (error) { return null; }
}
export function readToken(): string {
  try { const store = storage(); return (store && store.getItem(TOKEN_KEY)) || ""; } catch (error) { return ""; }
}
export function writeToken(token: string): void {
  try {
    const store = storage();
    if (store) { if (token) store.setItem(TOKEN_KEY, token); else store.removeItem(TOKEN_KEY); }
  } catch (error) { /* stockage indisponible : le jeton ne vit que le temps de la page */ }
}
export function readAuthor(): string {
  try { return (globalThis.localStorage && globalThis.localStorage.getItem(AUTHOR_KEY)) || ""; } catch (error) { return ""; }
}
export function writeAuthor(name: string): void {
  try {
    const store = globalThis.localStorage;
    if (store) { if (name) store.setItem(AUTHOR_KEY, name); else store.removeItem(AUTHOR_KEY); }
  } catch (error) { /* stockage indisponible : le nom ne vit que le temps de la page */ }
}

export const withParams = (route: string, params: Record<string, string>): string => route + "?" + new URLSearchParams(params).toString();

export async function call(route: string, params: Record<string, string>, token: string, payload?: unknown): Promise<Answer> {
  const init: RequestInit = { headers: { Authorization: "Bearer " + token }, credentials: "omit" };
  if (payload !== undefined) Object.assign(init, { method: "POST", headers: { ...init.headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const response = await fetch(withParams(route, params), init);
  let body: unknown = null;
  try { body = await response.json(); } catch (error) { body = null; }
  return { status: response.status, body };
}

export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

/** Le texte d'un code de refus dans la langue de la page (`common:http.<famille>.<code>`), écrit avec les valeurs du
 *  serveur (`params`) ; `action`, un mot de l'API, se traduit aussi. Vide si la page ne connaît pas le code. */
function ownText(family: "problem" | "field", code: unknown, params: Record<string, unknown>): string {
  const key = "common:http." + family + "." + String(code);
  if (typeof code !== "string" || !i18n.exists(key)) return "";
  const action = typeof params.action === "string" && i18n.exists("common:http.action." + params.action) ? t(("common:http.action." + params.action) as never) : params.action;
  return t(key as never, { ...params, action } as never) as unknown as string;
}

/** Le refus d'une réponse de l'API en mots (2026-10-10, lot 7 de la langue) : l'API répond en anglais avec un code stable, la
 *  page écrit son propre texte d'après le code du premier champ fautif, sinon celui du refus ; un code qu'elle ne
 *  connaît pas garde la phrase anglaise du serveur (`detail`). */
export function problemText(body: unknown): string {
  const problem = isRecord(body) ? body : {};
  const params = isRecord(problem.params) ? problem.params : {};
  const field = Array.isArray(problem.errors) && isRecord(problem.errors[0]) ? problem.errors[0] : {};
  const own = ownText("field", field.code, params);
  if (own) return own;
  const general = ownText("problem", problem.code, params) || (typeof problem.detail === "string" ? problem.detail : "");
  // un champ fautif dont la page ne connaît pas la règle (code de Pydantic ou du contrat) : au moins son chemin
  return general && typeof field.path === "string" && field.path ? t("common:http.withField", { problem: general, path: field.path }) : general;
}

/** `problemText` précédé du statut, sauf pour un 401 (le jeton) et un 404 (ce qui manque se dit seul). */
export function explain(status: number, body: unknown): string {
  if (status === 401) return t("common:http.tokenRefused");
  const detail = problemText(body);
  if (status === 404) return detail || t("common:http.unknownRun");
  return detail ? t("common:http.statusDetail", { status, detail }) : t("common:http.status", { status });
}
