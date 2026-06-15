import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import type { EnvScope } from "../env-vars.service";

const SCOPES: EnvScope[] = ["BUILD", "RUNTIME", "BOTH"];

export class SetEnvVarDto {
  @ApiProperty({ type: String })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ enum: SCOPES })
  @IsOptional()
  @IsIn(SCOPES)
  scope?: EnvScope;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}
