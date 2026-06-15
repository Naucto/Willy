import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseError } from "../common/errors";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { deployments, domains, gitCredentials } from "../db/schema";

export type Deployment = typeof deployments.$inferSelect;
export type DeploymentType = Deployment["type"];
export type DeploymentState = Deployment["state"];
export type Domain = typeof domains.$inferSelect;

export interface CreateDeploymentInput {
  name: string;
  type: DeploymentType;
  gitUrl: string;
  gitRef?: string;
  buildStrategy?: Deployment["buildStrategy"];
  dockerfilePath?: string;
  webServicePort?: number;
  healthCheckPath?: string;
  runCommand?: string;
  cronExpr?: string;
  memoryLimitMb?: number;
  domain?: string;
  gitToken?: string;
}

@Injectable()
export class DeploymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  async create(input: CreateDeploymentInput): Promise<Deployment> {
    const rows = await this.db
      .insert(deployments)
      .values({
        name: input.name,
        type: input.type,
        gitUrl: input.gitUrl,
        gitRef: input.gitRef ?? "main",
        buildStrategy: input.buildStrategy ?? "DOCKERFILE",
        dockerfilePath: input.dockerfilePath ?? null,
        webServicePort: input.webServicePort ?? null,
        healthCheckPath: input.healthCheckPath ?? "/",
        runCommand: input.runCommand ?? null,
        cronExpr: input.cronExpr ?? null,
        memoryLimitMb: input.memoryLimitMb ?? null,
      })
      .returning();

    const deployment = rows[0];

    if (!deployment) {
      throw new DatabaseError("deployment insert returned no row");
    }

    if (input.domain) {
      await this.db
        .insert(domains)
        .values({ deploymentId: deployment.id, fqdn: input.domain, isPrimary: true });
    }

    if (input.gitToken) {
      const sealed = this.crypto.encrypt(input.gitToken);
      await this.db.insert(gitCredentials).values({
        name: `${input.name}-token`,
        kind: "PAT",
        deploymentId: deployment.id,
        cipherText: sealed.cipherText,
        nonce: sealed.nonce,
        authTag: sealed.authTag,
        keyVersion: sealed.keyVersion,
      });
    }

    return deployment;
  }

  findAll(): Promise<Deployment[]> {
    return this.db.select().from(deployments);
  }

  async findById(id: string): Promise<Deployment | undefined> {
    const rows = await this.db.select().from(deployments).where(eq(deployments.id, id)).limit(1);

    return rows[0];
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(deployments).where(eq(deployments.id, id));
  }

  async setState(id: string, state: DeploymentState): Promise<void> {
    await this.db
      .update(deployments)
      .set({ state, updatedAt: new Date() })
      .where(eq(deployments.id, id));
  }

  async setActiveRelease(id: string, releaseId: string | null): Promise<void> {
    await this.db
      .update(deployments)
      .set({ activeReleaseId: releaseId, updatedAt: new Date() })
      .where(eq(deployments.id, id));
  }

  async primaryDomain(deploymentId: string): Promise<Domain | undefined> {
    const rows = await this.db
      .select()
      .from(domains)
      .where(and(eq(domains.deploymentId, deploymentId), eq(domains.isPrimary, true)))
      .limit(1);

    return rows[0];
  }

  async resolveGitToken(deploymentId: string): Promise<string | undefined> {
    const rows = await this.db
      .select()
      .from(gitCredentials)
      .where(eq(gitCredentials.deploymentId, deploymentId))
      .limit(1);

    const cred = rows[0];

    if (!cred?.cipherText || !cred.nonce || !cred.authTag) {
      return undefined;
    }

    return this.crypto.decrypt({
      cipherText: cred.cipherText,
      nonce: cred.nonce,
      authTag: cred.authTag,
      keyVersion: cred.keyVersion,
    });
  }
}
