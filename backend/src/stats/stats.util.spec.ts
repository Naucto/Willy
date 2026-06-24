import { describe, expect, it } from "vitest";
import {
  blkioBytes,
  cpuPercent,
  memUsage,
  netBytes,
  rate,
  StatsWindow,
  windowToMs,
} from "./stats.util";

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

describe("netBytes", () => {
  it("sums rx/tx across every interface", () => {
    expect(
      netBytes({
        eth0: { rx_bytes: 100, tx_bytes: 10 },
        eth1: { rx_bytes: 50, tx_bytes: 5 },
      }),
    ).toEqual({ rxBytes: 150, txBytes: 15 });
  });

  it("treats missing counters and the whole map as zero", () => {
    expect(netBytes({ eth0: {} })).toEqual({ rxBytes: 0, txBytes: 0 });
    expect(netBytes(undefined)).toEqual({ rxBytes: 0, txBytes: 0 });
  });
});

describe("blkioBytes", () => {
  it("sums read/write rows case-insensitively and ignores other ops", () => {
    expect(
      blkioBytes({
        io_service_bytes_recursive: [
          { op: "Read", value: 100 },
          { op: "write", value: 40 },
          { op: "Read", value: 25 },
          { op: "Sync", value: 999 },
        ],
      }),
    ).toEqual({ readBytes: 125, writeBytes: 40 });
  });

  it("degrades to zero when blkio is empty or absent (cgroup v2)", () => {
    expect(blkioBytes({ io_service_bytes_recursive: [] })).toEqual({ readBytes: 0, writeBytes: 0 });
    expect(blkioBytes(undefined)).toEqual({ readBytes: 0, writeBytes: 0 });
  });
});

describe("rate", () => {
  it("computes per-second rate from a cumulative delta", () => {
    expect(rate(3000, 1500, 15)).toBe(100);
  });

  it("clamps counter resets to zero", () => {
    expect(rate(100, 5000, 15)).toBe(0);
  });

  it("returns 0 for a non-positive interval", () => {
    expect(rate(3000, 1500, 0)).toBe(0);
  });
});

describe("windowToMs", () => {
  it("maps each window to its duration in milliseconds", () => {
    expect(windowToMs(StatsWindow.FifteenMinutes)).toBe(15 * 60 * 1000);
    expect(windowToMs(StatsWindow.OneHour)).toBe(60 * 60 * 1000);
    expect(windowToMs(StatsWindow.SixHours)).toBe(6 * 60 * 60 * 1000);
    expect(windowToMs(StatsWindow.TwentyFourHours)).toBe(24 * 60 * 60 * 1000);
  });
});
