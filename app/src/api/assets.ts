// The images of the annotations (docs/10 §6), read with the token and given to the canvas as `blob:` addresses (the
// token never in an address); "" when the image is missing or refused.
import { withParams } from "./http";
import type { Session } from "./run";

export const ASSETS_ROUTE = "/api/intent/assets";

export async function readAsset(session: Session, asset: string): Promise<string> {
  try {
    const response = await fetch(withParams(ASSETS_ROUTE, { infrastructure: session.infrastructure, asset }), {
      headers: { Authorization: `Bearer ${session.token}` },
      credentials: "omit",
    });
    return response.status === 200 ? URL.createObjectURL(await response.blob()) : "";
  } catch {
    return "";
  }
}
