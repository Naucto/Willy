import { Module } from "@nestjs/common";
import { ContainersModule } from "../containers/containers.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

// Live resource utilization (CPU/memory/swap/storage). DockerModule is global; ContainersModule
// discovers a deployment's containers, DeploymentsModule resolves its configured limits.
@Module({
  imports: [ContainersModule, DeploymentsModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
