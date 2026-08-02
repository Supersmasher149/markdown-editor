import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  SPLIT_MAX,
  SPLIT_MIN,
  validateSettings,
} from "./settingsStore";

describe("settings defaults", () => {
  it("is a complete, self-consistent object", () => {
    expect(DEFAULT_SETTINGS.version).toBe(1);
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(DEFAULT_SETTINGS.fontSize).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
    expect(DEFAULT_SETTINGS.fontSize).toBeLessThanOrEqual(FONT_SIZE_MAX);
    expect(DEFAULT_SETTINGS.splitPosition).toBeGreaterThanOrEqual(SPLIT_MIN);
    expect(DEFAULT_SETTINGS.splitPosition).toBeLessThanOrEqual(SPLIT_MAX);
  });

  it("survives a round trip through validation unchanged", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("settings validation", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not settings"],
    ["a number", 42],
    ["an array", []],
  ])("falls back to defaults for %s", (_label, input) => {
    expect(validateSettings(input)).toEqual(DEFAULT_SETTINGS);
  });

  it("discards settings written by a different version", () => {
    const fromTheFuture = { ...DEFAULT_SETTINGS, version: 2, fontSize: 22 };

    expect(validateSettings(fromTheFuture)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields when a sibling field is invalid", () => {
    const result = validateSettings({
      ...DEFAULT_SETTINGS,
      theme: "chartreuse",
      fontSize: 18,
    });

    expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    // One bad field must not cost the user their other preferences.
    expect(result.fontSize).toBe(18);
  });

  it("clamps a font size that is out of range", () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, fontSize: 900 }).fontSize,
    ).toBe(FONT_SIZE_MAX);
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, fontSize: 1 }).fontSize,
    ).toBe(FONT_SIZE_MIN);
  });

  it("clamps the split position into a usable range", () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, splitPosition: 0.99 })
        .splitPosition,
    ).toBe(SPLIT_MAX);
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, splitPosition: -3 })
        .splitPosition,
    ).toBe(SPLIT_MIN);
  });

  it("rejects non-finite numbers rather than clamping them", () => {
    const result = validateSettings({
      ...DEFAULT_SETTINGS,
      fontSize: Number.NaN,
      splitPosition: Number.POSITIVE_INFINITY,
    });

    expect(result.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(result.splitPosition).toBe(DEFAULT_SETTINGS.splitPosition);
  });

  it("rounds a fractional tab size", () => {
    expect(
      validateSettings({ ...DEFAULT_SETTINGS, tabSize: 3.7 }).tabSize,
    ).toBe(4);
  });

  it("rejects a non-boolean where a boolean is expected", () => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, softWrap: "yes" });

    expect(result.softWrap).toBe(DEFAULT_SETTINGS.softWrap);
  });

  it("rejects an unknown layout", () => {
    const result = validateSettings({
      ...DEFAULT_SETTINGS,
      defaultLayout: "three-column",
    });

    expect(result.defaultLayout).toBe(DEFAULT_SETTINGS.defaultLayout);
  });

  it("accepts every valid theme and layout", () => {
    for (const theme of ["system", "light", "dark"] as const) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, theme }).theme).toBe(
        theme,
      );
    }
    for (const layout of ["editor", "split", "preview"] as const) {
      expect(
        validateSettings({ ...DEFAULT_SETTINGS, defaultLayout: layout })
          .defaultLayout,
      ).toBe(layout);
    }
  });

  it("ignores unknown extra keys", () => {
    const result = validateSettings({
      ...DEFAULT_SETTINGS,
      somethingElse: "ignore me",
    });

    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(result).not.toHaveProperty("somethingElse");
  });
});
