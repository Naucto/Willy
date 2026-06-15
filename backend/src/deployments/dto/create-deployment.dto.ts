import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import type { Deployment, DeploymentType } from "../deployments.service";

const TYPES: DeploymentType[] = ["WEB", "WORKER", "CRON"];
const STRATEGIES: Deployment["buildStrategy"][] = ["NIXPACKS", "DOCKERFILE", "COMPOSE"];

export class CreateDeploymentDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,40}$/, {
    message: "name must be lowercase alphanumeric/hyphen, 1-41 chars",
  })
  name!: string;

  @IsIn(TYPES)
  type!: DeploymentType;

  @IsString()
  gitUrl!: string;

  @IsOptional()
  @IsString()
  gitRef?: string;

  @IsOptional()
  @IsIn(STRATEGIES)
  buildStrategy?: Deployment["buildStrategy"];

  @IsOptional()
  @IsString()
  dockerfilePath?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  webServicePort?: number;

  @IsOptional()
  @IsString()
  healthCheckPath?: string;

  @IsOptional()
  @IsString()
  runCommand?: string;

  @IsOptional()
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  gitToken?: string;

  @IsOptional()
  @IsInt()
  @Min(16)
  memoryLimitMb?: number;
}
