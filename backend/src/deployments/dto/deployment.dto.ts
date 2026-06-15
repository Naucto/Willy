import { ApiProperty } from "@nestjs/swagger";

const TYPES = ["WEB", "WORKER", "CRON"] as const;
const STRATEGIES = ["NIXPACKS", "DOCKERFILE", "COMPOSE"] as const;
const STATES = ["CREATED", "DEPLOYING", "RUNNING", "DEGRADED", "STOPPED", "ERROR"] as const;
const RESTART_POLICIES = ["NO", "ON_FAILURE", "ALWAYS", "UNLESS_STOPPED"] as const;

// OpenAPI projection of a deployments row. Source of truth for the generated client.
export class DeploymentDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: TYPES })
  type!: (typeof TYPES)[number];

  @ApiProperty({ type: String })
  gitUrl!: string;

  @ApiProperty({ type: String })
  gitRef!: string;

  @ApiProperty({ enum: STRATEGIES })
  buildStrategy!: (typeof STRATEGIES)[number];

  @ApiProperty({ type: String, nullable: true })
  dockerfilePath!: string | null;

  @ApiProperty({ type: String, nullable: true })
  composeFilePath!: string | null;

  @ApiProperty({ type: String, nullable: true })
  composeWebService!: string | null;

  @ApiProperty({ type: String, nullable: true })
  runCommand!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cronExpr!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  webServicePort!: number | null;

  @ApiProperty({ type: String })
  healthCheckPath!: string;

  @ApiProperty({ type: Boolean })
  autoDeploy!: boolean;

  @ApiProperty({ enum: RESTART_POLICIES })
  restartPolicy!: (typeof RESTART_POLICIES)[number];

  @ApiProperty({ type: Number, nullable: true })
  memoryLimitMb!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  nanoCpus!: number | null;

  @ApiProperty({ enum: STATES })
  state!: (typeof STATES)[number];

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  activeReleaseId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  gitCredentialId!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string;

  @ApiProperty({ type: String, nullable: true })
  primaryDomain!: string | null;
}
