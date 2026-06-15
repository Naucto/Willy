import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { GitError, GitService } from "./git.service";

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
