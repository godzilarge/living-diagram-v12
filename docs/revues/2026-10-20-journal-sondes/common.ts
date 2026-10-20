import type { Page } from "@playwright/test";
import { mockApi, NOW, open, TOKEN } from "/home/user/living-diagram-v12/app/e2e/helpers";
import { journalPage } from "/home/user/living-diagram-v12/.impeccable/planche-journal/synthetic";

export const OUT = "/tmp/claude-0/-home-user-living-diagram-v12/957076b1-e595-56de-aba6-b1bd4895fc10/scratchpad/probe/out";
export const DIAGRAM = "/next/?infrastructure=demo-dc&run_id=demo-0119&from=demo-0112";
export const LOG = `${DIAGRAM}#mode=journal`;
export { NOW, TOKEN, open, mockApi };

/** The bench's story (the builder's synthetic page) on /api/intent/journal; `body` overrides it. */
export async function withJournal(page: Page, body?: (url: URL) => unknown): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await mockApi(page);
  await page.route("**/api/intent/journal**", (route) => {
    const url = new URL(route.request().url());
    if (body) {
      const b = body(url);
      if (typeof b === "number") return route.fulfill({ status: b, json: { detail: "x" } });
      return route.fulfill({ json: b });
    }
    if (url.searchParams.get("before")) return route.fulfill({ json: { ...(journalPage() as object), entries: [], next: null } });
    return route.fulfill({ json: journalPage() });
  });
}
export { journalPage };

/** WCAG contrast of an element's text against its effective background (first opaque ancestor background). */
export const CONTRAST = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let out = { r: 255, g: 255, b: 255, a: 1 }; for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a), a: 1 }; } return out; };
  return { parse, ratio, bgOf };
})()`;
