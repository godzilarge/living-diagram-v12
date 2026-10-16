// A zoom step keeps the centre of the visible area where it is; the bounds are the canvas's.
import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, percentOf, zoomIn, zoomOut, zoomTo } from "../src/state/zoom";

const AREA = { width: 1000, height: 800 };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const CHROME = { top: 76, right: 0, bottom: 76, left: 0 };

/** The plan point under a screen point. */
const planAt = (view: { x: number; y: number; zoom: number }, sx: number, sy: number) => ({ x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom });

describe("the zoom", () => {
  it("keeps the centre of the visible area in place when stepping", () => {
    const view = { x: 120, y: -40, zoom: 0.8 };
    const next = zoomIn(view, AREA, CHROME);
    expect(next.zoom).toBeCloseTo(0.8 * ZOOM_STEP);
    const centre = { x: 500, y: 76 + (800 - 152) / 2 };
    expect(planAt(next, centre.x, centre.y)).toEqual(planAt(view, centre.x, centre.y));
    const back = zoomOut(next, AREA, CHROME);
    expect(back.zoom).toBeCloseTo(0.8);
    expect(back.x).toBeCloseTo(120);
    expect(back.y).toBeCloseTo(-40);
  });

  it("goes back to 100 % around the same centre, within the bounds", () => {
    expect(zoomTo({ x: 0, y: 0, zoom: 0.5 }, 1, AREA, NONE)).toEqual({ zoom: 1, x: -500, y: -400 });
    expect(zoomTo({ x: 0, y: 0, zoom: 5.5 }, 10, AREA, NONE).zoom).toBe(MAX_ZOOM);
    expect(zoomTo({ x: 0, y: 0, zoom: 0.06 }, 0.001, AREA, NONE).zoom).toBe(MIN_ZOOM);
  });

  it("says the zoom as a whole percentage, never 0", () => {
    expect(percentOf(0.624)).toBe(62);
    expect(percentOf(1)).toBe(100);
    expect(percentOf(0.001)).toBe(1);
  });
});
