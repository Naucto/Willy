import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./sse";

describe("parseSseBuffer", () => {
  it("extracts data lines from complete frames and keeps the remainder", () => {
    const { data, rest } = parseSseBuffer("data: line one\n\ndata: line two\n\ndata: partial");

    expect(data).toEqual(["line one", "line two"]);
    expect(rest).toBe("data: partial");
  });

  it("ignores non-data lines and tolerates missing leading space", () => {
    const { data } = parseSseBuffer("event: message\ndata:no-space\n\n");

    expect(data).toEqual(["no-space"]);
  });

  it("returns no data when no frame is complete", () => {
    const { data, rest } = parseSseBuffer("data: still going");

    expect(data).toEqual([]);
    expect(rest).toBe("data: still going");
  });
});
