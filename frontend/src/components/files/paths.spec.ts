import { describe, expect, it } from "vitest";
import { decodeBase64ToText, encodeTextToBase64 } from "./encoding";
import {
  baseOf,
  dirOf,
  formatBytes,
  isMoveInvalid,
  joinPath,
  languageForFile,
  suggestCopyName,
} from "./paths";

describe("path helpers", () => {
  it("joins paths relative to the volume root", () => {
    expect(joinPath("/", "a")).toBe("/a");
    expect(joinPath("/a/b", "c.txt")).toBe("/a/b/c.txt");
  });

  it("derives parent dir and basename", () => {
    expect(dirOf("/a/b/c.txt")).toBe("/a/b");
    expect(dirOf("/a")).toBe("/");
    expect(dirOf("/")).toBe("/");
    expect(baseOf("/a/b/c.txt")).toBe("c.txt");
  });
});

describe("languageForFile", () => {
  it("maps extensions to Monaco languages", () => {
    expect(languageForFile("app.ts")).toBe("typescript");
    expect(languageForFile("config.yaml")).toBe("yaml");
    expect(languageForFile("Dockerfile")).toBe("dockerfile");
    expect(languageForFile("notes")).toBe("plaintext");
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});

describe("suggestCopyName", () => {
  it("returns the name unchanged when it's free", () => {
    expect(suggestCopyName("test.txt", ["other.txt"])).toBe("test.txt");
  });

  it("bumps a numbered suffix preserving the extension", () => {
    expect(suggestCopyName("test.txt", ["test.txt"])).toBe("test (2).txt");
    expect(suggestCopyName("test.txt", ["test.txt", "test (2).txt"])).toBe("test (3).txt");
  });

  it("handles names without an extension", () => {
    expect(suggestCopyName("data", ["data"])).toBe("data (2)");
  });
});

describe("isMoveInvalid", () => {
  it("rejects moving a folder into itself or a descendant", () => {
    expect(isMoveInvalid("/a", "/a")).toBe(true);
    expect(isMoveInvalid("/a", "/a/b")).toBe(true);
    expect(isMoveInvalid("/a", "/b")).toBe(false);
  });
});

describe("base64 round-trip", () => {
  it("preserves multibyte UTF-8 text", () => {
    const text = "héllo → wörld 🚀\n";

    expect(decodeBase64ToText(encodeTextToBase64(text))).toBe(text);
  });
});
