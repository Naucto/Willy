import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { User, UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { TwoFactorService } from "./two-factor.service";

const baseUser: User = {
  id: "u1",
  email: "a@b.c",
  name: null,
  passwordHash: "",
  role: "ADMIN",
  disabled: false,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  refreshTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AuthService.login", () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash("correct horse", { type: argon2.argon2id });
  });

  function makeService(user: User | undefined) {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(user),
      setRefreshTokenHash: vi.fn().mockResolvedValue(undefined),
    } as unknown as UsersService;
    const jwt = { signAsync: vi.fn().mockResolvedValue("token") } as unknown as JwtService;
    const config = { getOrThrow: () => "secret", get: () => "15m" } as unknown as ConfigService;
    const twoFactor = {
      mintChallengeToken: vi.fn().mockResolvedValue("challenge"),
    } as unknown as TwoFactorService;

    return { service: new AuthService(users, jwt, config, twoFactor), users };
  }

  it("issues a session for valid credentials and stores a refresh hash", async () => {
    const { service, users } = makeService({ ...baseUser, passwordHash });
    const result = await service.login("a@b.c", "correct horse");

    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") {
      throw new Error("expected authenticated");
    }

    expect(result.session.accessToken).toBe("token");
    expect(result.session.user.email).toBe("a@b.c");
    expect(users.setRefreshTokenHash).toHaveBeenCalled();
  });

  it("asks for a TOTP code when 2FA is active", async () => {
    const { service } = makeService({
      ...baseUser,
      passwordHash,
      twoFactorEnabled: true,
      twoFactorSecret: "{}",
    });

    const result = await service.login("a@b.c", "correct horse");

    expect(result.status).toBe("totp_required");
  });

  it("forces setup when 2FA is required but unconfigured", async () => {
    const { service } = makeService({ ...baseUser, passwordHash, twoFactorEnabled: true });

    const result = await service.login("a@b.c", "correct horse");

    expect(result.status).toBe("totp_setup_required");
  });

  it("rejects a wrong password", async () => {
    const { service } = makeService({ ...baseUser, passwordHash });

    await expect(service.login("a@b.c", "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an unknown user", async () => {
    const { service } = makeService(undefined);

    await expect(service.login("missing@b.c", "x")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
