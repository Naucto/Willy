import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WillyError } from "../common/errors";

const exec = promisify(execFile);
const CLONE_TIMEOUT_MS = 120_000;
const LS_REMOTE_TIMEOUT_MS = 15_000;

export class GitError extends WillyError {}

export interface CloneOptions {
  url: string;
  ref: string;
  token?: string | undefined;
}

export interface CloneResult {
  dir: string;
  sha: string;
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "::1"
  );
}

@Injectable()
export class GitService {
  private readonly buildsRoot: string;

  constructor(config: ConfigService) {
    this.buildsRoot = config.get<string>("BUILDS_DIR") ?? join(tmpdir(), "willy-builds");
  }

  async clone(options: CloneOptions): Promise<CloneResult> {
    this.assertSafeUrl(options.url);

    await mkdir(this.buildsRoot, { recursive: true });
    const dir = await mkdtemp(join(this.buildsRoot, "build-"));
    const url = this.applyToken(options.url, options.token);

    try {
      await exec("git", ["clone", "--depth", "1", "--branch", options.ref, url, dir], {
        timeout: CLONE_TIMEOUT_MS,
        // Fail fast instead of hanging on a credentials prompt for private repos.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      await this.cleanup(dir);

      throw new GitError(`clone failed for ref "${options.ref}": ${describeError(error)}`);
    }

    const { stdout } = await exec("git", ["-C", dir, "rev-parse", "HEAD"]);

    return { dir, sha: stdout.trim() };
  }

  async cleanup(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
  }

  // Lists a remote's branches without cloning (`git ls-remote --heads`), so the create/settings UI
  // can offer branch choices for any git remote (not GitHub-specific) before the first deploy.
  async listBranches(url: string, token?: string): Promise<string[]> {
    this.assertSafeUrl(url);
    const remote = this.applyToken(url, token);

    try {
      const { stdout } = await exec("git", ["ls-remote", "--heads", remote], {
        timeout: LS_REMOTE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      return stdout
        .split("\n")
        .map((line) => line.split("\trefs/heads/")[1])
        .filter((branch): branch is string => Boolean(branch))
        .sort();
    } catch (error) {
      throw new GitError(`could not list branches: ${describeError(error)}`);
    }
  }

  private assertSafeUrl(url: string): void {
    // SSH URLs are authenticated by a deploy key and validated elsewhere.
    if (url.startsWith("git@")) {
      return;
    }

    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      throw new GitError("invalid repository URL");
    }

    if (parsed.protocol !== "https:") {
      throw new GitError("only https:// or git@ repository URLs are allowed");
    }

    if (isPrivateHost(parsed.hostname.toLowerCase())) {
      throw new GitError("repository host is not allowed");
    }
  }

  private applyToken(url: string, token?: string): string {
    if (!token || url.startsWith("git@")) {
      return url;
    }

    const parsed = new URL(url);
    parsed.username = "x-access-token";
    parsed.password = token;

    return parsed.toString();
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
