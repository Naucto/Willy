import { ApiProperty } from "@nestjs/swagger";

const STATUSES = [
  "QUEUED",
  "CLONING",
  "BUILDING",
  "HEALTHCHECKING",
  "LIVE",
  "SUPERSEDED",
  "FAILED",
  "ROLLEDBACK",
  "INTERRUPTED",
] as const;

// OpenAPI projection of a releases row (one build/deploy job).
export class ReleaseDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  deploymentId!: string;

  @ApiProperty({ type: String, nullable: true })
  gitSha!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageTag!: string | null;

  @ApiProperty({ enum: STATUSES })
  status!: (typeof STATUSES)[number];

  @ApiProperty({ type: String, nullable: true })
  containerId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  composeProject!: string | null;

  @ApiProperty({ type: String, nullable: true })
  logPath!: string | null;

  @ApiProperty({ type: String, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  createdById!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  queuedAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}
