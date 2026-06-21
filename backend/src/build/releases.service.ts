import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { requireRow } from "../db/query-helpers";
import { releases } from "../db/schema";
import { TasksService } from "../tasks/tasks.service";

export type Release = typeof releases.$inferSelect;
export type ReleaseStatus = Release["status"];

export interface ReleaseUpdate {
  gitSha?: string;
  imageTag?: string;
  containerId?: string;
  composeProject?: string;
  errorMessage?: string;
}

const TERMINAL: ReleaseStatus[] = ["LIVE", "FAILED", "ROLLEDBACK", "SUPERSEDED", "INTERRUPTED"];

// A release in a terminal state can produce no further build-log lines, so its log stream can end.
export function isTerminalReleaseStatus(status: ReleaseStatus): boolean {
  return TERMINAL.includes(status);
}

// Coarse progress for the activity tracker — deploys don't report finer granularity than their
// release phase.
const PROGRESS: Partial<Record<ReleaseStatus, number>> = {
  QUEUED: 5,
  CLONING: 20,
  BUILDING: 50,
  HEALTHCHECKING: 85,
};

@Injectable()
export class ReleasesService {
  // releaseId → activity task id, so status transitions can drive the task's progress/outcome.
  private readonly taskByRelease = new Map<string, string>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tasks: TasksService,
  ) {}

  async create(deploymentId: string, createdById?: string): Promise<Release> {
    const rows = await this.db
      .insert(releases)
      .values({ deploymentId, createdById: createdById ?? null })
      .returning();

    const release = requireRow(rows, "release insert returned no row");

    const task = await this.tasks.create({
      kind: "DEPLOY",
      title: "Deploy",
      deploymentId,
      actorId: createdById ?? null,
      progress: PROGRESS.QUEUED ?? null,
    });
    this.taskByRelease.set(release.id, task.id);
    await this.tasks.start(task.id);

    return release;
  }

  async setStatus(id: string, status: ReleaseStatus, update: ReleaseUpdate = {}): Promise<void> {
    const fields: Partial<typeof releases.$inferInsert> = { status, ...update };

    if (status === "BUILDING") {
      fields.startedAt = new Date();
    }

    if (TERMINAL.includes(status)) {
      fields.finishedAt = new Date();
    }

    await this.db.update(releases).set(fields).where(eq(releases.id, id));
    await this.updateTask(id, status, update.errorMessage);
  }

  // Best-effort: the activity task mirrors the deploy, so a bookkeeping failure here must never
  // reject setStatus and break the deploy pipeline (or tear down its live log stream).
  private async updateTask(
    releaseId: string,
    status: ReleaseStatus,
    errorMessage?: string,
  ): Promise<void> {
    const taskId = this.taskByRelease.get(releaseId);

    if (!taskId) {
      return;
    }

    try {
      if (status === "LIVE") {
        this.taskByRelease.delete(releaseId);
        await this.tasks.succeed(taskId);
      } else if (status === "FAILED" || status === "INTERRUPTED") {
        this.taskByRelease.delete(releaseId);
        await this.tasks.fail(taskId, errorMessage ?? "Deploy failed");
      } else if (TERMINAL.includes(status)) {
        // SUPERSEDED / ROLLEDBACK — the deploy didn't fail, it was replaced; close it out quietly.
        this.taskByRelease.delete(releaseId);
        await this.tasks.succeed(taskId);
      } else if (PROGRESS[status] !== undefined) {
        await this.tasks.setProgress(taskId, PROGRESS[status]);
      }
    } catch {
      this.taskByRelease.delete(releaseId);
    }
  }

  async findById(id: string): Promise<Release | undefined> {
    const rows = await this.db.select().from(releases).where(eq(releases.id, id)).limit(1);

    return rows[0];
  }

  // Builds that were mid-flight when the process died can never resume — flag them so they
  // don't sit "in progress" forever. Called once on boot by the reconciler.
  async markInterrupted(): Promise<void> {
    await this.db
      .update(releases)
      .set({ status: "INTERRUPTED", finishedAt: new Date() })
      .where(inArray(releases.status, ["QUEUED", "CLONING", "BUILDING", "HEALTHCHECKING"]));
  }

  listForDeployment(deploymentId: string): Promise<Release[]> {
    return this.db
      .select()
      .from(releases)
      .where(eq(releases.deploymentId, deploymentId))
      .orderBy(desc(releases.createdAt));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(releases).where(eq(releases.id, id));
  }
}
