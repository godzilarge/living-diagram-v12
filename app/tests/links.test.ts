// Values written twice, kept equal: the motion fallbacks of the scripts and the motion tokens; the CSP of
// `vite preview` (under which the measurement runs) and the CSP the backend sends with `/next/`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MOTION_FALLBACK, toMs } from "../src/ui/geometry";
import { CSP } from "../vite.config";

const root = resolve(__dirname, "..");

describe("values written twice", () => {
  it("the motion fallbacks equal the motion tokens", () => {
    const tokens = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8").split("@media")[0];
    for (const [name, ms] of Object.entries(MOTION_FALLBACK)) expect(tokens, name).toContain(`--motion-${name}: ${ms}ms;`);
  });

  it("a CSS time reads in milliseconds whatever its unit", () => {
    expect([toMs("350ms", 1), toMs("0.35s", 1), toMs("0s", 1), toMs("", 7)]).toEqual([350, 350, 0, 7]);
  });

  it("vite preview sends the backend's CSP", () => {
    const python = readFileSync(resolve(root, "../backend/src/ld_backend/render/app.py"), "utf8");
    const block = /APP_CSP = \(([\s\S]*?)\n\)/.exec(python);
    expect(block, "APP_CSP in app.py").not.toBeNull();
    const backend = [...(block as RegExpExecArray)[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
    expect(CSP).toBe(backend);
  });
});
