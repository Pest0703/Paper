import { describe, expect, it } from "vitest";
import { ensureVisibleNoteWindowState } from "../../electron/noteWindowState";

describe("note window state", () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  const secondary = { x: 1920, y: 0, width: 2560, height: 1400 };
  it("restores a visible second-screen window", () => {
    expect(ensureVisibleNoteWindowState({ x: 2100, y: 80, width: 1100, height: 820, maximized: true }, [primary, secondary])).toEqual({ x: 2100, y: 80, width: 1100, height: 820, maximized: true });
  });
  it("returns to a safe default after the second screen is removed", () => {
    expect(ensureVisibleNoteWindowState({ x: 2400, y: 100, width: 1100, height: 820, maximized: true }, [primary])).toEqual({ width: 1100, height: 820, maximized: false });
  });
});
