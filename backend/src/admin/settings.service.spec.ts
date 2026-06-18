import { describe, expect, it } from "vitest";
import { mergeSettings } from "./settings.service";

describe("mergeSettings", () => {
  it("falls back to defaults when nothing is stored", () => {
    expect(mergeSettings([])).toEqual({ showAllResources: false });
  });

  it("applies a stored override", () => {
    expect(mergeSettings([{ key: "showAllResources", value: true }])).toEqual({
      showAllResources: true,
    });
  });

  it("ignores unknown keys", () => {
    expect(mergeSettings([{ key: "legacyFlag", value: "x" }])).toEqual({
      showAllResources: false,
    });
  });
});
