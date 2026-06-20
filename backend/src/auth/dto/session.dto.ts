import { ApiProperty } from "@nestjs/swagger";
import { type Capability, CAPABILITIES } from "../permissions";

const ROLES = ["ADMIN", "OPERATOR", "VIEWER"] as const;

export class SessionUserDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ROLES })
  role!: (typeof ROLES)[number];

  @ApiProperty({ enum: CAPABILITIES, isArray: true, description: "UI capabilities for this role." })
  permissions!: Capability[];
}

export class SessionDto {
  @ApiProperty({ type: String })
  accessToken!: string;

  @ApiProperty({ type: String })
  refreshToken!: string;

  @ApiProperty({ type: SessionUserDto })
  user!: SessionUserDto;
}

// Shape returned by GET /auth/me (the decoded access-token identity).
export class AuthUserDto {
  @ApiProperty({ type: String, format: "uuid" })
  userId!: string;

  @ApiProperty({ type: String, format: "email" })
  email!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: ROLES })
  role!: (typeof ROLES)[number];

  @ApiProperty({ enum: CAPABILITIES, isArray: true, description: "UI capabilities for this role." })
  permissions!: Capability[];
}
