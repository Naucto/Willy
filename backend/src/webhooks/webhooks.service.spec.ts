import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { githubSignatureMatches } from "./webhooks.service";

const SECRET = "topsecret";
const BODY = Buffer.from('{"ref":"refs/heads/main"}');

function sign(secret: string, body: Buffer): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("githubSignatureMatches", () => {
  it("accepts a correct signature", () => {
    expect(githubSignatureMatches(SECRET, BODY, sign(SECRET, BODY))).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(githubSignatureMatches(SECRET, BODY, sign("other", BODY))).toBe(false);
  });

  it("rejects a tampered body", () => {
    const tampered = Buffer.from('{"ref":"refs/heads/evil"}');
    expect(githubSignatureMatches(SECRET, tampered, sign(SECRET, BODY))).toBe(false);
  });

  it("rejects malformed/short signatures without throwing", () => {
    expect(githubSignatureMatches(SECRET, BODY, "sha256=deadbeef")).toBe(false);
    expect(githubSignatureMatches(SECRET, BODY, "")).toBe(false);
  });
});
