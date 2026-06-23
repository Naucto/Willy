import { describe, expect, it } from "vitest";
import { buildCron, type CronPreset, describeCron, isValidCron, parseCron } from "./cron";

const preset = (over: Partial<CronPreset>): CronPreset => ({
  frequency: "daily",
  minute: 0,
  hour: 0,
  weekdays: [1],
  dayOfMonth: 1,
  ...over,
});

describe("buildCron", () => {
  it("renders each frequency to the expected expression", () => {
    expect(buildCron(preset({ frequency: "minute" }))).toBe("* * * * *");
    expect(buildCron(preset({ frequency: "hourly", minute: 15 }))).toBe("15 * * * *");
    expect(buildCron(preset({ frequency: "daily", minute: 0, hour: 3 }))).toBe("0 3 * * *");
    expect(
      buildCron(preset({ frequency: "weekly", minute: 0, hour: 3, weekdays: [1, 2, 3, 4, 5] })),
    ).toBe("0 3 * * 1,2,3,4,5");
    expect(buildCron(preset({ frequency: "monthly", minute: 30, hour: 6, dayOfMonth: 15 }))).toBe(
      "30 6 15 * *",
    );
  });

  it("sorts weekdays and falls back to Sunday when none are selected", () => {
    expect(buildCron(preset({ frequency: "weekly", hour: 9, weekdays: [5, 1, 3] }))).toBe(
      "0 9 * * 1,3,5",
    );
    expect(buildCron(preset({ frequency: "weekly", hour: 9, weekdays: [] }))).toBe("0 9 * * 0");
  });
});

describe("parseCron", () => {
  it("recognises each frequency", () => {
    expect(parseCron("* * * * *")).toMatchObject({ frequency: "minute" });
    expect(parseCron("15 * * * *")).toMatchObject({ frequency: "hourly", minute: 15 });
    expect(parseCron("0 3 * * *")).toMatchObject({ frequency: "daily", minute: 0, hour: 3 });
    expect(parseCron("0 3 * * 1,2,3,4,5")).toMatchObject({
      frequency: "weekly",
      hour: 3,
      weekdays: [1, 2, 3, 4, 5],
    });
    expect(parseCron("30 6 15 * *")).toMatchObject({ frequency: "monthly", dayOfMonth: 15 });
  });

  it("accepts weekday ranges and normalises Sunday (7 → 0)", () => {
    expect(parseCron("0 3 * * 1-5")).toMatchObject({ weekdays: [1, 2, 3, 4, 5] });
    expect(parseCron("0 3 * * 7")).toMatchObject({ weekdays: [0] });
  });

  it("returns null for expressions the builder can't represent", () => {
    expect(parseCron("*/5 * * * *")).toBeNull();
    expect(parseCron("0 3 * * MON")).toBeNull();
    expect(parseCron("0 3 1 * 5")).toBeNull(); // both day-of-month and weekday set
    expect(parseCron("0 0 1 1 *")).toBeNull(); // specific month
    expect(parseCron("0 3 * *")).toBeNull(); // too few fields
    expect(parseCron("")).toBeNull();
  });

  it("round-trips through buildCron", () => {
    for (const expr of [
      "* * * * *",
      "15 * * * *",
      "0 3 * * *",
      "0 3 * * 1,2,3,4,5",
      "30 6 15 * *",
    ]) {
      const parsed = parseCron(expr);
      expect(parsed).not.toBeNull();
      expect(buildCron(parsed as CronPreset)).toBe(expr);
    }
  });
});

describe("describeCron / isValidCron", () => {
  it("describes valid expressions and rejects invalid ones", () => {
    expect(describeCron("0 3 * * *")).toBeTruthy();
    expect(isValidCron("0 3 * * *")).toBe(true);
    expect(describeCron("not a cron")).toBeNull();
    expect(isValidCron("not a cron")).toBe(false);
  });
});
