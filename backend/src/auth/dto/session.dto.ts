import { ApiProperty } from "@nestjs/swagger";

const ROLES = ["ADMIN", "OPERATOR", "VIEWER"] as const;

export class SessionUserDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "email" })
  email!: string;

  @ApiProperty({ enum: ROLES })
  role!: (typeof ROLES)[number];
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

  @ApiProperty({ enum: ROLES })
  role!: (typeof ROLES)[number];
}
