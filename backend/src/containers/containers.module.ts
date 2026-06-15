import { Module } from "@nestjs/common";
import { ContainersService } from "./containers.service";

// Discovers a deployment's live containers (DockerService is global). Shared by anything that
// works per-container: volumes/backups, runtime logs, console.
@Module({
  providers: [ContainersService],
  exports: [ContainersService],
})
export class ContainersModule {}
