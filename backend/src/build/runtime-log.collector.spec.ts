import { describe, expect, it } from "vitest";
import { parseTimestampedLine, runtimeLogKey } from "./runtime-log.collector";

describe("runtimeLogKey", () => {
  it("keys by service, defaulting single-container deployments to 'default'", () => {
    expect(runtimeLogKey("dep1", "web")).toBe("runtime/dep1/web");
    expect(runtimeLogKey("dep1", null)).toBe("runtime/dep1/default");
  });
});

describe("parseTimestampedLine", () => {
  it("splits an RFC3339-prefixed line into epoch ms and the message", () => {
    const { tsMs, message } = parseTimestampedLine("2026-06-24T10:00:00.500000000Z hello world");

    expect(tsMs).toBe(Date.parse("2026-06-24T10:00:00.500Z"));
    expect(message).toBe("hello world");
  });

  it("preserves a message that itself contains spaces and colons", () => {
    expect(parseTimestampedLine("2026-06-24T10:00:00Z level=info msg=up").message).toBe(
      "level=info msg=up",
    );
  });

  it("returns an empty message for a timestamp-only line", () => {
    const { tsMs, message } = parseTimestampedLine("2026-06-24T10:00:00Z ");

    expect(tsMs).not.toBeNull();
    expect(message).toBe("");
  });

  it("passes through lines without a valid timestamp prefix verbatim", () => {
    expect(parseTimestampedLine("plain log line without timestamp")).toEqual({
      tsMs: null,
      message: "plain log line without timestamp",
    });
    expect(parseTimestampedLine("not-a-date still text")).toEqual({
      tsMs: null,
      message: "not-a-date still text",
    });
  });
});
