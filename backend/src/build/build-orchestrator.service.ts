import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import { DockerContainerService } from "../docker/docker-container.service";
import { DockerImageService } from "../docker/docker-image.service";
import { describeError } from "../docker/docker-helpers";
import { OWNER_LABEL } from "../traefik/label-generator.service";
import { GitService } from "../git/git.service";
import { BuildLogStore } from "./build-log.store";
import { BuildQueue } from "./build-queue";
import { ContainerOps } from "./container-ops.service";
import { CronService } from "./cron.service";
import { HealthCheckError } from "./errors";
import { HealthProber } from "./health-prober.service";
import { ImageBuilder } from "./image-builder.service";
import type { Release } from "./releases.service";
import { ReleasesService } from "./releases.service";
import { RuntimeLogCollector } from "./runtime-log.collector";
import { ComposeService } from "./strategies/compose.service";

// Drives a deployment from git clone -> image build -> running container. Uses a
// health-checked swap: the new container is started and probed while the old one keeps
// serving; only once it is healthy is the old one removed (cutover). A failed build or an
// unhealthy new container leaves the previous version running untouched. The build/launch/health
// mechanics live in ImageBuilder, ContainerOps and HealthProber; this class owns the state machine.
@Injectable()
export class BuildOrchestrator {
  private readonly logger = new Logger(BuildOrchestrator.name);

  constructor(
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly git: GitService,
    private readonly dockerContainers: DockerContainerService,
    private readonly dockerImages: DockerImageService,
    private readonly compose: ComposeService,
    private readonly buildLog: BuildLogStore,
    private readonly queue: BuildQueue,
    private readonly cron: CronService,
    private readonly runtimeLog: RuntimeLogCollector,
    private readonly imageBuilder: ImageBuilder,
    private readonly containerOps: ContainerOps,
    private readonly health: HealthProber,
  ) {}

  // After a container-bearing deployment goes live, (re)attach runtime-log follows to its current
  // containers so their output is persisted durably. No-op for CRON (no long-lived container).
  private async syncRuntimeLogs(deployment: Deployment): Promise<void> {
    if (deployment.type === "CRON") {
      return;
    }

    await this.runtimeLog.syncDeployment(deployment);
  }

  async deploy(deploymentId: string, actorId?: string): Promise<Release> {
    const deployment = await this.requireDeployment(deploymentId);
    const release = await this.releases.create(deploymentId, actorId);

    // Mark transitional immediately so the UI reflects "in progress" before the build runs.
    await this.deployments.setState(deploymentId, "DEPLOYING");
    this.queue.enqueue(deploymentId, () => this.runRelease(deployment, release.id));

    return release;
  }

  // The lifecycle actions below validate synchronously (so the caller gets 400/404 right away)
  // then run on the per-deployment queue and return immediately — a relaunch can wait up to the
  // health-check timeout, far longer than an HTTP request should stay open. The UI tracks the
  // outcome via the deployment state (polled).

