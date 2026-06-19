import type { StatsWindow } from "../api/types";

// Matches the backend sampler cadence (backend/src/stats/stats-sampler.service.ts). Used to detect
// downtime: a gap wider than a few intervals means Willy wasn't recording, so the line should break.
export const SAMPLE_INTERVAL_MS = 15_000;

const GAP_FACTOR = 2.5;

const WINDOW_MS: Record<StatsWindow, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

export function windowToMs(window: StatsWindow): number {
  return WINDOW_MS[window];
}

// Builds the chart timeline, inserting a `null` row wherever consecutive samples are further apart
// than a few sample intervals. Because the x-axis is time-scaled, that null breaks the line and the
// empty span is proportional to the real elapsed (downtime) gap.
export function buildGapRows<T extends { ts: number }>(
  samples: T[],
  intervalMs: number = SAMPLE_INTERVAL_MS,
): { times: number[]; rows: (T | null)[] } {
  const times: number[] = [];
  const rows: (T | null)[] = [];
  let prev: number | null = null;

  for (const sample of samples) {
    if (prev !== null && sample.ts - prev > intervalMs * GAP_FACTOR) {
      times.push(prev + intervalMs);
      rows.push(null);
    }

    times.push(sample.ts);
    rows.push(sample);
    prev = sample.ts;
  }

  return { times, rows };
}
