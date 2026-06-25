import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Docker from "dockerode";
import { DOCKER_CLIENT } from "./docker-client";
import {
  buildHealthcheckConfig,
  demuxLogBuffer,
  describeError,
  parseDeclaredHealthcheck,
  parseExposedPorts,
} from "./docker-helpers";
import { DockerImageService } from "./docker-image.service";
import type {
  ContainerNetwork,
  ContainerStatus,
  DockerHealthConfig,
  OneShotOptions,
  OneShotResult,
  RunContainerOptions,
  VolumeMount,
} from "./docker.types";

// Container create/start/stop/remove/inspect/run-to-completion over the Docker Engine API.
@Injectable()
export class DockerContainerService {
  private readonly logger = new Logger(DockerContainerService.name);
  // Per-container log rotation (operator-tunable retention).
  private readonly logConfig: { Type: string; Config: Record<string, string> };

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly images: DockerImageService,
    config: ConfigService,
  ) {
    this.logConfig = {
      Type: "json-file",
      Config: {
        "max-size": config.get<string>("LOG_MAX_SIZE") ?? "10m",
        "max-file": config.get<string>("LOG_MAX_FILES") ?? "3",
      },
    };
  }

  // Per-container log config: override max-size/max-file when set, else the operator-wide default.
  private resolveLogConfig(
    maxSizeMb?: number,
    maxFiles?: number,
  ): { Type: string; Config: Record<string, string> } {
    if (maxSizeMb === undefined && maxFiles === undefined) {
      return this.logConfig;
    }

    return {
      Type: "json-file",
      Config: {
        "max-size": maxSizeMb ? `${maxSizeMb}m` : (this.logConfig.Config["max-size"] ?? "10m"),
        "max-file": maxFiles ? String(maxFiles) : (this.logConfig.Config["max-file"] ?? "3"),
      },
    };
  }

  async runContainer(options: RunContainerOptions): Promise<string> {
    const healthcheck = buildHealthcheckConfig(options.healthcheck);
    const container = await this.docker.createContainer({
      name: options.name,
      Image: options.image,
      Env: Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`),
      Labels: options.labels ?? {},
      Cmd: options.command,
      ...(healthcheck ? { Healthcheck: healthcheck } : {}),
      HostConfig: {
        NetworkMode: options.network,
        RestartPolicy: { Name: options.restartPolicy ?? "unless-stopped" },
        Memory: options.memoryMb ? options.memoryMb * 1024 * 1024 : undefined,
        NanoCpus: options.nanoCpus,
        CapAdd: options.capAdd && options.capAdd.length > 0 ? options.capAdd : undefined,
        CapDrop: options.capDrop && options.capDrop.length > 0 ? options.capDrop : undefined,
        // Block privilege escalation via setuid/setgid binaries — a deployed app should never be able
        // to gain capabilities it wasn't started with. Docker's default cap set is otherwise kept so
        // ordinary images (which need CHOWN/SETUID/NET_BIND_SERVICE at startup) still work.
        SecurityOpt: ["no-new-privileges:true"],
        LogConfig: this.resolveLogConfig(options.logMaxSizeMb, options.logMaxFiles),
      },
    });

    await container.start();

    return container.id;
  }

  // Runs a one-shot helper container to completion, returning its exit code + combined logs.
  // Used for backups (tar a volume, pg_dump, aws s3 sync) via throwaway containers.
  async runToCompletion(options: OneShotOptions): Promise<OneShotResult> {
    await this.images.ensureImage(options.image);

    const container = await this.docker.createContainer({
      Image: options.image,
      Cmd: options.command,
      ...(options.entrypoint ? { Entrypoint: options.entrypoint } : {}),
      ...(options.labels ? { Labels: options.labels } : {}),
      Env: Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`),
      HostConfig: {
        Binds: options.binds,
        NetworkMode: options.network,
        Memory: options.memoryMb ? options.memoryMb * 1024 * 1024 : undefined,
        NanoCpus: options.nanoCpus,
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "1" } },
      },
    });

    try {
      await container.start();
      const result = (await container.wait()) as { StatusCode: number };
      const raw = (await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        timestamps: false,
      })) as unknown as Buffer;

      return { exitCode: result.StatusCode, logs: demuxLogBuffer(raw) };
    } finally {
      try {
        await container.remove({ force: true, v: false });
      } catch (error) {
        this.logger.warn(`failed to remove helper container: ${describeError(error)}`);
      }
    }
  }

  async inspectContainer(id: string, network?: string): Promise<ContainerStatus | undefined> {
    try {
      const info = await this.docker.getContainer(id).inspect();
      const ip = network ? info.NetworkSettings.Networks[network]?.IPAddress : undefined;
      const networks: ContainerNetwork[] = Object.entries(info.NetworkSettings.Networks ?? {}).map(
        ([name, net]) => ({ name, ip: net?.IPAddress || null }),
      );
      const mounts: VolumeMount[] = (info.Mounts ?? [])
        .filter((mount) => mount.Type === "volume" && Boolean(mount.Name))
        .map((mount) => ({
          name: mount.Name ?? "",
          destination: mount.Destination,
          rw: mount.RW,
        }));
      const exposedPorts = parseExposedPorts(info.Config?.ExposedPorts);
      const declaredHealthcheck = parseDeclaredHealthcheck(
        (info.Config as { Healthcheck?: DockerHealthConfig } | undefined)?.Healthcheck,
      );

      return {
        id: info.Id,
        name: info.Name?.replace(/^\//, "") || undefined,
        image: info.Config?.Image || undefined,
        running: info.State.Running,
        health: info.State.Health?.Status,
        ip: ip || undefined,
        mounts,
        service: info.Config?.Labels?.["com.docker.compose.service"] || undefined,
        networks,
        exposedPorts,
        declaredHealthcheck,
      };
    } catch {
      return undefined;
    }
  }

  async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string, drainSeconds = 10): Promise<void> {
    try {
      await this.docker.getContainer(id).stop({ t: drainSeconds });
    } catch {
      // Already stopped — fine for the stop → volume-op → start flow.
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

  // Removes all stopped containers and returns the count and space reclaimed.
  async pruneStoppedContainers(): Promise<{ containersDeleted: string[]; spaceReclaimed: number }> {
    try {
      const result = await this.docker.pruneContainers();

      return {
        containersDeleted: result.ContainersDeleted ?? [],
        spaceReclaimed: result.SpaceReclaimed ?? 0,
      };
    } catch (error) {
      this.logger.warn(`container prune failed: ${describeError(error)}`);

      return { containersDeleted: [], spaceReclaimed: 0 };
    }
  }
}
