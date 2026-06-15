import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import type { Deployment, DeploymentType } from "../deployments.service";

const TYPES: DeploymentType[] = ["WEB", "WORKER", "CRON"];
const STRATEGIES: Deployment["buildStrategy"][] = ["DOCKERFILE", "COMPOSE", "IMAGE"];

export class CreateDeploymentDto {
  @ApiProperty({ type: String, pattern: "^[a-z0-9][a-z0-9-]{0,40}$", example: "my-app" })
  @Matches(/^[a-z0-9][a-z0-9-]{0,40}$/, {
    message: "name must be lowercase alphanumeric/hyphen, 1-41 chars",
  })
  name!: string;

  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: DeploymentType;

  @ApiPropertyOptional({ type: String, example: "https://github.com/owner/repo.git" })
  @IsOptional()
  @IsString()
  gitUrl?: string;

  @ApiPropertyOptional({ type: String, example: "main" })
  @IsOptional()
  @IsString()
  gitRef?: string;

  @ApiPropertyOptional({
    type: String,
    example: "nginx:1.27",
    description: "For the IMAGE strategy.",
  })
  @IsOptional()
  @IsString()
  imageRef?: string;

  @ApiPropertyOptional({ enum: STRATEGIES })
  @IsOptional()
  @IsIn(STRATEGIES)
  buildStrategy?: Deployment["buildStrategy"];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  dockerfilePath?: string;

  @ApiPropertyOptional({ type: String, example: "docker-compose.yml" })
  @IsOptional()
  @IsString()
  composeFilePath?: string;

  @ApiPropertyOptional({ type: String, description: "Compose service to route + monitor." })
  @IsOptional()
  @IsString()
  composeWebService?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 65535 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  webServicePort?: number;

  @ApiPropertyOptional({ type: String, example: "/" })
  @IsOptional()
  @IsString()
  healthCheckPath?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  runCommand?: string;

  @ApiPropertyOptional({ type: String, example: "0 3 * * *" })
  @IsOptional()
  @IsString()
  cronExpr?: string;

  @ApiPropertyOptional({ type: String, example: "app.example.com" })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({
    type: String,
    description: "Personal access token for a private repo (encrypted at rest).",
  })
  @IsOptional()
  @IsString()
  gitToken?: string;

  @ApiPropertyOptional({ type: Number, minimum: 16 })
  @IsOptional()
  @IsInt()
  @Min(16)
  memoryLimitMb?: number;

  @ApiPropertyOptional({ type: Number, description: "CPU limit in nano-CPUs (1 CPU = 1e9)" })
  @IsOptional()
  @IsInt()
  @Min(0)
  nanoCpus?: number;

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
}
