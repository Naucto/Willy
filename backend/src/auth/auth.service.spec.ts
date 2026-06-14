import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { User, UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

const baseUser: User = {
  id: "u1",
  email: "a@b.c",
  passwordHash: "",
  role: "ADMIN",
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

    return { service: new AuthService(users, jwt, config), users };
  }

  it("issues a session for valid credentials and stores a refresh hash", async () => {
    const { service, users } = makeService({ ...baseUser, passwordHash });
    const result = await service.login("a@b.c", "correct horse");

    expect(result.accessToken).toBe("token");
    expect(result.user.email).toBe("a@b.c");
    expect(users.setRefreshTokenHash).toHaveBeenCalled();
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
