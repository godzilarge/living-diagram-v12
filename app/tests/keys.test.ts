// The diagram page's single-key shortcuts.
import { describe, expect, it } from "vitest";
import { shellKeyOf } from "../src/state/keys";

const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("shell keys", () => {
  it("maps each key the tooltips announce to its command, either case", () => {
    expect(shellKeyOf(press("Escape"), false)).toBe("deselect");
    expect(shellKeyOf(press("f"), false)).toBe("fit");
    expect(shellKeyOf(press("F"), false)).toBe("fit");
    expect(shellKeyOf(press("g"), false)).toBe("grid");
    expect(shellKeyOf(press("N"), false)).toBe("minimap");
    expect(shellKeyOf(press("+"), false)).toBe("zoomIn");
    expect(shellKeyOf(press("="), false)).toBe("zoomIn");
    expect(shellKeyOf(press("-"), false)).toBe("zoomOut");
    expect(shellKeyOf(press("−"), false)).toBe("zoomOut");
    expect(shellKeyOf(press("0"), false)).toBe("zoomReset");
  });

  it("leaves every other key, a key with a modifier, and a key typed in a field", () => {
    expect(shellKeyOf(press("x"), false)).toBeNull();
    expect(shellKeyOf(press("toString"), false)).toBeNull();
    expect(shellKeyOf(press("f", { ctrlKey: true }), false)).toBeNull();
    expect(shellKeyOf(press("0", { metaKey: true }), false)).toBeNull();
    expect(shellKeyOf(press("g", { altKey: true }), false)).toBeNull();
    expect(shellKeyOf(press("Escape"), true)).toBeNull();
  });
});
