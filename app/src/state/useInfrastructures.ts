// The infrastructures the context island offers, read once when a token is there (`GET /api/infrastructures`). The
// current one is always among them; an answer that is not ok leaves the choice with the current one alone.
import { useEffect, useState } from "react";
import { loadInfrastructures } from "../api/home";
import { readToken } from "../api/http";
import type { TokenState } from "./useHome";

/** The names to offer: the API's, the current one added when the API did not list it (or did not answer). */
export function withCurrent(names: readonly string[], current: string): readonly string[] {
  return !current || names.includes(current) ? names : [current, ...names];
}

export function useInfrastructures(token: TokenState, current: string): readonly string[] {
  const [names, setNames] = useState<readonly string[]>([]);
  useEffect(() => {
    const stored = readToken();
    if (token !== "present" || !stored) return undefined;
    let live = true;
    void loadInfrastructures(stored).then((answer) => {
      if (live && answer.kind === "ok") setNames(answer.data.infrastructures.map((item) => item.infrastructure));
    });
    return () => {
      live = false;
    };
  }, [token]);
  return withCurrent(names, current);
}
