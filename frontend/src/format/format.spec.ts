import { describe, expect, it } from "vitest";
import { displayName, formatBytes, formatPercent, humanizeRole, humanizeType } from ".";

describe("formatBytes", () => {
  it("scales into the largest fitting unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("renders an em dash for empty values", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("rounds to one decimal and appends a percent sign", () => {
    expect(formatPercent(12)).toBe("12%");
    expect(formatPercent(12.34)).toBe("12.3%");
  });

  it("renders an em dash when no value is available", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("keeps a real zero distinct from a missing value", () => {
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("humanizeRole / humanizeType", () => {
  it("title-cases SCREAMING_CASE values", () => {
    expect(humanizeRole("ADMIN")).toBe("Admin");
    expect(humanizeRole("USER")).toBe("User");
    expect(humanizeType("WEB")).toBe("Web");
    expect(humanizeType("CRON")).toBe("Cron");
    expect(humanizeType("WORKER")).toBe("Worker");
  });
});

describe("displayName", () => {
  it("prefers the name when set", () => {
    expect(displayName({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("Ada Lovelace");
  });

  it("falls back to the email when the name is missing or blank", () => {
    expect(displayName({ name: null, email: "ada@example.com" })).toBe("ada@example.com");
    expect(displayName({ name: "   ", email: "ada@example.com" })).toBe("ada@example.com");
    expect(displayName({ email: "ada@example.com" })).toBe("ada@example.com");
  });
});
