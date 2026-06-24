import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { parseDurationSeconds } from "../common/duration";
import { User, UsersService } from "../users/users.service";
import { JwtPayload } from "./jwt-payload.interface";
import { type Capability, capabilitiesForRole } from "./permissions";
import { TwoFactorService } from "./two-factor.service";

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: User["role"];
    permissions: Capability[];
  };
}

export type LoginOutcome =
  | { status: "authenticated"; session: SessionResult }
  | { status: "totp_required"; challengeToken: string }
  | { status: "totp_setup_required"; challengeToken: string };

export interface TotpSetupResult {
  secret: string;
  otpauthUri: string;
  setupToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async login(email: string, password: string): Promise<LoginOutcome> {
    const user = await this.users.findByEmail(email);

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("invalid credentials");
    }

    if (user.disabled) {
      throw new UnauthorizedException("account is disabled");
    }

    if (!user.twoFactorEnabled) {
      return { status: "authenticated", session: await this.issueSession(user) };
    }

    if (user.twoFactorSecret) {
      return {
        status: "totp_required",
        challengeToken: await this.twoFactor.mintChallengeToken(user.id, "verify"),
      };
    }

    // 2FA required but never configured (admin enforced it) — force setup before issuing a session.
    return {
      status: "totp_setup_required",
      challengeToken: await this.twoFactor.mintChallengeToken(user.id, "setup"),
    };
  }

  // Second login step when 2FA is active: verify the TOTP code against the stored secret.
  async verifyTotpLogin(challengeToken: string, code: string): Promise<SessionResult> {
    const userId = await this.twoFactor.verifyChallengeToken(challengeToken, "verify");
    const user = await this.users.findById(userId);
    const secret = user ? this.twoFactor.decryptSecret(user) : null;

    if (!user || !secret || !this.twoFactor.verifyCode(secret, code)) {
      throw new UnauthorizedException("invalid 2FA code");
    }

    return this.issueSession(user);
  }

  // Forced-setup step at login: hand back a fresh secret + QR (no persistence yet).
  async startTotpSetup(challengeToken: string): Promise<TotpSetupResult> {
    const userId = await this.twoFactor.verifyChallengeToken(challengeToken, "setup");
    const user = await this.users.findById(userId);

    if (!user) {
      throw new UnauthorizedException("invalid 2FA challenge");
    }

    const { secret, otpauthUri } = this.twoFactor.generateSecret(user.email);

    return { secret, otpauthUri, setupToken: await this.twoFactor.mintSetupToken(user.id, secret) };
  }

  // Forced-setup confirm at login: validate the code, persist the secret, then issue a session.
  async confirmTotpSetup(setupToken: string, code: string): Promise<SessionResult> {
    const { userId, secret } = await this.twoFactor.verifySetupToken(setupToken);

    if (!this.twoFactor.verifyCode(secret, code)) {
      throw new UnauthorizedException("invalid 2FA code");
    }

    await this.twoFactor.enable(userId, secret);
    const user = await this.users.findById(userId);

    if (!user) {
      throw new UnauthorizedException("user not found");
    }

    return this.issueSession(user);
  }

  async refresh(userId: string, presentedToken: string): Promise<SessionResult> {
    const user = await this.users.findById(userId);

    if (
      !user ||
      user.disabled ||
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: capabilitiesForRole(user.role),
      },
    };
  }
}
