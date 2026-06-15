import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import type { EnvScope } from "../env-vars.service";

const SCOPES: EnvScope[] = ["BUILD", "RUNTIME", "BOTH"];

export class SetEnvVarDto {
  @IsString()
  value!: string;

  @IsOptional()
  @IsIn(SCOPES)
  scope?: EnvScope;

  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}
