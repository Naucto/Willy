import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { CryptoService } from "../crypto/crypto.service";
import type { Database } from "../db/db.module";
import {
  EnvVarsService,
  type MaskedEnvVar,
  maskedEnvValue,
  mergeInheritedEnv,
} from "./env-vars.service";

describe("maskedEnvValue", () => {
  it("returns the plaintext for a regular var", () => {
    expect(maskedEnvValue(false, "3000")).toBe("3000");
  });

  it("never returns a secret's value", () => {
    expect(maskedEnvValue(true, "super-secret")).toBeNull();
  });
});

describe("mergeInheritedEnv", () => {
  const shared = (key: string, value: string): MaskedEnvVar => ({
    key,
    scope: "RUNTIME",
    isSecret: false,
    targetService: "",
    overridden: false,
    value,
  });

  const own = (key: string, value: string): MaskedEnvVar => ({
    ...shared(key, value),
    targetService: "backend",
  });

  it("lists the shared variables a service inherits alongside its own", () => {
    const merged = mergeInheritedEnv([shared("PORT", "3000")], [own("DB_URL", "postgres://")]);

    expect(merged.map((row) => row.key)).toEqual(["PORT", "DB_URL"]);
    expect(merged.map((row) => row.targetService)).toEqual(["", "backend"]);
  });

  it("marks a shared variable the service redefines", () => {
    const merged = mergeInheritedEnv([shared("PORT", "3000")], [own("PORT", "8080")]);

    expect(merged.map((row) => [row.key, row.targetService, row.overridden])).toEqual([
      ["PORT", "", true],
      ["PORT", "backend", false],
    ]);
  });

  // resolveForInjection orders shared before service-specific and lets the later write win; the list
  // must resolve to the same value, or the UI would show a variable the container does not have.
  it("resolves in the same precedence the injection applies", () => {
    const merged = mergeInheritedEnv(
      [shared("PORT", "3000"), shared("LOG", "info")],
      [own("PORT", "8080")],
    );
    const resolved = Object.fromEntries(merged.map((row) => [row.key, row.value]));

    expect(resolved).toEqual({ PORT: "8080", LOG: "info" });
  });

  it("leaves the shared scope's own listing untouched", () => {
    expect(mergeInheritedEnv([], [own("DB_URL", "postgres://")])).toEqual([
      own("DB_URL", "postgres://"),
    ]);
  });
});

// A Drizzle-ish stub in the shape this service uses: `select().from().where()` resolves to `rows`,
// and `insert().values().onConflictDoUpdate()` records what the conflict branch would write.
function makeDb(rows: unknown[], captured: { conflictSet?: Record<string, unknown> }): Database {
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: (args: { set: Record<string, unknown> }) => {
          captured.conflictSet = args.set;

          return Promise.resolve(undefined);
        },
      }),
    }),
  } as unknown as Database;
}

const crypto = {
  encrypt: () => ({ cipherText: "c", nonce: "n", authTag: "a", keyVersion: 1 }),
} as unknown as CryptoService;

describe("EnvVarsService.set", () => {
  it("refuses to replace a stored secret with an empty value", async () => {
    const service = new EnvVarsService(makeDb([{ isSecret: true }], {}), crypto);

    await expect(service.set("dep-1", "TOKEN", "")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows an empty value on a regular variable", async () => {
    const service = new EnvVarsService(makeDb([{ isSecret: false }], {}), crypto);

    await expect(service.set("dep-1", "DEBUG", "")).resolves.toBeUndefined();
  });

  it("allows an empty value on a variable that does not exist yet", async () => {
    const service = new EnvVarsService(makeDb([], {}), crypto);

    await expect(service.set("dep-1", "DEBUG", "")).resolves.toBeUndefined();
  });

  it("leaves scope and secrecy alone on a value-only write", async () => {
    const captured: { conflictSet?: Record<string, unknown> } = {};
    const service = new EnvVarsService(makeDb([{ isSecret: false }], captured), crypto);

    await service.set("dep-1", "PORT", "3000");

    expect(captured.conflictSet).not.toHaveProperty("scope");
    expect(captured.conflictSet).not.toHaveProperty("isSecret");
  });

  it("rewrites scope and secrecy when the caller states them", async () => {
    const captured: { conflictSet?: Record<string, unknown> } = {};
    const service = new EnvVarsService(makeDb([{ isSecret: false }], captured), crypto);

    await service.set("dep-1", "PORT", "3000", { scope: "BOTH", isSecret: false });

    expect(captured.conflictSet).toMatchObject({ scope: "BOTH", isSecret: false });
  });
});

describe("EnvVarsService.updateMeta", () => {
  it("rejects a variable that is not stored", async () => {
    const service = new EnvVarsService(makeDb([], {}), crypto);

    await expect(service.updateMeta("dep-1", "PORT", "", { scope: "BOTH" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
