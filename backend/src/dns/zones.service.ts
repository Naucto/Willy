import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { managedZones } from "../db/schema";
import { DnsProvider } from "./dns-provider";

// CRUD for operator-registered zones (the "register a zone" config surface).
@Injectable()
export class ManagedZonesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<string[]> {
    const rows = await this.db.select({ zone: managedZones.zone }).from(managedZones);

    return rows.map((row) => row.zone);
  }

  async add(zone: string): Promise<void> {
    await this.db.insert(managedZones).values({ zone }).onConflictDoNothing();
  }

  async remove(zone: string): Promise<void> {
    await this.db.delete(managedZones).where(eq(managedZones.zone, zone));
  }
}

// The zones Willy will manage: the provider's auto-discovered zones merged with operator-registered
// ones (deduped, lower-cased). This is the single source of truth for both the DNS UI and the domain
// perimeter check, so a manually-registered zone counts as in-perimeter.
@Injectable()
export class ZonesService {
  constructor(
    private readonly dns: DnsProvider,
    private readonly managed: ManagedZonesService,
  ) {}

  async all(): Promise<string[]> {
    const discovered = this.dns.configured ? await this.dns.zones().catch(() => []) : [];
    const registered = await this.managed.list();
    const merged = new Set([...discovered, ...registered].map((zone) => zone.toLowerCase()));

    return [...merged].sort();
  }
}
