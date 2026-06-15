import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class DomainDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  fqdn!: string;

  @ApiProperty({ type: Boolean })
  isPrimary!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Compose service this domain routes to; null = the deployment's default container.",
  })
  targetService!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: "Internal port this domain routes to; null = the deployment's web service port.",
  })
  targetPort!: number | null;
}

export class AddDomainDto {
  @ApiProperty({ type: String, example: "app.example.com" })
  @IsString()
  fqdn!: string;

  @ApiProperty({ type: String, required: false, nullable: true, example: "frontend" })
  @IsOptional()
  @IsString()
  targetService?: string | null;

  @ApiProperty({ type: Number, required: false, nullable: true, example: 8080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort?: number | null;
}

export class UpdateDomainTargetDto {
  @ApiProperty({ type: String, required: false, nullable: true, example: "frontend" })
  @IsOptional()
  @IsString()
  targetService?: string | null;

  @ApiProperty({ type: Number, required: false, nullable: true, example: 8080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort?: number | null;
}
