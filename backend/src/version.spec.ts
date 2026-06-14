import { describe, expect, it } from "vitest";
import { describeBackend, WILLY_VERSION } from "./version";

describe("version", () => {
  it("exposes a semver string", () => {
    expect(WILLY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("describes the backend", () => {
    expect(describeBackend()).toContain(WILLY_VERSION);
  });
});
