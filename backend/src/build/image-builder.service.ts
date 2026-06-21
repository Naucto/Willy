import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  type Deployment,
  DeploymentsService,
  dockerfileConfig,
  imageConfig,
} from "../deployments/deployments.service";
import { describeError } from "../docker/docker-helpers";
import { DockerImageService } from "../docker/docker-image.service";
import { EnvVarsService } from "../env-vars/env-vars.service";
import { GitService } from "../git/git.service";
import { BuildLogStore } from "./build-log.store";
import { ReleasesService } from "./releases.service";
import { DockerfileStrategy } from "./strategies/dockerfile.strategy";

const KEEP_IMAGES = 3;

// Turns a release into a runnable image tag: pulls (IMAGE strategy) or clones + builds (git
// strategies), and prunes the deployment's old images. The orchestrator sequences the release-status
// transitions around these calls.
@Injectable()
export class ImageBuilder {
  private readonly logger = new Logger(ImageBuilder.name);

  constructor(
    private readonly deployments: DeploymentsService,
    private readonly releases: ReleasesService,
    private readonly git: GitService,
    private readonly dockerImages: DockerImageService,
    private readonly envVars: EnvVarsService,
    private readonly dockerfile: DockerfileStrategy,
    private readonly buildLog: BuildLogStore,
  ) {}

  // IMAGE strategy: run an existing image as-is (no clone/build), just ensure it's pulled.
  async pullImageRelease(deployment: Deployment, releaseId: string): Promise<string> {
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
  async buildGitRelease(deployment: Deployment, releaseId: string): Promise<string> {
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

  // Keep the most recent images for the deployment; drop the rest.
  async cleanupImages(name: string, keepTag: string): Promise<void> {
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
}
