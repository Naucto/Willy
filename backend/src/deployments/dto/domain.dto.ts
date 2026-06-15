import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class DomainDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  fqdn!: string;

  @ApiProperty({ type: Boolean })
  isPrimary!: boolean;
}

export class AddDomainDto {
  @ApiProperty({ type: String, example: "app.example.com" })
  @IsString()
  fqdn!: string;
}
