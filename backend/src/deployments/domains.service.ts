import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { requireRow } from "../db/query-helpers";
import { domains, portBindings } from "../db/schema";

export type Domain = typeof domains.$inferSelect;

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

export interface DomainTargetInput {
  fqdn: string;
  // false = port-bind-only domain (no regular 443 route). Defaults to true.
  webRoute?: boolean;
  targetService?: string | null;
  targetPort?: number | null;
}

type PortBinding = typeof portBindings.$inferSelect;

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

// Deployment domains: the routing metadata that pins FQDNs to a deployment's containers/ports, plus
// the primary-domain bookkeeping. Hard-bound host ports live in PortBindingsService.
@Injectable()
export class DomainsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async primaryDomain(deploymentId: string): Promise<Domain | undefined> {
    const rows = await this.db
      .select()
      .from(domains)
      .where(and(eq(domains.deploymentId, deploymentId), eq(domains.isPrimary, true)))
      .limit(1);

    return rows[0];
  }

  // Map of deploymentId → primary FQDN across all deployments, for enriching API list responses.
  async primaryFqdns(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ deploymentId: domains.deploymentId, fqdn: domains.fqdn })
      .from(domains)
      .where(eq(domains.isPrimary, true));

    return new Map(rows.map((row) => [row.deploymentId, row.fqdn]));
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

    return requireRow(
      await this.db
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
        .returning(),
      "domain insert returned no row",
    );
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

  // Removes a domain; if it was primary, promotes another (so a WEB deployment keeps a primary).
  async removeDomain(deploymentId: string, domainId: string): Promise<void> {
    const [removed] = await this.db
      .delete(domains)
      .where(and(eq(domains.id, domainId), eq(domains.deploymentId, deploymentId)))
      .returning();

    if (removed?.isPrimary) {
      await this.promoteAnotherPrimary(deploymentId);
    }
  }

  // Makes the first remaining web-serving domain primary (so a WEB deployment keeps a primary after
  // its primary is demoted or removed). No-op when none qualify.
  private async promoteAnotherPrimary(deploymentId: string): Promise<void> {
    const [next] = await this.db
      .select()
      .from(domains)
      .where(and(eq(domains.deploymentId, deploymentId), eq(domains.webRoute, true)))
      .limit(1);

    if (next) {
      await this.db.update(domains).set({ isPrimary: true }).where(eq(domains.id, next.id));
    }
  }

  // Clears `domainId` as primary and promotes another web-serving domain (if any) in its place.
  private async demotePrimary(deploymentId: string, domainId: string): Promise<void> {
    await this.db.update(domains).set({ isPrimary: false }).where(eq(domains.id, domainId));
    await this.promoteAnotherPrimary(deploymentId);
  }
}
