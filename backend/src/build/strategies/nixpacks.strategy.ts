import { spawn } from "node:child_process";
import { Injectable } from "@nestjs/common";
import { WillyError } from "../../common/errors";
import { DockerService } from "../../docker/docker.service";
import type { BuildContext } from "./dockerfile.strategy";

export class NixpacksError extends WillyError {}

// Builds from source with Nixpacks (auto-detected runtime). Nixpacks only *generates* the
// Dockerfile here (`--out`); the actual image build goes through the same dockerode path as
// the Dockerfile strategy (legacy builder via the socket-proxy), so no Docker CLI is needed
// in the image — just the nixpacks binary.
@Injectable()
export class NixpacksStrategy {
  constructor(private readonly docker: DockerService) {}

  async build(context: BuildContext): Promise<void> {
    await this.generate(context);

    await this.docker.buildImage({
      contextDir: context.contextDir,
      imageTag: context.imageTag,
      // Nixpacks writes the generated Dockerfile under .nixpacks/.
      dockerfile: ".nixpacks/Dockerfile",
      buildArgs: context.buildArgs,
      onLog: context.onLog,
    });
  }

  private generate(context: BuildContext): Promise<void> {
    const args = ["build", context.contextDir, "--out", context.contextDir];

    for (const [key, value] of Object.entries(context.buildArgs)) {
      args.push("--env", `${key}=${value}`);
    }

    const child = spawn("nixpacks", args);

    child.stdout.on("data", (chunk: Buffer) => this.emit(chunk, context));
    child.stderr.on("data", (chunk: Buffer) => this.emit(chunk, context));

    return new Promise<void>((resolve, reject) => {
      child.on("error", (error) => reject(new NixpacksError(error.message)));
      child.on("close", (code) => {
        if (code === 0) {
          resolve();

          return;
        }

        reject(new NixpacksError(`nixpacks exited with code ${code}`));
      });
    });
  }

  private emit(chunk: Buffer, context: BuildContext): void {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.length > 0) {
        context.onLog(line);
      }
    }
  }
}
