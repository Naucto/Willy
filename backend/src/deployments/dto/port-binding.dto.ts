import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class PortBindingDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  domainId!: string;

  @ApiProperty({ type: Number, description: "Dedicated host port this domain is bound to." })
  hostPort!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Compose service this binding routes to; null = the deployment's default container.",
  })
  targetService!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Internal port this binding routes to; null = the deployment's web service port.",
  })
  targetPort!: number | null;
}

// hostPort's hard bounds (1024-65535) are validated here; the real check that it falls inside the
// admin's active sub-range and is free happens in the controller against live settings.
export class AddPortBindingDto {
  @ApiProperty({ type: Number, example: 20001 })
  @IsInt()
  @Min(1024)
  @Max(65535)
  hostPort!: number;

  @ApiProperty({ type: String, required: false, nullable: true, example: "rtc-1" })
  @IsOptional()
  @IsString()
  targetService?: string | null;

  @ApiProperty({ type: Number, required: false, nullable: true, example: 5001 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort?: number | null;
}

export class UpdatePortBindingDto {
  @ApiProperty({ type: Number, example: 20001 })
  @IsInt()
  @Min(1024)
  @Max(65535)
  hostPort!: number;

  @ApiProperty({ type: String, required: false, nullable: true, example: "rtc-1" })
  @IsOptional()
  @IsString()
  targetService?: string | null;

  @ApiProperty({ type: Number, required: false, nullable: true, example: 5001 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort?: number | null;
}

export class SuggestPortDto {
  @ApiProperty({ type: Number, description: "Lowest free host port in the active sub-range." })
  hostPort!: number;
}
