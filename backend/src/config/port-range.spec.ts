import { describe, expect, it } from "vitest";
import { ConfigError } from "../common/errors";
import { parsePortRange, rangeContains } from "./port-range";

describe("parsePortRange", () => {
  it("parses a valid range", () => {
    expect(parsePortRange("20000-20099")).toEqual({ start: 20000, end: 20099 });
  });

  it("trims surrounding whitespace", () => {
    expect(parsePortRange("  20000-20099 ")).toEqual({ start: 20000, end: 20099 });
  });

  it("allows a single-port range (start == end)", () => {
    expect(parsePortRange("20000-20000")).toEqual({ start: 20000, end: 20000 });
  });

  it("returns null for an absent or empty value", () => {
    expect(parsePortRange(undefined)).toBeNull();
    expect(parsePortRange(null)).toBeNull();
    expect(parsePortRange("")).toBeNull();
    expect(parsePortRange("   ")).toBeNull();
  });

  it("rejects a reversed range", () => {
    expect(() => parsePortRange("20099-20000")).toThrow(ConfigError);
  });

  it("rejects privileged ports (<= 1023)", () => {
    expect(() => parsePortRange("80-443")).toThrow(ConfigError);
    expect(() => parsePortRange("1023-20000")).toThrow(ConfigError);
  });

  it("rejects ports above 65535", () => {
    expect(() => parsePortRange("60000-70000")).toThrow(ConfigError);
  });

  it("rejects malformed input", () => {
    expect(() => parsePortRange("20000")).toThrow(ConfigError);
    expect(() => parsePortRange("20000-")).toThrow(ConfigError);
    expect(() => parsePortRange("abc-def")).toThrow(ConfigError);
    expect(() => parsePortRange("20000:20099")).toThrow(ConfigError);
  });
});

describe("rangeContains", () => {
  const capacity = { start: 20000, end: 20099 };

  it("accepts an inner range fully inside", () => {
    expect(rangeContains(capacity, { start: 20010, end: 20050 })).toBe(true);
    expect(rangeContains(capacity, capacity)).toBe(true);
  });

  it("rejects an inner range that spills past either bound", () => {
    expect(rangeContains(capacity, { start: 19999, end: 20050 })).toBe(false);
    expect(rangeContains(capacity, { start: 20050, end: 20100 })).toBe(false);
  });
});
