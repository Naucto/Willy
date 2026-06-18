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
