import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WillyError } from "../common/errors";
import { scrubSecrets } from "../common/redact";

const exec = promisify(execFile);
// Sized for a *tracked* submodule, which is the expensive case: following a branch rules out a
// shallow clone, so each deploy fetches whole histories rather than one commit each. A repository
// of a few hundred megabytes is minutes, not seconds, and the budget has to cover the slowest of
// them plus whatever the forge is throttling that day.
const CLONE_TIMEOUT_MS = 600_000;
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
      // The child-process error echoes the argv, which includes the tokened URL — scrub before it
      // reaches the error object (and from there logs + the releases.error_message column).
      throw error instanceof GitError
        ? error
        : new GitError(
            scrubSecrets(
              `clone failed for ref "${options.ref}": ${describeError(error)}`,
              options.token ? [options.token] : [],
            ),
          );
    }

    const { stdout } = await exec("git", ["-C", dir, "rev-parse", "HEAD"]);

    return { dir, sha: stdout.trim() };
  }

  // Pulls in submodules after the superproject is cloned. Authenticates every fetch with the same
  // token as the superproject by rewriting GitHub remotes (HTTPS or SSH form) to a token-bearing
  // HTTPS URL, carried in the environment so it reaches submodules at any depth.
  //
  // The SSH form matters even where no key exists: a `.gitmodules` may name `git@github.com:…`,
  // and the image has no ssh binary, so without the rewrite the clone dies on `cannot run ssh`
  // rather than on anything to do with credentials.
  private async updateSubmodules(
    dir: string,
    token: string | undefined,
    mode: "track" | "pin",
  ): Promise<void> {
    try {
      await exec("git", submoduleUpdateArgs(dir, mode), {
        timeout: CLONE_TIMEOUT_MS,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          ...(token ? tokenRewriteConfig(token) : {}),
        },
      });
    } catch (error) {
      throw new GitError(
        scrubSecrets(`submodule update failed: ${describeError(error)}`, token ? [token] : []),
      );
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
      throw new GitError(
        scrubSecrets(`could not list branches: ${describeError(error)}`, token ? [token] : []),
      );
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
  const args = ["-C", dir, "submodule", "update", "--init", "--recursive"];

  if (mode === "track") {
    // No `--depth 1` here, and the two are not merely a slow pair: a submodule cloned shallow
    // fetches its default branch and nothing else, so `--remote` has no `origin/<branch>` to
    // resolve and the update dies with "unable to find refs/remotes/origin/<branch>". Tracking
    // worked only where .gitmodules happened to name the default branch.
    args.push("--remote");
  } else {
    args.push("--depth", "1");
  }

  return args;
}

// Builds the `url.<tokened>.insteadOf` git-config that makes submodule fetches reuse the
// superproject's token. Both the HTTPS and SSH GitHub remote forms are rewritten so `.gitmodules`
// can use either.
export function tokenRewriteConfig(token: string): Record<string, string> {
  const key = `url.https://x-access-token:${token}@github.com/.insteadOf`;
  const values = ["https://github.com/", "git@github.com:"];

  // `GIT_CONFIG_COUNT` rather than `git config` or `-c`, because each of the three puts the token
  // somewhere different: the first writes it into the build's config file, the second onto the
  // argv of every git process, and this one into an environment git already inherits. It is also
  // the only one a *nested* submodule sees — a rewrite living in the superproject's config is read
  // by its own submodule clones and by nothing deeper, which is why a submodule of a submodule
  // still reached for SSH.
  return Object.fromEntries([
    ["GIT_CONFIG_COUNT", String(values.length)],
    ...values.flatMap((value, i) => [
      [`GIT_CONFIG_KEY_${String(i)}`, key],
      [`GIT_CONFIG_VALUE_${String(i)}`, value],
    ]),
  ]);
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
