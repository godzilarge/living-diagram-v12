// Dates and ages in both languages, with "now" given and the time zone pinned to UTC.
import { describe, expect, it } from "vitest";
import { dayMonth, daysSince, isStale, parseTime, shortDateTime, when } from "../src/state/time";

const UTC = "UTC";
const NOW = Date.parse("2026-01-19T19:30:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

describe("time", () => {
  it("writes a collection's start short, in the page's language", () => {
    expect(shortDateTime("2026-01-19T02:00:00Z", "en-GB", UTC)).toBe("19 Jan, 02:00");
    expect(shortDateTime("2026-01-19T02:00:00Z", "fr-FR", UTC)).toBe("19 janv., 02:00");
    expect(shortDateTime("not a date", "en-GB", UTC)).toBe("");
    expect(parseTime("nope")).toBeNull();
  });

  it("says a day, with its year when it is not this year's", () => {
    expect(dayMonth("2026-01-12T02:00:00Z", "en-GB", NOW, UTC)).toBe("12 Jan");
    expect(dayMonth("2026-01-12T02:00:00Z", "fr-FR", NOW, UTC)).toBe("12 janv.");
    expect(dayMonth("2025-12-30T02:00:00Z", "en-GB", NOW, UTC)).toBe("30 Dec 2025");
  });

  it("gives an age under a day, yesterday with its time, then the day", () => {
    expect(when(ago(10_000), NOW, "en-GB", UTC)).toEqual({ kind: "text", text: "now" });
    expect(when(ago(5 * 60_000), NOW, "en-GB", UTC)).toEqual({ kind: "text", text: "5 min ago" });
    expect(when(ago(2 * H), NOW, "fr-FR", UTC)).toEqual({ kind: "text", text: "il y a 2\u00a0h" }) // Intl joins with a no-break space;
    expect(when(ago(2 * H), NOW, "en-GB", UTC).kind).toBe("text");
    expect(when("2026-01-18T17:42:00Z", NOW, "fr-FR", UTC)).toEqual({ kind: "dayAt", day: "hier", time: "17:42" });
    expect(when("2026-01-18T17:42:00Z", NOW, "en-GB", UTC)).toEqual({ kind: "dayAt", day: "yesterday", time: "17:42" });
    expect(when("2026-01-17T09:00:00Z", NOW, "en-GB", UTC)).toEqual({ kind: "text", text: "17 Jan" });
    expect(when("2026-01-17T09:00:00Z", NOW, "fr-FR", UTC)).toEqual({ kind: "text", text: "17 janv." });
  });

  it("treats a date in the future as now, and an unreadable one as nothing", () => {
    expect(when(new Date(NOW + H).toISOString(), NOW, "en-GB", UTC)).toEqual({ kind: "text", text: "now" });
    expect(when("x", NOW, "en-GB", UTC)).toEqual({ kind: "text", text: "" });
  });

  it("counts whole days and calls late what is more than seven days old", () => {
    expect(daysSince(ago(7 * 24 * H + H), NOW)).toBe(7);
    expect(daysSince("x", NOW)).toBeNull();
    expect(daysSince(new Date(NOW + H).toISOString(), NOW)).toBe(0);
    expect(isStale(ago(7 * 24 * H), NOW)).toBe(false);
    expect(isStale(ago(7 * 24 * H + 1), NOW)).toBe(true);
    expect(isStale("x", NOW)).toBe(false);
  });
});
