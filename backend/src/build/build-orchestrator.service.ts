import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import { DockerContainerService } from "../docker/docker-container.service";
import { DockerImageService } from "../docker/docker-image.service";
import { BuildQueue } from "./build-queue";
import { ContainerOps } from "./container-ops.service";
import { CronService } from "./cron.service";
import type { Release } from "./releases.service";
import { ReleasesService } from "./releases.service";
import { ReleaseRunner } from "./release-runner.service";
import { RuntimeLogCollector } from "./runtime-log.collector";
import { ComposeService } from "./strategies/compose.service";

// Public API for the deployment lifecycle. Validates each action synchronously (so the caller gets
// 400/404 immediately), then enqueues the long-running work on the per-deployment queue, where
// ReleaseRunner performs the health-checked swap. A failed build/launch leaves the prior version
// running untouched. The UI tracks the outcome via the deployment state (polled).
@Injectable()
export class BuildOrchestrator {
  constructor(
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly dockerContainers: DockerContainerService,
    private readonly dockerImages: DockerImageService,
    private readonly compose: ComposeService,
    private readonly cron: CronService,
    private readonly runtimeLog: RuntimeLogCollector,
    private readonly containerOps: ContainerOps,
    private readonly queue: BuildQueue,
    private readonly runner: ReleaseRunner,
  ) {}

  async deploy(deploymentId: string, actorId?: string): Promise<Release> {
    const deployment = await this.requireDeployment(deploymentId);
    const release = await this.releases.create(deploymentId, actorId);

    // Mark transitional immediately so the UI reflects "in progress" before the build runs.
    await this.deployments.setState(deploymentId, "DEPLOYING");
    this.queue.enqueue(deploymentId, () => this.runner.runRelease(deployment, release.id));

    return release;
  }

  async stop(deploymentId: string): Promise<void> {
    await this.requireDeployment(deploymentId);
    this.queue.enqueue(deploymentId, () => this.runner.runStop(deploymentId));
  }

  async start(deploymentId: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);

    // Compose has no stored per-release image to relaunch — a fresh `up` is the way back.
    if (deployment.buildStrategy === "COMPOSE") {
      await this.deploy(deploymentId);

      return;
    }

    if (!deployment.activeReleaseId) {
      throw new BadRequestException("no active release to start; deploy first");
    }

    // CRON has no container to relaunch — re-arming the schedule is the "start".
    if (deployment.type === "CRON") {
      await this.deployments.setState(deploymentId, "RUNNING");
      const armed = await this.requireDeployment(deploymentId);
      this.cron.sync(armed);

      return;
    }

    await this.deployments.setState(deploymentId, "DEPLOYING");
    this.queue.enqueue(deploymentId, () => this.runner.runRelaunch(deploymentId));
  }

  // Recreate the active release's container (picks up current env/config) via the swap.
  async restart(deploymentId: string): Promise<void> {
    await this.start(deploymentId);
  }

  // Re-launch a previously built release's image (no rebuild) and make it active.
  async rollback(deploymentId: string, releaseId: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);

    if (deployment.buildStrategy === "COMPOSE") {
      throw new BadRequestException("rollback is not supported for compose deployments");
    }

    if (deployment.type === "CRON") {
      throw new BadRequestException("rollback is not supported for CRON deployments");
    }

    const target = await this.releases.findById(releaseId);

    if (!target || target.deploymentId !== deploymentId) {
      throw new NotFoundException("release not found for this deployment");
    }

    if (!target.imageTag) {
      throw new BadRequestException("release has no built image to roll back to");
    }

    await this.deployments.setState(deploymentId, "DEPLOYING");
    this.queue.enqueue(deploymentId, () => this.runner.runRollback(deploymentId, releaseId));
  }

  // Permanently delete a non-active release: remove its container + image, then the row.
  async deleteRelease(deploymentId: string, releaseId: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);
    const release = await this.releases.findById(releaseId);

    if (!release || release.deploymentId !== deploymentId) {
      throw new NotFoundException("release not found for this deployment");
    }

    if (deployment.activeReleaseId === releaseId) {
      throw new BadRequestException("cannot delete the active release");
    }

    if (release.containerId) {
      await this.dockerContainers.stopAndRemove(release.containerId);
    }

    if (release.imageTag) {
      await this.dockerImages.removeImage(release.imageTag);
    }

    await this.releases.delete(releaseId);
  }

  async teardown(deploymentId: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);
    this.runtimeLog.stopDeployment(deploymentId);

    if (deployment.type === "CRON") {
      this.cron.unregister(deploymentId);

      return;
    }

    if (deployment.buildStrategy === "COMPOSE") {
      await this.compose.down(deployment);

      return;
    }

    await this.containerOps.removeAllContainers(deploymentId);
  }

  private async requireDeployment(deploymentId: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
