import { describe, expect, it } from "vitest";
import { scrubSecrets } from "./redact";

const TOKEN = "github_pat_11AKTHUPI0sctcbchD5UL0_mBazd47zSjYTLSYz9d7uQqunde0dHsvWNNAAXl8jJy9";

describe("scrubSecrets", () => {
  it("strips a known secret substring wherever it appears", () => {
    const out = scrubSecrets(`using ${TOKEN} twice: ${TOKEN}`, [TOKEN]);

    expect(out).not.toContain(TOKEN);
    expect(out).toBe("using *** twice: ***");
  });

  it("redacts credentials embedded in a URL even without knowing the secret", () => {
    const out = scrubSecrets(`clone https://x-access-token:${TOKEN}@github.com/acme/repo.git`);

    expect(out).not.toContain(TOKEN);
    expect(out).toBe("clone https://x-access-token:***@github.com/acme/repo.git");
  });

  it("redacts the real git clone-failure message a lost token produced", () => {
    // The exact leak vector: execFile echoes the full argv (tokened URL) into the error.
    const leaked = [
      'clone failed for ref "main": Command failed: git clone --depth 1 --branch main -- ',
      `https://x-access-token:${TOKEN}@github.com/Naucto/Production-Environment.git /tmp/willy-builds/build-IDKyPx`,
      "remote: Invalid username or token. Password authentication is not supported.",
    ].join("\n");

    const out = scrubSecrets(leaked, [TOKEN]);

    expect(out).not.toContain(TOKEN);
    expect(out).toContain(
      "https://x-access-token:***@github.com/Naucto/Production-Environment.git",
    );
  });

  it("leaves text without secrets untouched", () => {
    const clean = 'clone failed for ref "main": repository not found';

    expect(scrubSecrets(clean)).toBe(clean);
    expect(scrubSecrets("plain https://github.com/acme/repo.git line")).toBe(
      "plain https://github.com/acme/repo.git line",
    );
  });

  it("does not treat a host:port/path as credentials", () => {
    const line = "connected to db://postgres:5432/willy over the wire";

    // `postgres:5432` is host:port (a `/` follows before any `@`), not userinfo — must be left alone.
    expect(scrubSecrets(line)).toBe(line);
  });

  it("ignores empty secret values", () => {
    expect(scrubSecrets("nothing to redact", ["", ""])).toBe("nothing to redact");
  });
});
