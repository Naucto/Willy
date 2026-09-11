import { describe, expect, it } from "vitest";
import { type MaskedEnvVar, maskedEnvValue, mergeInheritedEnv } from "./env-vars.service";

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
