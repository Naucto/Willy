import { Injectable } from "@nestjs/common";
import { DockerService } from "../../docker/docker.service";

export interface BuildContext {
  contextDir: string;
  imageTag: string;
  dockerfilePath?: string | undefined;
  buildArgs: Record<string, string>;
  onLog: (line: string) => void;
}

@Injectable()
export class DockerfileStrategy {
  constructor(private readonly docker: DockerService) {}

  async build(context: BuildContext): Promise<void> {
    await this.docker.buildImage({
      contextDir: context.contextDir,
      imageTag: context.imageTag,
      dockerfile: context.dockerfilePath ?? "Dockerfile",
      buildArgs: context.buildArgs,
      onLog: context.onLog,
    });
  }
}
