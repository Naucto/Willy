import { describe, expect, it } from "vitest";
import { matrixToOctal, modeToMatrix, parseIdInput, withMatrix } from "./perms";

describe("modeToMatrix", () => {
  it("decodes 0644", () => {
    expect(modeToMatrix("0644")).toEqual({
      owner: { read: true, write: true, execute: false },
      group: { read: true, write: false, execute: false },
      other: { read: true, write: false, execute: false },
    });
  });

  it("decodes 0755", () => {
    const m = modeToMatrix("0755");
    expect(m.owner).toEqual({ read: true, write: true, execute: true });
    expect(m.group).toEqual({ read: true, write: false, execute: true });
  });

  it("treats an invalid mode as no permissions", () => {
    expect(matrixToOctal(modeToMatrix("xyz"))).toBe(0);
  });
});

describe("withMatrix", () => {
  it("round-trips through the matrix", () => {
    expect(withMatrix("0644", modeToMatrix("0644"))).toBe("0644");
    expect(withMatrix("0755", modeToMatrix("0755"))).toBe("0755");
  });

  it("preserves special (setuid/sticky) bits when editing rwx", () => {
    // 4755 = setuid + 0755; flipping group-write should keep the leading 4.
    const matrix = modeToMatrix("4755");
    matrix.group.write = true;

    expect(withMatrix("4755", matrix)).toBe("4775");
  });
});

describe("parseIdInput", () => {
  it("reads a raw number", () => {
    expect(parseIdInput("1000")).toBe(1000);
    expect(parseIdInput("  0 ")).toBe(0);
  });

  it("reads the id out of a 'name (id)' label", () => {
    expect(parseIdInput("app (1000)")).toBe(1000);
    expect(parseIdInput("www-data (33)")).toBe(33);
  });

  it("returns null for non-numeric free text", () => {
    expect(parseIdInput("nobody")).toBeNull();
    expect(parseIdInput("")).toBeNull();
  });
});
