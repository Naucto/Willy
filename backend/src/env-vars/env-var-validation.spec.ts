import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertValidEnvKey, assertValidEnvValue } from "./env-var-validation";

describe("assertValidEnvKey", () => {
  it("accepts conventional env var names", () => {
    expect(() => assertValidEnvKey("DATABASE_URL")).not.toThrow();
    expect(() => assertValidEnvKey("_private")).not.toThrow();
    expect(() => assertValidEnvKey("PORT2")).not.toThrow();
  });

  it("rejects names that could split entries or skew interpolation", () => {
    for (const bad of ["2PORT", "A B", "A=B", "FOO\nBAR", "FOO-BAR", ""]) {
      expect(() => assertValidEnvKey(bad)).toThrow(BadRequestException);
    }
  });
});

describe("assertValidEnvValue", () => {
  it("allows multiline secrets (PEM keys, JSON)", () => {
    expect(() =>
      assertValidEnvValue("-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----\n"),
    ).not.toThrow();
    expect(() => assertValidEnvValue('{"a":1}')).not.toThrow();
  });

  it("rejects NUL bytes", () => {
    expect(() => assertValidEnvValue("ab\u0000cd")).toThrow(BadRequestException);
  });

  it("rejects oversized values", () => {
    expect(() => assertValidEnvValue("x".repeat(128 * 1024 + 1))).toThrow(BadRequestException);
  });
});
