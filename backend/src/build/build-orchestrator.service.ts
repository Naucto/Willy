import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { WillyError } from "../common/errors";
import {
  type Deployment,
  DeploymentsService,
  dockerfileConfig,
  imageConfig,
} from "../deployments/deployments.service";
import type { RestartPolicyName } from "../docker/docker.service";
import { DockerService } from "../docker/docker.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { GitService } from "../git/git.service";
import {
  LabelGeneratorService,
  OWNER_LABEL,
  groupRoutes,
} from "../traefik/label-generator.service";
import { BuildLogStore } from "./build-log.store";
import { BuildQueue } from "./build-queue";
import { CronService } from "./cron.service";
import type { Release } from "./releases.service";
import { ReleasesService } from "./releases.service";
import { ComposeService } from "./strategies/compose.service";
import { DockerfileStrategy } from "./strategies/dockerfile.strategy";
import { NixpacksStrategy } from "./strategies/nixpacks.strategy";

const EDGE_NETWORK = "willy_edge";

// A freshly launched container gets a *lower* router priority than the one already serving
// the shared Host rule, so the old version keeps winning until it is removed at cutover.
// Priority is derived from launch time (not the release date) so a rollback — launching an
// older release's image — still correctly supersedes the current one. Base keeps the value
// positive and shrinking; Traefik priorities are int64 so the magnitude is fine.
const PRIORITY_BASE = 9_000_000_000_000;

const WEB_HEALTH_TIMEOUT_MS = 90_000;
const WORKER_HEALTH_GRACE_MS = 6_000;
const HEALTH_INTERVAL_MS = 2_000;
const HTTP_PROBE_TIMEOUT_MS = 3_000;
const KEEP_IMAGES = 3;

const RESTART_MAP: Record<Deployment["restartPolicy"], RestartPolicyName> = {
  NO: "no",
  ON_FAILURE: "on-failure",
  ALWAYS: "always",
  UNLESS_STOPPED: "unless-stopped",
};

class HealthCheckError extends WillyError {}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Drives a deployment from git clone -> image build -> running container. Uses a
// health-checked swap: the new container is started and probed while the old one keeps
// serving; only once it is healthy is the old one removed (cutover). A failed build or an
// unhealthy new container leaves the previous version running untouched.
@Injectable()
export class BuildOrchestrator {
  private readonly logger = new Logger(BuildOrchestrator.name);

