import { describe, expect, it } from "vitest";
import { parseExposedPorts } from "./docker.service";

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
