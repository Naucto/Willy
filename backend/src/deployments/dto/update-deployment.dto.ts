import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { Deployment } from "../deployments.service";

const STRATEGIES: Deployment["buildStrategy"][] = ["DOCKERFILE", "COMPOSE", "IMAGE"];
const RESTART: Deployment["restartPolicy"][] = ["NO", "ON_FAILURE", "ALWAYS", "UNLESS_STOPPED"];

// All optional — only provided fields are changed. name/type are immutable.
export class UpdateDeploymentDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  gitUrl?: string;

  @ApiPropertyOptional({ type: String, example: "nginx:1.27" })
  @IsOptional()
  @IsString()
  imageRef?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  gitRef?: string;

  @ApiPropertyOptional({ enum: STRATEGIES })
  @IsOptional()
  @IsIn(STRATEGIES)
  buildStrategy?: Deployment["buildStrategy"];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  dockerfilePath?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  composeFilePath?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  composeWebService?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 65535 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  webServicePort?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  healthCheckPath?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  runCommand?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cronExpr?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  autoDeploy?: boolean;

  @ApiPropertyOptional({ enum: RESTART })
  @IsOptional()
  @IsIn(RESTART)
  restartPolicy?: Deployment["restartPolicy"];

  @ApiPropertyOptional({ type: Number, minimum: 16, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(16)
  memoryLimitMb?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "CPU limit in nano-CPUs (1 CPU = 1e9)",
  })
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

  @ApiPropertyOptional({ type: Number, example: 10, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  logMaxSizeMb?: number | null;

  @ApiPropertyOptional({ type: Number, example: 3, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  logMaxFiles?: number | null;

  @ApiPropertyOptional({ type: String, example: "app.example.com" })
  @IsOptional()
  @IsString()
  domain?: string;
}
