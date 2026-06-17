import { Injectable } from "@nestjs/common";
import type { Deployment } from "../deployments/deployments.service";
import {
  type ContainerNetwork,
  type DeclaredHealthcheck,
  DockerService,
  type VolumeMount,
} from "../docker/docker.service";
import { OWNER_LABEL } from "../traefik/label-generator.service";

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

export interface DeploymentContainer {
  id: string;
  name: string;
  image: string;
  running: boolean;
  volumes: VolumeMount[];
  // Compose service name; null for single-container deployments.
  service: string | null;
  networks: ContainerNetwork[];
  // TCP ports the image declares via EXPOSE; used to populate the domain port picker.
  exposedPorts: number[];
  // Runtime health (Docker State.Health.Status: starting/healthy/unhealthy), null when none.
  health: string | null;
  // The healthcheck declared by the image/compose file (read-only), null when none.
  declaredHealthcheck: DeclaredHealthcheck | null;
}

// Discovers the live containers (and their named volumes) belonging to a deployment: compose stacks
// by their project label, everything else by Willy's owner label.
@Injectable()
export class ContainersService {
  constructor(private readonly docker: DockerService) {}

  async listForDeployment(deployment: Deployment): Promise<DeploymentContainer[]> {
    const ids = await this.discover(deployment);
    const containers: DeploymentContainer[] = [];

    for (const id of ids) {
      const info = await this.docker.inspectContainer(id);

      if (info) {
        containers.push({
          id: info.id,
          name: info.name ?? info.id.slice(0, 12),
          image: info.image ?? "",
          running: info.running,
          volumes: info.mounts,
          service: info.service ?? null,
          networks: info.networks,
          exposedPorts: info.exposedPorts,
          health: info.health ?? null,
          declaredHealthcheck: info.declaredHealthcheck ?? null,
        });
      }
    }

    return containers;
  }

  // Validates that a requested container (full/short id or name) belongs to the deployment and
  // returns its full id, or null if it isn't one of the deployment's containers. Guards
  // per-container logs/console against pointing at arbitrary containers.
  async resolveContainerId(deployment: Deployment, requested: string): Promise<string | null> {
    const containers = await this.listForDeployment(deployment);
    const match = containers.find(
      (container) =>
        container.id === requested ||
        container.id.startsWith(requested) ||
        container.name === requested,
    );

    return match?.id ?? null;
  }

  // Resolves the container to target when the caller didn't pick one (console/logs). With a single
  // container that's the one; with none, null (callers replay history / report "nothing running");
  // with several it's ambiguous, so the caller must prompt for one (the frontend shows a selector).
  async defaultContainer(
    deployment: Deployment,
  ): Promise<{ id: string | null; ambiguous: boolean }> {
    const containers = await this.listForDeployment(deployment);

    if (containers.length > 1) {
      return { id: null, ambiguous: true };
    }

    return { id: containers[0]?.id ?? null, ambiguous: false };
  }

  async containersUsingVolume(deployment: Deployment, volume: string): Promise<string[]> {
    const containers = await this.listForDeployment(deployment);

    return containers
      .filter((container) => container.volumes.some((mount) => mount.name === volume))
      .map((container) => container.id);
  }

  private discover(deployment: Deployment): Promise<string[]> {
    if (deployment.buildStrategy === "COMPOSE") {
      return this.docker.listByLabel(COMPOSE_PROJECT_LABEL, `willy_${deployment.name}`);
    }

    return this.docker.listByLabel(OWNER_LABEL, deployment.id);
  }
}
