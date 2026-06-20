import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { DomainsModule } from "../domains/domains.module";
import { DeploymentsController } from "./deployments.controller";
import { DeploymentsService } from "./deployments.service";

@Module({
  imports: [DomainsModule, AdminModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
