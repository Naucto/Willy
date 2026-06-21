import { Socket } from "node:net";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { WillyError } from "../common/errors";
import { ContainersService } from "../containers/containers.service";
import {
  type Deployment,
  DeploymentsService,
  dockerfileConfig,
  imageConfig,
} from "../deployments/deployments.service";
import { DomainsService } from "../deployments/domains.service";
import { DockerContainerService } from "../docker/docker-container.service";
import { DockerImageService } from "../docker/docker-image.service";
import type { RestartPolicyName } from "../docker/docker.service";
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
import { RuntimeLogCollector } from "./runtime-log.collector";
import { ComposeService } from "./strategies/compose.service";
import { DockerfileStrategy } from "./strategies/dockerfile.strategy";

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
const KEEP_IMAGES = 3;

// After the stack is healthy, how long to keep trying to actually reach the app on its routed port
// before declaring the deployment unreachable (a port misconfiguration that would otherwise 502).
const REACHABILITY_TIMEOUT_MS = 15_000;

// Best-effort TCP connect with a per-attempt timeout — true if the port accepts a connection.
function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();

    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

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
    private readonly domains: DomainsService,
    private readonly releases: ReleasesService,
    private readonly git: GitService,
    private readonly dockerContainers: DockerContainerService,
    private readonly dockerImages: DockerImageService,
    private readonly labels: LabelGeneratorService,
    private readonly envVars: EnvVarsService,
    private readonly dockerfile: DockerfileStrategy,
    private readonly compose: ComposeService,
    private readonly buildLog: BuildLogStore,
    private readonly queue: BuildQueue,
    private readonly cron: CronService,
    private readonly runtimeLog: RuntimeLogCollector,
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

    await this.removeAllContainers(deploymentId);
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
      const containerId = await this.launchAndHealthCheck(deployment, target.imageTag, target);

      await this.removeStaleContainers(deploymentId, containerId);
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

  // IMAGE strategy: run an existing image as-is (no clone/build), just ensure it's pulled.
  private async pullImageRelease(deployment: Deployment, releaseId: string): Promise<string> {
    const imageTag = imageConfig(deployment)?.imageRef;

    if (!imageTag) {
      throw new BadRequestException("image deployment requires an image reference");
    }

    await this.releases.setStatus(releaseId, "BUILDING", { imageTag });
    this.buildLog.append(releaseId, `pulling image ${imageTag}`);
    await this.dockerImages.ensureImage(imageTag);

    return imageTag;
  }

  // Clone the repo and build an image from its Dockerfile, returning the built tag.
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
      await this.syncRuntimeLogs(deployment);

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

      if (!(await this.composeHealthy(deployment))) {
        // Compose recreates the stack in place, so an unhealthy result has no prior version to fall
        // back to — stop the brought-up containers so they aren't left serving while unhealthy.
        this.buildLog.append(releaseId, "stack unhealthy — stopping containers");
        await this.compose.stopAll(deployment);

        throw new HealthCheckError("compose stack did not become healthy");
      }

      // Healthy containers can still 502 if the app listens on a different port than Traefik routes
      // to. Probe the routed port so a port mismatch fails loudly instead of silently 502-ing.
      const unreachable = await this.firstUnreachableRoute(deployment);

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

  // Compose health gate: wait until every project container is up to its bar. A service that
  // declares a healthcheck (in the file or injected by Willy) must report Docker-healthy; a service
  // with no healthcheck passes as soon as it's running. Returns false if the deadline passes first.
  private async composeHealthy(deployment: Deployment): Promise<boolean> {
    const deadline = Date.now() + WEB_HEALTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const containers = await this.containers.listForDeployment(deployment);

      if (containers.length > 0 && (await this.allContainersHealthy(containers))) {
        return true;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return false;
  }

  // Verify each routed domain actually reaches its container on the port Traefik forwards to. Returns
  // a human-readable reason for the first unreachable route, or null when everything is reachable (or
  // can't be safely determined). Conservative: only probes a route when its target container is
  // unambiguous, so it never fails a healthy deploy on missing information.
  private async firstUnreachableRoute(deployment: Deployment): Promise<string | null> {
    const [containers, routes] = await Promise.all([
      this.containers.listForDeployment(deployment),
      this.domains.domainRoutes(deployment.id),
    ]);

    for (const route of routes) {
      const container = route.targetService
        ? containers.find((c) => c.service === route.targetService)
        : containers.length === 1
          ? containers[0]
          : undefined;

      const ip = container?.networks.find((n) => n.name === EDGE_NETWORK)?.ip;

      if (!container || !ip) {
        continue;
      }

      const port = route.targetPort ?? deployment.webServicePort ?? container.exposedPorts[0] ?? 80;
      const deadline = Date.now() + REACHABILITY_TIMEOUT_MS;
      let reachable = false;

      while (Date.now() < deadline) {
        if (await tcpConnect(ip, port, HEALTH_INTERVAL_MS)) {
          reachable = true;
          break;
        }

        await delay(HEALTH_INTERVAL_MS);
      }

      if (!reachable) {
        const exposed = container.exposedPorts.length
          ? ` (the container exposes ${container.exposedPorts.join(", ")})`
          : "";

        return (
          `${route.fqdn} is routed to port ${port} but the app isn't accepting connections there${exposed}. ` +
          "Set the domain's port (Domains tab) to the port your app actually listens on."
        );
      }
    }

    return null;
  }

  private async allContainersHealthy(
    containers: { id: string; service: string | null }[],
  ): Promise<boolean> {
    for (const container of containers) {
      const status = await this.dockerContainers.inspectContainer(container.id);

      if (!status?.running) {
        return false;
      }

      // Only gate on a healthcheck when one exists (declared or injected); otherwise running is
      // enough — we don't health-check a container that defines no healthcheck.
      if (status.health !== undefined && status.health !== "healthy") {
        return false;
      }
    }

    return true;
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

    await this.dockerContainers.removeByName(containerName);

    // The fallback port for domains that don't pin one: a legacy webServicePort if still set,
    // otherwise the image's first exposed port, otherwise 80.
    const exposed = await this.dockerImages.imageExposedPorts(imageTag);
    const defaultPort = deployment.webServicePort ?? exposed[0] ?? 80;
    let labels: Record<string, string>;
    let network: string | undefined;

    if (deployment.type === "WEB") {
      const routes = await this.domains.domainRoutes(deployment.id);

      if (routes.length === 0) {
        throw new BadRequestException("WEB deployment requires a domain");
      }

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

    const containerId = await this.dockerContainers.runContainer({
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
      healthcheck: deployment.healthcheck ?? undefined,
      command: deployment.runCommand ? ["sh", "-c", deployment.runCommand] : undefined,
    });

    const healthy =
      deployment.type === "WEB"
        ? await this.probeWeb(containerId)
        : await this.probeWorker(containerId);

    if (!healthy) {
      await this.dockerContainers.stopAndRemove(containerId);

      throw new HealthCheckError("new container did not become healthy");
    }

    return containerId;
  }

  // WEB: healthy once the container is running. If it declares a healthcheck (image HEALTHCHECK or a
  // Willy-injected custom one) also wait until it reports "healthy" — Traefik refuses to route a
  // "starting"/"unhealthy" container, so cutting over before then would briefly drop traffic. A
  // container with no healthcheck is considered ready as soon as it's running.
  private async probeWeb(containerId: string): Promise<boolean> {
    const deadline = Date.now() + WEB_HEALTH_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await this.dockerContainers.inspectContainer(containerId);

      if (status?.running && (status.health === undefined || status.health === "healthy")) {
        return true;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return false;
  }

  // WORKER/CRON: healthy if it survives a short grace window without exiting.
  private async probeWorker(containerId: string): Promise<boolean> {
    const deadline = Date.now() + WORKER_HEALTH_GRACE_MS;

    while (Date.now() < deadline) {
      const status = await this.dockerContainers.inspectContainer(containerId);

      if (!status || !status.running || status.health === "unhealthy") {
        return false;
      }

      await delay(HEALTH_INTERVAL_MS);
    }

    return true;
  }

  // Keep the most recent images for the deployment; drop the rest.
  private async cleanupImages(name: string, keepTag: string): Promise<void> {
    try {
      const tags = await this.dockerImages.listImageTags(`willy/${name}`);

      for (const tag of tags.slice(KEEP_IMAGES)) {
        if (tag !== keepTag) {
          await this.dockerImages.removeImage(tag);
        }
      }
    } catch (error) {
      this.logger.warn(`image cleanup for ${name} failed: ${describeError(error)}`);
    }
  }

  private async removeStaleContainers(deploymentId: string, keepId: string): Promise<void> {
    const ids = await this.dockerContainers.listByLabel(OWNER_LABEL, deploymentId);

    for (const id of ids) {
      if (id !== keepId) {
        await this.dockerContainers.stopAndRemove(id);
      }
    }
  }

  private async removeAllContainers(deploymentId: string): Promise<void> {
    const ids = await this.dockerContainers.listByLabel(OWNER_LABEL, deploymentId);

    for (const id of ids) {
      await this.dockerContainers.stopAndRemove(id);
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
