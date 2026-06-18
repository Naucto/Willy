import { ApiProperty } from "@nestjs/swagger";
import { DeploymentRefDto } from "./deployment-ref.dto";

export class AdminImageDto {
  @ApiProperty({ type: String, description: "Full Docker image ID (sha256:…)." })
  id!: string;

  @ApiProperty({ type: [String] })
  repoTags!: string[];

  @ApiProperty({ type: Number, description: "Actual on-disk size of the image in bytes." })
  size!: number;

  @ApiProperty({ type: Number, description: "Virtual size including shared layers, in bytes." })
  virtualSize!: number;

  @ApiProperty({ type: Number, description: "Unix timestamp when the image was created." })
  created!: number;

  @ApiProperty({ type: () => [DeploymentRefDto] })
  deployments!: DeploymentRefDto[];

  @ApiProperty({ type: Number, description: "Number of containers based on this image." })
  activeContainersCount!: number;

  @ApiProperty({ type: Boolean, description: "Built by Willy or run by a managed deployment." })
  managed!: boolean;
}
