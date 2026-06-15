import { Module } from "@nestjs/common";
import { DeploymentsModule } from "../deployments/deployments.module";
import { BackupQueue } from "./backup-queue";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";
import { ContainersService } from "./containers.service";
import { DeploymentVolumesController } from "./volumes.controller";

@Module({
  imports: [DeploymentsModule],
  controllers: [BackupsController, DeploymentVolumesController],
  providers: [BackupsService, BackupQueue, ContainersService],
  exports: [BackupsService],
})
export class BackupsModule {}
