import { ApiProperty } from "@nestjs/swagger";

const SCOPES = ["BUILD", "RUNTIME", "BOTH"] as const;

// Env var as exposed to the UI. Regular vars carry their plaintext value; secrets carry null. A
// service listing also carries the shared variables that service inherits, told apart by
// targetService.
export class MaskedEnvVarDto {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ enum: SCOPES })
  scope!: (typeof SCOPES)[number];

  @ApiProperty({ type: Boolean })
  isSecret!: boolean;

  @ApiProperty({
    type: String,
    description: 'Scope the variable is stored in; "" = shared across every service.',
  })
  targetService!: string;

  @ApiProperty({
    type: Boolean,
    description: "Shared variable the listed service redefines; that service gets its own value.",
  })
  overridden!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Plaintext value, or null for secrets.",
  })
  value!: string | null;
}
