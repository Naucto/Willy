import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { type Readable, pipeline } from "node:stream";
import { promisify } from "node:util";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq } from "drizzle-orm";
import { WillyError } from "../common/errors";
import { DB, type Database } from "../db/db.module";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";
import { backups } from "../db/schema";
import { BackupQueue } from "./backup-queue";
import { ContainersService } from "./containers.service";
import {
  BackupDestinationsService,
  type DestinationConfig,
  type DestinationType,
} from "./destinations.service";
import { OffsiteService } from "./offsite/offsite.service";

export class BackupError extends WillyError {}

const streamPipeline = promisify(pipeline);

export type Backup = typeof backups.$inferSelect;

export interface CreateBackupInput {
  kind: Backup["kind"];
  target: string;
  deploymentId?: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Backups run as throwaway helper containers that write artifacts into the willy_backups volume,
// which is also mounted into this server so it can size/checksum/stream/delete them. VOLUME_TAR
// tars a named volume; S3_SYNC (offsite) comes next. Direct database dumps are intentionally out
// of scope — apps persist through volumes, which the volume backup already covers.
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly dir: string;
  private readonly volume: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly docker: DockerService,
    private readonly queue: BackupQueue,
    private readonly deployments: DeploymentsService,
    private readonly containers: ContainersService,
    private readonly destinations: BackupDestinationsService,
    private readonly offsite: OffsiteService,
    config: ConfigService,
  ) {
    this.dir = config.get<string>("BACKUPS_DIR") ?? "/var/lib/willy/backups";
    this.volume = config.get<string>("BACKUPS_VOLUME") ?? "willy_backups";
  }

  listVolumes(): Promise<string[]> {
    return this.docker.listVolumes();
  }

  list(): Promise<Backup[]> {
    return this.db.select().from(backups).orderBy(desc(backups.createdAt));
  }

  async get(id: string): Promise<Backup> {
    const [row] = await this.db.select().from(backups).where(eq(backups.id, id));

    if (!row) {
      throw new NotFoundException(`Backup ${id} not found`);
    }

    return row;
  }

  // Records the backup as PENDING and returns immediately; the artifact is produced in the
  // background so the request doesn't block on the helper container.
  async create(input: CreateBackupInput): Promise<Backup> {
    if (input.kind !== "VOLUME_TAR") {
      throw new BackupError(`Backup kind ${input.kind} is not supported yet`);
    }

    const [row] = await this.db
      .insert(backups)
      .values({
        kind: input.kind,
        target: input.target,
        status: "PENDING",
        ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      })
      .returning();

    if (!row) {
      throw new BackupError("Failed to record backup");
    }

    this.queue.enqueue(input.target, () => this.runVolumeTar(row.id, input.target));

    return row;
  }

  // Prune a target's SUCCESS backups down to the newest `keep`, deleting artifacts + rows.
  schedulePrune(target: string, keep: number): void {
    this.queue.enqueue(target, () => this.pruneTarget(target, keep));
  }

  // Probes a destination's connectivity + credentials before it's saved (delegated to the driver).
  testConnection(type: DestinationType, config: DestinationConfig): Promise<void> {
    return this.offsite.test(type, config);
  }

  // Push a finished artifact to an offsite destination (S3 / FTP / SFTP / SSH). Runs in the
  // background; offsiteUrl is set on success.
  async pushOffsite(backupId: string, destinationId: string): Promise<void> {
    const backup = await this.get(backupId);

    if (backup.status !== "SUCCESS" || !backup.location || !backup.target) {
      throw new BackupError("Backup is not available to push");
    }

    const { type, config } = await this.destinations.resolve(destinationId);
    const { target, location } = backup;

    this.queue.enqueue(target, () => this.runOffsite(backupId, location, type, config));
  }

  async remove(id: string): Promise<void> {
    const row = await this.get(id);

    if (row.location) {
      await unlink(join(this.dir, row.location)).catch(() => undefined);
    }

    await this.db.delete(backups).where(eq(backups.id, id));
  }

  async openDownload(id: string): Promise<{ stream: Readable; filename: string }> {
    const row = await this.get(id);

    if (row.status !== "SUCCESS" || !row.location) {
      throw new BackupError("Backup is not available for download");
    }

    return { stream: createReadStream(join(this.dir, row.location)), filename: row.location };
  }

  // Restore an artifact back into the volume it came from, on the deployment it belongs to.
  async restore(id: string): Promise<void> {
    const row = await this.get(id);

    if (row.status !== "SUCCESS" || !row.location || !row.target || !row.deploymentId) {
      throw new BackupError("Backup cannot be restored (missing artifact, volume, or deployment)");
    }

    const deployment = await this.requireDeployment(row.deploymentId);
    const { target, location } = row;

    this.queue.enqueue(target, () => this.runVolumeOp(deployment, target, location));
  }

  // Wipe a deployment volume back to empty.
  async resetVolume(deploymentId: string, volume: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);

    this.queue.enqueue(volume, () => this.runVolumeOp(deployment, volume));
  }

  private async runVolumeTar(id: string, target: string): Promise<void> {
    const file = `${id}.tar.gz`;

    await this.db
      .update(backups)
      .set({ status: "RUNNING", startedAt: new Date() })
      .where(eq(backups.id, id));

    try {
      const result = await this.docker.runToCompletion({
        image: "alpine:3.20",
        binds: [`${target}:/data:ro`, `${this.volume}:/backup`],
        command: ["sh", "-c", `tar -czf /backup/${file} -C /data .`],
      });

      if (result.exitCode !== 0) {
        throw new BackupError(`tar exited ${result.exitCode}: ${result.logs.slice(0, 300)}`);
      }

      const { size, checksum } = await this.measure(file);

      await this.db
        .update(backups)
        .set({
          status: "SUCCESS",
          location: file,
          sizeBytes: size,
          checksum,
          finishedAt: new Date(),
        })
        .where(eq(backups.id, id));
    } catch (error) {
      this.logger.warn(`backup ${id} failed: ${describeError(error)}`);
      await this.db
        .update(backups)
        .set({ status: "FAILED", errorMessage: describeError(error), finishedAt: new Date() })
        .where(eq(backups.id, id));
    }
  }

  private async runOffsite(
    id: string,
    file: string,
    type: DestinationType,
    config: DestinationConfig,
  ): Promise<void> {
    try {
      const url = await this.offsite.push(type, file, config);
      await this.db.update(backups).set({ offsiteUrl: url }).where(eq(backups.id, id));
    } catch (error) {
      this.logger.warn(`offsite push ${id} failed: ${describeError(error)}`);
    }
  }

  private async pruneTarget(target: string, keep: number): Promise<void> {
    const rows = await this.db
      .select()
      .from(backups)
      .where(and(eq(backups.target, target), eq(backups.status, "SUCCESS")))
      .orderBy(desc(backups.createdAt));

    for (const row of rows.slice(Math.max(keep, 0))) {
      await this.remove(row.id).catch((error) =>
        this.logger.warn(`prune ${row.id} failed: ${describeError(error)}`),
      );
    }
  }

  // Stop the containers using the volume, wipe it (and optionally extract an archive into it),
  // then start them again — so a live container never sees a half-written volume.
  private async runVolumeOp(
    deployment: Deployment,
    volume: string,
    restoreFile?: string,
  ): Promise<void> {
    const ids = await this.containers.containersUsingVolume(deployment, volume);

    for (const id of ids) {
      await this.docker.stopContainer(id);
    }

    try {
      const command = restoreFile
        ? `find /data -mindepth 1 -delete && tar -xzf /backup/${restoreFile} -C /data`
        : "find /data -mindepth 1 -delete";
      const binds = restoreFile
        ? [`${volume}:/data`, `${this.volume}:/backup:ro`]
        : [`${volume}:/data`];

      const result = await this.docker.runToCompletion({
        image: "alpine:3.20",
        binds,
        command: ["sh", "-c", command],
      });

      if (result.exitCode !== 0) {
        throw new BackupError(`volume op exited ${result.exitCode}: ${result.logs.slice(0, 300)}`);
      }
    } catch (error) {
      this.logger.warn(`volume op on ${volume} failed: ${describeError(error)}`);
    } finally {
      for (const id of ids) {
        await this.docker.startContainer(id).catch(() => undefined);
      }
    }
  }

  private async requireDeployment(id: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(id);

    if (!deployment) {
      throw new BackupError(`Deployment ${id} not found`);
    }

    return deployment;
  }

  private async measure(file: string): Promise<{ size: number; checksum: string }> {
    const path = join(this.dir, file);
    const hash = createHash("sha256");

    await streamPipeline(createReadStream(path), hash);

    return { size: (await stat(path)).size, checksum: hash.digest("hex") };
  }
}
