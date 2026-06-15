import { ApiProperty } from "@nestjs/swagger";

export class CleanupResultDto {
  @ApiProperty({ type: Number, description: "Bytes reclaimed by pruning dangling images." })
  spaceReclaimedBytes!: number;

  @ApiProperty({
    type: [String],
    description: "Stale per-deployment image tags that were removed.",
  })
  removedImageTags!: string[];
}
