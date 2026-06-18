import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import type { EnvScope } from "../env-vars.service";

const SCOPES = ["BUILD", "RUNTIME", "BOTH"] as const;

// Change a variable's scope and/or type without re-supplying its value.
export class UpdateEnvVarMetaDto {
  @ApiPropertyOptional({ enum: SCOPES })
  @IsOptional()
  @IsIn(SCOPES)
  scope?: EnvScope;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}
