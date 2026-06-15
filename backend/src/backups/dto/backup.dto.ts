import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

const BACKUP_KINDS = ["VOLUME_TAR", "PG_DUMP", "S3_SYNC"] as const;
type BackupKind = (typeof BACKUP_KINDS)[number];

export class BackupDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  deploymentId!: string | null;

  @ApiProperty({ enum: BACKUP_KINDS })
  kind!: string;

  @ApiProperty({ enum: ["PENDING", "RUNNING", "SUCCESS", "FAILED"] })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  target!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  sizeBytes!: number | null;

  @ApiProperty({ type: String, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;
}

export class VolumesDto {
  @ApiProperty({ type: [String] })
  volumes!: string[];
}

export class BackupScheduleDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  deploymentId!: string | null;

  @ApiProperty({ type: String })
  target!: string;

  @ApiProperty({ type: String })
  cron!: string;

  @ApiProperty({ type: Number })
  retention!: number;

  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  lastRunAt!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export class CreateBackupScheduleDto {
  @ApiProperty({ type: String, example: "willy_blog_data" })
  @IsString()
  target!: string;

  @ApiProperty({ type: String, example: "0 3 * * *" })
  @IsString()
  cron!: string;

  @ApiPropertyOptional({ type: Number, example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  retention?: number;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  deploymentId?: string;
}

export class UpdateBackupScheduleDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  enabled!: boolean;
}

export class VolumeMountDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  destination!: string;

  @ApiProperty({ type: Boolean })
  rw!: boolean;
}

export class ContainerDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  image!: string;

  @ApiProperty({ type: Boolean })
  running!: boolean;

  @ApiProperty({ type: [VolumeMountDto] })
  volumes!: VolumeMountDto[];
}

export class CreateBackupDto {
  @ApiProperty({ enum: BACKUP_KINDS })
  @IsIn(BACKUP_KINDS)
  kind!: BackupKind;

  @ApiProperty({ type: String, example: "willy_compose-blog_data" })
  @IsString()
  target!: string;

  @ApiPropertyOptional({ type: String, format: "uuid" })
  @IsOptional()
  @IsUUID()
  deploymentId?: string;
}
