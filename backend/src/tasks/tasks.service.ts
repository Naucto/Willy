import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { tasks } from "../db/schema";

export type Task = typeof tasks.$inferSelect;
export type TaskKind = Task["kind"];

export interface CreateTaskInput {
  kind: TaskKind;
  title: string;
  deploymentId?: string | null;
  backupId?: string | null;
  actorId?: string | null;
  // Omit (or null) for operations that can't report determinate progress — the UI shows an
  // indeterminate bar.
  progress?: number | null;
}

export interface ListTasksOptions {
  scope: "active" | "recent";
  deploymentId?: string;
}

const ACTIVE_STATUSES = ["PENDING", "RUNNING"] as const;

@Injectable()
export class TasksService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: CreateTaskInput): Promise<Task> {
    const [row] = await this.db
      .insert(tasks)
      .values({
        kind: input.kind,
        title: input.title,
        deploymentId: input.deploymentId ?? null,
        backupId: input.backupId ?? null,
        actorId: input.actorId ?? null,
        progress: input.progress ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create task");
    }

    return row;
  }

  async start(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: "RUNNING", startedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async setProgress(id: string, progress: number): Promise<void> {
    await this.db
      .update(tasks)
      .set({ progress: Math.max(0, Math.min(100, Math.round(progress))) })
      .where(eq(tasks.id, id));
  }

  async succeed(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: "SUCCESS", progress: 100, finishedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async fail(id: string, errorMessage: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: "FAILED", errorMessage: errorMessage.slice(0, 500), finishedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  // Wrap a synchronous-ish operation: create → start → run → succeed/fail. Returns the work result;
  // re-throws so the caller's own error handling still applies.
  async track<T>(input: CreateTaskInput, work: () => Promise<T>): Promise<T> {
    const task = await this.create(input);
    await this.start(task.id);

    try {
      const result = await work();
      await this.succeed(task.id);

      return result;
    } catch (error) {
      await this.fail(task.id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // Tasks left mid-flight by a restart can never resume — fail them so the activity tracker doesn't
  // show them spinning forever. Called once on boot by the reconciler.
  async markInterrupted(): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: "FAILED", errorMessage: "Interrupted by restart", finishedAt: new Date() })
      .where(inArray(tasks.status, [...ACTIVE_STATUSES]));
  }

  // Clearing only removes finished rows — a running task can't be dismissed (it would leave the
  // underlying operation orphaned with no visible trace).
  async clear(id: string): Promise<void> {
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

    if (!row) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    if ((ACTIVE_STATUSES as readonly string[]).includes(row.status)) {
      throw new ConflictException("Cannot clear a task that is still running");
    }

    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  async clearFinished(): Promise<void> {
    await this.db.delete(tasks).where(notInArray(tasks.status, [...ACTIVE_STATUSES]));
  }

  list({ scope, deploymentId }: ListTasksOptions): Promise<Task[]> {
    const scoped = deploymentId ? eq(tasks.deploymentId, deploymentId) : undefined;

    if (scope === "active") {
      return this.db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.status, [...ACTIVE_STATUSES]), scoped))
        .orderBy(desc(tasks.createdAt));
    }

    return this.db.select().from(tasks).where(scoped).orderBy(desc(tasks.createdAt)).limit(50);
  }
}
