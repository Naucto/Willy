import { describe, expect, it } from "vitest";
import { generatePassword } from "./password";

const ALLOWED = /^[a-zA-Z2-9!@#$%*\-_]+$/;

describe("generatePassword", () => {
  it("honours the requested length", () => {
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword(24)).toHaveLength(24);
  });

  it("only uses the unambiguous charset (no 0/O/1/l/I)", () => {
    const pw = generatePassword(200);
    expect(pw).toMatch(ALLOWED);
    expect(pw).not.toMatch(/[01OlI]/);
  });

  it("produces a different password each call", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
