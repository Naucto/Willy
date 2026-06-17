import { describe, expect, it } from "vitest";
import { isValidFqdn } from "./domain";

describe("isValidFqdn", () => {
  it("accepts multi-label domains", () => {
    expect(isValidFqdn("app.example.com")).toBe(true);
    expect(isValidFqdn("api.staging.example.co.uk")).toBe(true);
    expect(isValidFqdn("my-app.localhost")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidFqdn("  app.example.com  ")).toBe(true);
  });

  it("rejects single labels and malformed input", () => {
    expect(isValidFqdn("localhost")).toBe(false);
    expect(isValidFqdn("")).toBe(false);
    expect(isValidFqdn("-bad.example.com")).toBe(false);
    expect(isValidFqdn("bad-.example.com")).toBe(false);
    expect(isValidFqdn("space d.example.com")).toBe(false);
  });
});
