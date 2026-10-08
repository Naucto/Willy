import { spawn } from "node:child_process";
import { join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Docker from "dockerode";
import { WillyError } from "../common/errors";
import { DOCKER_CLIENT, dockerCliEnv, dockerProxyUrl } from "./docker-client";
import { describeError, parseExposedPorts } from "./docker-helpers";
import type { BuildImageOptions } from "./docker.types";

export class ImageBuildError extends WillyError {}

// Image build/pull/list/inspect/prune over the Docker Engine API.
@Injectable()
export class DockerImageService {
  private readonly logger = new Logger(DockerImageService.name);

  private readonly dockerHost: string;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    config: ConfigService,
  ) {
    this.dockerHost = dockerProxyUrl(config);
  }

  // Builds an image from a context directory with BuildKit, streaming build output to onLog.
  buildImage(options: BuildImageOptions): Promise<void> {
    const args = [
      "buildx",
      "build",
      "--load",
      "--tag",
      options.imageTag,
      "--file",
      join(options.contextDir, options.dockerfile ?? "Dockerfile"),
    ];

    for (const [key, value] of Object.entries(options.buildArgs ?? {})) {
      args.push("--build-arg", `${key}=${value}`);
    }

    args.push(options.contextDir);

    const child = spawn("docker", args, { env: dockerCliEnv(this.dockerHost) });
    const relay = (chunk: Buffer): void => {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (line.length > 0) {
          options.onLog?.(line);
        }
      }
    };

    child.stdout.on("data", relay);
    child.stderr.on("data", relay);

    return new Promise<void>((resolve, reject) => {
      child.on("error", (error) => reject(new ImageBuildError(error.message)));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();

          return;
        }

        reject(new ImageBuildError(`docker buildx build exited with code ${code}`));
      });
    });
  }

  // Pulls an image if it isn't present locally (helper images for backups, etc.).
  async ensureImage(image: string): Promise<void> {
    const present = await this.docker.listImages({ filters: { reference: [image] } });

    if (present.length > 0) {
      return;
    }

    const stream = await this.docker.pull(image);

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (error) =>
        error ? reject(error instanceof Error ? error : new Error(String(error))) : resolve(),
      );
    });
  }

  // Every tagged image present on the host, newest first — for the "browse images" picker when
  // choosing an IMAGE-strategy source. Excludes Willy's own per-release build images and untagged.
  async listLocalImageTags(): Promise<string[]> {
    const images = await this.docker.listImages();

    return images
      .sort((a, b) => b.Created - a.Created)
      .flatMap((image) => image.RepoTags ?? [])
      .filter((tag) => tag.length > 0 && !tag.endsWith(":<none>") && !tag.startsWith("willy/"));
  }

  // Tags under a repo (e.g. "willy/blog"), newest first — used for keep-N image cleanup.
  async listImageTags(repo: string): Promise<string[]> {
    const images = await this.docker.listImages({ filters: { reference: [`${repo}:*`] } });

    return images
      .filter((image) => image.RepoTags && image.RepoTags.length > 0)
      .sort((a, b) => b.Created - a.Created)
      .flatMap((image) => image.RepoTags ?? [])
      .filter((tag) => tag.startsWith(`${repo}:`) && !tag.endsWith(":<none>"));
  }

  async removeImage(tag: string): Promise<void> {
    try {
      await this.docker.getImage(tag).remove({ force: true });
    } catch (error) {
      this.logger.warn(`failed to remove image ${tag}: ${describeError(error)}`);
    }
  }

  // The TCP ports an image declares via EXPOSE, ascending. Used as the fallback routing/health-check
  // port when a deployment's domain doesn't pin an explicit port. Empty if none/uninspectable.
  async imageExposedPorts(tag: string): Promise<number[]> {
    try {
      const info = await this.docker.getImage(tag).inspect();

      return parseExposedPorts(info.Config?.ExposedPorts);
    } catch {
      return [];
    }
  }

  // Prunes only dangling images (untagged layers left behind by rebuilds). Scoped on purpose —
  // never a blanket `image prune -a`, which would delete images still referenced by deployments.
  // Returns the bytes reclaimed.
  async pruneDanglingImages(): Promise<number> {
    try {
      const result = await this.docker.pruneImages({ filters: { dangling: { true: true } } });

      return result.SpaceReclaimed ?? 0;
    } catch (error) {
      this.logger.warn(`dangling image prune failed: ${describeError(error)}`);

      return 0;
    }
  }

  // Prunes dangling images and returns both the space reclaimed and the number of deleted images.
  async pruneDanglingImagesWithCount(): Promise<{ imagesDeleted: number; spaceReclaimed: number }> {
    try {
      const result = await this.docker.pruneImages({ filters: { dangling: { true: true } } });

      return {
        imagesDeleted: result.ImagesDeleted?.length ?? 0,
        spaceReclaimed: result.SpaceReclaimed ?? 0,
      };
    } catch (error) {
      this.logger.warn(`dangling image prune failed: ${describeError(error)}`);

      return { imagesDeleted: 0, spaceReclaimed: 0 };
    }
  }

  // All images on the host, including untagged ones — for the admin resource overview.
  async listAllImages() {
    return this.docker.listImages();
  }
}