  async stop(deploymentId: string): Promise<void> {
    await this.requireDeployment(deploymentId);
    this.queue.enqueue(deploymentId, () => this.runStop(deploymentId));
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
    this.queue.enqueue(deploymentId, () => this.runRelaunch(deploymentId));
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
    this.queue.enqueue(deploymentId, () => this.runRollback(deploymentId, releaseId));
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

  private async runStop(deploymentId: string): Promise<void> {
    try {
      const deployment = await this.requireDeployment(deploymentId);
      this.runtimeLog.stopDeployment(deploymentId);

      if (deployment.type === "CRON") {
        this.cron.unregister(deploymentId);
      } else if (deployment.buildStrategy === "COMPOSE") {
        await this.compose.down(deployment);
      } else {
        await this.containerOps.removeAllContainers(deploymentId);
      }

      await this.deployments.setState(deploymentId, "STOPPED");
    } catch (error) {
      this.logger.warn(`stop failed for ${deploymentId}: ${describeError(error)}`);
      await this.markActionFailed(deploymentId);
    }
  }

  private async runRelaunch(deploymentId: string): Promise<void> {
    try {
      const deployment = await this.requireDeployment(deploymentId);
      const release = deployment.activeReleaseId
        ? await this.releases.findById(deployment.activeReleaseId)
        : undefined;

      if (!release?.imageTag) {
        throw new BadRequestException("active release has no built image");
      }

      const containerId = await this.containerOps.launchAndHealthCheck(
        deployment,
        release.imageTag,
        release,
      );
      await this.containerOps.removeStaleContainers(deploymentId, containerId);
      await this.deployments.setState(deploymentId, "RUNNING");
      await this.syncRuntimeLogs(deployment);
    } catch (error) {
      this.logger.warn(`relaunch failed for ${deploymentId}: ${describeError(error)}`);
      await this.markActionFailed(deploymentId);
    }
  }

  private async runRollback(deploymentId: string, releaseId: string): Promise<void> {
    try {
      const deployment = await this.requireDeployment(deploymentId);
      const target = await this.releases.findById(releaseId);

      if (!target?.imageTag) {
        throw new BadRequestException("release has no built image to roll back to");
      }

      const priorActiveReleaseId = deployment.activeReleaseId;
      const containerId = await this.containerOps.launchAndHealthCheck(
        deployment,
        target.imageTag,
        target,
      );

      await this.containerOps.removeStaleContainers(deploymentId, containerId);
      await this.releases.setStatus(releaseId, "LIVE", { containerId });
      await this.deployments.setActiveRelease(deploymentId, releaseId);
      await this.deployments.setState(deploymentId, "RUNNING");
      await this.syncRuntimeLogs(deployment);

      if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
        await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
      }
    } catch (error) {
      this.logger.warn(`rollback failed for ${deploymentId}: ${describeError(error)}`);
      await this.markActionFailed(deploymentId);
    }
  }

  // A failed background action leaves the old container running (the swap only removes it on
  // success), so reflect "still up" vs "nothing running".
  private async markActionFailed(deploymentId: string): Promise<void> {
    const containers = await this.dockerContainers.listByLabel(OWNER_LABEL, deploymentId);
    await this.deployments.setState(deploymentId, containers.length > 0 ? "DEGRADED" : "ERROR");
  }

  private async runRelease(deployment: Deployment, releaseId: string): Promise<void> {
    if (deployment.buildStrategy === "COMPOSE") {
      await this.runComposeRelease(deployment, releaseId);

      return;
    }

    const priorActiveReleaseId = deployment.activeReleaseId;

    try {
      const release = await this.releases.findById(releaseId);

      if (!release) {
        throw new NotFoundException("release not found");
      }

      this.buildLog.append(releaseId, `deploying ${deployment.name} (${deployment.type})`);

      const imageTag =
        deployment.buildStrategy === "IMAGE"
          ? await this.imageBuilder.pullImageRelease(deployment, releaseId)
          : await this.imageBuilder.buildGitRelease(deployment, releaseId);

      // CRON deployments don't run a long-lived container — the image is run on a schedule.
      if (deployment.type === "CRON") {
        await this.releases.setStatus(releaseId, "LIVE", { imageTag });
        await this.deployments.setActiveRelease(deployment.id, releaseId);
        await this.deployments.setState(deployment.id, "RUNNING");

        if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
          await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
        }

        await this.imageBuilder.cleanupImages(deployment.name, imageTag);
        const scheduled = await this.deployments.findById(deployment.id);

        if (scheduled) {
          this.cron.sync(scheduled);
        }

        this.buildLog.append(
          releaseId,
          `cron scheduled (${deployment.cronExpr ?? "no expression"})`,
        );

        return;
      }

      await this.releases.setStatus(releaseId, "HEALTHCHECKING", { imageTag });
      this.buildLog.append(releaseId, "starting new container and health-checking");
      const containerId = await this.containerOps.launchAndHealthCheck(
        deployment,
        imageTag,
        release,
      );

      await this.releases.setStatus(releaseId, "LIVE", { containerId });
      await this.deployments.setActiveRelease(deployment.id, releaseId);
      await this.deployments.setState(deployment.id, "RUNNING");
      await this.containerOps.removeStaleContainers(deployment.id, containerId);
      await this.syncRuntimeLogs(deployment);

      if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
        await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
      }

