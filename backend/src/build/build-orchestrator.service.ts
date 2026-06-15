import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import type { RestartPolicyName } from "../docker/docker.service";
import { DockerService } from "../docker/docker.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { GitService } from "../git/git.service";
import { LabelGeneratorService, OWNER_LABEL } from "../traefik/label-generator.service";
import { BuildLogStore } from "./build-log.store";
import { BuildQueue } from "./build-queue";
import type { Release } from "./releases.service";
import { ReleasesService } from "./releases.service";
import { DockerfileStrategy } from "./strategies/dockerfile.strategy";

const EDGE_NETWORK = "willy_edge";

const RESTART_MAP: Record<Deployment["restartPolicy"], RestartPolicyName> = {
  NO: "no",
  ON_FAILURE: "on-failure",
  ALWAYS: "always",
  UNLESS_STOPPED: "unless-stopped",
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Drives a deployment from git clone -> image build -> running container, updating the
// Release status as it goes. Health-checked zero-downtime swap arrives in Phase 5; here a
// new container is started and the previous one(s) for the deployment are then removed.
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
    private readonly buildLog: BuildLogStore,
    private readonly queue: BuildQueue,
  ) {}

  async deploy(deploymentId: string, actorId?: string): Promise<Release> {
    const deployment = await this.requireDeployment(deploymentId);
    const release = await this.releases.create(deploymentId, actorId);

    this.queue.enqueue(deploymentId, () => this.runRelease(deployment, release.id));

    return release;
  }

  async stop(deploymentId: string): Promise<void> {
    await this.requireDeployment(deploymentId);
    await this.removeAllContainers(deploymentId);
    await this.deployments.setState(deploymentId, "STOPPED");
  }

  async start(deploymentId: string): Promise<void> {
    const deployment = await this.requireDeployment(deploymentId);

    if (!deployment.activeReleaseId) {
      throw new BadRequestException("no active release to start; deploy first");
    }

    const release = await this.releases.findById(deployment.activeReleaseId);

    if (!release?.imageTag) {
      throw new BadRequestException("active release has no built image");
    }

    const tag = release.gitSha ? release.gitSha.slice(0, 12) : release.id.slice(0, 12);
    const containerId = await this.launchContainer(deployment, release.imageTag, tag);

    await this.removeStaleContainers(deploymentId, containerId);
    await this.deployments.setState(deploymentId, "RUNNING");
  }

  async teardown(deploymentId: string): Promise<void> {
    await this.removeAllContainers(deploymentId);
  }

  private async runRelease(deployment: Deployment, releaseId: string): Promise<void> {
    try {
      this.buildLog.append(releaseId, `deploying ${deployment.name} (${deployment.type})`);
      await this.releases.setStatus(releaseId, "CLONING");

      const token = await this.deployments.resolveGitToken(deployment.id);
      const { dir, sha } = await this.git.clone({
        url: deployment.gitUrl,
        ref: deployment.gitRef,
        token,
      });
      const shortSha = sha.slice(0, 12);
      const imageTag = `willy/${deployment.name}:${shortSha}`;

      await this.releases.setStatus(releaseId, "BUILDING", { gitSha: sha, imageTag });
      this.buildLog.append(releaseId, `building ${imageTag}`);

      const buildArgs = await this.envVars.resolveForInjection(deployment.id, "BUILD");

      try {
        await this.dockerfile.build({
          contextDir: dir,
          imageTag,
          dockerfilePath: deployment.dockerfilePath ?? undefined,
          buildArgs,
          onLog: (line) => this.buildLog.append(releaseId, line),
        });
      } finally {
        await this.git.cleanup(dir);
      }

      await this.releases.setStatus(releaseId, "HEALTHCHECKING");
      const containerId = await this.launchContainer(deployment, imageTag, shortSha);

      await this.releases.setStatus(releaseId, "LIVE", { containerId });
      await this.deployments.setActiveRelease(deployment.id, releaseId);
      await this.deployments.setState(deployment.id, "RUNNING");
      await this.removeStaleContainers(deployment.id, containerId);

      this.buildLog.append(releaseId, "deployment live");
    } catch (error) {
      const message = describeError(error);
      this.logger.warn(`release ${releaseId} failed: ${message}`);
      this.buildLog.append(releaseId, `error: ${message}`);
      await this.releases.setStatus(releaseId, "FAILED", { errorMessage: message });
      await this.deployments.setState(deployment.id, "ERROR");
    } finally {
      this.buildLog.finish(releaseId);
    }
  }

  private async launchContainer(
    deployment: Deployment,
    imageTag: string,
    shortSha: string,
  ): Promise<string> {
    const env = await this.envVars.resolveForInjection(deployment.id, "RUNTIME");
    const containerName = `willy_${deployment.name}_${shortSha}`;

    await this.docker.removeByName(containerName);

    let labels: Record<string, string>;
    let network: string | undefined;

    if (deployment.type === "WEB") {
      const domain = await this.deployments.primaryDomain(deployment.id);

      if (!domain) {
        throw new BadRequestException("WEB deployment requires a primary domain");
      }

      labels = this.labels.forWeb({
        deploymentId: deployment.id,
        routerName: deployment.name,
        host: domain.fqdn,
        port: deployment.webServicePort ?? 80,
        network: EDGE_NETWORK,
      });
      network = EDGE_NETWORK;
    } else {
      labels = this.labels.forNonWeb(deployment.id);
      network = undefined;
    }

    return this.docker.runContainer({
      name: containerName,
      image: imageTag,
      env,
      labels,
      network,
      restartPolicy: RESTART_MAP[deployment.restartPolicy],
      memoryMb: deployment.memoryLimitMb ?? undefined,
      command: deployment.runCommand ? ["sh", "-c", deployment.runCommand] : undefined,
    });
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
