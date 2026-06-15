import { ApiProperty } from "@nestjs/swagger";

const SCOPES = ["BUILD", "RUNTIME", "BOTH"] as const;

// Env var as exposed to the UI — never carries the decrypted value.
export class MaskedEnvVarDto {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ enum: SCOPES })
  scope!: (typeof SCOPES)[number];

  @ApiProperty({ type: Boolean })
  isSecret!: boolean;
}