      await this.imageBuilder.cleanupImages(deployment.name, imageTag);
      this.buildLog.append(releaseId, "deployment live");
    } catch (error) {
      const message = describeError(error);
      this.logger.warn(`release ${releaseId} failed: ${message}`);
      this.buildLog.append(releaseId, `error: ${message}`);
      await this.releases.setStatus(releaseId, "FAILED", { errorMessage: message });
      // The previous version is left untouched, so reflect that it is still serving.
      await this.deployments.setState(deployment.id, priorActiveReleaseId ? "DEGRADED" : "ERROR");
    } finally {
      this.buildLog.finish(releaseId);
    }
  }

  // Compose path: `docker compose up -d --build` recreates the stack in place (brief
  // interruption), then the web service is health-checked. No health-checked swap.
  private async runComposeRelease(deployment: Deployment, releaseId: string): Promise<void> {
    const priorActiveReleaseId = deployment.activeReleaseId;

    try {
      const release = await this.releases.findById(releaseId);

      if (!release) {
        throw new NotFoundException("release not found");
      }

      this.buildLog.append(releaseId, `deploying ${deployment.name} (compose)`);
      await this.releases.setStatus(releaseId, "CLONING");

      const token = await this.deployments.resolveGitToken(deployment.id);
      const { dir, sha } = await this.git.clone({
        url: deployment.gitUrl,
        ref: deployment.gitRef,
        token,
      });

      await this.releases.setStatus(releaseId, "BUILDING", { gitSha: sha });
      this.buildLog.append(releaseId, "docker compose up -d --build");

      let project: string;

      try {
        ({ project } = await this.compose.up(deployment, dir, (line) =>
          this.buildLog.append(releaseId, line),
        ));
      } finally {
        await this.git.cleanup(dir);
      }

      // No single container anchors a compose release — it's tracked by its project label.
      await this.releases.setStatus(releaseId, "HEALTHCHECKING", { composeProject: project });
      this.buildLog.append(releaseId, "health-checking stack");

      if (!(await this.health.composeHealthy(deployment))) {
        // Compose recreates the stack in place, so an unhealthy result has no prior version to fall
        // back to — stop the brought-up containers so they aren't left serving while unhealthy.
        this.buildLog.append(releaseId, "stack unhealthy — stopping containers");
        await this.compose.stopAll(deployment);

        throw new HealthCheckError("compose stack did not become healthy");
      }

      // Healthy containers can still 502 if the app listens on a different port than Traefik routes
      // to. Probe the routed port so a port mismatch fails loudly instead of silently 502-ing.
      const unreachable = await this.health.firstUnreachableRoute(deployment);

      if (unreachable) {
        this.buildLog.append(releaseId, unreachable);
        await this.compose.stopAll(deployment);

        throw new HealthCheckError(unreachable);
      }

      await this.releases.setStatus(releaseId, "LIVE", { composeProject: project });
      await this.deployments.setActiveRelease(deployment.id, releaseId);
      await this.deployments.setState(deployment.id, "RUNNING");
      await this.syncRuntimeLogs(deployment);

      if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
        await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
      }

      this.buildLog.append(releaseId, "deployment live");
    } catch (error) {
      const message = describeError(error);
      this.logger.warn(`compose release ${releaseId} failed: ${message}`);
      this.buildLog.append(releaseId, `error: ${message}`);
      await this.releases.setStatus(releaseId, "FAILED", { errorMessage: message });
      // A failed healthcheck stops the in-place-recreated stack, so nothing is serving → ERROR.
      // Other failures (e.g. clone) leave the prior stack untouched and still serving → DEGRADED.
      const stoppedStack = error instanceof HealthCheckError;
      await this.deployments.setState(
        deployment.id,
        !stoppedStack && priorActiveReleaseId ? "DEGRADED" : "ERROR",
      );
    } finally {
      this.buildLog.finish(releaseId);
    }
  }

  private async requireDeployment(deploymentId: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
