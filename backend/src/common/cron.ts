import { BadRequestException } from "@nestjs/common";
import { CronJob } from "cron";

// Validates a 5-field cron expression by constructing (but not starting) a CronJob — the `cron`
// package parses and rejects malformed expressions in its constructor. Throws a 400 so callers
// surface the problem to the user instead of failing silently at scheduler-registration time.
export function assertValidCron(expression: string): void {
  try {
    new CronJob(expression, () => undefined);
  } catch {
    throw new BadRequestException(`Invalid cron expression: ${expression}`);
  }
}
