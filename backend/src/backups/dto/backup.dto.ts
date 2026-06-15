import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

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
