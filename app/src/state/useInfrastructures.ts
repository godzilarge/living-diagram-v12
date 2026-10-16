// The infrastructures the context island offers and the search palette lists, read once when a token is there
// (`GET /api/infrastructures`): their names and their device counts. The current one is always among them (without a
// count when the API did not list it); an answer that is not ok leaves the choice with the current one alone.
import { useEffect, useState } from "react";
import { loadInfrastructures } from "../api/home";
import { readToken } from "../api/http";
import type { TokenState } from "./useHome";

export type KnownInfrastructure = Readonly<{ name: string; devices: number | null }>;

/** The infrastructures to offer: the API's, the current one added when the API did not list it (or did not answer). */
export function withCurrent(known: readonly KnownInfrastructure[], current: string): readonly KnownInfrastructure[] {
  return !current || known.some((item) => item.name === current) ? known : [{ name: current, devices: null }, ...known];
}

export function useInfrastructures(token: TokenState, current: string): readonly KnownInfrastructure[] {
  const [known, setKnown] = useState<readonly KnownInfrastructure[]>([]);
  useEffect(() => {
    const stored = readToken();
    if (token !== "present" || !stored) return undefined;
    let live = true;
    void loadInfrastructures(stored).then((answer) => {
      if (live && answer.kind === "ok") setKnown(answer.data.infrastructures.map((item) => ({ name: item.infrastructure, devices: item.devices })));
    });
    return () => {
      live = false;
    };
  }, [token]);
  return withCurrent(known, current);
}
