import { plainToInstance } from "class-transformer";
import { IsInt, IsOptional, IsString, MinLength, validateSync } from "class-validator";
import { ConfigError } from "../common/errors";

export class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  // 32 bytes encoded as hex (64 chars) — validated precisely in CryptoService.
  @IsString()
  @MinLength(32)
  WILLY_MASTER_KEY!: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsOptional()
  @IsString()
  DOCKER_PROXY_HOST?: string;

  @IsOptional()
  @IsInt()
  DOCKER_PROXY_PORT?: number;

  @IsOptional()
  @IsString()
  WILLY_ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  WILLY_ADMIN_PASSWORD?: string;

  @IsOptional()
  @IsString()
  BASE_DOMAIN?: string;

  // Where backup artifacts live inside willy-server (the willy_backups volume) + the volume name
  // that backup helper containers bind by.
  @IsOptional()
  @IsString()
  BACKUPS_DIR?: string;

  @IsOptional()
  @IsString()
  BACKUPS_VOLUME?: string;

  // Per-container log rotation (json-file driver). Defaults: 10m / 3 files.
  @IsOptional()
  @IsString()
  LOG_MAX_SIZE?: string;

  @IsOptional()
  @IsString()
  LOG_MAX_FILES?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new ConfigError(
      `Invalid environment configuration:\n${errors.map((e) => e.toString()).join("\n")}`,
    );
  }

  return validated;
}
