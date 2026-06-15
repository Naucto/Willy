import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { cronRuns } from "../db/schema";

export type CronRun = typeof cronRuns.$inferSelect;

export interface CronRunResult {
  status: CronRun["status"];
  exitCode: number | null;
  logs: string;
}

// Run history for CRON deployments — one row per scheduled (or manual) execution.
@Injectable()
export class CronRunsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async start(deploymentId: string): Promise<CronRun> {
    const [row] = await this.db.insert(cronRuns).values({ deploymentId }).returning();

    if (!row) {
      throw new Error("failed to record cron run");
    }

    return row;
  }

  async finish(id: string, result: CronRunResult): Promise<void> {
    await this.db
      .update(cronRuns)
      .set({
        status: result.status,
        exitCode: result.exitCode,
        logs: result.logs,
        finishedAt: new Date(),
      })
      .where(eq(cronRuns.id, id));
  }

  listForDeployment(deploymentId: string, limit = 50): Promise<CronRun[]> {
    return this.db
      .select()
      .from(cronRuns)
      .where(eq(cronRuns.deploymentId, deploymentId))
      .orderBy(desc(cronRuns.startedAt))
      .limit(limit);
  }
}
