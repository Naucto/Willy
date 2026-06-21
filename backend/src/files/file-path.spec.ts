import { describe, expect, it } from "vitest";
import { FileManagerError } from "../common/errors";
import { assertBasename, basename, containerPath, parentAndName, VOLUME_ROOT } from "./file-path";

describe("containerPath", () => {
  it("roots a relative path under /mnt", () => {
    expect(containerPath("foo/bar.txt")).toBe("/mnt/foo/bar.txt");
  });

  it("treats a leading slash as the volume root, not the host root", () => {
    expect(containerPath("/etc/passwd")).toBe("/mnt/etc/passwd");
  });

  it("maps an empty path (and bare slash) to the volume root", () => {
    expect(containerPath("")).toBe(VOLUME_ROOT);
    expect(containerPath("/")).toBe(VOLUME_ROOT);
  });

  it("collapses redundant slashes and . segments", () => {
    expect(containerPath("a//b/./c")).toBe("/mnt/a/b/c");
  });

  it("rejects any .. traversal segment", () => {
    expect(() => containerPath("../etc")).toThrow(FileManagerError);
    expect(() => containerPath("a/../../b")).toThrow(FileManagerError);
    expect(() => containerPath("/foo/../../bar")).toThrow(FileManagerError);
  });

  it("rejects NUL bytes", () => {
    expect(() => containerPath("a\0b")).toThrow(FileManagerError);
  });

  it("rejects an over-long path", () => {
    expect(() => containerPath("a".repeat(5000))).toThrow(FileManagerError);
  });
});

describe("assertBasename", () => {
  it("accepts a plain name", () => {
    expect(assertBasename("file.txt")).toBe("file.txt");
  });

  it("rejects separators, traversal, and empties", () => {
    expect(() => assertBasename("")).toThrow(FileManagerError);
    expect(() => assertBasename("a/b")).toThrow(FileManagerError);
    expect(() => assertBasename("..")).toThrow(FileManagerError);
    expect(() => assertBasename(".")).toThrow(FileManagerError);
    expect(() => assertBasename("x\0y")).toThrow(FileManagerError);
  });
});

describe("parentAndName / basename", () => {
  it("splits an absolute path", () => {
    expect(parentAndName("/mnt/a/b.txt")).toEqual({ dir: "/mnt/a", name: "b.txt" });
    expect(basename("/mnt/a/b.txt")).toBe("b.txt");
  });
});
