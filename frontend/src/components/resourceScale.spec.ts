import { describe, expect, it } from "vitest";
import { cpuMarks, cpuMax, memoryMarks, memoryMaxMb } from "./resourceScale";

describe("resourceScale", () => {
  it("rounds host memory down to whole GB, falling back when unknown", () => {
    expect(memoryMaxMb(8192)).toBe(8192);
    expect(memoryMaxMb(7800)).toBe(7168); // 7.6G → 7G
    expect(memoryMaxMb(0)).toBe(4096);
    expect(memoryMaxMb(undefined)).toBe(4096);
    expect(memoryMaxMb(512)).toBe(4096); // below 1G → fallback
  });

  it("builds memory marks ending exactly at the ceiling with no duplicates", () => {
    const marks = memoryMarks(memoryMaxMb(16384));
    expect(marks[0]).toEqual({ value: 0, label: "Off" });
    expect(marks.at(-1)).toEqual({ value: 16384, label: "16G" });
    const values = marks.map((m) => m.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("caps small hosts cleanly", () => {
    expect(memoryMarks(2048)).toEqual([
      { value: 0, label: "Off" },
      { value: 1024, label: "1G" },
      { value: 2048, label: "2G" },
    ]);
  });

  it("derives the CPU ceiling and marks from host cores", () => {
    expect(cpuMax(4)).toBe(4);
    expect(cpuMax(0)).toBe(8);
    expect(cpuMax(undefined)).toBe(8);
    expect(cpuMarks(4)).toEqual([
      { value: 0, label: "Off" },
      { value: 1, label: "1" },
      { value: 2, label: "2" },
      { value: 3, label: "3" },
      { value: 4, label: "4" },
    ]);
    expect(cpuMarks(8).at(-1)).toEqual({ value: 8, label: "8" });
  });
});
