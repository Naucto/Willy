import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { BuildOrchestrator } from "../build/build-orchestrator.service";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { webhookSecrets } from "../db/schema";
import { DeploymentsService } from "../deployments/deployments.service";

export interface WebhookOutcome {
  accepted: boolean;
  reason?: string;
}

// Constant-time check of a GitHub `X-Hub-Signature-256` header against the raw body.
export function githubSignatureMatches(
  secret: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly deployments: DeploymentsService,
    private readonly orchestrator: BuildOrchestrator,
  ) {}

  // Generates a fresh secret, stores it encrypted, and returns the plaintext once.
  async rotateSecret(deploymentId: string): Promise<string> {
    const secret = randomBytes(24).toString("hex");
    const sealed = this.crypto.encrypt(secret);
    const fields = {
      secretCipher: sealed.cipherText,
      nonce: sealed.nonce,
      authTag: sealed.authTag,
      keyVersion: sealed.keyVersion,
    };

    await this.db
      .insert(webhookSecrets)
      .values({ deploymentId, ...fields })
      .onConflictDoUpdate({ target: webhookSecrets.deploymentId, set: fields });

    return secret;
  }

  async isConfigured(deploymentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: webhookSecrets.id })
      .from(webhookSecrets)
      .where(eq(webhookSecrets.deploymentId, deploymentId))
      .limit(1);

    return rows.length > 0;
  }

  // Verifies the HMAC signature, then deploys when the event/ref/autoDeploy gate allows it.
  // Returns false (never throws) for a valid-but-ignored delivery; the signature check is the
  // only hard failure path and is surfaced by the caller as 401.
  async handlePush(
    deploymentId: string,
    signature: string,
    event: string,
    rawBody: Buffer,
  ): Promise<WebhookOutcome> {
    const secret = await this.getSecret(deploymentId);

    if (!secret || !githubSignatureMatches(secret, rawBody, signature)) {
      return { accepted: false, reason: "invalid signature" };
    }

    if (event !== "push") {
      return { accepted: false, reason: `ignored event: ${event}` };
    }

    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      return { accepted: false, reason: "unknown deployment" };
    }

    if (!deployment.autoDeploy) {
      return { accepted: false, reason: "auto-deploy disabled" };
    }

    const branch = this.parseBranch(rawBody);

    if (branch !== deployment.gitRef) {
      return { accepted: false, reason: `ref ${branch ?? "?"} != ${deployment.gitRef}` };
    }

    await this.orchestrator.deploy(deploymentId);
    this.logger.log(`webhook deploy queued for ${deployment.name}`);

    return { accepted: true };
  }

  private async getSecret(deploymentId: string): Promise<string | undefined> {
    const rows = await this.db
      .select()
      .from(webhookSecrets)
      .where(eq(webhookSecrets.deploymentId, deploymentId))
      .limit(1);

    const row = rows[0];

    if (!row) {
      return undefined;
    }

    return this.crypto.decrypt({
      cipherText: row.secretCipher,
      nonce: row.nonce,
      authTag: row.authTag,
      keyVersion: row.keyVersion,
    });
  }

  private parseBranch(rawBody: Buffer): string | undefined {
    try {
      const payload = JSON.parse(rawBody.toString("utf8")) as { ref?: string };

      return payload.ref?.replace("refs/heads/", "");
    } catch {
      return undefined;
    }
  }
}
