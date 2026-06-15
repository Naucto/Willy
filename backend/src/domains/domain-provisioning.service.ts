import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { dnsRecords, domains } from "../db/schema";
import { DnsProvider } from "../dns/dns-provider";
import { ZonesService } from "../dns/zones.service";
import { SystemService } from "../system/system.service";
import { zoneFor, subDomainOf } from "./domain-zone";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Ties a deployment domain to DNS: validates it sits inside the OVH perimeter, auto-creates the
// A record pointing at the host, and tears that record down when the domain is removed. The
// per-domain certificate itself is issued by Traefik (DNS-01 via the router's `ovh` certresolver);
// here we just keep DNS + cert status in sync. All record operations are best-effort — a DNS hiccup
// must never block attaching/removing a domain (routing still works once DNS is fixed).
@Injectable()
export class DomainProvisioningService {
  private readonly logger = new Logger(DomainProvisioningService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dns: DnsProvider,
    private readonly zones: ZonesService,
    private readonly system: SystemService,
  ) {}

  // Rejects a domain that isn't inside any managed zone — but only for providers that enforce the
  // perimeter (OVH). The local provider accepts anything (e.g. *.localhost) for dev.
  async assertInPerimeter(fqdn: string): Promise<void> {
    if (!this.dns.configured || !this.dns.enforcesPerimeter) {
      return;
    }

    const zones = await this.zones.all();

    if (!zoneFor(fqdn, zones)) {
      throw new BadRequestException(
        `${fqdn} is not within an OVH-managed zone (add the zone to your OVH account first)`,
      );
    }
  }

  // Creates (or reuses) the A record for a domain and marks its certificate pending.
  async provision(deploymentId: string, fqdn: string): Promise<void> {
    try {
      if (!this.dns.configured) {
        return;
      }

      const zone = zoneFor(fqdn, await this.zones.all());

      if (!zone) {
        return;
      }

      const sub = subDomainOf(fqdn, zone);
      const ip = (await this.system.getPublicIp()).ip;

      if (!ip) {
        this.logger.warn(`no public IP known; skipping A record for ${fqdn}`);

        return;
      }

      const existing = (await this.dns.records(zone)).find(
        (record) => record.subDomain === sub && record.fieldType === "A",
      );
      const record = existing ?? (await this.dns.create(zone, this.aRecord(sub, ip)));

      await this.db
        .insert(dnsRecords)
        .values({
          zone,
          subDomain: sub,
          type: "A",
          target: record.target,
          ttl: record.ttl,
          ovhRecordId: record.id,
          managedByWilly: true,
          deploymentId,
        })
        .onConflictDoUpdate({
          target: [dnsRecords.zone, dnsRecords.subDomain, dnsRecords.type],
          set: {
            target: record.target,
            ovhRecordId: record.id,
            deploymentId,
            updatedAt: new Date(),
          },
        });

      await this.db
        .update(domains)
        .set({ certStatus: "PENDING", updatedAt: new Date() })
        .where(eq(domains.fqdn, fqdn));
    } catch (error) {
      this.logger.warn(`DNS provisioning for ${fqdn} failed: ${describeError(error)}`);
    }
  }

  // Removes the A record Willy created for a domain (best-effort; leaves unmanaged records alone).
  async deprovision(fqdn: string): Promise<void> {
    try {
      if (!this.dns.configured) {
        return;
      }

      const zone = zoneFor(fqdn, await this.zones.all());

      if (!zone) {
        return;
      }

      const sub = subDomainOf(fqdn, zone);
      const rows = await this.db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.zone, zone),
            eq(dnsRecords.subDomain, sub),
            eq(dnsRecords.type, "A"),
            eq(dnsRecords.managedByWilly, true),
          ),
        );

      for (const row of rows) {
        if (row.ovhRecordId) {
          try {
            await this.dns.remove(zone, row.ovhRecordId);
          } catch (error) {
            this.logger.warn(`failed to delete OVH record for ${fqdn}: ${describeError(error)}`);
          }
        }

        await this.db.delete(dnsRecords).where(eq(dnsRecords.id, row.id));
      }
    } catch (error) {
      this.logger.warn(`DNS deprovisioning for ${fqdn} failed: ${describeError(error)}`);
    }
  }

  private aRecord(subDomain: string, ip: string) {
    return { fieldType: "A" as const, subDomain, target: ip, ttl: 3600 };
  }
}
