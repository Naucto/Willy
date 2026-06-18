import { ApiProperty } from "@nestjs/swagger";
import type { Task } from "../tasks.service";

export class TaskDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({
    enum: [
      "DEPLOY",
      "BACKUP",
      "RESTORE",
      "OFFSITE_PUSH",
      "VOLUME_RESET",
      "PRUNE_IMAGES",
      "PRUNE_CONTAINERS",
    ],
  })
  kind!: Task["kind"];

  @ApiProperty({ enum: ["PENDING", "RUNNING", "SUCCESS", "FAILED"] })
  status!: Task["status"];

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  deploymentId!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "0–100, or null when indeterminate." })
  progress!: number | null;

  @ApiProperty({ type: String, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;
}

export function toTaskDto(row: Task): TaskDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    deploymentId: row.deploymentId,
    progress: row.progress,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
