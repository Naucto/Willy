import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DeploymentsModule } from "../deployments/deployments.module";
import { BackupQueue } from "./backup-queue";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";
import { ContainersService } from "./containers.service";
import { BackupDestinationsController } from "./destinations.controller";
import { BackupDestinationsService } from "./destinations.service";
import { BackupSchedulesController } from "./schedules.controller";
import { BackupSchedulesService } from "./schedules.service";
import { DeploymentVolumesController } from "./volumes.controller";

@Module({
  imports: [DeploymentsModule, ScheduleModule.forRoot()],
  controllers: [
    BackupsController,
    BackupSchedulesController,
    BackupDestinationsController,
    DeploymentVolumesController,
  ],
  providers: [
    BackupsService,
    BackupQueue,
    ContainersService,
    BackupSchedulesService,
    BackupDestinationsService,
  ],
  exports: [BackupsService],
})
export class BackupsModule {}
