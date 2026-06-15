import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import type { RestartPolicyName } from "../resource-limits";

const RESTART: RestartPolicyName[] = ["NO", "ON_FAILURE", "ALWAYS", "UNLESS_STOPPED"];

// A compose service's resource limits (read + write). Every field optional; omitting all of them
// clears the service's overrides.
export class ResourceLimitsDto {
  @ApiPropertyOptional({ type: Number, nullable: true, example: 512 })
  @IsOptional()
  @IsInt()
  @Min(1)
  memoryLimitMb?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 1_000_000_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  nanoCpus?: number | null;

  @ApiPropertyOptional({ type: [String], example: ["NET_ADMIN"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capAdd?: string[];

  @ApiPropertyOptional({ type: [String], example: ["ALL"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capDrop?: string[];

  @ApiPropertyOptional({ enum: RESTART })
  @IsOptional()
  @IsIn(RESTART)
  restartPolicy?: RestartPolicyName;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  logMaxSizeMb?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  logMaxFiles?: number | null;
}
