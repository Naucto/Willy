import { ApiProperty } from "@nestjs/swagger";

// Shared shape for endpoints that only acknowledge success.
export class OkResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  ok!: boolean;
}
