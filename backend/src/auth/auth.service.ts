import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { parseDurationSeconds } from "../common/duration";
import { User, UsersService } from "../users/users.service";
import { JwtPayload } from "./jwt-payload.interface";

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: User["role"] };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async login(email: string, password: string): Promise<SessionResult> {
    const user = await this.users.findByEmail(email);

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("invalid credentials");
    }

    return this.issueSession(user);
  }

  async refresh(userId: string, presentedToken: string): Promise<SessionResult> {
    const user = await this.users.findById(userId);

    if (
      !user ||
      !user.refreshTokenHash ||
      !(await argon2.verify(user.refreshTokenHash, presentedToken))
    ) {
      throw new UnauthorizedException("invalid refresh token");
    }

    return this.issueSession(user);
  }

  async logout(userId: string): Promise<void> {
    await this.users.setRefreshTokenHash(userId, null);
  }

  private async issueSession(user: User): Promise<SessionResult> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_SECRET"),
      expiresIn: parseDurationSeconds(this.config.get<string>("JWT_EXPIRES_IN") ?? "15m"),
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: parseDurationSeconds(this.config.get<string>("JWT_REFRESH_EXPIRES_IN") ?? "7d"),
    });

    // Store a hash of the refresh token so it can be rotated/revoked.
    await this.users.setRefreshTokenHash(user.id, await this.hashPassword(refreshToken));

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
