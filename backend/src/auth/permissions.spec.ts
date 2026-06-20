import { describe, expect, it } from "vitest";
import { capabilitiesForRole } from "./permissions";

describe("capabilitiesForRole", () => {
  it("grants admins both capabilities", () => {
    expect(capabilitiesForRole("ADMIN")).toEqual(["operate", "admin"]);
  });

  it("grants operators only operate", () => {
    expect(capabilitiesForRole("OPERATOR")).toEqual(["operate"]);
  });

  it("grants viewers nothing", () => {
    expect(capabilitiesForRole("VIEWER")).toEqual([]);
  });
});
