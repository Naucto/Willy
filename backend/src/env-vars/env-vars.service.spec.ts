import { describe, expect, it } from "vitest";
import { maskedEnvValue } from "./env-vars.service";

describe("maskedEnvValue", () => {
  it("returns the plaintext for a regular var", () => {
    expect(maskedEnvValue(false, "3000")).toBe("3000");
  });

  it("never returns a secret's value", () => {
    expect(maskedEnvValue(true, "super-secret")).toBeNull();
  });
});
