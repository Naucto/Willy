import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsFQDN, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { PortBindingDto } from "./port-binding.dto";

export class DomainDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  fqdn!: string;

  @ApiProperty({ type: Boolean })
  isPrimary!: boolean;

  @ApiProperty({
    type: Boolean,
    description: "Whether this domain serves a regular 443 web route; false = port-bind-only.",
  })
  webRoute!: boolean;

  @ApiProperty({
    type: [PortBindingDto],
    description: "Hard-bound host ports fronting this domain.",
  })
  bindings!: PortBindingDto[];

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
  // require_tld allows multi-label hosts incl. *.localhost for local dev; rejects single labels.
  @IsFQDN({ require_tld: true }, { message: "fqdn must be a valid domain (e.g. app.example.com)" })
  fqdn!: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: "false = create a port-bind-only domain with no 443 route. Defaults to true.",
  })
  @IsOptional()
  @IsBoolean()
  webRoute?: boolean;

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
  @ApiProperty({
    type: Boolean,
    required: false,
    description: "Toggle the domain's 443 web route on/off without touching its host-port binds.",
  })
  @IsOptional()
  @IsBoolean()
  webRoute?: boolean;

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
