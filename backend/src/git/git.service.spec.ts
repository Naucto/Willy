import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { GitError, GitService, parseRefs } from "./git.service";

function makeService(): GitService {
  const config = { get: () => "/tmp/willy-builds-test" } as unknown as ConfigService;

  return new GitService(config);
}

describe("GitService SSRF guard", () => {
  it.each([
    "http://example.com/repo.git",
    "ftp://example.com/repo",
    "https://localhost/repo",
    "https://app.localhost/repo",
    "https://127.0.0.1/repo",
    "https://10.1.2.3/repo",
    "https://192.168.0.1/repo",
    "https://172.16.0.1/repo",
    "not-a-url",
  ])("rejects %s", async (url) => {
    await expect(makeService().clone({ url, ref: "main" })).rejects.toBeInstanceOf(GitError);
  });
});

describe("parseRefs", () => {
  it("parses branches and tags, dropping peeled entries and sorting", () => {
    const stdout = [
      "a1b2c3d\trefs/heads/main",
      "e4f5g6h\trefs/heads/feature/login",
      "i7j8k9l\trefs/tags/v1.0.0",
      // Peeled tag pointing at the commit the annotated tag wraps — must be ignored.
      "m0n1o2p\trefs/tags/v1.0.0^{}",
      "",
    ].join("\n");

    expect(parseRefs(stdout)).toEqual(["feature/login", "main", "v1.0.0"]);
  });

  it("returns an empty list for empty output", () => {
    expect(parseRefs("")).toEqual([]);
  });
});
