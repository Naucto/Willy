import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DatabaseError } from "../common/errors";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { deployments, domains, gitCredentials } from "../db/schema";
import type {
  ComposeConfig,
  DockerfileConfig,
  ImageConfig,
  StrategyConfig,
} from "./strategy-config";

export type Deployment = typeof deployments.$inferSelect;
export type DeploymentType = Deployment["type"];
export type DeploymentState = Deployment["state"];
export type Domain = typeof domains.$inferSelect;

// A domain with its routing target, ordered primary-first — consumed by the Traefik route grouping.
export interface DomainRoute {
  fqdn: string;
  targetService: string | null;
  targetPort: number | null;
  isPrimary: boolean;
}

export interface DomainTargetInput {
  fqdn: string;
  targetService?: string | null;
  targetPort?: number | null;
}

// Raw per-strategy fields as they arrive from the API, normalised into the stored StrategyConfig.
interface StrategyFields {
  dockerfilePath?: string | null;
  composeFilePath?: string | null;
  composeWebService?: string | null;
  imageRef?: string | null;
}

function buildStrategyConfig(
  strategy: Deployment["buildStrategy"],
  fields: StrategyFields,
): StrategyConfig {
  if (strategy === "DOCKERFILE") {
    return fields.dockerfilePath ? { dockerfilePath: fields.dockerfilePath } : {};
  }

  if (strategy === "COMPOSE") {
    return {
      ...(fields.composeFilePath ? { composeFilePath: fields.composeFilePath } : {}),
      ...(fields.composeWebService ? { composeWebService: fields.composeWebService } : {}),
    };
  }

  if (strategy === "IMAGE") {
    return { imageRef: fields.imageRef ?? "" };
  }

  return {};
}

// Typed views of strategyConfig, narrowed by the deployment's build strategy.
export function dockerfileConfig(deployment: Deployment): DockerfileConfig {
  return (
    deployment.buildStrategy === "DOCKERFILE" ? deployment.strategyConfig : {}
  ) as DockerfileConfig;
}

export function composeConfig(deployment: Deployment): ComposeConfig {
  return (deployment.buildStrategy === "COMPOSE" ? deployment.strategyConfig : {}) as ComposeConfig;
}

export function imageConfig(deployment: Deployment): ImageConfig | undefined {
  return deployment.buildStrategy === "IMAGE"
    ? (deployment.strategyConfig as ImageConfig)
    : undefined;
}

export interface CreateDeploymentInput {
  name: string;
  type: DeploymentType;
  gitUrl?: string;
  gitRef?: string;
  buildStrategy?: Deployment["buildStrategy"];
  dockerfilePath?: string;
  composeFilePath?: string;
  composeWebService?: string;
  imageRef?: string;
  webServicePort?: number;
  healthCheckPath?: string;
  runCommand?: string;
  cronExpr?: string;
  memoryLimitMb?: number;
  nanoCpus?: number;
  capAdd?: string[];
  capDrop?: string[];
  domain?: string;
  gitToken?: string;
}

// Fields editable after creation (name/type are immutable; the git token has its own flow).
export interface UpdateDeploymentInput {
  gitUrl?: string;
  gitRef?: string;
  buildStrategy?: Deployment["buildStrategy"];
  dockerfilePath?: string | null;
  composeFilePath?: string | null;
  composeWebService?: string | null;
  imageRef?: string | null;
  webServicePort?: number | null;
  healthCheckPath?: string;
  runCommand?: string | null;
  cronExpr?: string | null;
  autoDeploy?: boolean;
  restartPolicy?: Deployment["restartPolicy"];
  memoryLimitMb?: number | null;
  nanoCpus?: number | null;
  capAdd?: string[] | null;
  capDrop?: string[] | null;
  // The primary domain lives in a separate table; handled out-of-band in update().
  domain?: string;
}

// A deployment plus its primary domain, for API responses.
export type DeploymentView = Deployment & { primaryDomain: string | null };

const EDITABLE_FIELDS: (keyof UpdateDeploymentInput)[] = [
  "gitUrl",
  "gitRef",
  "buildStrategy",
  "webServicePort",
  "healthCheckPath",
  "runCommand",
  "cronExpr",
  "autoDeploy",
  "restartPolicy",
  "memoryLimitMb",
  "nanoCpus",
  "capAdd",
  "capDrop",
];

