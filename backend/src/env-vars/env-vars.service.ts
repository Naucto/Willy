import { BadRequestException, Inject, Injectable } from "@nestjs/common";
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
  // Plaintext for regular vars; null for secrets (never returned in plaintext).
  value: string | null;
}

export interface SetEnvVarInput {
  scope?: EnvScope | undefined;
  isSecret?: boolean | undefined;
  targetService?: string | undefined;
}

export interface UpdateEnvVarMetaInput {
  scope?: EnvScope | undefined;
  isSecret?: boolean | undefined;
}

// A secret's value is never exposed; a regular var shows its value. Pure for unit-testing.
export function maskedEnvValue(isSecret: boolean, value: string): string | null {
  return isSecret ? null : value;
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

  // Lists vars for a service ("" = deployment-wide/shared). Regular vars carry their plaintext
  // value; secrets are returned with value === null.
  async listMasked(deploymentId: string, targetService = ""): Promise<MaskedEnvVar[]> {
    const rows = await this.db
      .select()
      .from(envVars)
      .where(and(eq(envVars.deploymentId, deploymentId), eq(envVars.targetService, targetService)));

    return rows.map((row) => ({
      key: row.key,
      scope: row.scope,
      isSecret: row.isSecret,
      value: maskedEnvValue(
        row.isSecret,
        row.isSecret
          ? ""
          : this.crypto.decrypt({
              cipherText: row.cipherText,
              nonce: row.nonce,
              authTag: row.authTag,
              keyVersion: row.keyVersion,
            }),
      ),
    }));
  }

  // Changes a var's scope and/or type without re-supplying the value. Converting a secret to a
  // regular var is refused here — that must go through `set` with a fresh value, so a stored secret
  // is never auto-revealed.
  async updateMeta(
    deploymentId: string,
    key: string,
    targetService: string,
    input: UpdateEnvVarMetaInput,
  ): Promise<void> {
    const [row] = await this.db
      .select({ isSecret: envVars.isSecret })
      .from(envVars)
      .where(
        and(
          eq(envVars.deploymentId, deploymentId),
          eq(envVars.targetService, targetService),
          eq(envVars.key, key),
        ),
      );

    if (!row) {
      throw new BadRequestException("Variable not found");
    }

    if (row.isSecret && input.isSecret === false) {
      throw new BadRequestException(
        "Converting a secret to a regular variable requires a new value",
      );
    }

    await this.db
      .update(envVars)
      .set({
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.isSecret !== undefined ? { isSecret: input.isSecret } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(envVars.deploymentId, deploymentId),
          eq(envVars.targetService, targetService),
          eq(envVars.key, key),
        ),
      );
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
