import { describe, expect, it } from "vitest";
import { ConfigError } from "../common/errors";
import { validateEnv } from "./env.validation";

const base = {
  DATABASE_URL: "postgres://x",
  REDIS_URL: "redis://redis:6379",
  WILLY_MASTER_KEY: "0".repeat(64),
  JWT_SECRET: "0".repeat(32),
  JWT_REFRESH_SECRET: "0".repeat(32),
};

describe("validateEnv", () => {
  it("accepts a complete configuration", () => {
    expect(validateEnv(base).REDIS_URL).toBe("redis://redis:6379");
  });

  it("rejects a configuration missing REDIS_URL", () => {
    const without: Partial<typeof base> = { ...base };
    delete without.REDIS_URL;

    expect(() => validateEnv(without)).toThrow(ConfigError);
  });
});
