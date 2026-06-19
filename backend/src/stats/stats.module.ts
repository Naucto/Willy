import { Module } from "@nestjs/common";
import { ContainersModule } from "../containers/containers.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { MetricsStoreService } from "./metrics-store.service";
import { StatsController } from "./stats.controller";
import { StatsSamplerService } from "./stats-sampler.service";
import { StatsService } from "./stats.service";

// Live resource utilization (CPU/memory/swap/storage) + its sampled history. DockerModule and
// RedisModule are global; ContainersModule discovers a deployment's containers, DeploymentsModule
// resolves its configured limits and enumerates deployments to sample.
@Module({
  imports: [ContainersModule, DeploymentsModule],
  controllers: [StatsController],
  providers: [StatsService, MetricsStoreService, StatsSamplerService],
})
export class StatsModule {}
