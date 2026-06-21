import { Module } from "@nestjs/common";
import { DeploymentsModule } from "../deployments/deployments.module";
import { CleanupController } from "./cleanup.controller";
import { CleanupService } from "./cleanup.service";

// Scheduled + on-demand host maintenance (scoped disk cleanup). The Docker services are global.
@Module({
  imports: [DeploymentsModule],
  controllers: [CleanupController],
  providers: [CleanupService],
})
export class MaintenanceModule {}
