// The queue of the diffs read on the home: only rows on screen, in the order they came into view, each asked once.
import { describe, expect, it } from "vitest";
import { EMPTY_QUEUE, markAsked, nextToAsk, seeRows } from "../src/state/diff-queue";

const all = () => true;

describe("diff queue", () => {
  it("asks nothing before a row is seen", () => {
    expect(nextToAsk(EMPTY_QUEUE, all)).toBeNull();
  });

  it("asks the rows on screen in the order they came into view, each once", () => {
    let queue = seeRows(EMPTY_QUEUE, ["a", "b", "c"], []);
    expect(nextToAsk(queue, all)).toBe("a");
    queue = markAsked(queue, "a");
    expect(nextToAsk(queue, all)).toBe("b");
    queue = seeRows(queue, ["z"], []);
    queue = markAsked(markAsked(queue, "b"), "c");
    expect(nextToAsk(queue, all)).toBe("z");
    expect(nextToAsk(markAsked(queue, "z"), all)).toBeNull();
  });

  it("skips a row that left the screen before its turn, and asks it when it comes back, at its first place", () => {
    let queue = seeRows(EMPTY_QUEUE, ["a", "b", "c"], []);
    queue = seeRows(queue, [], ["a", "b"]);
    expect(nextToAsk(queue, all)).toBe("c");
    queue = seeRows(queue, ["d", "b"], []);
    expect(queue.order).toEqual(["a", "b", "c", "d"]);
    expect(nextToAsk(queue, all)).toBe("b");
  });

  it("never asks a row asked already, even off screen and back (its answer is kept)", () => {
    let queue = markAsked(seeRows(EMPTY_QUEUE, ["a"], []), "a");
    queue = seeRows(seeRows(queue, [], ["a"]), ["a"], []);
    expect(nextToAsk(queue, all)).toBeNull();
  });

  it("skips a row without a diff to read (no previous collection)", () => {
    const queue = seeRows(EMPTY_QUEUE, ["first", "b"], []);
    expect(nextToAsk(queue, (key) => key !== "first")).toBe("b");
  });

  it("counts a row seen twice in one report once, and never changes the queue it is given", () => {
    const before = seeRows(EMPTY_QUEUE, ["a"], []);
    const after = seeRows(before, ["b", "b", "a"], []);
    expect(after.order).toEqual(["a", "b"]);
    expect(before.order).toEqual(["a"]);
    expect(markAsked(before, "a").asked.has("a")).toBe(true);
    expect(before.asked.size).toBe(0);
    expect(EMPTY_QUEUE.order).toEqual([]);
  });
});
