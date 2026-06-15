import { ApiProperty } from "@nestjs/swagger";

// The host's public IP, for pre-filling A/AAAA records that point at this server.
export class PublicIpDto {
  @ApiProperty({ type: String, nullable: true })
  ip!: string | null;
}
