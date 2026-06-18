import { ApiProperty } from "@nestjs/swagger";

const SCOPES = ["BUILD", "RUNTIME", "BOTH"] as const;

// Env var as exposed to the UI. Regular vars carry their plaintext value; secrets carry null.
export class MaskedEnvVarDto {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ enum: SCOPES })
  scope!: (typeof SCOPES)[number];

  @ApiProperty({ type: Boolean })
  isSecret!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Plaintext value, or null for secrets.",
  })
  value!: string | null;
}
