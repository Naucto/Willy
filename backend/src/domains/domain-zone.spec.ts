import { describe, expect, it } from "vitest";
import { subDomainOf, zoneFor } from "./domain-zone";

describe("domain-zone", () => {
  const zones = ["naucto.net", "apps.naucto.net", "example.com"];

  it("matches a domain to its containing zone", () => {
    expect(zoneFor("app.naucto.net", zones)).toBe("naucto.net");
    expect(zoneFor("naucto.net", zones)).toBe("naucto.net");
    expect(zoneFor("api.example.com", zones)).toBe("example.com");
  });

  it("prefers the most specific (longest) zone on overlap", () => {
    expect(zoneFor("dash.apps.naucto.net", zones)).toBe("apps.naucto.net");
  });

  it("returns null when the domain is outside every zone", () => {
    expect(zoneFor("app.other.org", zones)).toBeNull();
  });

  it("is case- and trailing-dot-insensitive", () => {
    expect(zoneFor("App.Naucto.NET.", zones)).toBe("naucto.net");
  });

  it("derives the sub-domain relative to the zone", () => {
    expect(subDomainOf("app.naucto.net", "naucto.net")).toBe("app");
    expect(subDomainOf("a.b.naucto.net", "naucto.net")).toBe("a.b");
    expect(subDomainOf("naucto.net", "naucto.net")).toBe("");
  });
});
