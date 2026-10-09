// Ce que les deux faces servies par le backend (`/view`, l'application à `/`) partagent pour parler à l'API : les
// routes, l'appel (jeton en `Authorization`, jamais dans l'adresse), la lecture d'une réponse en mots, et les deux
// rangements du navigateur : le jeton dans `sessionStorage` (l'onglet, pas le disque), le nom dans `localStorage`
// (une commodité, pas un secret). Aucun DOM ici.
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

export function explain(status: number, body: unknown): string {
  if (status === 401) return "jeton refusé par l'API";
  const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : "";
  if (status === 404) return detail || "run inconnue pour cette infrastructure";
  return "l'API répond " + status + (detail ? " : " + detail : "");
}
