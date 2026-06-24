import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

const ROLES = ["ADMIN", "OPERATOR", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

// Public projection of a user — never includes password/refresh hashes.
export class UserDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ROLES })
  role!: string;

  @ApiProperty({ type: Boolean, description: "Whether sign-in is suspended for this user." })
  disabled!: boolean;

  @ApiProperty({ type: Boolean, description: "Whether 2FA is required for this user." })
  twoFactorEnabled!: boolean;

  @ApiProperty({ type: Boolean, description: "Whether a TOTP secret has been confirmed." })
  twoFactorConfigured!: boolean;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export class CreateUserDto {
  @ApiProperty({ type: String, format: "email" })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ type: String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ type: String, format: "email" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}

export class SetPasswordDto {
  @ApiProperty({ type: String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class SetUserDisabledDto {
  @ApiProperty({ type: Boolean, description: "Suspend (true) or restore (false) sign-in." })
  @IsBoolean()
  disabled!: boolean;
}
