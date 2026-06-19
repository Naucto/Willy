import { describe, expect, it } from "vitest";
import { buildGapRows, SAMPLE_INTERVAL_MS, windowToMs } from "./chartData";

const at = (ts: number) => ({ ts, v: ts });

describe("buildGapRows", () => {
  it("keeps contiguous samples without inserting gaps", () => {
    const samples = [at(0), at(SAMPLE_INTERVAL_MS), at(2 * SAMPLE_INTERVAL_MS)];
    const { times, rows } = buildGapRows(samples);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row !== null)).toBe(true);
    expect(times).toEqual([0, SAMPLE_INTERVAL_MS, 2 * SAMPLE_INTERVAL_MS]);
  });

  it("inserts a null row across a downtime gap", () => {
    const gapStart = 0;
    const gapEnd = 10 * SAMPLE_INTERVAL_MS; // far beyond the gap threshold
    const { times, rows } = buildGapRows([at(gapStart), at(gapEnd)]);

    // sample, null marker, sample
    expect(rows).toHaveLength(3);
    expect(rows[0]).not.toBeNull();
    expect(rows[1]).toBeNull();
    expect(rows[2]).not.toBeNull();
    // The marker sits one interval after the last good sample, so the hole is proportional.
    expect(times[1]).toBe(gapStart + SAMPLE_INTERVAL_MS);
  });

  it("returns empty arrays for no samples", () => {
    expect(buildGapRows([])).toEqual({ times: [], rows: [] });
  });
});

describe("windowToMs", () => {
  it("maps each window to its duration in milliseconds", () => {
    expect(windowToMs("1h")).toBe(60 * 60 * 1000);
    expect(windowToMs("6h")).toBe(6 * 60 * 60 * 1000);
    expect(windowToMs("24h")).toBe(24 * 60 * 60 * 1000);
  });
});
