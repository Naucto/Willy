import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { DomainsModule } from "../domains/domains.module";
import { DeploymentsController } from "./deployments.controller";
import { DeploymentsService } from "./deployments.service";
import { DomainsService } from "./domains.service";
import { PortBindingsService } from "./port-bindings.service";

@Module({
  imports: [DomainsModule, AdminModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DomainsService, PortBindingsService],
  exports: [DeploymentsService, DomainsService, PortBindingsService],
})
export class DeploymentsModule {}
