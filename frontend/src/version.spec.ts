import { describe, expect, it } from "vitest";
import { WILLY_VERSION } from "./version";

describe("version", () => {
  it("exposes a semver string", () => {
    expect(WILLY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
