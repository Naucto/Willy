import { createHmac } from "node:crypto";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import type { BuildOrchestrator } from "../build/build-orchestrator.service";
import type { CryptoService } from "../crypto/crypto.service";
import type { Database } from "../db/db.module";
import type { DeploymentsService } from "../deployments/deployments.service";
import { WebhooksService, deliveryDedupeKey, githubSignatureMatches } from "./webhooks.service";

const SECRET = "topsecret";
const BODY = Buffer.from('{"ref":"refs/heads/main"}');

function sign(secret: string, body: Buffer): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

// A SET-NX backed fake: first claim of a key returns "OK", later claims return null (already present).
function fakeRedis(): { redis: Redis; set: ReturnType<typeof vi.fn> } {
  const claimed = new Set<string>();
  const set = vi.fn(async (key: string) => {
    if (claimed.has(key)) {
      return null;
    }

    claimed.add(key);

    return "OK";
  });

  return { redis: { set } as unknown as Redis, set };
}

function makeService(overrides: { redis?: Redis; deploy?: ReturnType<typeof vi.fn> } = {}) {
  const deploy = overrides.deploy ?? vi.fn(async () => {});
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ secretCipher: "x" }] }) }),
    }),
  } as unknown as Database;
  const crypto = { decrypt: () => SECRET } as unknown as CryptoService;
  const deployments = {
    findById: async () => ({ id: "dep1", name: "app", autoDeploy: true, gitRef: "main" }),
  } as unknown as DeploymentsService;
  const orchestrator = { deploy } as unknown as BuildOrchestrator;
  const redis = overrides.redis ?? fakeRedis().redis;

  return { service: new WebhooksService(db, redis, crypto, deployments, orchestrator), deploy };
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

describe("handlePush replay protection", () => {
  const validSig = sign(SECRET, BODY);

  it("deploys the first time a delivery is seen", async () => {
    const { service, deploy } = makeService();

    const outcome = await service.handlePush("dep1", validSig, "push", BODY, "delivery-1");

    expect(outcome.accepted).toBe(true);
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("rejects a replay of the same delivery id and does not redeploy", async () => {
    const { redis } = fakeRedis();
    const { service, deploy } = makeService({ redis });

    const first = await service.handlePush("dep1", validSig, "push", BODY, "delivery-1");
    const replay = await service.handlePush("dep1", validSig, "push", BODY, "delivery-1");

    expect(first.accepted).toBe(true);
    expect(replay).toEqual({ accepted: false, reason: "duplicate delivery" });
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("treats distinct delivery ids as separate deploys", async () => {
    const { redis } = fakeRedis();
    const { service, deploy } = makeService({ redis });

    await service.handlePush("dep1", validSig, "push", BODY, "delivery-1");
    await service.handlePush("dep1", validSig, "push", BODY, "delivery-2");

    expect(deploy).toHaveBeenCalledTimes(2);
  });

  it("fails open when Redis is unavailable", async () => {
    const redis = { set: vi.fn(async () => Promise.reject(new Error("down"))) } as unknown as Redis;
    const { service, deploy } = makeService({ redis });

    const outcome = await service.handlePush("dep1", validSig, "push", BODY, "delivery-1");

    expect(outcome.accepted).toBe(true);
    expect(deploy).toHaveBeenCalledTimes(1);
  });

  it("builds a deployment-scoped dedupe key", () => {
    expect(deliveryDedupeKey("dep1", "abc")).toBe("webhook:delivery:dep1:abc");
  });
});
