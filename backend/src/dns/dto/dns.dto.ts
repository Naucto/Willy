import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from "class-validator";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV"] as const;
type RecordType = (typeof RECORD_TYPES)[number];

export class ZonesDto {
  @ApiProperty({ type: [String] })
  zones!: string[];
}

export class RegisterZoneDto {
  @ApiProperty({ type: String, example: "example.com" })
  @IsString()
  @Matches(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, {
    message: "zone must be a valid domain (e.g. example.com)",
  })
  zone!: string;
}

export class DnsRecordDto {
  @ApiProperty({ type: Number })
  id!: number;

  @ApiProperty({ type: String })
  zone!: string;

  @ApiProperty({ type: String })
  fieldType!: string;

  @ApiProperty({ type: String })
  subDomain!: string;

  @ApiProperty({ type: String })
  target!: string;

  @ApiProperty({ type: Number })
  ttl!: number;
}

export class CreateDnsRecordDto {
  @ApiProperty({ enum: RECORD_TYPES })
  @IsIn(RECORD_TYPES)
  fieldType!: RecordType;

  @ApiProperty({ type: String, example: "app" })
  @IsString()
  subDomain!: string;

  @ApiProperty({ type: String, example: "203.0.113.10" })
  @IsString()
  target!: string;

  @ApiPropertyOptional({ type: Number, default: 3600 })
  @IsOptional()
  @IsInt()
  @Min(60)
  ttl?: number;
}

export class UpdateDnsRecordDto {
  @ApiProperty({ type: String })
  @IsString()
  target!: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(60)
  ttl?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  subDomain?: string;
}
