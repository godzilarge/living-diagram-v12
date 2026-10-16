// The engine guard: the pure engine imports under Vitest, without a DOM, through the `@engine` alias.
import { describe, expect, it } from "vitest";
import { haBadge, SELECTION_KINDS } from "@engine/canvas/model";

describe("@engine", () => {
  it("imports the canvas model without a DOM", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
    expect(SELECTION_KINDS).toContain("node");
    expect(haBadge("active_passive", "primary")).toBe("A");
    expect(haBadge("active_passive", "secondary")).toBe("P");
  });
});