@Injectable()
export class DeploymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
  ) {}

  async create(input: CreateDeploymentInput): Promise<Deployment> {
    const isImage = input.buildStrategy === "IMAGE";

    if (isImage && !input.imageRef) {
      throw new DatabaseError("image deployments require an image reference");
    }

    if (!isImage && !input.gitUrl) {
      throw new DatabaseError("git-based deployments require a git URL");
    }

    const rows = await this.db
      .insert(deployments)
      .values({
        name: input.name,
        type: input.type,
        gitUrl: input.gitUrl ?? "",
        gitRef: input.gitRef ?? "main",
        buildStrategy: input.buildStrategy ?? "DOCKERFILE",
        strategyConfig: buildStrategyConfig(input.buildStrategy ?? "DOCKERFILE", input),
        webServicePort: input.webServicePort ?? null,
        healthCheckPath: input.healthCheckPath ?? "/",
        runCommand: input.runCommand ?? null,
        cronExpr: input.cronExpr ?? null,
        memoryLimitMb: input.memoryLimitMb ?? null,
        nanoCpus: input.nanoCpus ?? null,
        capAdd: input.capAdd ?? null,
        capDrop: input.capDrop ?? null,
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

  async update(id: string, input: UpdateDeploymentInput): Promise<Deployment> {
    // Domain lives in its own table; apply it separately (takes effect on next deploy/restart).
    if (input.domain !== undefined) {
      await this.setPrimaryDomain(id, input.domain);
    }

    const fields: Partial<typeof deployments.$inferInsert> = { updatedAt: new Date() };

    const assign = <K extends keyof UpdateDeploymentInput>(key: K): void => {
      const value = input[key];

      if (value !== undefined) {
        (fields as Record<string, unknown>)[key] = value;
      }
    };

    for (const key of EDITABLE_FIELDS) {
      assign(key);
    }

    // Rebuild the per-strategy config when the strategy or any of its fields are touched. The
    // settings form always submits the full set for the active strategy, so a full rebuild is safe.
    const touchesStrategy =
      input.buildStrategy !== undefined ||
      input.dockerfilePath !== undefined ||
      input.composeFilePath !== undefined ||
      input.composeWebService !== undefined ||
      input.imageRef !== undefined;

    if (touchesStrategy) {
      const current = await this.findById(id);
      const strategy = input.buildStrategy ?? current?.buildStrategy ?? "DOCKERFILE";
      fields.strategyConfig = buildStrategyConfig(strategy, input);
    }

    const rows = await this.db
      .update(deployments)
      .set(fields)
      .where(eq(deployments.id, id))
      .returning();

    const deployment = rows[0];

    if (!deployment) {
      throw new DatabaseError("deployment update returned no row");
    }

    return deployment;
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

  // All domains attached to a deployment (primary first) with their routing target, for building
  // per-(service, port) Traefik routers.
  async domainRoutes(deploymentId: string): Promise<DomainRoute[]> {
    const rows = await this.db
      .select({
        fqdn: domains.fqdn,
        targetService: domains.targetService,
        targetPort: domains.targetPort,
        isPrimary: domains.isPrimary,
      })
      .from(domains)
      .where(eq(domains.deploymentId, deploymentId));

    return rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }

  // Sets/replaces the deployment's primary domain. Applies to routing on the next deploy/restart.
  async setPrimaryDomain(deploymentId: string, fqdn: string): Promise<void> {
    const existing = await this.primaryDomain(deploymentId);

    if (existing) {
      await this.db
        .update(domains)
        .set({ fqdn, updatedAt: new Date() })
        .where(eq(domains.id, existing.id));

      return;
    }

    await this.db.insert(domains).values({ deploymentId, fqdn, isPrimary: true });
  }

  listDomains(deploymentId: string): Promise<Domain[]> {
    return this.db
      .select()
      .from(domains)
      .where(eq(domains.deploymentId, deploymentId))
      .orderBy(desc(domains.isPrimary), domains.fqdn);
  }

  // Adds an extra FQDN; becomes primary only if the deployment has none yet. Optionally pins the
  // domain to a specific container/service + port (granular routing); omitted = deployment default.
  async addDomain(deploymentId: string, input: DomainTargetInput): Promise<Domain> {
    const existing = await this.primaryDomain(deploymentId);
    const [row] = await this.db
      .insert(domains)
      .values({
        deploymentId,
        fqdn: input.fqdn,
        targetService: input.targetService ?? null,
        targetPort: input.targetPort ?? null,
        isPrimary: !existing,
      })
      .returning();

    if (!row) {
      throw new DatabaseError("domain insert returned no row");
    }

    return row;
  }

  // Repoints a domain at a different container/service + port. null clears the override (back to
  // the deployment default). Applies to routing on the next deploy/restart.
  async updateDomainTarget(
    deploymentId: string,
    domainId: string,
    target: { targetService: string | null; targetPort: number | null },
  ): Promise<Domain> {
    const [row] = await this.db
      .update(domains)
      .set({
        targetService: target.targetService,
        targetPort: target.targetPort,
        updatedAt: new Date(),
      })
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)))
      .returning();

    if (!row) {
      throw new NotFoundException("domain not found for this deployment");
    }

    return row;
  }

  // Removes a domain; if it was primary, promotes another (so a WEB deployment keeps a primary).
  async removeDomain(deploymentId: string, domainId: string): Promise<void> {
    const [removed] = await this.db
      .delete(domains)
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)))
      .returning();

    if (removed?.isPrimary) {
      const [next] = await this.db
        .select()
        .from(domains)
        .where(eq(domains.deploymentId, deploymentId))
        .limit(1);

      if (next) {
        await this.db.update(domains).set({ isPrimary: true }).where(eq(domains.id, next.id));
      }
    }
  }

  async makePrimary(deploymentId: string, domainId: string): Promise<void> {
    await this.db
      .update(domains)
      .set({ isPrimary: false })
      .where(eq(domains.deploymentId, deploymentId));
    await this.db
      .update(domains)
      .set({ isPrimary: true })
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)));
  }

  // List/get enriched with the primary domain fqdn for API responses.
  async findAllForApi(): Promise<DeploymentView[]> {
    const rows = await this.db.select().from(deployments);
    const primary = await this.db
      .select({ deploymentId: domains.deploymentId, fqdn: domains.fqdn })
      .from(domains)
      .where(eq(domains.isPrimary, true));
    const byDeployment = new Map(primary.map((row) => [row.deploymentId, row.fqdn]));

    return rows.map((row) => ({ ...row, primaryDomain: byDeployment.get(row.id) ?? null }));
  }

  async findByIdForApi(id: string): Promise<DeploymentView | undefined> {
    const deployment = await this.findById(id);

    if (!deployment) {
      return undefined;
    }

    const domain = await this.primaryDomain(id);

    return { ...deployment, primaryDomain: domain?.fqdn ?? null };
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
