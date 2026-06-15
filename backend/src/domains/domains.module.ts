import { Module } from "@nestjs/common";
import { DnsModule } from "../dns/dns.module";
import { SystemModule } from "../system/system.module";
import { DomainProvisioningService } from "./domain-provisioning.service";

// Ties deployment domains to DNS (perimeter validation + auto A-record lifecycle). Kept separate
// from DeploymentsModule so it can depend on DNS/System without a circular import.
@Module({
  imports: [DnsModule, SystemModule],
  providers: [DomainProvisioningService],
  exports: [DomainProvisioningService],
})
export class DomainsModule {}
