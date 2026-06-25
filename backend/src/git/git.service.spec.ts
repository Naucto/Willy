import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import {
  GitError,
  GitService,
  assertSafeRef,
  parseRefs,
  submoduleUpdateArgs,
  tokenRewriteConfig,
} from "./git.service";

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

describe("assertSafeRef", () => {
  it.each(["main", "master", "v1.2.0", "release/1.2", "feature/JIRA-123_thing", "a.b.c"])(
    "accepts %s",
    (ref) => {
      expect(() => assertSafeRef(ref)).not.toThrow();
    },
  );

  it.each([
    "",
    "-rf",
    "--upload-pack=touch /tmp/x",
    "--output=/etc/passwd",
    "main branch",
    "a..b",
    "ref~1",
    "a:b",
    "a?b",
    "a*b",
    "a[b",
    "a\\b",
  ])("rejects %j", (ref) => {
    expect(() => assertSafeRef(ref)).toThrow(GitError);
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

describe("submoduleUpdateArgs", () => {
  it("tracks branch tips with --remote in track mode", () => {
    const args = submoduleUpdateArgs("/builds/x", "track");

    expect(args).toEqual([
      "-C",
      "/builds/x",
      "submodule",
      "update",
      "--init",
      "--recursive",
      "--depth",
      "1",
      "--remote",
    ]);
  });

  it("uses the superproject's pinned commits in pin mode (no --remote)", () => {
    expect(submoduleUpdateArgs("/builds/x", "pin")).not.toContain("--remote");
  });
});

describe("tokenRewriteConfig", () => {
  it("rewrites both HTTPS and SSH GitHub remotes to a token-bearing URL", () => {
    const { key, values } = tokenRewriteConfig("ghs_secret");

    expect(key).toBe("url.https://x-access-token:ghs_secret@github.com/.insteadOf");
    expect(values).toEqual(["https://github.com/", "git@github.com:"]);
  });
});
