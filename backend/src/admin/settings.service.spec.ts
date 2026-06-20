import { describe, expect, it } from "vitest";
import { mergeSettings } from "./settings.service";

describe("mergeSettings", () => {
  it("falls back to defaults when nothing is stored (no capacity)", () => {
    expect(mergeSettings([])).toEqual({
      showAllResources: false,
      portBinding: { enabled: false, start: 0, end: 0 },
      portBindingCapacity: null,
    });
  });

  it("defaults the port-binding sub-range to the provisioned capacity", () => {
    expect(mergeSettings([], { start: 20000, end: 20099 })).toEqual({
      showAllResources: false,
      portBinding: { enabled: false, start: 20000, end: 20099 },
      portBindingCapacity: { start: 20000, end: 20099 },
    });
  });

  it("applies a stored override", () => {
    expect(mergeSettings([{ key: "showAllResources", value: true }])).toEqual({
      showAllResources: true,
      portBinding: { enabled: false, start: 0, end: 0 },
      portBindingCapacity: null,
    });
  });

  it("applies a stored port-binding override over the capacity default", () => {
    const result = mergeSettings(
      [{ key: "portBinding", value: { enabled: true, start: 20010, end: 20050 } }],
      { start: 20000, end: 20099 },
    );

    expect(result.portBinding).toEqual({ enabled: true, start: 20010, end: 20050 });
    expect(result.portBindingCapacity).toEqual({ start: 20000, end: 20099 });
  });

  it("ignores unknown keys", () => {
    expect(mergeSettings([{ key: "legacyFlag", value: "x" }])).toEqual({
      showAllResources: false,
      portBinding: { enabled: false, start: 0, end: 0 },
      portBindingCapacity: null,
    });
  });
});
