import { Module } from "@nestjs/common";
import { ContainersModule } from "../containers/containers.module";
import { DeploymentsModule } from "../deployments/deployments.module";
import { EnvVarsModule } from "../env-vars/env-vars.module";
import { GitModule } from "../git/git.module";
import { TraefikModule } from "../traefik/traefik.module";
import { BuildLogStore } from "./build-log.store";
import { BuildOrchestrator } from "./build-orchestrator.service";
import { BuildQueue } from "./build-queue";
import { CronRunsService } from "./cron-runs.service";
import { CronService } from "./cron.service";
import { DeploymentActionsController } from "./deployment-actions.controller";
import { ReleasesService } from "./releases.service";
import { RuntimeLogCollector } from "./runtime-log.collector";
import { ComposeService } from "./strategies/compose.service";
import { DockerfileStrategy } from "./strategies/dockerfile.strategy";

@Module({
  imports: [DeploymentsModule, EnvVarsModule, GitModule, TraefikModule, ContainersModule],
  controllers: [DeploymentActionsController],
  providers: [
    BuildOrchestrator,
    BuildQueue,
    ReleasesService,
    BuildLogStore,
    RuntimeLogCollector,
    DockerfileStrategy,
    ComposeService,
    CronService,
    CronRunsService,
  ],
  exports: [BuildOrchestrator, ReleasesService, BuildLogStore, RuntimeLogCollector],
})
export class BuildModule {}
