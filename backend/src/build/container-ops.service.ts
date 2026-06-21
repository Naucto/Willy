import { BadRequestException, Injectable } from "@nestjs/common";
import type { Deployment } from "../deployments/deployments.service";
import { DomainsService } from "../deployments/domains.service";
import { DockerContainerService } from "../docker/docker-container.service";
import { DockerImageService } from "../docker/docker-image.service";
import type { RestartPolicyName } from "../docker/docker.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import {
  LabelGeneratorService,
  OWNER_LABEL,
  groupRoutes,
} from "../traefik/label-generator.service";
import { HealthCheckError } from "./errors";
import { HealthProber } from "./health-prober.service";
import type { Release } from "./releases.service";

const EDGE_NETWORK = "willy_edge";

// A freshly launched container gets a *lower* router priority than the one already serving
// the shared Host rule, so the old version keeps winning until it is removed at cutover.
// Priority is derived from launch time (not the release date) so a rollback — launching an
// older release's image — still correctly supersedes the current one. Base keeps the value
// positive and shrinking; Traefik priorities are int64 so the magnitude is fine.
const PRIORITY_BASE = 9_000_000_000_000;

const RESTART_MAP: Record<Deployment["restartPolicy"], RestartPolicyName> = {
  NO: "no",
  ON_FAILURE: "on-failure",
  ALWAYS: "always",
  UNLESS_STOPPED: "unless-stopped",
};

// Single-container lifecycle for the health-checked swap: launch the new container (resolving its
// env/labels/network), gate it on the health prober, and reap the deployment's stale containers.
@Injectable()
export class ContainerOps {
  constructor(
    private readonly dockerContainers: DockerContainerService,
    private readonly dockerImages: DockerImageService,
    private readonly domains: DomainsService,
    private readonly labels: LabelGeneratorService,
    private readonly envVars: EnvVarsService,
    private readonly health: HealthProber,
  ) {}

  // Starts the new container and blocks until it is healthy. Throws (leaving the old
  // container running) if it never becomes healthy.
  async launchAndHealthCheck(
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
        ? await this.health.probeWeb(containerId)
        : await this.health.probeWorker(containerId);

    if (!healthy) {
      await this.dockerContainers.stopAndRemove(containerId);

      throw new HealthCheckError("new container did not become healthy");
    }

    return containerId;
  }

  async removeStaleContainers(deploymentId: string, keepId: string): Promise<void> {
    const ids = await this.dockerContainers.listByLabel(OWNER_LABEL, deploymentId);

    for (const id of ids) {
      if (id !== keepId) {
        await this.dockerContainers.stopAndRemove(id);
      }
    }
  }

  async removeAllContainers(deploymentId: string): Promise<void> {
    const ids = await this.dockerContainers.listByLabel(OWNER_LABEL, deploymentId);

    for (const id of ids) {
      await this.dockerContainers.stopAndRemove(id);
    }
  }
}
