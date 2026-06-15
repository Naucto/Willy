import { ApiProperty } from "@nestjs/swagger";

// OpenAPI projection of a cron_runs row (one scheduled/manual CRON execution).
export class CronRunDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  deploymentId!: string;

  @ApiProperty({ enum: ["RUNNING", "SUCCESS", "FAILED"] })
  status!: string;

  @ApiProperty({ type: Number, nullable: true })
  exitCode!: number | null;

  @ApiProperty({ type: String, nullable: true })
  logs!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  startedAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;
}
