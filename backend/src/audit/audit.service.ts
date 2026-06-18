import { Inject, Injectable, Logger } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { auditLogs, users } from "../db/schema";
import { DB, type Database } from "../db/db.module";

export type AuditLog = typeof auditLogs.$inferSelect;
export type AuditAction = AuditLog["action"];

export interface RecordAuditInput {
  actorId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface AuditEntry extends AuditLog {
  actorEmail: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  // Best-effort: an audit write must never break the operation it records.
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? null,
        ip: input.ip ?? null,
      });
    } catch (error) {
      this.logger.warn(`failed to record audit ${input.action}: ${String(error)}`);
    }
  }

  async list(limit = 200): Promise<AuditEntry[]> {
    const rows = await this.db
      .select({ audit: auditLogs, actorEmail: users.email })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows.map((row) => ({ ...row.audit, actorEmail: row.actorEmail }));
  }
}
