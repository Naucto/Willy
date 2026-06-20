import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { TOTP } from "otpauth";
import { describe, expect, it } from "vitest";
import type { CryptoService } from "../crypto/crypto.service";
import type { UsersService } from "../users/users.service";
import { TwoFactorService } from "./two-factor.service";

function make() {
  const users = {} as unknown as UsersService;
  const crypto = {} as unknown as CryptoService;
  const jwt = new JwtService({});
  const config = { getOrThrow: () => "test-secret-test-secret" } as unknown as ConfigService;

  return new TwoFactorService(users, crypto, jwt, config);
}

// Generate a valid current code for a base32 secret, as an authenticator app would.
function currentCode(base32: string): string {
  return new TOTP({ secret: base32 }).generate();
}

describe("TwoFactorService.verifyCode", () => {
  it("accepts a freshly generated code and rejects a wrong one", () => {
    const service = make();
    const { secret } = service.generateSecret("a@b.c");

    expect(service.verifyCode(secret, currentCode(secret))).toBe(true);
    expect(service.verifyCode(secret, "000000")).toBe(false);
  });
});

describe("TwoFactorService challenge/setup tokens", () => {
  it("round-trips a challenge token and rejects the wrong mode", async () => {
    const service = make();
    const token = await service.mintChallengeToken("u1", "verify");

    expect(await service.verifyChallengeToken(token, "verify")).toBe("u1");
    await expect(service.verifyChallengeToken(token, "setup")).rejects.toThrow();
  });

  it("round-trips a setup token carrying the candidate secret", async () => {
    const service = make();
    const token = await service.mintSetupToken("u1", "JBSWY3DPEHPK3PXP");

    expect(await service.verifySetupToken(token)).toEqual({
      userId: "u1",
      secret: "JBSWY3DPEHPK3PXP",
    });
  });

  it("rejects a garbage token", async () => {
    const service = make();

    await expect(service.verifyChallengeToken("not-a-jwt", "verify")).rejects.toThrow();
  });
});
