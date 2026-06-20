import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DatabaseError } from "../common/errors";
import { CryptoService } from "../crypto/crypto.service";
import { DB, type Database } from "../db/db.module";
import { deployments, domains, gitCredentials, portBindings } from "../db/schema";
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
export type Domain = typeof domains.$inferSelect;
export type PortBinding = typeof portBindings.$inferSelect;

// A domain with its routing target, ordered primary-first — consumed by the Traefik route grouping.
// A domain expands into its regular 443 route (hostPort null) plus one route per hard-bound host
// port, each carrying its own internal target.
export interface DomainRoute {
  fqdn: string;
  targetService: string | null;
  targetPort: number | null;
  hostPort: number | null;
  isPrimary: boolean;
}

export interface PortBindingInput {
  hostPort: number;
  targetService?: string | null;
  targetPort?: number | null;
}

export interface DomainTargetInput {
  fqdn: string;
  // false = port-bind-only domain (no regular 443 route). Defaults to true.
  webRoute?: boolean;
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

// Expands stored domains + their hard-bound ports into flat Traefik routes (primary first). A domain
// contributes a regular 443 route (hostPort null) only when its webRoute is on; every binding adds a
// dedicated-port route regardless. Pure so the routing shape can be unit-tested without a database.
export function expandDomainRoutes(
  domainRows: Array<{
    id: string;
    fqdn: string;
    webRoute: boolean;
    targetService: string | null;
    targetPort: number | null;
    isPrimary: boolean;
  }>,
  bindingRows: Array<{
    domainId: string;
    hostPort: number;
    targetService: string | null;
    targetPort: number | null;
  }>,
): DomainRoute[] {
  const bindingsByDomain = new Map<string, typeof bindingRows>();

  for (const binding of bindingRows) {
    const list = bindingsByDomain.get(binding.domainId) ?? [];
    list.push(binding);
    bindingsByDomain.set(binding.domainId, list);
  }

  const routes: DomainRoute[] = [];

  for (const domain of domainRows) {
    if (domain.webRoute) {
      routes.push({
        fqdn: domain.fqdn,
        targetService: domain.targetService,
        targetPort: domain.targetPort,
        hostPort: null,
        isPrimary: domain.isPrimary,
      });
    }

    for (const binding of bindingsByDomain.get(domain.id) ?? []) {
      routes.push({
        fqdn: domain.fqdn,
        targetService: binding.targetService,
        targetPort: binding.targetPort,
        hostPort: binding.hostPort,
        isPrimary: domain.isPrimary,
      });
    }
  }

  return routes.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

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
      await this.db.insert(domains).values({
        deploymentId: deployment.id,
        fqdn: input.domain,
        isPrimary: true,
        targetPort: input.domainPort ?? null,
        targetService: input.domainService ?? null,
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

  // All routes for a deployment (primary first), for building Traefik routers. Each domain yields
  // its regular 443 route (hostPort null) plus one route per hard-bound host port — the latter each
  // carrying their own internal target and served on a dedicated entrypoint.
  async domainRoutes(deploymentId: string): Promise<DomainRoute[]> {
    const domainRows = await this.db
      .select({
        id: domains.id,
        fqdn: domains.fqdn,
        webRoute: domains.webRoute,
        targetService: domains.targetService,
        targetPort: domains.targetPort,
        isPrimary: domains.isPrimary,
      })
      .from(domains)
      .where(eq(domains.deploymentId, deploymentId));

    const bindingRows = await this.db
      .select({
        domainId: portBindings.domainId,
        hostPort: portBindings.hostPort,
        targetService: portBindings.targetService,
        targetPort: portBindings.targetPort,
      })
      .from(portBindings)
      .innerJoin(domains, eq(portBindings.domainId, domains.id))
      .where(eq(domains.deploymentId, deploymentId));

    return expandDomainRoutes(domainRows, bindingRows);
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

  // Domains (primary-first) each with their hard-bound host ports attached, so the UI can render the
  // full route list — a domain's 443 web route plus its port binds — without an N+1 fetch per domain.
  async domainsWithBindings(
    deploymentId: string,
  ): Promise<Array<{ domain: Domain; bindings: PortBinding[] }>> {
    const domainRows = await this.listDomains(deploymentId);

    const bindingRows = await this.db
      .select({ binding: portBindings })
      .from(portBindings)
      .innerJoin(domains, eq(portBindings.domainId, domains.id))
      .where(eq(domains.deploymentId, deploymentId))
      .orderBy(portBindings.hostPort);

    const byDomain = new Map<string, PortBinding[]>();

    for (const { binding } of bindingRows) {
      const list = byDomain.get(binding.domainId) ?? [];
      list.push(binding);
      byDomain.set(binding.domainId, list);
    }

    return domainRows.map((domain) => ({ domain, bindings: byDomain.get(domain.id) ?? [] }));
  }

  // Adds an extra FQDN; becomes primary only if the deployment has none yet. Optionally pins the
  // domain to a specific container/service + port (granular routing); omitted = deployment default.
  async addDomain(deploymentId: string, input: DomainTargetInput): Promise<Domain> {
    const webRoute = input.webRoute ?? true;
    const existing = await this.primaryDomain(deploymentId);
    const [row] = await this.db
      .insert(domains)
      .values({
        deploymentId,
        fqdn: input.fqdn,
        webRoute,
        targetService: input.targetService ?? null,
        targetPort: input.targetPort ?? null,
        // A port-bind-only domain never serves 443, so it can't be the primary landing page.
        isPrimary: webRoute && !existing,
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
    target: { webRoute?: boolean; targetService: string | null; targetPort: number | null },
  ): Promise<Domain> {
    const [row] = await this.db
      .update(domains)
      .set({
        ...(target.webRoute === undefined ? {} : { webRoute: target.webRoute }),
        targetService: target.targetService,
        targetPort: target.targetPort,
        updatedAt: new Date(),
      })
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)))
      .returning();

    if (!row) {
      throw new NotFoundException("domain not found for this deployment");
    }

    // Dropping the 443 route off the primary domain hands primary to another web-serving domain.
    if (target.webRoute === false && row.isPrimary) {
      await this.demotePrimary(deploymentId, domainId);
    }

    return row;
  }

  // Clears `domainId` as primary and promotes another web-serving domain (if any) in its place.
  private async demotePrimary(deploymentId: string, domainId: string): Promise<void> {
    await this.db.update(domains).set({ isPrimary: false }).where(eq(domains.id, domainId));

    const [next] = await this.db
      .select()
      .from(domains)
      .where(and(eq(domains.deploymentId, deploymentId), eq(domains.webRoute, true)))
      .limit(1);

    if (next) {
      await this.db.update(domains).set({ isPrimary: true }).where(eq(domains.id, next.id));
    }
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
        .where(and(eq(domains.deploymentId, deploymentId), eq(domains.webRoute, true)))
        .limit(1);

      if (next) {
        await this.db.update(domains).set({ isPrimary: true }).where(eq(domains.id, next.id));
      }
    }
  }

  async makePrimary(deploymentId: string, domainId: string): Promise<void> {
    const domain = await this.findDomain(deploymentId, domainId);

    if (!domain) {
      throw new NotFoundException("domain not found for this deployment");
    }

    // A port-bind-only domain serves no 443 landing page, so it can't be the primary.
    if (!domain.webRoute) {
      throw new ConflictException("a port-bind-only domain cannot be made primary");
    }

    await this.db
      .update(domains)
      .set({ isPrimary: false })
      .where(eq(domains.deploymentId, deploymentId));
    await this.db
      .update(domains)
      .set({ isPrimary: true })
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)));
  }

  // Confirms a domain belongs to a deployment (ownership check for the nested binding endpoints).
  async findDomain(deploymentId: string, domainId: string): Promise<Domain | undefined> {
    const rows = await this.db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)))
      .limit(1);

    return rows[0];
  }

  listPortBindings(domainId: string): Promise<PortBinding[]> {
    return this.db
      .select()
      .from(portBindings)
      .where(eq(portBindings.domainId, domainId))
      .orderBy(portBindings.hostPort);
  }

  // Host ports already claimed across ALL domains/deployments — a host port binds at most once.
  async allocatedHostPorts(): Promise<number[]> {
    const rows = await this.db.select({ hostPort: portBindings.hostPort }).from(portBindings);

    return rows.map((row) => row.hostPort);
  }

  // Lowest free port within the active sub-range, across all bindings. Throws when exhausted.
  async suggestFreePort(range: { start: number; end: number }): Promise<number> {
    const taken = new Set(await this.allocatedHostPorts());

    for (let port = range.start; port <= range.end; port += 1) {
      if (!taken.has(port)) {
        return port;
      }
    }

    throw new ConflictException("no free host port available in the configured range");
  }

  async addPortBinding(domainId: string, input: PortBindingInput): Promise<PortBinding> {
    await this.assertHostPortFree(input.hostPort);

    const [row] = await this.db
      .insert(portBindings)
      .values({
        domainId,
        hostPort: input.hostPort,
        targetService: input.targetService ?? null,
        targetPort: input.targetPort ?? null,
      })
      .returning();

    if (!row) {
      throw new DatabaseError("port binding insert returned no row");
    }

    return row;
  }

  async updatePortBinding(
    domainId: string,
    bindingId: string,
    patch: PortBindingInput,
  ): Promise<PortBinding> {
    await this.assertHostPortFree(patch.hostPort, bindingId);

    const [row] = await this.db
      .update(portBindings)
      .set({
        hostPort: patch.hostPort,
        targetService: patch.targetService ?? null,
        targetPort: patch.targetPort ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(portBindings.id, bindingId), eq(portBindings.domainId, domainId)))
      .returning();

    if (!row) {
      throw new NotFoundException("port binding not found for this domain");
    }

    return row;
  }

  async removePortBinding(domainId: string, bindingId: string): Promise<void> {
    await this.db
      .delete(portBindings)
      .where(and(eq(portBindings.id, bindingId), eq(portBindings.domainId, domainId)));
  }

  // The DB UNIQUE(host_port) is the hard guarantee; this pre-check turns a concurrent clash into a
  // friendly 409 instead of a 500 for the common (non-racing) case.
  private async assertHostPortFree(hostPort: number, excludeBindingId?: string): Promise<void> {
    const [clash] = await this.db
      .select({ id: portBindings.id })
      .from(portBindings)
      .where(eq(portBindings.hostPort, hostPort))
      .limit(1);

    if (clash && clash.id !== excludeBindingId) {
      throw new ConflictException(`host port ${hostPort} is already bound`);
    }
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
