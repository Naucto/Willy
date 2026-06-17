import { ApiProperty } from "@nestjs/swagger";

export class PruneResultDto {
  @ApiProperty({ type: Number, description: "Bytes reclaimed by the prune operation." })
  spaceReclaimedBytes!: number;

  @ApiProperty({ type: Number, description: "Number of images or containers removed." })
  itemsRemoved!: number;
}
