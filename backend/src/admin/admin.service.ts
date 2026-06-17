import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray, or } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { deployments, releases } from "../db/schema";
import { DockerService } from "../docker/docker.service";
import type { AdminContainerDto } from "./dto/admin-container.dto";
import type { AdminImageDto } from "./dto/admin-image.dto";
import type { DeploymentRefDto } from "./dto/deployment-ref.dto";
import type { PruneResultDto } from "./dto/prune-result.dto";

// Image tags produced by Willy follow willy/<deploymentName>:<hash> — extract the name component.
const WILLY_IMAGE_RE = /^willy\/([^:]+):/;

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly docker: DockerService,
  ) {}

  async getImages(): Promise<AdminImageDto[]> {
    const images = await this.docker.listAllImages();

    // Collect unique deployment names referenced by willy/* tags.
    const allDeploymentNames = new Set<string>();

    for (const image of images) {
      for (const tag of image.RepoTags ?? []) {
        const match = WILLY_IMAGE_RE.exec(tag);

        if (match?.[1]) {
          allDeploymentNames.add(match[1]);
        }
      }
    }

    const deploymentByName = new Map<string, DeploymentRefDto>();

    if (allDeploymentNames.size > 0) {
      const rows = await this.db
        .select({ id: deployments.id, name: deployments.name })
        .from(deployments)
        .where(inArray(deployments.name, [...allDeploymentNames]));

      for (const row of rows) {
        deploymentByName.set(row.name, row);
      }
    }

    return images.map((image) => {
      const repoTags = (image.RepoTags ?? []).filter((t) => t !== "<none>:<none>");
      const imageDeploymentNames = new Set<string>();

      for (const tag of repoTags) {
        const match = WILLY_IMAGE_RE.exec(tag);

        if (match?.[1]) {
          imageDeploymentNames.add(match[1]);
        }
      }

      const imageDeployments = [...imageDeploymentNames]
        .map((name) => deploymentByName.get(name))
        .filter((d): d is DeploymentRefDto => d !== undefined);

      return {
        id: image.Id,
        repoTags,
        size: image.Size,
        virtualSize: image.VirtualSize ?? image.Size,
        created: image.Created,
        deployments: imageDeployments,
        activeContainersCount: image.Containers ?? 0,
      };
    });
  }

  async deleteImage(id: string): Promise<void> {
    await this.docker.removeImage(id);
  }

  async pruneImages(): Promise<PruneResultDto> {
    const result = await this.docker.pruneDanglingImagesWithCount();

    return { spaceReclaimedBytes: result.spaceReclaimed, itemsRemoved: result.imagesDeleted };
  }

  async getContainers(): Promise<AdminContainerDto[]> {
    const allContainers = await this.docker.listAllContainers();

    if (allContainers.length === 0) {
      return [];
    }

    const containerIds = allContainers.map((c) => c.Id);
    const composeProjects = [
      ...new Set(
        allContainers
          .map((c) => c.Labels?.["com.docker.compose.project"])
          .filter((p): p is string => Boolean(p)),
      ),
    ];

    const conditions = [
      inArray(releases.containerId, containerIds),
      ...(composeProjects.length > 0 ? [inArray(releases.composeProject, composeProjects)] : []),
    ];

    const releaseRows = await this.db
      .selectDistinct({
        containerId: releases.containerId,
        composeProject: releases.composeProject,
        deploymentId: deployments.id,
        deploymentName: deployments.name,
      })
      .from(releases)
      .innerJoin(deployments, eq(releases.deploymentId, deployments.id))
      .where(or(...conditions));

    const byContainerId = new Map<string, DeploymentRefDto>();
    const byComposeProject = new Map<string, DeploymentRefDto>();

    for (const row of releaseRows) {
      const ref: DeploymentRefDto = { id: row.deploymentId, name: row.deploymentName };

      if (row.containerId) {
        byContainerId.set(row.containerId, ref);
      }

      if (row.composeProject) {
        byComposeProject.set(row.composeProject, ref);
      }
    }

    return allContainers.map((container) => {
      const composeProject = container.Labels?.["com.docker.compose.project"];
      const deployment =
        byContainerId.get(container.Id) ??
        (composeProject ? (byComposeProject.get(composeProject) ?? null) : null);

      return {
        id: container.Id,
        name: (container.Names[0] ?? "").replace(/^\//, ""),
        image: container.Image,
        state: container.State,
        status: container.Status,
        created: container.Created,
        deployment,
      };
    });
  }

  async pruneContainers(): Promise<PruneResultDto> {
    const result = await this.docker.pruneStoppedContainers();

    return {
      spaceReclaimedBytes: result.spaceReclaimed,
      itemsRemoved: result.containersDeleted.length,
    };
  }
}
