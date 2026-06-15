import { spawn } from "node:child_process";
import { PassThrough, type Readable } from "node:stream";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Docker from "dockerode";

export interface BuildImageOptions {
  contextDir: string;
  imageTag: string;
  dockerfile?: string | undefined;
  buildArgs?: Record<string, string> | undefined;
  onLog?: ((line: string) => void) | undefined;
}

export type RestartPolicyName = "no" | "on-failure" | "always" | "unless-stopped";

export interface RunContainerOptions {
  name: string;
  image: string;
  env?: Record<string, string> | undefined;
  labels?: Record<string, string> | undefined;
  network?: string | undefined;
  restartPolicy?: RestartPolicyName | undefined;
  memoryMb?: number | undefined;
  nanoCpus?: number | undefined;
  command?: string[] | undefined;
}

export interface ContainerStatus {
  id: string;
  running: boolean;
  health: string | undefined;
  ip: string | undefined;
}

interface BuildEvent {
  stream?: string;
  error?: string;
  errorDetail?: { message?: string };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Thin wrapper over the Docker Engine API, reached through the least-privilege
// docker-socket-proxy (never the raw socket).
@Injectable()
export class DockerService {
  private readonly docker: Docker;
  private readonly logger = new Logger(DockerService.name);

  constructor(config: ConfigService) {
    this.docker = new Docker({
      host: config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy",
      port: config.get<number>("DOCKER_PROXY_PORT") ?? 2375,
      protocol: "http",
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();

      return true;
    } catch (error) {
      this.logger.warn(`docker ping failed: ${describeError(error)}`);

      return false;
    }
  }

  // Builds an image from a context directory, streaming build output to onLog.
  async buildImage(options: BuildImageOptions): Promise<void> {
    const tar = spawn("tar", ["-C", options.contextDir, "--exclude=.git", "-czf", "-", "."]);
    const buildStream = await this.docker.buildImage(tar.stdout, {
      t: options.imageTag,
      dockerfile: options.dockerfile ?? "Dockerfile",
      buildargs: options.buildArgs ?? {},
      // Legacy builder: BuildKit ("2") needs a /session endpoint the socket-proxy blocks.
      version: "1",
    });

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        buildStream,
        (error) => {
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)));

            return;
          }

          resolve();
        },
        (event: unknown) => {
          const { stream, error, errorDetail } = event as BuildEvent;

          if (error || errorDetail?.message) {
            options.onLog?.(error ?? errorDetail?.message ?? "build error");

            return;
          }

          if (stream && options.onLog) {
            options.onLog(stream.replace(/\n$/, ""));
          }
        },
      );
    });
  }

  async runContainer(options: RunContainerOptions): Promise<string> {
    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      Env: Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`),
      Labels: options.labels ?? {},
      Cmd: options.command,
      HostConfig: {
        NetworkMode: options.network,
        RestartPolicy: { Name: options.restartPolicy ?? "unless-stopped" },
        Memory: options.memoryMb ? options.memoryMb * 1024 * 1024 : undefined,
        NanoCpus: options.nanoCpus,
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      },
    });

    await container.start();

    return container.id;
  }

  async inspectContainer(id: string, network?: string): Promise<ContainerStatus | undefined> {
    try {
      const info = await this.docker.getContainer(id).inspect();
      const ip = network ? info.NetworkSettings.Networks[network]?.IPAddress : undefined;

      return {
        id: info.Id,
        running: info.State.Running,
        health: info.State.Health?.Status,
        ip: ip || undefined,
      };
    } catch {
      return undefined;
    }
  }

  async stopAndRemove(id: string, drainSeconds = 10): Promise<void> {
    const container = this.docker.getContainer(id);

    try {
      await container.stop({ t: drainSeconds });
    } catch {
      // Already stopped — fall through to removal.
    }

    try {
      await container.remove({ force: true, v: false });
    } catch (error) {
      this.logger.warn(`failed to remove container ${id}: ${describeError(error)}`);
    }
  }

  // Remove a container by name if it exists (clears stale names before a run).
  async removeByName(name: string): Promise<void> {
    const existing = await this.docker.listContainers({ all: true, filters: { name: [name] } });

    for (const info of existing) {
      await this.stopAndRemove(info.Id, 0);
    }
  }

  async listByLabel(key: string, value: string): Promise<string[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`${key}=${value}`] },
    });

    return containers.map((container) => container.Id);
  }

  async getLogStream(id: string, tail = 200): Promise<Readable> {
    const container = this.docker.getContainer(id);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    });
    const out = new PassThrough();

    // Logs are multiplexed (no TTY) — demux stdout+stderr into one text stream.
    this.docker.modem.demuxStream(stream, out, out);
    stream.on("end", () => out.end());
    stream.on("error", (error: unknown) => {
      out.destroy(error instanceof Error ? error : new Error(String(error)));
    });

    return out;
  }

  async removeImage(tag: string): Promise<void> {
    try {
      await this.docker.getImage(tag).remove({ force: true });
    } catch (error) {
      this.logger.warn(`failed to remove image ${tag}: ${describeError(error)}`);
    }
  }
}
