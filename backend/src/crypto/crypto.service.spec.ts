import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { CryptoService } from "./crypto.service";

function makeService(masterKey = "a".repeat(64)): CryptoService {
  const config = { getOrThrow: () => masterKey } as unknown as ConfigService;

  return new CryptoService(config);
}

describe("CryptoService", () => {
  it("round-trips a secret without leaking the plaintext", () => {
    const service = makeService();
    const sealed = service.encrypt("hunter2");

    expect(sealed.cipherText).not.toContain("hunter2");
    expect(service.decrypt(sealed)).toBe("hunter2");
  });

  it("uses a unique nonce per encryption", () => {
    const service = makeService();

    expect(service.encrypt("same").nonce).not.toBe(service.encrypt("same").nonce);
  });

  it("rejects tampered ciphertext", () => {
    const service = makeService();
    const sealed = service.encrypt("secret");
    const tampered = { ...sealed, authTag: Buffer.alloc(16).toString("base64") };

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it("rejects a master key that is not 32 bytes", () => {
    expect(() => makeService("deadbeef")).toThrow(/32 bytes/);
  });
});
