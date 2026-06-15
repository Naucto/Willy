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
  targetService?: string | undefined;
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
    const targetService = input.targetService ?? "";
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
      .values({ deploymentId, key, targetService, ...fields })
      .onConflictDoUpdate({
        target: [envVars.deploymentId, envVars.targetService, envVars.key],
        set: { ...fields, updatedAt: new Date() },
      });
  }

  async delete(deploymentId: string, key: string, targetService = ""): Promise<void> {
    await this.db
      .delete(envVars)
      .where(
        and(
          eq(envVars.deploymentId, deploymentId),
          eq(envVars.targetService, targetService),
          eq(envVars.key, key),
        ),
      );
  }

  // Reads never expose plaintext values. Scoped to a service ("" = deployment-wide/shared).
  async listMasked(deploymentId: string, targetService = ""): Promise<MaskedEnvVar[]> {
    return this.db
      .select({ key: envVars.key, scope: envVars.scope, isSecret: envVars.isSecret })
      .from(envVars)
      .where(and(eq(envVars.deploymentId, deploymentId), eq(envVars.targetService, targetService)));
  }

  // Distinct compose services that have service-specific vars (excludes the "" shared scope).
  async servicesWithEnv(deploymentId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ targetService: envVars.targetService })
      .from(envVars)
      .where(eq(envVars.deploymentId, deploymentId));

    return rows.map((row) => row.targetService).filter((service) => service !== "");
  }

  // Decrypts only the vars relevant to a phase — used at build/run injection time. Merges shared
  // ("") vars with the given service's, the service-specific ones taking precedence.
  async resolveForInjection(
    deploymentId: string,
    phase: InjectionPhase,
    service = "",
  ): Promise<Record<string, string>> {
    const rows = await this.db.select().from(envVars).where(eq(envVars.deploymentId, deploymentId));
    const resolved: Record<string, string> = {};

    // Shared first, then service-specific so the latter overrides on key conflict.
    const ordered = [...rows].sort(
      (a, b) => Number(a.targetService !== "") - Number(b.targetService !== ""),
    );

    for (const row of ordered) {
      const applies = row.targetService === "" || row.targetService === service;

      if (applies && (row.scope === phase || row.scope === "BOTH")) {
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
