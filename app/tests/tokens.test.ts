// tokens.css is generated from DESIGN.md and never drifts from it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DESIGN, OUTPUT, generate } from "../scripts/tokens.mjs";

const APP = resolve(__dirname, "..");
const design = readFileSync(DESIGN, "utf8");

describe("tokens.css", () => {
  it("is exactly what DESIGN.md's frontmatter generates", () => {
    expect(readFileSync(OUTPUT, "utf8")).toBe(generate(design));
    expect(() => execFileSync("node", ["scripts/tokens.mjs", "--check"], { cwd: APP, stdio: "pipe" })).not.toThrow();
  });

  it("switches theme and accent on <html> and collapses motion under reduced motion", () => {
    const css = generate(design);
    for (const selector of [":root {", ':root[data-theme="dark"] {', ':root[data-accent="ink"] {', ':root[data-theme="dark"][data-accent="ink"] {', "@media (prefers-reduced-motion: reduce)"])
      expect(css).toContain(selector);
    expect(css).toContain("--color-accent: #2150E8;");
    expect(css).toContain("--control-height: 32px;");
    expect(css).toContain("--tooltip-background-color: var(--color-tip-bg);");
    expect(css).toMatch(/--motion-hover: 1ms;/);
  });

  it("refuses a frontmatter it cannot honour", () => {
    expect(() => generate("no frontmatter")).toThrow(/no frontmatter/);
    const orphan = design.replace('  dark-canvas: "#161719"', '  dark-nowhere: "#161719"');
    expect(() => generate(orphan)).toThrow(/dark-nowhere/);
    const notColour = design.replace('  ink-2: "#45484D"', '  ink-2: "dark grey"');
    expect(() => generate(notColour)).toThrow(/ink-2/);
    const badRef = design.replace('textColor: "{colors.ink-3}"', 'textColor: "{colors.ink-9}"');
    expect(() => generate(badRef)).toThrow(/unknown reference/);
  });
});
