import { Injectable } from "@nestjs/common";
import { DockerImageService } from "../../docker/docker-image.service";

export interface BuildContext {
  contextDir: string;
  imageTag: string;
  dockerfilePath?: string | undefined;
  buildArgs: Record<string, string>;
  onLog: (line: string) => void;
}

@Injectable()
export class DockerfileStrategy {
  constructor(private readonly dockerImages: DockerImageService) {}

  async build(context: BuildContext): Promise<void> {
    await this.dockerImages.buildImage({
      contextDir: context.contextDir,
      imageTag: context.imageTag,
      dockerfile: context.dockerfilePath ?? "Dockerfile",
      buildArgs: context.buildArgs,
      onLog: context.onLog,
    });
  }
}
