import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { envVars } from "../db/schema";

export type EnvScope = (typeof envVars.$inferSelect)["scope"];
export type InjectionPhase = "BUILD" | "RUNTIME";

export interface MaskedEnvVar {
  key: string;
  scope: EnvScope;
  isSecret: boolean;
}

export interface SetEnvVarInput {
  scope?: EnvScope | undefined;
  isSecret?: boolean | undefined;
}

@Injectable()
export class EnvVarsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  async set(
    deploymentId: string,
    key: string,
    value: string,
    input: SetEnvVarInput = {},
  ): Promise<void> {
    const sealed = this.crypto.encrypt(value);
    const fields = {
      cipherText: sealed.cipherText,
      nonce: sealed.nonce,
      authTag: sealed.authTag,
      keyVersion: sealed.keyVersion,
      scope: input.scope ?? "RUNTIME",
      isSecret: input.isSecret ?? true,
    };

    await this.db
      .insert(envVars)
      .values({ deploymentId, key, ...fields })
      .onConflictDoUpdate({
        target: [envVars.deploymentId, envVars.key],
        set: { ...fields, updatedAt: new Date() },
      });
  }

  async delete(deploymentId: string, key: string): Promise<void> {
    await this.db
      .delete(envVars)
      .where(and(eq(envVars.deploymentId, deploymentId), eq(envVars.key, key)));
  }

  // Reads never expose plaintext values.
  async listMasked(deploymentId: string): Promise<MaskedEnvVar[]> {
    return this.db
      .select({ key: envVars.key, scope: envVars.scope, isSecret: envVars.isSecret })
      .from(envVars)
      .where(eq(envVars.deploymentId, deploymentId));
  }

  // Decrypts only the vars relevant to a phase — used at build/run injection time.
  async resolveForInjection(
    deploymentId: string,
    phase: InjectionPhase,
  ): Promise<Record<string, string>> {
    const rows = await this.db.select().from(envVars).where(eq(envVars.deploymentId, deploymentId));
    const resolved: Record<string, string> = {};

    for (const row of rows) {
      if (row.scope === phase || row.scope === "BOTH") {
        resolved[row.key] = this.crypto.decrypt({
          cipherText: row.cipherText,
          nonce: row.nonce,
          authTag: row.authTag,
          keyVersion: row.keyVersion,
        });
      }
    }

    return resolved;
  }
}
