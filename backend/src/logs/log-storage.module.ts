import { Global, Module } from "@nestjs/common";
import { LogStorageService } from "./log-storage.service";

// Durable log storage is shared by the build orchestrator (build logs), the runtime log collector
// (container logs) and the logs controller (SSE replay), so it's global like the Docker client.
@Global()
@Module({
  providers: [LogStorageService],
  exports: [LogStorageService],
})
export class LogStorageModule {}
