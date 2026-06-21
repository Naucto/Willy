import { describe, expect, it } from "vitest";
import { fileType, modeHuman, modeOctal, parseStatLine, toEntry } from "./file-stat";

describe("fileType", () => {
  it("maps the stat format bits to an entry type", () => {
    expect(fileType(0o040755)).toBe("dir");
    expect(fileType(0o100644)).toBe("file");
    expect(fileType(0o120777)).toBe("symlink");
    expect(fileType(0o010000)).toBe("other");
  });
});

describe("parseStatLine", () => {
  it("parses a well-formed hex-mode stat line", () => {
    // %f is hex: 0x41ed = 0o40755 (a 0755 dir).
    const info = parseStatLine("41ed|4096|0|0|1700000000");

    expect(info).toEqual({
      type: "dir",
      perm: 0o755,
      size: 4096,
      uid: 0,
      gid: 0,
      mtimeMs: 1700000000000,
    });
  });

  it("returns null on too few fields or a non-hex mode", () => {
    expect(parseStatLine("41ed|4096|0")).toBeNull();
    expect(parseStatLine("zzzz|1|0|0|1")).toBeNull();
  });
});

describe("modeOctal / modeHuman", () => {
  it("formats permission bits", () => {
    expect(modeOctal(0o644)).toBe("0644");
    expect(modeOctal(0o7)).toBe("0007");
    expect(modeHuman(0o644)).toBe("rw-r--r--");
    expect(modeHuman(0o755)).toBe("rwxr-xr-x");
    expect(modeHuman(0o000)).toBe("---------");
  });
});

describe("toEntry", () => {
  it("builds a DTO with octal + human modes and an ISO mtime", () => {
    const entry = toEntry("app.log", {
      type: "file",
      perm: 0o640,
      size: 12,
      uid: 1000,
      gid: 1000,
      mtimeMs: 1700000000000,
    });

    expect(entry).toMatchObject({
      name: "app.log",
      type: "file",
      mode: "0640",
      modeHuman: "rw-r-----",
      uid: 1000,
      gid: 1000,
      mtime: "2023-11-14T22:13:20.000Z",
    });
  });
});
