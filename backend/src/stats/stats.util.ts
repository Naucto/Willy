// Pure helpers turning raw Docker stats snapshots into the numbers the panel shows. Kept free of
// dockerode so they can be unit-tested directly.

export interface CpuSnapshot {
  cpu_usage: { total_usage: number };
  system_cpu_usage: number;
  online_cpus?: number;
}

export interface MemSnapshot {
  usage: number;
  limit: number;
  // cgroup stat bag (cache/swap/…); keyed loosely since fields differ across cgroup v1/v2.
  stats?: Record<string, number>;
}

// Docker's own CPU% formula: the container's CPU-time delta over the system CPU-time delta, scaled
// by the number of cores. Returns 0 on the first sample (no previous delta) or when idle.
export function cpuPercent(current: CpuSnapshot, previous: CpuSnapshot): number {
  const cpuDelta = current.cpu_usage.total_usage - previous.cpu_usage.total_usage;
  const systemDelta = current.system_cpu_usage - previous.system_cpu_usage;
  const cores = current.online_cpus || 1;

  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  return Math.round((cpuDelta / systemDelta) * cores * 1000) / 10;
}

// Real RSS excludes the page cache (Docker's own "MEM USAGE" subtracts it); swap is best-effort
// since cgroup v2 may not report it.
export function memUsage(mem: MemSnapshot): {
  usageBytes: number;
  limitBytes: number;
  swapBytes: number;
} {
  const cache = mem.stats?.cache ?? mem.stats?.total_inactive_file ?? mem.stats?.inactive_file ?? 0;

  return {
    usageBytes: Math.max(0, mem.usage - cache),
    limitBytes: mem.limit,
    swapBytes: mem.stats?.swap ?? 0,
  };
}

// Per-interface network counters Docker reports under `networks`; only the byte totals interest us.
export interface NetSnapshot {
  rx_bytes?: number;
  tx_bytes?: number;
}

// One row of Docker's blkio recursive accounting: a device + operation (Read/Write/Sync/Async/…).
export interface BlkioEntry {
  op?: string;
  value?: number;
}

export interface BlkioSnapshot {
  io_service_bytes_recursive?: BlkioEntry[];
}

// Sum rx/tx across every attached interface. Counters are cumulative since container start.
export function netBytes(networks: Record<string, NetSnapshot> | undefined): {
  rxBytes: number;
  txBytes: number;
} {
  let rxBytes = 0;
  let txBytes = 0;

  for (const net of Object.values(networks ?? {})) {
    rxBytes += net.rx_bytes ?? 0;
    txBytes += net.tx_bytes ?? 0;
  }

  return { rxBytes, txBytes };
}

// Sum read/write bytes from the recursive blkio table. May be empty under cgroup v2 — degrade to 0.
export function blkioBytes(blkio: BlkioSnapshot | undefined): {
  readBytes: number;
  writeBytes: number;
} {
  let readBytes = 0;
  let writeBytes = 0;

  for (const entry of blkio?.io_service_bytes_recursive ?? []) {
    const op = entry.op?.toLowerCase();

    if (op === "read") {
      readBytes += entry.value ?? 0;
    } else if (op === "write") {
      writeBytes += entry.value ?? 0;
    }
  }

  return { readBytes, writeBytes };
}

// Per-second rate between two cumulative readings. Clamps negatives to 0 so a counter reset (restart
// or a changing container set) reads as a momentary lull rather than a huge negative spike.
export function rate(current: number, previous: number, elapsedSec: number): number {
  if (elapsedSec <= 0) {
    return 0;
  }

  return Math.max(0, current - previous) / elapsedSec;
}

// Time windows the history endpoints accept, smallest (sparklines) to largest (full charts).
export enum StatsWindow {
  FifteenMinutes = "15m",
  OneHour = "1h",
  SixHours = "6h",
  TwentyFourHours = "24h",
}

const WINDOW_MS: Record<StatsWindow, number> = {
  [StatsWindow.FifteenMinutes]: 15 * 60 * 1000,
  [StatsWindow.OneHour]: 60 * 60 * 1000,
  [StatsWindow.SixHours]: 6 * 60 * 60 * 1000,
  [StatsWindow.TwentyFourHours]: 24 * 60 * 60 * 1000,
};

export function windowToMs(window: StatsWindow): number {
  return WINDOW_MS[window];
}
