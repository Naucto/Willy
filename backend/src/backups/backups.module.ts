import { Module } from "@nestjs/common";
import { BackupQueue } from "./backup-queue";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";

@Module({
  controllers: [BackupsController],
  providers: [BackupsService, BackupQueue],
  exports: [BackupsService],
})
export class BackupsModule {}
