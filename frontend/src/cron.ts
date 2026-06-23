import cronstrue from "cronstrue";

export type CronFrequency = "minute" | "hourly" | "daily" | "weekly" | "monthly" | "custom";

// A schedule expressed through the visual builder. `minute`/`hour` are 0-based clock fields;
// `weekdays` are cron weekday numbers (0 = Sunday) used by the weekly frequency; `dayOfMonth`
// (1-31) by the monthly one. Unused fields keep their defaults so switching frequency preserves
// the user's previous time/day choices.
export interface CronPreset {
  frequency: CronFrequency;
  minute: number;
  hour: number;
  weekdays: number[];
  dayOfMonth: number;
}

export const DEFAULT_PRESET: CronPreset = {
  frequency: "daily",
  minute: 0,
  hour: 0,
  weekdays: [1],
  dayOfMonth: 1,
};

export function buildCron(preset: CronPreset): string {
  const { minute, hour, weekdays, dayOfMonth } = preset;

  switch (preset.frequency) {
    case "minute":
      return "* * * * *";
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly": {
      const days = (weekdays.length ? [...weekdays] : [0]).sort((a, b) => a - b).join(",");

      return `${minute} ${hour} * * ${days}`;
    }
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case "custom":
      // Custom schedules are driven by the raw field, never rebuilt from the preset.
      return "";
  }
}

function intField(field: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(field)) {
    return null;
  }

  const n = Number(field);

  return n >= min && n <= max ? n : null;
}

function weekdayNum(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const n = Number(value);

  if (n < 0 || n > 7) {
    return null;
  }

  // cron accepts both 0 and 7 for Sunday; normalise to 0.
  return n === 7 ? 0 : n;
}

function parseWeekdays(field: string): number[] | null {
  const out = new Set<number>();

  for (const part of field.split(",")) {
    const range = part.split("-");

    if (range.length === 1) {
      const n = weekdayNum(range[0]);

      if (n === null) {
        return null;
      }

      out.add(n);
    } else if (range.length === 2) {
      const a = weekdayNum(range[0]);
      const b = weekdayNum(range[1]);

      if (a === null || b === null || a > b) {
        return null;
      }

      for (let i = a; i <= b; i++) {
        out.add(i);
      }
    } else {
      return null;
    }
  }

  return out.size ? [...out].sort((a, b) => a - b) : null;
}

// Maps a raw expression back onto a builder preset, or null when it uses syntax the builder can't
// represent (steps, lists in unexpected fields, named months, …) — the caller then falls back to
// the Custom raw field.
export function parseCron(expr: string): CronPreset | null {
  const parts = expr.trim().split(/\s+/);

  if (parts.length !== 5) {
    return null;
  }

  const [min, hour, dom, month, dow] = parts;

  if (!min || !hour || !dom || !month || !dow || month !== "*") {
    return null;
  }

  if (min === "*" && hour === "*" && dom === "*" && dow === "*") {
    return { ...DEFAULT_PRESET, frequency: "minute" };
  }

  const m = intField(min, 0, 59);

  if (m !== null && hour === "*" && dom === "*" && dow === "*") {
    return { ...DEFAULT_PRESET, frequency: "hourly", minute: m };
  }

  const h = intField(hour, 0, 23);

  if (m === null || h === null) {
    return null;
  }

  if (dom === "*" && dow === "*") {
    return { ...DEFAULT_PRESET, frequency: "daily", minute: m, hour: h };
  }

  if (dom === "*" && dow !== "*") {
    const weekdays = parseWeekdays(dow);

    return weekdays
      ? { ...DEFAULT_PRESET, frequency: "weekly", minute: m, hour: h, weekdays }
      : null;
  }

  if (dow === "*" && dom !== "*") {
    const d = intField(dom, 1, 31);

    return d !== null
      ? { ...DEFAULT_PRESET, frequency: "monthly", minute: m, hour: h, dayOfMonth: d }
      : null;
  }

  return null;
}

export function describeCron(expr: string): string | null {
  try {
    return cronstrue.toString(expr.trim(), { throwExceptionOnParseError: true, verbose: false });
  } catch {
    return null;
  }
}

export function isValidCron(expr: string): boolean {
  return describeCron(expr) !== null;
}
