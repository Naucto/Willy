import { Module } from "@nestjs/common";
import { DockerModule } from "../docker/docker.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SettingsService } from "./settings.service";

@Module({
  imports: [DockerModule],
  controllers: [AdminController],
  providers: [AdminService, SettingsService],
})
export class AdminModule {}
