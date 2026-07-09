import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ContainersService } from "../containers/containers.service";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import { DockerContainerService } from "../docker/docker-container.service";
import { describeError } from "../docker/docker-helpers";
import { GitService } from "../git/git.service";
import { OWNER_LABEL } from "../traefik/label-generator.service";
import { BuildLogStore } from "./build-log.store";
import { ContainerOps } from "./container-ops.service";
import { CronService } from "./cron.service";
import { HealthCheckError } from "./errors";
import { HealthProber } from "./health-prober.service";
import { ImageBuilder } from "./image-builder.service";
import { ReleasesService } from "./releases.service";
import { RuntimeLogCollector } from "./runtime-log.collector";
import { type ComposePlan, ComposeService } from "./strategies/compose.service";

// Runs the background lifecycle work for a release: the git clone -> image build -> health-checked
// container swap, plus relaunch/rollback/stop. BuildOrchestrator validates and enqueues; these
// workers do the long-running execution off the request path and own the per-step state writes.
@Injectable()
export class ReleaseRunner {
  private readonly logger = new Logger(ReleaseRunner.name);

  constructor(
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly git: GitService,
    private readonly dockerContainers: DockerContainerService,
    private readonly compose: ComposeService,
    private readonly buildLog: BuildLogStore,
    private readonly cron: CronService,
    private readonly runtimeLog: RuntimeLogCollector,
    private readonly imageBuilder: ImageBuilder,
    private readonly containerOps: ContainerOps,
    private readonly health: HealthProber,
    private readonly containers: ContainersService,
  ) {}

  // After a container-bearing deployment goes live, (re)attach runtime-log follows to its current
  // containers so their output is persisted durably. No-op for CRON (no long-lived container).
  private async syncRuntimeLogs(deployment: Deployment): Promise<void> {
    if (deployment.type === "CRON") {
      return;
    }

    await this.runtimeLog.syncDeployment(deployment);
  }

  async runStop(deploymentId: string): Promise<void> {
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

  async runRelaunch(deploymentId: string): Promise<void> {
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

  async runRollback(deploymentId: string, releaseId: string): Promise<void> {
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

  async runRelease(deployment: Deployment, releaseId: string): Promise<void> {
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

  // Compose path (blue-green): pinned singletons (volumes/host ports) are recreated in place under the
  // stable base project; the eligible tier is brought up under a release-scoped project alongside the
  // currently-serving one, health-checked, then cut over by tearing down the prior release. A failed
  // gate tears down only the new release, leaving the previous version serving — never destructive.
  private async runComposeRelease(deployment: Deployment, releaseId: string): Promise<void> {
    const priorActiveReleaseId = deployment.activeReleaseId;
    const prior = priorActiveReleaseId
      ? await this.releases.findById(priorActiveReleaseId)
      : undefined;
    const baseProject = this.compose.baseProject(deployment);
    const priorReleaseProject = prior?.composeProject ?? null;

    try {
      const release = await this.releases.findById(releaseId);

      if (!release) {
        throw new NotFoundException("release not found");
      }

      const releaseShort = releaseId.slice(0, 8);

      this.buildLog.append(releaseId, `deploying ${deployment.name} (compose, blue-green)`);
      await this.releases.setStatus(releaseId, "CLONING");

      const token = await this.deployments.resolveGitToken(deployment.id);
      const { dir, sha } = await this.git.clone({
        url: deployment.gitUrl,
        ref: deployment.gitRef,
        token,
      });

      await this.releases.setStatus(releaseId, "BUILDING", { gitSha: sha });

      let plan: ComposePlan;
      let releaseProject: string | null = null;

      try {
        plan = await this.compose.prepare(deployment, dir, (line) =>
          this.buildLog.append(releaseId, line),
        );

        if (plan.split.pinned.length > 0) {
          this.buildLog.append(
            releaseId,
            `recreating pinned services: ${plan.split.pinned.join(", ")}`,
          );
          await this.compose.upBase(deployment, dir, plan, (line) =>
            this.buildLog.append(releaseId, line),
          );
        }

        if (plan.split.eligible.length > 0) {
          this.buildLog.append(
            releaseId,
            `starting release services: ${plan.split.eligible.join(", ")}`,
          );
          ({ project: releaseProject } = await this.compose.upRelease(
            deployment,
            dir,
            plan,
            releaseShort,
            (line) => this.buildLog.append(releaseId, line),
          ));
        }
      } finally {
        await this.git.cleanup(dir);
      }

      // Track by the release project (or the base project when the whole stack is pinned).
      const composeProject = releaseProject ?? baseProject;
      await this.releases.setStatus(releaseId, "HEALTHCHECKING", { composeProject });
      this.buildLog.append(releaseId, "health-checking new containers");

      // Gate on the green set only — base pinned services plus this release's eligible containers —
      // never the prior (blue) release, which keeps serving until cutover.
      const green = [
        ...(plan.split.pinned.length > 0 ? await this.containers.listForProject(baseProject) : []),
        ...(releaseProject ? await this.containers.listForProject(releaseProject) : []),
      ];

      if (!(await this.health.composeHealthy(deployment, green))) {
        await this.failGate(releaseId, releaseProject, "compose stack did not become healthy");
      }

      const unreachable = await this.health.firstUnreachableRoute(deployment, green);

      if (unreachable) {
        await this.failGate(releaseId, releaseProject, unreachable);
      }

      // Cutover: green's release-scoped router already exists at lower priority; removing the prior
      // release lets Traefik route to green. The base project is never touched.
      await this.releases.setStatus(releaseId, "LIVE", { composeProject });
      await this.deployments.setActiveRelease(deployment.id, releaseId);
      await this.deployments.setState(deployment.id, "RUNNING");
      await this.syncRuntimeLogs(deployment);

      // Tear down only the superseded (blue) release project. Guard against the base project (a
      // pre-split prior release recorded the base project) and the just-deployed green one.
      if (
        priorReleaseProject &&
        priorReleaseProject !== baseProject &&
        priorReleaseProject !== releaseProject
      ) {
        this.buildLog.append(releaseId, `removing superseded release ${priorReleaseProject}`);
        await this.compose.downRelease(priorReleaseProject);
      }

      if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
        await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
      }

      this.buildLog.append(releaseId, "deployment live");
    } catch (error) {
      const message = describeError(error);
      this.logger.warn(`compose release ${releaseId} failed: ${message}`);
      this.buildLog.append(releaseId, `error: ${message}`);
      await this.releases.setStatus(releaseId, "FAILED", { errorMessage: message });
      // Non-destructive: a failed gate removed only the green release project, so blue + base keep
      // serving (DEGRADED). ERROR only when there was no prior release to fall back to.
      await this.deployments.setState(deployment.id, priorActiveReleaseId ? "DEGRADED" : "ERROR");
    } finally {
      this.buildLog.finish(releaseId);
    }
  }

  // A failed health/reachability gate: tear down the new (green) release project so blue + base keep
  // serving, then abort. An all-pinned deploy has no release project — its recreated stack is left
  // running (in-place, non-destructive) rather than forcibly stopped.
  private async failGate(
    releaseId: string,
    releaseProject: string | null,
    reason: string,
  ): Promise<never> {
    this.buildLog.append(releaseId, reason);

    if (releaseProject) {
      this.buildLog.append(releaseId, `removing failed release ${releaseProject}`);
      await this.compose.downRelease(releaseProject);
    }

    throw new HealthCheckError(reason);
  }

  private async requireDeployment(deploymentId: string): Promise<Deployment> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      throw new NotFoundException("deployment not found");
    }

    return deployment;
  }
}
