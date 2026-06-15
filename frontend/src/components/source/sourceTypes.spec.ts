import { describe, expect, it } from "vitest";
import { isGitStrategy, SOURCE_OPTIONS, sourceDescription } from "./sourceTypes";

describe("sourceTypes", () => {
  it("offers one option per supported (non-nixpacks) build strategy", () => {
    expect(SOURCE_OPTIONS.map((option) => option.value)).toEqual([
      "DOCKERFILE",
      "COMPOSE",
      "IMAGE",
    ]);
    expect(SOURCE_OPTIONS.every((option) => option.description.length > 0)).toBe(true);
  });

  it("returns the same explanation string the wizard and settings share", () => {
    expect(sourceDescription("IMAGE")).toContain("registry");
    expect(sourceDescription("DOCKERFILE")).toContain("Dockerfile");
  });

  it("classifies git-backed strategies", () => {
    expect(isGitStrategy("DOCKERFILE")).toBe(true);
    expect(isGitStrategy("COMPOSE")).toBe(true);
    expect(isGitStrategy("IMAGE")).toBe(false);
  });
});
