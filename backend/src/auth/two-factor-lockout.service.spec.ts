import { UnauthorizedException } from "@nestjs/common";
import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { TwoFactorLockoutService, twoFactorFailureKey } from "./two-factor-lockout.service";

// Minimal in-memory Redis covering the commands the service uses (incr/expire/get/del).
function fakeRedis(): Redis {
  const store = new Map<string, number>();

  return {
    incr: async (key: string) => {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);

      return next;
    },
    expire: async () => 1,
    get: async (key: string) => {
      const value = store.get(key);

      return value === undefined ? null : String(value);
    },
    del: async (key: string) => {
      store.delete(key);

      return 1;
    },
  } as unknown as Redis;
}

describe("TwoFactorLockoutService", () => {
  it("allows attempts below the threshold", async () => {
    const lockout = new TwoFactorLockoutService(fakeRedis());

    for (let i = 0; i < 4; i++) {
      await lockout.recordFailure("user-1");
    }

    await expect(lockout.assertNotLockedOut("user-1")).resolves.toBeUndefined();
  });

  it("locks the account after too many failures", async () => {
    const lockout = new TwoFactorLockoutService(fakeRedis());

    for (let i = 0; i < 5; i++) {
      await lockout.recordFailure("user-1");
    }

    await expect(lockout.assertNotLockedOut("user-1")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("clears the counter on success", async () => {
    const lockout = new TwoFactorLockoutService(fakeRedis());

    for (let i = 0; i < 5; i++) {
      await lockout.recordFailure("user-1");
    }

    await lockout.clear("user-1");

    await expect(lockout.assertNotLockedOut("user-1")).resolves.toBeUndefined();
  });

  it("tracks each account independently", async () => {
    const lockout = new TwoFactorLockoutService(fakeRedis());

    for (let i = 0; i < 5; i++) {
      await lockout.recordFailure("user-1");
    }

    await expect(lockout.assertNotLockedOut("user-2")).resolves.toBeUndefined();
  });

  it("fails open when Redis is down", async () => {
    const down = {
      incr: async () => Promise.reject(new Error("down")),
      get: async () => Promise.reject(new Error("down")),
      del: async () => Promise.reject(new Error("down")),
      expire: async () => Promise.reject(new Error("down")),
    } as unknown as Redis;
    const lockout = new TwoFactorLockoutService(down);

    await lockout.recordFailure("user-1");
    await expect(lockout.assertNotLockedOut("user-1")).resolves.toBeUndefined();
  });

  it("namespaces the counter key by user", () => {
    expect(twoFactorFailureKey("abc")).toBe("2fa:fail:abc");
  });
});
