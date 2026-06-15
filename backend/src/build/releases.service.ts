import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import { DatabaseError } from "../common/errors";
import { DB, type Database } from "../db/db.module";
import { releases } from "../db/schema";

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

@Injectable()
export class ReleasesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(deploymentId: string, createdById?: string): Promise<Release> {
    const rows = await this.db
      .insert(releases)
      .values({ deploymentId, createdById: createdById ?? null })
      .returning();

    const release = rows[0];

    if (!release) {
      throw new DatabaseError("release insert returned no row");
    }

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
