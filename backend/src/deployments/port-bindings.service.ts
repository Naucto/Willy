import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { requireRow } from "../db/query-helpers";
import { portBindings } from "../db/schema";

export type PortBinding = typeof portBindings.$inferSelect;

export interface PortBindingInput {
  hostPort: number;
  targetService?: string | null;
  targetPort?: number | null;
}

// Hard-bound host ports fronting a domain (each its own Traefik entrypoint, additive to the domain's
// 443 routing). Host ports are unique across the whole machine, so allocation is checked globally.
@Injectable()
export class PortBindingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

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

    return requireRow(
      await this.db
        .insert(portBindings)
        .values({
          domainId,
          hostPort: input.hostPort,
          targetService: input.targetService ?? null,
          targetPort: input.targetPort ?? null,
        })
        .returning(),
      "port binding insert returned no row",
    );
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
}
