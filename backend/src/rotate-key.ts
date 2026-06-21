import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ConfigError } from "./common/errors";
import { backupDestinations, envVars, gitCredentials, webhookSecrets } from "./db/schema";

// Re-encrypts every stored secret from the current WILLY_MASTER_KEY to a new one.
//
//   WILLY_MASTER_KEY=<old> DATABASE_URL=... npm run -w @willy/backend rotate-key -- <newKeyHex>
//
// After it succeeds, set WILLY_MASTER_KEY to the new key and restart the server.

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;

interface Sealed {
  cipherText: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
}

function decrypt(key: Buffer, sealed: Pick<Sealed, "cipherText" | "nonce" | "authTag">): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(sealed.cipherText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function encrypt(key: Buffer, plaintext: string, keyVersion: number): Sealed {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const cipherText = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    cipherText: cipherText.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
  };
}

function loadKey(hex: string | undefined, label: string): Buffer {
  if (!hex || Buffer.from(hex, "hex").length !== 32) {
    throw new ConfigError(`${label} must be 32 bytes encoded as 64 hex characters`);
  }

  return Buffer.from(hex, "hex");
}

async function main(): Promise<void> {
  const oldKey = loadKey(process.env.WILLY_MASTER_KEY, "WILLY_MASTER_KEY (current)");
  const newKey = loadKey(process.argv[2], "new key argument");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  let rotated = 0;

  const reseal = (sealed: {
    cipherText: string;
    nonce: string;
    authTag: string;
    keyVersion: number;
  }): Sealed => encrypt(newKey, decrypt(oldKey, sealed), sealed.keyVersion + 1);

  try {
    for (const row of await db.select().from(envVars)) {
      const next = reseal(row);
      await db.update(envVars).set(next).where(eq(envVars.id, row.id));
      rotated += 1;
    }

    for (const row of await db.select().from(backupDestinations)) {
      const next = reseal(row);
      await db.update(backupDestinations).set(next).where(eq(backupDestinations.id, row.id));
      rotated += 1;
    }

    for (const row of await db.select().from(webhookSecrets)) {
      const next = reseal({ ...row, cipherText: row.secretCipher });
      await db
        .update(webhookSecrets)
        .set({
          secretCipher: next.cipherText,
          nonce: next.nonce,
          authTag: next.authTag,
          keyVersion: next.keyVersion,
        })
        .where(eq(webhookSecrets.id, row.id));
      rotated += 1;
    }

    for (const row of await db.select().from(gitCredentials)) {
      if (!row.cipherText || !row.nonce || !row.authTag) {
        continue;
      }

      const next = reseal({
        cipherText: row.cipherText,
        nonce: row.nonce,
        authTag: row.authTag,
        keyVersion: row.keyVersion,
      });
      await db.update(gitCredentials).set(next).where(eq(gitCredentials.id, row.id));
      rotated += 1;
    }

    console.log(
      `Re-encrypted ${rotated} secret(s). Set WILLY_MASTER_KEY to the new key and restart.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
