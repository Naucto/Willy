import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertValidCron } from "./cron";

describe("assertValidCron", () => {
  it("accepts valid 5-field expressions", () => {
    expect(() => assertValidCron("0 3 * * *")).not.toThrow();
    expect(() => assertValidCron("*/5 * * * *")).not.toThrow();
    expect(() => assertValidCron("0 3 * * 1-5")).not.toThrow();
  });

  it("throws BadRequestException on malformed expressions", () => {
    expect(() => assertValidCron("not a cron")).toThrow(BadRequestException);
    expect(() => assertValidCron("99 99 * * *")).toThrow(BadRequestException);
    expect(() => assertValidCron("")).toThrow(BadRequestException);
  });
});
