import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseError } from "../common/errors";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { requireRow } from "../db/query-helpers";
import { deployments, gitCredentials } from "../db/schema";
import { DomainsService } from "./domains.service";
import type { HealthcheckSpec, ResourceLimits } from "./resource-limits";
import type {
  ComposeConfig,
  DockerfileConfig,
  ImageConfig,
  StrategyConfig,
} from "./strategy-config";

export type Deployment = typeof deployments.$inferSelect;
export type DeploymentType = Deployment["type"];
export type DeploymentState = Deployment["state"];

// Domain/port-binding routing lives in its own services now; re-exported here so existing imports of
// these types from deployments.service keep resolving.
export type { Domain, DomainRoute, DomainTargetInput } from "./domains.service";
export { expandDomainRoutes } from "./domains.service";
export type { PortBinding, PortBindingInput } from "./port-bindings.service";

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
  runCommand?: string;
  cronExpr?: string;
  memoryLimitMb?: number;
  nanoCpus?: number;
  capAdd?: string[];
  capDrop?: string[];
  domain?: string;
  // Optional binding for the primary domain created alongside the deployment (wizard).
  domainPort?: number;
  domainService?: string;
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
  runCommand?: string | null;
  cronExpr?: string | null;
  autoDeploy?: boolean;
  restartPolicy?: Deployment["restartPolicy"];
  memoryLimitMb?: number | null;
  nanoCpus?: number | null;
  capAdd?: string[] | null;
  capDrop?: string[] | null;
  logMaxSizeMb?: number | null;
  logMaxFiles?: number | null;
  healthcheck?: HealthcheckSpec | null;
  // The primary domain lives in a separate table; handled out-of-band in update().
  domain?: string;
}

// A deployment plus its primary domain, for API responses.
export type DeploymentView = Deployment & { primaryDomain: string | null };

const EDITABLE_FIELDS: (keyof UpdateDeploymentInput)[] = [
  "gitUrl",
  "gitRef",
  "buildStrategy",
  "runCommand",
  "cronExpr",
  "autoDeploy",
  "restartPolicy",
  "memoryLimitMb",
  "nanoCpus",
  "capAdd",
  "capDrop",
  "logMaxSizeMb",
  "logMaxFiles",
  "healthcheck",
];

@Injectable()
export class DeploymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly domains: DomainsService,
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
        runCommand: input.runCommand ?? null,
        cronExpr: input.cronExpr ?? null,
        memoryLimitMb: input.memoryLimitMb ?? null,
        nanoCpus: input.nanoCpus ?? null,
        capAdd: input.capAdd ?? null,
        capDrop: input.capDrop ?? null,
      })
      .returning();

    const deployment = requireRow(rows, "deployment insert returned no row");

    if (input.domain) {
      await this.domains.addDomain(deployment.id, {
        fqdn: input.domain,
        targetService: input.domainService ?? null,
        targetPort: input.domainPort ?? null,
      });
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
      await this.domains.setPrimaryDomain(id, input.domain);
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

    return requireRow(rows, "deployment update returned no row");
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

  // Updates a compose service's resource limits. The Resources and Health tabs each own a disjoint
  // subset of a service's limits (memory/cpu/caps/logs vs restart/healthcheck), so the incoming
  // partial is *merged* onto the stored entry rather than replacing it — otherwise saving one tab
  // would wipe the other's fields. Applies on the next deploy/restart.
  async updateServiceResources(
    id: string,
    service: string,
    limits: ResourceLimits,
  ): Promise<Deployment> {
    const current = await this.findById(id);

    if (!current) {
      throw new NotFoundException("deployment not found");
    }

    const next = { ...(current.serviceResources ?? {}) };
    next[service] = { ...(next[service] ?? {}), ...limits };

    const [row] = await this.db
      .update(deployments)
      .set({ serviceResources: next, updatedAt: new Date() })
      .where(eq(deployments.id, id))
      .returning();

    if (!row) {
      throw new NotFoundException("deployment not found");
    }

    return row;
  }

  // List/get enriched with the primary domain fqdn for API responses.
  async findAllForApi(): Promise<DeploymentView[]> {
    const rows = await this.db.select().from(deployments);
    const byDeployment = await this.domains.primaryFqdns();

    return rows.map((row) => ({ ...row, primaryDomain: byDeployment.get(row.id) ?? null }));
  }

  async findByIdForApi(id: string): Promise<DeploymentView | undefined> {
    const deployment = await this.findById(id);

    if (!deployment) {
      return undefined;
    }

    const domain = await this.domains.primaryDomain(id);

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
