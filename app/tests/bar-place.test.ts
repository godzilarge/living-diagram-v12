// The placement of a contextual bar: above its element, flipped below near the top islands, inside the free zone.
import { describe, expect, it } from "vitest";
import { BAR_GAP, BAR_H, placeBar, toScreen, zoneOf } from "../src/state/bar-place";

const zone = zoneOf(1440, 900);

describe("bar placement", () => {
  it("leaves the islands' bands free: 76 px at the top, the left and the bottom, 16 px on the right", () => {
    expect(zone).toEqual({ left: 76, top: 76, right: 1424, bottom: 824, reserved: null });
  });

  it("sits 12 px above the element, centred on it", () => {
    const place = placeBar({ x: 600, y: 400, w: 100, h: 40 }, 392, zone);
    expect(place).toEqual({ x: 454, y: 400 - BAR_GAP - BAR_H, below: false });
  });

  it("flips below the element when it would come within 12 px of the top islands", () => {
    const place = placeBar({ x: 600, y: 120, w: 100, h: 40 }, 392, zone);
    expect(place).toEqual({ x: 454, y: 120 + 40 + BAR_GAP, below: true });
    expect(placeBar({ x: 600, y: 136, w: 100, h: 40 }, 392, zone)?.below).toBe(false);
  });

  it("sits at the top of the zone over an element taller than the zone, never clamped onto it", () => {
    expect(placeBar({ x: 600, y: 100, w: 100, h: 700 }, 392, zone)).toEqual({ x: 454, y: 76, below: false });
  });

  it("never crosses the palette nor the right edge, and waits for an element out of the zone", () => {
    expect(placeBar({ x: 80, y: 400, w: 40, h: 40 }, 392, zone)?.x).toBe(76);
    expect(placeBar({ x: 1380, y: 400, w: 40, h: 40 }, 392, zone)?.x).toBe(1424 - 392);
    expect(placeBar({ x: 2000, y: 400, w: 40, h: 40 }, 392, zone)).toBeNull();
    expect(placeBar({ x: 600, y: -100, w: 40, h: 20 }, 392, zone)).toBeNull();
  });

  it("stops above a reserved island (the minimap, bottom right in edit mode) only when the bar's span crosses it", () => {
    const reserved = { x: 1246, y: 750, w: 178, h: 134 };
    const withIsland = zoneOf(1440, 900, reserved);
    // an element near the bottom right: no room above (the top islands), below would cover the minimap: top of the zone
    const low = { x: 1300, y: 100, w: 40, h: 620 };
    expect(placeBar(low, 392, zone)).toEqual({ x: 1032, y: 732, below: true });
    expect(placeBar(low, 392, withIsland)).toEqual({ x: 1032, y: 76, below: false });
    // the same element on the left: the island is not in the bar's span, the bar goes below as before
    const left = { ...low, x: 300 };
    expect(placeBar(left, 392, withIsland)).toEqual(placeBar(left, 392, zone));
    expect(placeBar({ x: 1300, y: 600, w: 40, h: 40 }, 392, withIsland)).toEqual({ x: 1032, y: 600 - BAR_GAP - BAR_H, below: false });
  });

  it("converts a plan box to the screen through the view", () => {
    expect(toScreen({ x: 10, y: 20, w: 100, h: 50 }, { x: 5, y: 5, zoom: 2 })).toEqual({ x: 25, y: 45, w: 200, h: 100 });
  });
});
