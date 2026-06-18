import { ApiProperty } from "@nestjs/swagger";
import type { AuditEntry } from "../audit.service";

export class AuditLogDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  actorId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Acting user's email, if known." })
  actorEmail!: string | null;

  @ApiProperty({ type: String })
  action!: string;

  @ApiProperty({ type: String, nullable: true })
  targetType!: string | null;

  @ApiProperty({ type: String, nullable: true })
  targetId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export function toAuditLogDto(row: AuditEntry): AuditLogDto {
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  };
}
