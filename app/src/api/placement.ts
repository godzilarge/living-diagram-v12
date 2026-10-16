// The writer of the memorized placement (docs/09), as the engine's placement host asks for it (`Placer`): what the
// canvas just placed goes to `POST /api/placement` with the revision the page read; the API answers with the document
// (200), the newer document when the page's was stale (409), or a refusal. Not an intent: no author, never journaled.
// The message of a refusal is a catalogue key the host shows in its note.
import type { PlaceResult, Placer, PlacementWrite } from "@engine/shell/apps";
import type { Session } from "./run";
import { parsePlacement, placementUrl } from "./run";

export type PostFetch = (input: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
const browserFetch: PostFetch = (input, init) => fetch(input, init);

export function makePlacer(session: () => Session, say: (key: "refused" | "unreachable", status?: number) => string, fetchFn: PostFetch = browserFetch): Placer {
  const save = async (write: PlacementWrite): Promise<PlaceResult> => {
    const { token, infrastructure } = session();
    let response: Awaited<ReturnType<PostFetch>>;
    try {
      response = await fetchFn(placementUrl(infrastructure), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(write),
      });
    } catch {
      return { ok: false, message: say("unreachable") };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const placement = parsePlacement(body);
    if (response.status === 200 && placement) return { ok: true, placement };
    if (response.status === 409 && placement) return { ok: false, stale: true, placement };
    return { ok: false, message: say("refused", response.status) };
  };
  return { save };
}
