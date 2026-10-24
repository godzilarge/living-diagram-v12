// A motion token read back as milliseconds (ui/motion.ts): the built sheet writes `240ms` as `.24s`.
import { describe, expect, it } from "vitest";
import { durationMs } from "../src/ui/motion";

describe("durationMs", () => {
  it("reads milliseconds and seconds, minified or not", () => {
    expect(durationMs("240ms")).toBe(240);
    expect(durationMs(".24s")).toBeCloseTo(240, 6);
    expect(durationMs("0.24s")).toBeCloseTo(240, 6);
    expect(durationMs(" 1ms ")).toBe(1);
    expect(durationMs("1s")).toBe(1000);
  });

  it("gives 0 for anything that is not a duration", () => {
    for (const text of ["", "240", "fast", "-1ms", "1.2.3s", "NaNms", "1e3ms"]) expect(durationMs(text)).toBe(0);
  });
});
