// The two pages hold the CSP 'self': no inline script, no inline style, no external URL; the boot script (public/boot.js, the
// stored theme before the first paint) comes first, then the page's module.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.each(["index.html", "primitives.html"])("%s", (name) => {
  const page = readFileSync(resolve(__dirname, "..", name), "utf8");
  it("loads the boot script, then its own module, as files, never inline", () => {
    expect(page).toMatch(/<script type="module" src="\/boot\.js"><\/script>\n<script type="module" src="\/src\/[\w/]+\.tsx"><\/script>/);
    expect(page.match(/<script/g)).toHaveLength(2);
  });
  it("has no style, no style attribute, no external URL", () => {
    expect(page).not.toMatch(/<style|style=|https?:\/\//);
  });
});
