import { describe, expect, it } from "vitest";
import { normalizePrivateKey } from "./ssh.driver";

describe("normalizePrivateKey", () => {
  it("strips trailing newlines/whitespace (the script re-adds exactly one)", () => {
    expect(normalizePrivateKey("-----KEY-----\n")).toBe("-----KEY-----");
    expect(normalizePrivateKey("-----KEY-----\n\n  \n")).toBe("-----KEY-----");
  });

  it("normalises CRLF to LF", () => {
    expect(normalizePrivateKey("line1\r\nline2\r\n")).toBe("line1\nline2");
  });

  it("leaves an already-clean key body untouched", () => {
    expect(normalizePrivateKey("line1\nline2")).toBe("line1\nline2");
  });
});
