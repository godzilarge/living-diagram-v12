// La couche API de l'application : ce que l'application lit (les runs, une run avec son rapport, son diff, son
// intention, son placement) et comment une réponse se dit en mots. Partagé avec `/view` : `shell/http.ts` (routes,
// appel, jeton). Aucun composant n'appelle ceci directement : le store (state/store.tsx) le fait et distribue.
import type { Diff } from "../../contracts/diff";
import type { Snapshot } from "../../contracts/snapshot";
import type { CatalogueEntry, IngestData, Intent, PageData, Placement } from "../../canvas/types";
import type { RunEntry } from "../../shell/apps";
import { call, explain, isRecord, ROUTES, withParams } from "../../shell/http";
import type { JournalPage } from "../state/journal";
export { explain, readAuthor, readToken, writeAuthor, writeToken } from "../../shell/http";

export interface Session { token: string; infrastructure: string }
export type RunsResult = { ok: true; runs: RunEntry[] } | { ok: false; status: number; message: string };
export type RunResult = { ok: true; data: PageData; runs: RunEntry[] | null; warnings: string[]; remembered: boolean } | { ok: false; status: number; message: string };

export async function fetchRuns(session: Session): Promise<RunsResult> {
  try {
    const found = await call(ROUTES.runs, { infrastructure: session.infrastructure }, session.token);
    if (found.status === 200 && isRecord(found.body) && Array.isArray(found.body.runs)) return { ok: true, runs: found.body.runs as RunEntry[] };
    return { ok: false, status: found.status, message: explain(found.status, found.body) };
  } catch (error) {
    return { ok: false, status: 0, message: "l'API ne répond pas" };
  }
}

// Comme la coquille `/view` : le snapshot est nécessaire ; le rapport, le diff (si `from`), l'intention, le placement
// et la liste des runs se lisent en même temps, et s'ils manquent la run s'ouvre sans eux, en le disant.
export async function fetchRun(session: Session, runId: string, from: string, catalogue: Record<string, CatalogueEntry>): Promise<RunResult> {
  const params = { infrastructure: session.infrastructure, run_id: runId };
  const infra = { infrastructure: session.infrastructure };
  const token = session.token;
  try {
    const [snapshot, report, diff, intent, placement, runs] = await Promise.all([
      call(ROUTES.snapshot, params, token), call(ROUTES.report, params, token),
      from ? call(ROUTES.diff, { infrastructure: session.infrastructure, from, to: runId }, token) : Promise.resolve(null),
      call(ROUTES.intent, infra, token), call(ROUTES.placement, infra, token), call(ROUTES.runs, infra, token),
    ]);
    if (snapshot.status !== 200 || !isRecord(snapshot.body)) return { ok: false, status: snapshot.status, message: explain(snapshot.status, snapshot.body) };
    const warnings: string[] = [];
    const reportBody = report.status === 200 && isRecord(report.body) ? report.body : null;
    const data: PageData = {
      snapshot: snapshot.body as unknown as Snapshot,
      ingest: reportBody ? { summary: reportBody.summary as IngestData["summary"], findings: (reportBody.findings || []) as IngestData["findings"] } : null,
      origin: "api · " + session.infrastructure + " · " + runId, catalogue,
    };
    if (diff) {
      if (diff.status === 200 && isRecord(diff.body)) data.diff = diff.body as unknown as Diff;
      else warnings.push("diff indisponible : " + explain(diff.status, diff.body));
    }
    if (intent.status === 200 && isRecord(intent.body)) data.intent = intent.body as unknown as Intent;
    else warnings.push("intention indisponible : " + explain(intent.status, intent.body));
    let remembered = false;
    if (placement.status === 200 && isRecord(placement.body)) { data.placement = placement.body as unknown as Placement; remembered = true; }
    else warnings.push("placement mémorisé indisponible : " + explain(placement.status, placement.body));
    let list: RunEntry[] | null = null;
    if (runs.status === 200 && isRecord(runs.body) && Array.isArray(runs.body.runs)) list = runs.body.runs as RunEntry[];
    else warnings.push("liste des runs indisponible : " + explain(runs.status, runs.body));
    return { ok: true, data, runs: list, warnings, remembered };
  } catch (error) {
    return { ok: false, status: 0, message: "l'API ne répond pas" };
  }
}

/** Ce que `POST /api/intent/assets` rend : l'empreinte à citer, le type reconnu, la taille et les dimensions. */
export interface AssetReceipt { asset: string; media_type: string; bytes: number; width: number; height: number }
export type AssetResult = { ok: true; receipt: AssetReceipt } | { ok: false; message: string };

/** Envoie une image (docs/10 §6) : le fichier brut, son type déclaré ; le serveur le reconnaît à ses octets. */
export async function uploadAsset(session: Session, file: Blob): Promise<AssetResult> {
  try {
    const response = await fetch(withParams(ROUTES.assets, { infrastructure: session.infrastructure }), {
      method: "POST", headers: { Authorization: "Bearer " + session.token, "Content-Type": file.type || "application/octet-stream" }, body: file, credentials: "omit",
    });
    let body: unknown = null;
    try { body = await response.json(); } catch (error) { body = null; }
    if ((response.status === 201 || response.status === 200) && isRecord(body) && typeof body.asset === "string") return { ok: true, receipt: body as unknown as AssetReceipt };
    const detail = isRecord(body) && Array.isArray(body.errors) && body.errors.length && isRecord(body.errors[0]) ? String(body.errors[0].message) : "";
    return { ok: false, message: response.status === 413 ? "image trop lourde (4 Mo au plus)" : response.status === 415 ? "PNG, JPEG ou WebP seulement" : detail || explain(response.status, body) };
  } catch (error) { return { ok: false, message: "l'API ne répond pas" }; }
}

/** Lit une image avec le jeton et rend une adresse `blob:` (jamais le jeton dans une adresse) ; `""` si elle manque. */
export async function readAsset(session: Session, asset: string): Promise<string> {
  const response = await fetch(withParams(ROUTES.assets, { infrastructure: session.infrastructure, asset }), { headers: { Authorization: "Bearer " + session.token }, credentials: "omit" });
  if (response.status !== 200) return "";
  return URL.createObjectURL(await response.blob());
}

export type JournalResult = { ok: true; page: JournalPage } | { ok: false; status: number; message: string };

/** Une page du journal des modifications (`GET /api/intent/journal`) ; `params` répétables (`author`, `category`). */
export async function fetchJournal(token: string, params: [string, string][]): Promise<JournalResult> {
  try {
    const response = await fetch(ROUTES.journal + "?" + new URLSearchParams(params).toString(), { headers: { Authorization: "Bearer " + token }, credentials: "omit" });
    let body: unknown = null;
    try { body = await response.json(); } catch (error) { body = null; }
    if (response.status === 200 && isRecord(body) && Array.isArray(body.entries)) return { ok: true, page: body as unknown as JournalPage };
    return { ok: false, status: response.status, message: explain(response.status, body) };
  } catch (error) {
    return { ok: false, status: 0, message: "l'API ne répond pas" };
  }
}
