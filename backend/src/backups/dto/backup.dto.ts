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

  @ApiProperty({ type: String, nullable: true })
  offsiteUrl!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  finishedAt!: string | null;
}

const DESTINATION_TYPES = ["S3", "FTP", "SFTP", "SSH"] as const;
type DestinationType = (typeof DESTINATION_TYPES)[number];

export class BackupDestinationDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: DESTINATION_TYPES })
  type!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export class CreateBackupDestinationDto {
  @ApiProperty({ type: String, example: "offsite-s3" })
  @IsString()
  name!: string;

  @ApiProperty({ enum: DESTINATION_TYPES })
  @IsIn(DESTINATION_TYPES)
  type!: DestinationType;

  // S3 fields.
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  bucket?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ type: String, example: "https://s3.example.com" })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  accessKeyId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  secretAccessKey?: string;

  // FTP / SFTP fields.
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  port?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  path?: string;

  // SSH only: a PEM private key (git-over-ssh style); alternative to password.
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  privateKey?: string;
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

export class NetworkInfoDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;
}

export class DeclaredHealthcheckDto {
  @ApiProperty({ type: [String], example: ["CMD-SHELL", "curl -f http://localhost/health"] })
  test!: string[];

  @ApiProperty({ type: String, nullable: true, example: "30s" })
  interval!: string | null;

  @ApiProperty({ type: String, nullable: true, example: "10s" })
  timeout!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 3 })
  retries!: number | null;

  @ApiProperty({ type: String, nullable: true, example: "5s" })
  startPeriod!: string | null;
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

  @ApiProperty({ type: String, nullable: true })
  service!: string | null;

  @ApiProperty({ type: [NetworkInfoDto] })
  networks!: NetworkInfoDto[];

  @ApiProperty({ type: [Number] })
  exposedPorts!: number[];

  @ApiProperty({ type: String, nullable: true, example: "healthy" })
  health!: string | null;

  @ApiProperty({ type: DeclaredHealthcheckDto, nullable: true })
  declaredHealthcheck!: DeclaredHealthcheckDto | null;
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
