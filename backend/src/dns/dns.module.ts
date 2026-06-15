import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OvhClient } from "../ovh/ovh-client";
import { DnsController } from "./dns.controller";
import { DnsProvider } from "./dns-provider";
import { LocalDnsProvider } from "./providers/local-dns.provider";
import { OvhDnsProvider } from "./providers/ovh-dns.provider";

// Provider selection: explicit DNS_PROVIDER (ovh|local) wins; otherwise auto — OVH when credentials
// are present, local in-memory otherwise (the default for `make dev`).
function createDnsProvider(config: ConfigService, ovh: OvhClient): DnsProvider {
  const mode = (
    config.get<string>("DNS_PROVIDER") ?? (ovh.configured ? "ovh" : "local")
  ).toLowerCase();
  const logger = new Logger("DnsModule");

  if (mode === "ovh") {
    logger.log("Using OVH DNS provider");

    return new OvhDnsProvider(ovh);
  }

  logger.log("Using local in-memory DNS provider");

  return new LocalDnsProvider();
}

@Module({
  controllers: [DnsController],
  providers: [
    { provide: DnsProvider, useFactory: createDnsProvider, inject: [ConfigService, OvhClient] },
  ],
})
export class DnsModule {}
