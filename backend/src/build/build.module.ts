import { Module } from "@nestjs/common";
import { DeploymentsModule } from "../deployments/deployments.module";
import { EnvVarsModule } from "../env-vars/env-vars.module";
import { GitModule } from "../git/git.module";
import { TraefikModule } from "../traefik/traefik.module";
import { BuildLogStore } from "./build-log.store";
import { BuildOrchestrator } from "./build-orchestrator.service";
import { BuildQueue } from "./build-queue";
import { DeploymentActionsController } from "./deployment-actions.controller";
import { ReleasesService } from "./releases.service";
import { DockerfileStrategy } from "./strategies/dockerfile.strategy";

@Module({
  imports: [DeploymentsModule, EnvVarsModule, GitModule, TraefikModule],
  controllers: [DeploymentActionsController],
  providers: [BuildOrchestrator, BuildQueue, ReleasesService, BuildLogStore, DockerfileStrategy],
  exports: [BuildOrchestrator, ReleasesService, BuildLogStore],
})
export class BuildModule {}
