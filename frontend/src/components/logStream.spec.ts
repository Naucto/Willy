import { describe, expect, it } from "vitest";
import { interpretLogLine } from "./logStream";

const EOT = String.fromCharCode(4);

describe("interpretLogLine", () => {
  it("classifies the control markers", () => {
    expect(interpretLogLine("__willy_eof__").kind).toBe("eof");
    expect(interpretLogLine("__willy_stalled__").kind).toBe("stalled");
    expect(interpretLogLine("__willy_live__").kind).toBe("live");
  });

  it("matches a marker despite a stray non-printable byte or trailing newline on the wire", () => {
    expect(interpretLogLine(`${EOT}__willy_eof__`).kind).toBe("eof");
    expect(interpretLogLine("__willy_stalled__\n").kind).toBe("stalled");
  });

  it("passes ordinary log lines through verbatim", () => {
    expect(interpretLogLine("hello world")).toEqual({ kind: "line", text: "hello world" });
    // A line that merely contains a marker substring is still a log line.
    expect(interpretLogLine("got __willy_live__ here").kind).toBe("line");
  });

  it("preserves ANSI escapes and leading whitespace in the line text", () => {
    const raw = "  [31mred[0m";

    expect(interpretLogLine(raw)).toEqual({ kind: "line", text: raw });
  });
});
