import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConfigError } from "../common/errors";

export interface SealedSecret {
  cipherText: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
}

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;
const NONCE_BYTES = 12;

// Encrypts at-rest secrets (env vars, webhook/git/db credentials) with AES-256-GCM.
// Values are decrypted only at the point of use and never logged.
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const key = Buffer.from(config.getOrThrow<string>("WILLY_MASTER_KEY"), "hex");

    if (key.length !== 32) {
      throw new ConfigError("WILLY_MASTER_KEY must be 32 bytes encoded as 64 hex characters");
    }

    this.key = key;
  }

  encrypt(plaintext: string): SealedSecret {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);
    const cipherText = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    return {
      cipherText: cipherText.toString("base64"),
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: KEY_VERSION,
    };
  }

  decrypt(sealed: SealedSecret): string {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(sealed.nonce, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.cipherText, "base64")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  }
}
