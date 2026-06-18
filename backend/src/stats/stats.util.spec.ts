import { describe, expect, it } from "vitest";
import { cpuPercent, memUsage } from "./stats.util";

describe("cpuPercent", () => {
  it("scales the cpu delta over the system delta by core count", () => {
    const current = { cpu_usage: { total_usage: 200 }, system_cpu_usage: 2000, online_cpus: 4 };
    const previous = { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000, online_cpus: 4 };

    // (100/1000) * 4 * 100 = 40
    expect(cpuPercent(current, previous)).toBe(40);
  });

  it("returns 0 on the first sample / when idle", () => {
    const snap = { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000, online_cpus: 2 };

    expect(cpuPercent(snap, snap)).toBe(0);
  });

  it("defaults to a single core when online_cpus is missing", () => {
    const current = { cpu_usage: { total_usage: 150 }, system_cpu_usage: 1100 };
    const previous = { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 };

    // (50/100) * 1 * 100 = 50
    expect(cpuPercent(current, previous)).toBe(50);
  });
});

describe("memUsage", () => {
  it("subtracts page cache from usage and reads swap", () => {
    expect(memUsage({ usage: 1000, limit: 4000, stats: { cache: 300, swap: 50 } })).toEqual({
      usageBytes: 700,
      limitBytes: 4000,
      swapBytes: 50,
    });
  });

  it("falls back to inactive_file and a zero swap when cache fields are absent", () => {
    expect(memUsage({ usage: 1000, limit: 4000, stats: { total_inactive_file: 200 } })).toEqual({
      usageBytes: 800,
      limitBytes: 4000,
      swapBytes: 0,
    });
  });

  it("never reports negative usage", () => {
    expect(memUsage({ usage: 100, limit: 4000, stats: { cache: 999 } }).usageBytes).toBe(0);
  });
});
