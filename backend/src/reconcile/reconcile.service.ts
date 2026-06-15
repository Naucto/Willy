import { Injectable, type OnApplicationBootstrap, Logger } from "@nestjs/common";
import { BuildOrchestrator } from "../build/build-orchestrator.service";
import { ReleasesService } from "../build/releases.service";
import { RuntimeLogCollector } from "../build/runtime-log.collector";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";
import { OWNER_LABEL } from "../traefik/label-generator.service";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// On boot (after migrations), bring the running state back in line with the database: clear
// builds that were interrupted by the restart, and restart the active container of any
// deployment that should be running but isn't (e.g. after a host reboot).
@Injectable()
export class ReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly docker: DockerService,
    private readonly orchestrator: BuildOrchestrator,
    private readonly runtimeLog: RuntimeLogCollector,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.docker.ping())) {
      this.logger.warn("docker unreachable; skipping reconciliation");

      return;
    }

    await this.releases.markInterrupted();

    const deployments = await this.deployments.findAll();

    for (const deployment of deployments) {
      // STOPPED is an intentional state; never deployed -> nothing to restore.
      if (deployment.state === "STOPPED" || !deployment.activeReleaseId) {
        continue;
      }

      const containers = await this.docker.listByLabel(OWNER_LABEL, deployment.id);

      if (containers.length > 0) {
        // Already running — just re-attach runtime-log follows lost with the previous process.
        await this.runtimeLog.syncDeployment(deployment);

        continue;
      }

      try {
        await this.orchestrator.start(deployment.id);
        this.logger.log(`reconciled ${deployment.name}: restarted active release`);
      } catch (error) {
        this.logger.warn(`failed to reconcile ${deployment.name}: ${describeError(error)}`);
        await this.deployments.setState(deployment.id, "ERROR");
      }
    }
  }
}
