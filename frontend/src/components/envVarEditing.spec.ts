import { describe, expect, it } from "vitest";
import type { MaskedEnvVar } from "../api/types";
import { envSaveBlocked, envSaveMode, envValueDisplay } from "./envVarEditing";

const regular: MaskedEnvVar = { key: "PORT", scope: "RUNTIME", isSecret: false, value: "3000" };
const secret: MaskedEnvVar = { key: "TOKEN", scope: "RUNTIME", isSecret: true, value: null };

describe("envValueDisplay", () => {
  it("shows a regular var's value", () => {
    expect(envValueDisplay(regular)).toBe("3000");
  });

  it("shows a dash for secrets", () => {
    expect(envValueDisplay(secret)).toBe("—");
  });
});

describe("envSaveMode", () => {
  it("PATCHes meta when editing a secret with no new value", () => {
    expect(envSaveMode({ editing: true, existingIsSecret: true, value: "" })).toBe("meta");
  });

  it("PUTs when a value is supplied", () => {
    expect(envSaveMode({ editing: true, existingIsSecret: true, value: "new" })).toBe("set");
  });

  it("PUTs for a new variable", () => {
    expect(envSaveMode({ editing: false, existingIsSecret: false, value: "" })).toBe("set");
  });

  it("PUTs when editing a regular var (even with no value change path)", () => {
    expect(envSaveMode({ editing: true, existingIsSecret: false, value: "" })).toBe("set");
  });
});

describe("envSaveBlocked", () => {
  it("blocks converting a secret to regular without a fresh value", () => {
    expect(
      envSaveBlocked({ editing: true, existingIsSecret: true, nextIsSecret: false, value: "" }),
    ).toBe(true);
  });

  it("allows the conversion once a value is entered", () => {
    expect(
      envSaveBlocked({ editing: true, existingIsSecret: true, nextIsSecret: false, value: "x" }),
    ).toBe(false);
  });

  it("does not block a secret staying secret", () => {
    expect(
      envSaveBlocked({ editing: true, existingIsSecret: true, nextIsSecret: true, value: "" }),
    ).toBe(false);
  });
});
