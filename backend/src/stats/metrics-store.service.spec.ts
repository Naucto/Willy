import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { deploymentKey, hostKey, MetricsStoreService } from "./metrics-store.service";

describe("metrics keys", () => {
  it("namespaces host and per-deployment streams", () => {
    expect(hostKey()).toBe("metrics:host");
    expect(deploymentKey("abc")).toBe("metrics:dep:abc");
  });
});

describe("MetricsStoreService.range", () => {
  it("parses stream entries into timestamped samples", async () => {
    const xrange = vi.fn().mockResolvedValue([
      ["1700000000000-0", ["d", JSON.stringify({ cpuPercent: 12 })]],
      ["1700000015000-0", ["d", JSON.stringify({ cpuPercent: 34 })]],
    ]);
    const store = new MetricsStoreService({ xrange } as unknown as Redis);

    const samples = await store.range<{ cpuPercent: number }>("metrics:host", 1700000000000);

    expect(xrange).toHaveBeenCalledWith("metrics:host", "1700000000000-0", "+");
    expect(samples).toEqual([
      { ts: 1700000000000, data: { cpuPercent: 12 } },
      { ts: 1700000015000, data: { cpuPercent: 34 } },
    ]);
  });
});

describe("MetricsStoreService.record", () => {
  it("appends, trims by timestamp, and refreshes the key TTL atomically", async () => {
    const xadd = vi.fn().mockReturnThis();
    const xtrim = vi.fn().mockReturnThis();
    const expire = vi.fn().mockReturnThis();
    const exec = vi.fn().mockResolvedValue([]);
    const multi = { xadd, xtrim, expire, exec };
    const store = new MetricsStoreService({ multi: () => multi } as unknown as Redis);

    await store.record("metrics:host", { cpuPercent: 5 });

    expect(xadd).toHaveBeenCalledWith("metrics:host", "*", "d", JSON.stringify({ cpuPercent: 5 }));
    expect(xtrim).toHaveBeenCalledWith("metrics:host", "MINID", "~", expect.any(Number));
    expect(expire).toHaveBeenCalledWith("metrics:host", expect.any(Number));
    expect(exec).toHaveBeenCalledOnce();
  });
});
