import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, IsString, MinLength } from "class-validator";

const ROLES = ["ADMIN", "OPERATOR", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

// Public projection of a user — never includes password/refresh hashes.
export class UserDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ enum: ROLES })
  role!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export class CreateUserDto {
  @ApiProperty({ type: String, format: "email" })
  @IsEmail()
  email!: string;

  @ApiProperty({ type: String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: Role;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: Role;
}

export class SetPasswordDto {
  @ApiProperty({ type: String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
