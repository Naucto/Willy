import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Secret, TOTP } from "otpauth";
import { CryptoService, type SealedSecret } from "../crypto/crypto.service";
import { type User, UsersService } from "../users/users.service";

const ISSUER = "Willy";

// A 2FA "challenge" token gates the second login step: it proves the password was accepted without
// handing out a real session. "setup" tokens additionally carry the candidate secret so the
// confirm step is stateless (no DB pending column).
interface ChallengePayload {
  sub: string;
  typ: "2fa";
  mode: "verify" | "setup";
}

interface SetupPayload {
  sub: string;
  typ: "2fa_setup";
  secret: string;
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly users: UsersService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.getOrThrow<string>("JWT_SECRET");
  }

  generateSecret(email: string): { secret: string; otpauthUri: string } {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: ISSUER, label: email, secret });

    return { secret: secret.base32, otpauthUri: totp.toString() };
  }

  // window:1 tolerates one 30s step of clock drift on either side.
  verifyCode(base32: string, code: string): boolean {
    const totp = new TOTP({ issuer: ISSUER, label: ISSUER, secret: Secret.fromBase32(base32) });

    return totp.validate({ token: code.trim(), window: 1 }) !== null;
  }

  mintChallengeToken(userId: string, mode: "verify" | "setup"): Promise<string> {
    const payload: ChallengePayload = { sub: userId, typ: "2fa", mode };

    return this.jwt.signAsync(payload, { secret: this.secret, expiresIn: "5m" });
  }

  async verifyChallengeToken(token: string, mode: "verify" | "setup"): Promise<string> {
    const payload = await this.verify<ChallengePayload>(token);

    if (payload.typ !== "2fa" || payload.mode !== mode) {
      throw new UnauthorizedException("invalid 2FA challenge");
    }

    return payload.sub;
  }

  mintSetupToken(userId: string, base32: string): Promise<string> {
    const payload: SetupPayload = { sub: userId, typ: "2fa_setup", secret: base32 };

    return this.jwt.signAsync(payload, { secret: this.secret, expiresIn: "10m" });
  }

  async verifySetupToken(token: string): Promise<{ userId: string; secret: string }> {
    const payload = await this.verify<SetupPayload>(token);

    if (payload.typ !== "2fa_setup") {
      throw new UnauthorizedException("invalid 2FA setup token");
    }

    return { userId: payload.sub, secret: payload.secret };
  }

  async enable(userId: string, base32: string): Promise<void> {
    const sealed = this.crypto.encrypt(base32);

    await this.users.setTwoFactor(userId, { enabled: true, secret: JSON.stringify(sealed) });
  }

  async disable(userId: string): Promise<void> {
    await this.users.setTwoFactor(userId, { enabled: false, secret: null });
  }

  // Mark 2FA required without a secret yet, and drop the refresh token so the requirement takes
  // effect on the next refresh/login (where the user is forced through setup).
  async require(userId: string): Promise<void> {
    await this.users.setTwoFactor(userId, { enabled: true });
    await this.users.setRefreshTokenHash(userId, null);
  }

  decryptSecret(user: User): string | null {
    if (!user.twoFactorSecret) {
      return null;
    }

    return this.crypto.decrypt(JSON.parse(user.twoFactorSecret) as SealedSecret);
  }

  private async verify<T extends object>(token: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException("invalid or expired 2FA token");
    }
  }
}
