import { Inject, Injectable } from "@nestjs/common";
import { eq, inArray, isNotNull, or } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";
import { deployments, releases } from "../db/schema";
import { DockerContainerService } from "../docker/docker-container.service";
import { DockerImageService } from "../docker/docker-image.service";
import { DockerSystemService } from "../docker/docker-system.service";
import { OWNER_LABEL } from "../traefik/label-generator.service";
import type { AdminContainerDto } from "./dto/admin-container.dto";
import type { AdminImageDto } from "./dto/admin-image.dto";
import type { DeploymentRefDto } from "./dto/deployment-ref.dto";
import type { PruneResultDto } from "./dto/prune-result.dto";

// Image tags produced by Willy follow willy/<deploymentName>:<hash> — extract the name component.
const WILLY_IMAGE_RE = /^willy\/([^:]+):/;

// Images Willy itself builds for a deployment: "willy/<name>:<hash>" (single) or the compose project
// prefix "willy_<name>-<service>". Note the control plane uses "willy-server"/"willy-web" (hyphen),
// which deliberately does NOT match — that's infra, not a managed deployment image.
const WILLY_BUILT_IMAGE_RE = /^willy[/_]/;

// A container is Willy-managed when it belongs to a deployment — it maps to one through a release, or
// carries the deploymentId owner label (covers the window before the release row is written).
export function isManagedContainer(
  labels: Record<string, string> | undefined,
  deployment: DeploymentRefDto | null,
): boolean {
  return deployment !== null || Boolean(labels?.[OWNER_LABEL]);
}

// An image is Willy-managed when Willy built it for a deployment, or it's an external image a
// deployment runs (IMAGE strategy) — i.e. referenced by some release's image tag.
export function isManagedImage(
  repoTags: readonly string[],
  managedImageTags: ReadonlySet<string>,
): boolean {
  return repoTags.some((tag) => WILLY_BUILT_IMAGE_RE.test(tag) || managedImageTags.has(tag));
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dockerImages: DockerImageService,
    private readonly dockerContainers: DockerContainerService,
    private readonly dockerSystem: DockerSystemService,
  ) {}

  // By default only Willy-managed images are returned; `all` reveals every host image (e.g. so an
  // admin can prune dangling/system images for disk).
  async getImages(all = false): Promise<AdminImageDto[]> {
    const images = await this.dockerImages.listAllImages();

    // The set of image tags any deployment runs — covers IMAGE-strategy external refs (nginx:1.27)
    // that aren't named willy/*.
    const tagRows = await this.db
      .selectDistinct({ imageTag: releases.imageTag })
      .from(releases)
      .where(isNotNull(releases.imageTag));
    const managedImageTags = new Set(
      tagRows.map((row) => row.imageTag).filter((tag): tag is string => Boolean(tag)),
    );

    // Collect unique deployment names referenced by willy/* tags (for the Deployments column).
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

    const result: AdminImageDto[] = [];

    for (const image of images) {
      const repoTags = (image.RepoTags ?? []).filter((t) => t !== "<none>:<none>");
      const managed = isManagedImage(repoTags, managedImageTags);

      if (!all && !managed) {
        continue;
      }

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

      result.push({
        id: image.Id,
        repoTags,
        size: image.Size,
        virtualSize: image.VirtualSize ?? image.Size,
        created: image.Created,
        deployments: imageDeployments,
        activeContainersCount: image.Containers ?? 0,
        managed,
      });
    }

    return result;
  }

  async deleteImage(id: string): Promise<void> {
    await this.dockerImages.removeImage(id);
  }

  async pruneImages(): Promise<PruneResultDto> {
    const result = await this.dockerImages.pruneDanglingImagesWithCount();

    return { spaceReclaimedBytes: result.spaceReclaimed, itemsRemoved: result.imagesDeleted };
  }

  // By default only Willy-managed containers are returned; `all` reveals every host container
  // (control plane, helpers, foreign containers) for pruning/inspection.
  async getContainers(all = false): Promise<AdminContainerDto[]> {
    const allContainers = await this.dockerSystem.listAllContainers();

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

    const result: AdminContainerDto[] = [];

    for (const container of allContainers) {
      const composeProject = container.Labels?.["com.docker.compose.project"];
      const deployment =
        byContainerId.get(container.Id) ??
        (composeProject ? (byComposeProject.get(composeProject) ?? null) : null);
      const managed = isManagedContainer(container.Labels, deployment);

      if (!all && !managed) {
        continue;
      }

      result.push({
        id: container.Id,
        name: (container.Names[0] ?? "").replace(/^\//, ""),
        image: container.Image,
        state: container.State,
        status: container.Status,
        created: container.Created,
        deployment,
        managed,
      });
    }

    return result;
  }

  async pruneContainers(): Promise<PruneResultDto> {
    const result = await this.dockerContainers.pruneStoppedContainers();

    return {
      spaceReclaimedBytes: result.spaceReclaimed,
      itemsRemoved: result.containersDeleted.length,
    };
  }
}
