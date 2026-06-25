import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
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
  // For repos with submodules: "track" (default) checks out each submodule's configured branch tip,
  // so a redeploy picks up new submodule commits without bumping the superproject's pointers; "pin"
  // uses the exact commits the superproject records.
  submodules?: "track" | "pin" | undefined;
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
    assertSafeRef(options.ref);

    await mkdir(this.buildsRoot, { recursive: true });
    const dir = await mkdtemp(join(this.buildsRoot, "build-"));
    const url = this.applyToken(options.url, options.token);

    try {
      // `--` ends option parsing so a crafted URL/ref can never be read as a git flag (e.g.
      // `--upload-pack=…`, the classic argument-injection sink); the ref is also pre-validated.
      await exec("git", ["clone", "--depth", "1", "--branch", options.ref, "--", url, dir], {
        timeout: CLONE_TIMEOUT_MS,
        // Fail fast instead of hanging on a credentials prompt for private repos.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      if (await hasSubmodules(dir)) {
        await this.updateSubmodules(dir, options.token, options.submodules ?? "track");
      }
    } catch (error) {
      await this.cleanup(dir);

      // Submodule failures already carry a GitError with a precise message; don't mask them.
      throw error instanceof GitError
        ? error
        : new GitError(`clone failed for ref "${options.ref}": ${describeError(error)}`);
    }

    const { stdout } = await exec("git", ["-C", dir, "rev-parse", "HEAD"]);

    return { dir, sha: stdout.trim() };
  }

  // Pulls in submodules after the superproject is cloned. Authenticates submodule fetches with the
  // same token as the superproject by rewriting GitHub remotes (HTTPS or SSH form) to a token-bearing
  // HTTPS URL — written to the build's local git config (cleaned up with the build dir), so the token
  // is not passed on the argv of each child fetch.
  private async updateSubmodules(
    dir: string,
    token: string | undefined,
    mode: "track" | "pin",
  ): Promise<void> {
    if (token) {
      const { key, values } = tokenRewriteConfig(token);

      // First value replaces the key; the rest are appended (a multi-valued insteadOf).
      let replace = true;

      for (const value of values) {
        const configArgs = replace
          ? ["-C", dir, "config", key, value]
          : ["-C", dir, "config", "--add", key, value];

        await exec("git", configArgs);
        replace = false;
      }
    }

    try {
      await exec("git", submoduleUpdateArgs(dir, mode), {
        timeout: CLONE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      throw new GitError(`submodule update failed: ${describeError(error)}`);
    }
  }

  async cleanup(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
  }

  // Lists a remote's branches and tags without cloning (`git ls-remote --heads --tags`), so the
  // create/settings UI can offer (and validate) refs for any git remote — not GitHub-specific —
  // before the first deploy. Tags are included so a tag-pinned ref isn't false-flagged as missing.
  async listBranches(url: string, token?: string): Promise<string[]> {
    this.assertSafeUrl(url);
    const remote = this.applyToken(url, token);

    try {
      // `--` ends option parsing so the remote can't be interpreted as a git flag (argument injection).
      const { stdout } = await exec("git", ["ls-remote", "--heads", "--tags", "--", remote], {
        timeout: LS_REMOTE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      return parseRefs(stdout);
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

// A branch/tag is passed as the value of `git --branch`; reject anything that could be read as an
// option or smuggle a second argument. The allowlist (word chars plus `./-`) covers every real-world
// branch/tag name while excluding whitespace, control chars, git-illegal punctuation, an option-leading
// `-`, and `..` ref escapes. Exported for unit testing.
export function assertSafeRef(ref: string): void {
  if (ref.length === 0 || ref.startsWith("-") || ref.includes("..") || !/^[\w./-]+$/.test(ref)) {
    throw new GitError(`invalid git ref: ${JSON.stringify(ref)}`);
  }
}

async function hasSubmodules(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".gitmodules"));

    return true;
  } catch {
    return false;
  }
}

// `git submodule update` arguments. "track" adds `--remote` so each submodule is moved to its
// configured branch tip instead of the commit the superproject pins.
export function submoduleUpdateArgs(dir: string, mode: "track" | "pin"): string[] {
  const args = ["-C", dir, "submodule", "update", "--init", "--recursive", "--depth", "1"];

  if (mode === "track") {
    args.push("--remote");
  }

  return args;
}

// Builds the `url.<tokened>.insteadOf` git-config that makes submodule fetches reuse the
// superproject's token. Both the HTTPS and SSH GitHub remote forms are rewritten so `.gitmodules`
// can use either.
export function tokenRewriteConfig(token: string): { key: string; values: string[] } {
  const tokened = `https://x-access-token:${token}@github.com/`;

  return { key: `url.${tokened}.insteadOf`, values: ["https://github.com/", "git@github.com:"] };
}

// Parses `git ls-remote --heads --tags` output into a sorted, de-duplicated list of ref names
// (the short `main`/`v1.2.0` form). Peeled tag entries (`refs/tags/v1^{}`, which point at the
// tag's target commit) are dropped so a tag isn't listed twice.
export function parseRefs(stdout: string): string[] {
  const refs = new Set<string>();

  for (const line of stdout.split("\n")) {
    const ref = line.split("\t")[1];

    if (!ref || ref.endsWith("^{}")) {
      continue;
    }

    const name = ref.replace(/^refs\/(heads|tags)\//, "");

    if (name) {
      refs.add(name);
    }
  }

  return [...refs].sort();
}
