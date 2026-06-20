import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { SessionDto } from "./session.dto";

export const LOGIN_STATUS = ["authenticated", "totp_required", "totp_setup_required"] as const;

// Result of POST /auth/login. Either a full session (no 2FA) or a short-lived challenge token that
// the client exchanges for a session via the /auth/2fa/* routes.
export class LoginResultDto {
  @ApiProperty({ enum: LOGIN_STATUS })
  status!: (typeof LOGIN_STATUS)[number];

  @ApiPropertyOptional({ type: SessionDto })
  session?: SessionDto;

  @ApiPropertyOptional({ type: String })
  challengeToken?: string;
}

export class TotpLoginDto {
  @ApiProperty({ type: String })
  @IsString()
  challengeToken!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(6)
  code!: string;
}

export class TotpSetupStartDto {
  @ApiProperty({ type: String })
  @IsString()
  challengeToken!: string;
}

export class TotpConfirmDto {
  @ApiProperty({ type: String })
  @IsString()
  setupToken!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(6)
  code!: string;
}

export class TotpSetupResponseDto {
  @ApiProperty({ type: String, description: "Base32 secret to enter manually." })
  secret!: string;

  @ApiProperty({ type: String, description: "otpauth:// URI to render as a QR code." })
  otpauthUri!: string;

  @ApiProperty({ type: String, description: "Opaque token to pass back when confirming the code." })
  setupToken!: string;
}
