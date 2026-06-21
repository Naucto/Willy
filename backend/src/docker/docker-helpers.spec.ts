import { describe, expect, it } from "vitest";
import {
  buildHealthcheckConfig,
  durationToNs,
  nsToDuration,
  parseDeclaredHealthcheck,
  parseExposedPorts,
} from "./docker-helpers";

describe("parseExposedPorts", () => {
  it("extracts TCP ports, sorted ascending", () => {
    expect(parseExposedPorts({ "4000/tcp": {}, "80/tcp": {} })).toEqual([80, 4000]);
  });

  it("drops UDP ports", () => {
    expect(parseExposedPorts({ "80/tcp": {}, "53/udp": {} })).toEqual([80]);
  });

  it("dedupes equal port numbers across protocols", () => {
    expect(parseExposedPorts({ "443/tcp": {}, "443/udp": {} })).toEqual([443]);
  });

  it("returns empty for missing or empty config", () => {
    expect(parseExposedPorts(undefined)).toEqual([]);
    expect(parseExposedPorts({})).toEqual([]);
  });
});

describe("durationToNs / nsToDuration", () => {
  it("parses duration strings into nanoseconds", () => {
    expect(durationToNs("30s")).toBe(30e9);
    expect(durationToNs("1m30s")).toBe(90e9);
    expect(durationToNs("500ms")).toBe(500e6);
  });

  it("returns undefined for blank or unparseable input", () => {
    expect(durationToNs(undefined)).toBeUndefined();
    expect(durationToNs("")).toBeUndefined();
    expect(durationToNs("soon")).toBeUndefined();
  });

  it("humanises nanoseconds to seconds, null for zero/unset", () => {
    expect(nsToDuration(30e9)).toBe("30s");
    expect(nsToDuration(0)).toBeNull();
    expect(nsToDuration(undefined)).toBeNull();
  });
});

describe("parseDeclaredHealthcheck", () => {
  it("returns undefined when absent or disabled", () => {
    expect(parseDeclaredHealthcheck(undefined)).toBeUndefined();
    expect(parseDeclaredHealthcheck({ Test: [] })).toBeUndefined();
    expect(parseDeclaredHealthcheck({ Test: ["NONE"] })).toBeUndefined();
  });

  it("humanises durations and keeps the test/retries", () => {
    expect(
      parseDeclaredHealthcheck({ Test: ["CMD-SHELL", "curl -f /"], Interval: 30e9, Retries: 3 }),
    ).toEqual({
      test: ["CMD-SHELL", "curl -f /"],
      interval: "30s",
      timeout: null,
      retries: 3,
      startPeriod: null,
    });
  });
});

describe("buildHealthcheckConfig", () => {
  it("returns undefined when there is no test", () => {
    expect(buildHealthcheckConfig(null)).toBeUndefined();
    expect(buildHealthcheckConfig(undefined)).toBeUndefined();
    expect(
      buildHealthcheckConfig({
        test: "   ",
        interval: "",
        timeout: "",
        startPeriod: "",
        retries: 0,
      }),
    ).toBeUndefined();
  });

  it("wraps the shell test and converts the durations it is given", () => {
    expect(
      buildHealthcheckConfig({
        test: "curl -f /",
        interval: "30s",
        timeout: "5s",
        startPeriod: "10s",
        retries: 3,
      }),
    ).toEqual({
      Test: ["CMD-SHELL", "curl -f /"],
      Interval: 30e9,
      Timeout: 5e9,
      Retries: 3,
      StartPeriod: 10e9,
    });
  });
});
