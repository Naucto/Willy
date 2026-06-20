import { describe, expect, it } from "vitest";
import { userSections } from "./userSections";

describe("userSections", () => {
  it("lists the General, Security and Two-factor sections in order", () => {
    expect(userSections().map((s) => s.key)).toEqual(["general", "security", "twofa"]);
  });
});
