import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { AreCapabilitiesSafe } from "../capabilities";
import type { RestartPolicyName } from "../resource-limits";

const RESTART: RestartPolicyName[] = ["NO", "ON_FAILURE", "ALWAYS", "UNLESS_STOPPED"];

// A user-defined healthcheck (durations are Docker duration strings like "30s"). The test is the
// shell command run inside the container (wrapped CMD-SHELL on injection).
export class HealthcheckDto {
  @ApiProperty({ type: String, example: "curl -f http://localhost/health" })
  @IsString()
  @IsNotEmpty()
  test!: string;

  @ApiPropertyOptional({ type: String, example: "30s" })
  @IsOptional()
  @IsString()
  interval?: string;

  @ApiPropertyOptional({ type: String, example: "10s" })
  @IsOptional()
  @IsString()
  timeout?: string;

  @ApiPropertyOptional({ type: Number, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  retries?: number;

  @ApiPropertyOptional({ type: String, example: "5s" })
  @IsOptional()
  @IsString()
  startPeriod?: string;
}

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

  @ApiPropertyOptional({ type: [String], example: ["NET_BIND_SERVICE"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @AreCapabilitiesSafe()
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

  @ApiPropertyOptional({ type: HealthcheckDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => HealthcheckDto)
  healthcheck?: HealthcheckDto | null;
}
