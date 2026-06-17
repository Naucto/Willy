import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeploymentRefDto } from "./deployment-ref.dto";

export class AdminContainerDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, description: "Image tag or ID the container was started from." })
  image!: string;

  @ApiProperty({ type: String, description: "Docker state: running, exited, created, paused, …" })
  state!: string;

  @ApiProperty({ type: String, description: 'Human-readable status, e.g. "Up 2 hours".' })
  status!: string;

  @ApiProperty({ type: Number, description: "Unix timestamp when the container was created." })
  created!: number;

  @ApiPropertyOptional({ type: () => DeploymentRefDto, nullable: true })
  deployment!: DeploymentRefDto | null;
}
