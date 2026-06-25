import { describe, expect, it } from "vitest";
import {
  UnsafeCapabilityError,
  assertSafeCapabilities,
  findUnsafeCapabilities,
  normalizeCapability,
} from "./capabilities";

describe("normalizeCapability", () => {
  it("strips the CAP_ prefix, trims, and upper-cases", () => {
    expect(normalizeCapability("cap_sys_admin")).toBe("SYS_ADMIN");
    expect(normalizeCapability("  net_admin ")).toBe("NET_ADMIN");
    expect(normalizeCapability("NET_BIND_SERVICE")).toBe("NET_BIND_SERVICE");
  });
});

describe("findUnsafeCapabilities", () => {
  it("returns nothing for safe / empty / nullish input", () => {
    expect(findUnsafeCapabilities(["NET_BIND_SERVICE", "CHOWN"])).toEqual([]);
    expect(findUnsafeCapabilities([])).toEqual([]);
    expect(findUnsafeCapabilities(null)).toEqual([]);
    expect(findUnsafeCapabilities(undefined)).toEqual([]);
  });

  it("flags dangerous caps regardless of casing/prefix", () => {
    expect(findUnsafeCapabilities(["SYS_ADMIN"])).toEqual(["SYS_ADMIN"]);
    expect(findUnsafeCapabilities(["cap_sys_ptrace"])).toEqual(["cap_sys_ptrace"]);
    expect(findUnsafeCapabilities(["NET_ADMIN", "CHOWN", "ALL"])).toEqual(["NET_ADMIN", "ALL"]);
  });
});

describe("assertSafeCapabilities", () => {
  it("passes for a safe set", () => {
    expect(() => assertSafeCapabilities(["NET_BIND_SERVICE"])).not.toThrow();
  });

  it("throws UnsafeCapabilityError naming the offenders", () => {
    expect(() => assertSafeCapabilities(["SYS_ADMIN", "NET_ADMIN"])).toThrow(UnsafeCapabilityError);
    expect(() => assertSafeCapabilities(["SYS_ADMIN"])).toThrow(/SYS_ADMIN/);
  });
});
