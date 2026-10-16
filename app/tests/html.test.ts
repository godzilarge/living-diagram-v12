// The two pages hold the CSP 'self': no inline script, no inline style, no external URL.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.each(["index.html", "primitives.html"])("%s", (name) => {
  const page = readFileSync(resolve(__dirname, "..", name), "utf8");
  it("loads its script as a module file, never inline", () => {
    expect(page).toMatch(/<script type="module" src="\/src\/[\w/]+\.tsx"><\/script>/);
    expect(page.match(/<script/g)).toHaveLength(1);
  });
  it("has no style, no style attribute, no external URL", () => {
    expect(page).not.toMatch(/<style|style=|https?:\/\//);
  });
});