  constructor(
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly git: GitService,
    private readonly docker: DockerService,
    private readonly labels: LabelGeneratorService,
    private readonly envVars: EnvVarsService,
    private readonly dockerfile: DockerfileStrategy,
    private readonly nixpacks: NixpacksStrategy,
    private readonly compose: ComposeService,
    private readonly buildLog: BuildLogStore,
    private readonly queue: BuildQueue,
    private readonly cron: CronService,
  ) {}

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
      await this.docker.stopAndRemove(release.containerId);
    }

    if (release.imageTag) {
      await this.docker.removeImage(release.imageTag);
    }

    await this.releases.delete(releaseId);
  }

  async teardown(deploymentId: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);

    if (deployment.type === "CRON") {
      this.cron.unregister(deploymentId);

      return;
    }

    if (deployment.buildStrategy === "COMPOSE") {
      await this.compose.down(deployment);

      return;
    }

    await this.removeAllContainers(deploymentId);
  }

  private async runStop(deploymentId: string): Promise<void> {
    try {
      const deployment = await this.requireDeployment(deploymentId);

      if (deployment.type === "CRON") {
        this.cron.unregister(deploymentId);
      } else if (deployment.buildStrategy === "COMPOSE") {
        await this.compose.down(deployment);
      } else {
        await this.removeAllContainers(deploymentId);
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

      const containerId = await this.launchAndHealthCheck(deployment, release.imageTag, release);
      await this.removeStaleContainers(deploymentId, containerId);
      await this.deployments.setState(deploymentId, "RUNNING");
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
      const containerId = await this.launchAndHealthCheck(deployment, target.imageTag, target);

      await this.removeStaleContainers(deploymentId, containerId);
      await this.releases.setStatus(releaseId, "LIVE", { containerId });
      await this.deployments.setActiveRelease(deploymentId, releaseId);
      await this.deployments.setState(deploymentId, "RUNNING");

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
    const containers = await this.docker.listByLabel(OWNER_LABEL, deploymentId);
    await this.deployments.setState(deploymentId, containers.length > 0 ? "DEGRADED" : "ERROR");
  }

  // IMAGE strategy: run an existing image as-is (no clone/build), just ensure it's pulled.
  private async pullImageRelease(deployment: Deployment, releaseId: string): Promise<string> {
    const imageTag = imageConfig(deployment)?.imageRef;

    if (!imageTag) {
      throw new BadRequestException("image deployment requires an image reference");
    }

    await this.releases.setStatus(releaseId, "BUILDING", { imageTag });
    this.buildLog.append(releaseId, `pulling image ${imageTag}`);
    await this.docker.ensureImage(imageTag);

    return imageTag;
  }

  // Clone the repo and build an image (Dockerfile/Nixpacks), returning the built tag.
  private async buildGitRelease(deployment: Deployment, releaseId: string): Promise<string> {
    await this.releases.setStatus(releaseId, "CLONING");

    const token = await this.deployments.resolveGitToken(deployment.id);
    const { dir, sha } = await this.git.clone({
      url: deployment.gitUrl,
      ref: deployment.gitRef,
      token,
    });
    const imageTag = `willy/${deployment.name}:${sha.slice(0, 12)}`;

    await this.releases.setStatus(releaseId, "BUILDING", { gitSha: sha, imageTag });
    this.buildLog.append(releaseId, `building ${imageTag} (${deployment.buildStrategy})`);

    const buildArgs = await this.envVars.resolveForInjection(deployment.id, "BUILD");

    try {
      await this.buildImage(deployment, {
        contextDir: dir,
        imageTag,
        dockerfilePath: dockerfileConfig(deployment).dockerfilePath ?? undefined,
        buildArgs,
        onLog: (line) => this.buildLog.append(releaseId, line),
      });
    } finally {
      await this.git.cleanup(dir);
    }

    return imageTag;
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
          ? await this.pullImageRelease(deployment, releaseId)
          : await this.buildGitRelease(deployment, releaseId);

      // CRON deployments don't run a long-lived container — the image is run on a schedule.
      if (deployment.type === "CRON") {
        await this.releases.setStatus(releaseId, "LIVE", { imageTag });
        await this.deployments.setActiveRelease(deployment.id, releaseId);
        await this.deployments.setState(deployment.id, "RUNNING");

        if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
          await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
        }

        await this.cleanupImages(deployment.name, imageTag);
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
      const containerId = await this.launchAndHealthCheck(deployment, imageTag, release);

      await this.releases.setStatus(releaseId, "LIVE", { containerId });
      await this.deployments.setActiveRelease(deployment.id, releaseId);
      await this.deployments.setState(deployment.id, "RUNNING");
      await this.removeStaleContainers(deployment.id, containerId);

      if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
        await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
      }

      await this.cleanupImages(deployment.name, imageTag);
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

      const project = this.compose.projectName(deployment);
      let webContainerId: string;

      try {
        webContainerId = await this.compose.up(deployment, dir, (line) =>
          this.buildLog.append(releaseId, line),
        );
      } finally {
        await this.git.cleanup(dir);
      }

      await this.releases.setStatus(releaseId, "HEALTHCHECKING", {
        containerId: webContainerId,
        composeProject: project,
      });
      this.buildLog.append(releaseId, "health-checking web service");

      const healthy =
        deployment.type === "WEB"
          ? await this.probeWeb(webContainerId, deployment, deployment.webServicePort ?? 80)
          : await this.probeWorker(webContainerId);

      if (!healthy) {
        throw new HealthCheckError("web service did not become healthy");
      }

      await this.releases.setStatus(releaseId, "LIVE", { containerId: webContainerId });
      await this.deployments.setActiveRelease(deployment.id, releaseId);
      await this.deployments.setState(deployment.id, "RUNNING");

      if (priorActiveReleaseId && priorActiveReleaseId !== releaseId) {
        await this.releases.setStatus(priorActiveReleaseId, "SUPERSEDED");
      }

      this.buildLog.append(releaseId, "deployment live");
    } catch (error) {
      const message = describeError(error);
      this.logger.warn(`compose release ${releaseId} failed: ${message}`);
      this.buildLog.append(releaseId, `error: ${message}`);
      await this.releases.setStatus(releaseId, "FAILED", { errorMessage: message });
      await this.deployments.setState(deployment.id, priorActiveReleaseId ? "DEGRADED" : "ERROR");
    } finally {
      this.buildLog.finish(releaseId);
    }
  }

  private buildImage(
    deployment: Deployment,
    context: {
      contextDir: string;
      imageTag: string;
      dockerfilePath: string | undefined;
      buildArgs: Record<string, string>;
      onLog: (line: string) => void;
    },
  ): Promise<void> {
    switch (deployment.buildStrategy) {
      case "DOCKERFILE":
        return this.dockerfile.build(context);
      case "NIXPACKS":
        return this.nixpacks.build(context);
      default:
        throw new BadRequestException(
          `build strategy ${deployment.buildStrategy} is not supported yet`,
        );
    }
  }

  // Starts the new container and blocks until it is healthy. Throws (leaving the old
  // container running) if it never becomes healthy.
  private async launchAndHealthCheck(
    deployment: Deployment,
    imageTag: string,
    release: Release,
  ): Promise<string> {
    const env = await this.envVars.resolveForInjection(deployment.id, "RUNTIME");
    const releaseShort = release.id.slice(0, 8);
    const containerName = `willy_${deployment.name}_${releaseShort}`;

    await this.docker.removeByName(containerName);

    const defaultPort = deployment.webServicePort ?? 80;
    let labels: Record<string, string>;
    let network: string | undefined;
    // For a single-container deployment every domain routes to the one container; only the port
    // can vary (no compose service name), so probe whichever port the primary domain points at.
    let probePort = defaultPort;

    if (deployment.type === "WEB") {
      const routes = await this.deployments.domainRoutes(deployment.id);

      if (routes.length === 0) {
        throw new BadRequestException("WEB deployment requires a domain");
      }

      probePort = routes[0]?.targetPort ?? defaultPort;
      labels = this.labels.forWebRoutes({
        deploymentId: deployment.id,
        routerPrefix: `${deployment.name}-${releaseShort}`,
        network: EDGE_NETWORK,
        priority: PRIORITY_BASE - Date.now(),
        groups: groupRoutes(routes, { defaultService: null, defaultPort }),
      });
      network = EDGE_NETWORK;
    } else {
      labels = this.labels.forNonWeb(deployment.id);
      network = undefined;
    }

    const containerId = await this.docker.runContainer({
      name: containerName,
      image: imageTag,
      env,
      labels,
      network,
      restartPolicy: RESTART_MAP[deployment.restartPolicy],
      memoryMb: deployment.memoryLimitMb ?? undefined,
      nanoCpus: deployment.nanoCpus ?? undefined,
      capAdd: deployment.capAdd ?? undefined,
      capDrop: deployment.capDrop ?? undefined,
      logMaxSizeMb: deployment.logMaxSizeMb ?? undefined,
      logMaxFiles: deployment.logMaxFiles ?? undefined,
      command: deployment.runCommand ? ["sh", "-c", deployment.runCommand] : undefined,
    });

    const healthy =
      deployment.type === "WEB"
        ? await this.probeWeb(containerId, deployment, probePort)
        : await this.probeWorker(containerId);

    if (!healthy) {
      await this.docker.stopAndRemove(containerId);

      throw new HealthCheckError("new container did not become healthy");
    }

    return containerId;
  }

  // WEB: container running + an HTTP response (<500) at healthCheckPath on the edge IP. If the
  // image declares its own Docker HEALTHCHECK, also wait until it reports "healthy" — Traefik
  // refuses to route a "starting"/"unhealthy" container, so cutting over before then would
  // briefly drop traffic.
  private async probeWeb(
    containerId: string,
    deployment: Deployment,
    port: number,
  ): Promise<boolean> {
    const path = deployment.healthCheckPath || "/";
    const deadline = Date.now() + WEB_HEALTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await this.docker.inspectContainer(containerId, EDGE_NETWORK);
      // undefined = no HEALTHCHECK in the image (Traefik routes it immediately).
      const dockerReady = status?.health === undefined || status.health === "healthy";

      if (status?.running && status.ip && dockerReady) {
        if (await this.httpProbe(status.ip, port, path)) {
          return true;
        }
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return false;
  }

  // WORKER/CRON: healthy if it survives a short grace window without exiting.
  private async probeWorker(containerId: string): Promise<boolean> {
    const deadline = Date.now() + WORKER_HEALTH_GRACE_MS;

    while (Date.now() < deadline) {
      const status = await this.docker.inspectContainer(containerId);

      if (!status || !status.running || status.health === "unhealthy") {
        return false;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return true;
  }

  private async httpProbe(ip: string, port: number, path: string): Promise<boolean> {
    const url = `http://${ip}:${port}${path.startsWith("/") ? path : `/${path}`}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_PROBE_TIMEOUT_MS) });

      return response.status < 500;
    } catch {
      return false;
    }
  }

  // Keep the most recent images for the deployment; drop the rest.
  private async cleanupImages(name: string, keepTag: string): Promise<void> {
    try {
      const tags = await this.docker.listImageTags(`willy/${name}`);

      for (const tag of tags.slice(KEEP_IMAGES)) {
        if (tag !== keepTag) {
          await this.docker.removeImage(tag);
        }
      }
    } catch (error) {
      this.logger.warn(`image cleanup for ${name} failed: ${describeError(error)}`);
    }
  }

  private async removeStaleContainers(deploymentId: string, keepId: string): Promise<void> {
    const ids = await this.docker.listByLabel(OWNER_LABEL, deploymentId);

    for (const id of ids) {
      if (id !== keepId) {
        await this.docker.stopAndRemove(id);
      }
    }
  }

  private async removeAllContainers(deploymentId: string): Promise<void> {
    const ids = await this.docker.listByLabel(OWNER_LABEL, deploymentId);

    for (const id of ids) {
      await this.docker.stopAndRemove(id);
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
