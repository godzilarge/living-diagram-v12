// Talking to the API: the token in `Authorization` (never in the address), the answer read into one of five outcomes.
// The token lives in `sessionStorage` under the v1's key (`ld-api-token`: one tab, never the disk), the declared author
// in `localStorage` (`ld-author`): a token typed in the v1 opens the v2 and back. Pure: the storage and `fetch` are
// parameters (the browser's by default), so Node tests every path.

export const TOKEN_KEY = "ld-api-token";
export const AUTHOR_KEY = "ld-author";

export type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Fetch = (input: string, init: RequestInit) => Promise<Pick<Response, "status" | "ok" | "json">>;

/** What a call gives: the parsed data, or why not. `invalid`: a 2xx whose body is not what the contract says. */
export type Answer<T> =
  | Readonly<{ kind: "ok"; data: T }>
  | Readonly<{ kind: "unauthorized" }>
  | Readonly<{ kind: "failed"; status: number }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unreachable" }>;

function browserStore(name: "sessionStorage" | "localStorage"): KeyStore | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null; // a blocked storage: the value lives as long as the page
  }
}

function read(store: KeyStore | null, key: string): string {
  try {
    return store?.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function readToken(store: KeyStore | null = browserStore("sessionStorage")): string {
  return read(store, TOKEN_KEY);
}

/** Stores the token; an empty one removes it (a refused token is worth nothing). */
export function writeToken(token: string, store: KeyStore | null = browserStore("sessionStorage")): void {
  try {
    if (token.trim()) store?.setItem(TOKEN_KEY, token.trim());
    else store?.removeItem(TOKEN_KEY);
  } catch {
    // a full or blocked storage: the token lives as long as the page
  }
}

export function readAuthor(store: KeyStore | null = browserStore("localStorage")): string {
  return read(store, AUTHOR_KEY);
}

/** Stores the declared author (trimmed, 80 characters at most, the contract's bound); an empty name removes it. */
export function writeAuthor(name: string, store: KeyStore | null = browserStore("localStorage")): void {
  const kept = name.trim().slice(0, 80);
  try {
    if (kept) store?.setItem(AUTHOR_KEY, kept);
    else store?.removeItem(AUTHOR_KEY);
  } catch {
    // a full or blocked storage: the name lives as long as the page
  }
}

export type Params = Readonly<Record<string, string | number>> | readonly (readonly [string, string])[];

/** The route with its query; a list of pairs keeps a repeated key (`author` twice), a record cannot. */
export function withParams(route: string, params: Params): string {
  const pairs = Array.isArray(params) ? (params as readonly (readonly [string, string])[]).map(([key, value]) => [key, value]) : Object.entries(params).map(([key, value]) => [key, String(value)]);
  const query = new URLSearchParams(pairs as [string, string][]).toString();
  return query ? `${route}?${query}` : route;
}

const browserFetch: Fetch = (input, init) => fetch(input, init);

/** A GET of the API with the token; `parse` validates the body at the boundary (null = not the contract's shape). */
export async function getJson<T>(
  route: string,
  params: Params,
  token: string,
  parse: (body: unknown) => T | null,
  fetchFn: Fetch = browserFetch,
): Promise<Answer<T>> {
  let response: Awaited<ReturnType<Fetch>>;
  try {
    response = await fetchFn(withParams(route, params), { headers: { Authorization: `Bearer ${token}` }, credentials: "omit" });
  } catch {
    return { kind: "unreachable" };
  }
  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "failed", status: response.status };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "invalid" };
  }
  const data = parse(body);
  return data === null ? { kind: "invalid" } : { kind: "ok", data };
}
