import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DeploymentsModule } from "../deployments/deployments.module";
import { BackupQueue } from "./backup-queue";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";
import { ContainersService } from "./containers.service";
import { BackupSchedulesController } from "./schedules.controller";
import { BackupSchedulesService } from "./schedules.service";
import { DeploymentVolumesController } from "./volumes.controller";

@Module({
  imports: [DeploymentsModule, ScheduleModule.forRoot()],
  controllers: [BackupsController, BackupSchedulesController, DeploymentVolumesController],
  providers: [BackupsService, BackupQueue, ContainersService, BackupSchedulesService],
  exports: [BackupsService],
})
export class BackupsModule {}
