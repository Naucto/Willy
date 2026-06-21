import { plainToInstance } from "class-transformer";
import { IsInt, IsOptional, IsString, Matches, MinLength, validateSync } from "class-validator";
import { ConfigError } from "../common/errors";

export class EnvironmentVariables {
  @IsString()
  DATABASE_URL!: string;

  // Time-series metrics store (see MetricsStoreService), e.g. redis://redis:6379.
  @IsString()
  REDIS_URL!: string;

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

  // Where durable build/runtime logs are persisted inside willy-server (the willy_logs volume),
  // so log history survives restarts and outlives stopped containers.
  @IsOptional()
  @IsString()
  LOGS_DIR?: string;

  // Per-container log rotation (json-file driver). Defaults: 10m / 3 files.
  @IsOptional()
  @IsString()
  LOG_MAX_SIZE?: string;

  @IsOptional()
  @IsString()
  LOG_MAX_FILES?: string;

  // Provisioned host-port capacity for hard-bound domains, "START-END" (e.g. "20000-20099").
  // Infra publishes this whole range on Traefik and declares one entrypoint per port; the panel's
  // active sub-range must stay within it. Absent/empty = feature unprovisioned (disabled).
  // Empty string is allowed (passed through as `${WILLY_PORT_BIND_RANGE:-}` when unset) and means
  // the feature is off; a non-empty value must be START-END.
  @IsOptional()
  @IsString()
  @Matches(/^(\d+-\d+)?$/, { message: "WILLY_PORT_BIND_RANGE must be START-END, e.g. 20000-20099" })
  WILLY_PORT_BIND_RANGE?: string;

  // Volume file-manager tunables. The helper image is a tiny BusyBox userland that mounts the target
  // volume at /mnt; read/upload caps bound how much the panel will move through a JSON/multipart body.
  @IsOptional()
  @IsString()
  FILE_MANAGER_IMAGE?: string;

  @IsOptional()
  @IsInt()
  FILE_MANAGER_MAX_READ_MB?: number;

  @IsOptional()
  @IsInt()
  FILE_MANAGER_MAX_UPLOAD_MB?: number;

  @IsOptional()
  @IsInt()
  FILE_MANAGER_HELPER_IDLE_TTL_MS?: number;
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
