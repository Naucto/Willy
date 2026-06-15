import { ApiProperty } from "@nestjs/swagger";

export class StreamTicketDto {
  @ApiProperty({ type: String })
  ticket!: string;
}
