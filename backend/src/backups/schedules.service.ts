import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { desc, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { backupSchedules } from "../db/schema";
import { BackupError, BackupsService } from "./backups.service";

export type BackupSchedule = typeof backupSchedules.$inferSelect;

export interface CreateScheduleInput {
  target: string;
  cron: string;
  retention?: number;
  deploymentId?: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Cron-driven volume backups with retention. Each enabled schedule registers a CronJob that, on
// tick, enqueues a backup of its target and prunes that target to the newest `retention` archives.
@Injectable()
export class BackupSchedulesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupSchedulesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly registry: SchedulerRegistry,
    private readonly backups: BackupsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const schedule of await this.list()) {
      if (schedule.enabled) {
        this.register(schedule);
      }
    }
  }

  list(deploymentId?: string): Promise<BackupSchedule[]> {
    if (deploymentId) {
      return this.db
        .select()
        .from(backupSchedules)
        .where(eq(backupSchedules.deploymentId, deploymentId))
        .orderBy(desc(backupSchedules.createdAt));
    }

    return this.db.select().from(backupSchedules).orderBy(desc(backupSchedules.createdAt));
  }

  async create(input: CreateScheduleInput): Promise<BackupSchedule> {
    this.assertValidCron(input.cron);

    const [row] = await this.db
      .insert(backupSchedules)
      .values({
        kind: "VOLUME_TAR",
        target: input.target,
        cron: input.cron,
        ...(input.retention !== undefined ? { retention: input.retention } : {}),
        ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      })
      .returning();

    if (!row) {
      throw new BackupError("Failed to create schedule");
    }

    this.register(row);

    return row;
  }

  async setEnabled(id: string, enabled: boolean): Promise<BackupSchedule> {
    const [row] = await this.db
      .update(backupSchedules)
      .set({ enabled })
      .where(eq(backupSchedules.id, id))
      .returning();

    if (!row) {
      throw new BackupError(`Schedule ${id} not found`);
    }

    if (enabled) {
      this.register(row);
    } else {
      this.unregister(id);
    }

    return row;
  }

  async remove(id: string): Promise<void> {
    this.unregister(id);
    await this.db.delete(backupSchedules).where(eq(backupSchedules.id, id));
  }

  private register(schedule: BackupSchedule): void {
    this.unregister(schedule.id);

    const job = new CronJob(schedule.cron, () => void this.run(schedule.id));
    // SchedulerRegistry types its CronJob against @nestjs/schedule's bundled `cron`, whose generic
    // params differ from the `cron` package we construct from; the cast bridges that mismatch.
    this.registry.addCronJob(this.jobName(schedule.id), job as unknown as CronJob);
    job.start();
  }

  private unregister(id: string): void {
    try {
      this.registry.deleteCronJob(this.jobName(id));
    } catch {
      // Not registered — nothing to remove.
    }
  }

  private async run(id: string): Promise<void> {
    const [schedule] = await this.db
      .select()
      .from(backupSchedules)
      .where(eq(backupSchedules.id, id));

    if (!schedule || !schedule.enabled) {
      return;
    }

    try {
      await this.backups.create({
        kind: "VOLUME_TAR",
        target: schedule.target,
        ...(schedule.deploymentId ? { deploymentId: schedule.deploymentId } : {}),
      });
      this.backups.schedulePrune(schedule.target, schedule.retention);
      await this.db
        .update(backupSchedules)
        .set({ lastRunAt: new Date() })
        .where(eq(backupSchedules.id, id));
    } catch (error) {
      this.logger.warn(`scheduled backup ${id} failed: ${describeError(error)}`);
    }
  }

  private assertValidCron(expression: string): void {
    try {
      // Constructing validates the expression without starting it.
      new CronJob(expression, () => undefined);
    } catch {
      throw new BadRequestException(`Invalid cron expression: ${expression}`);
    }
  }

  private jobName(id: string): string {
    return `backup:${id}`;
  }
}
