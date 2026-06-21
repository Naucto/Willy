import type { Readable } from "node:stream";
import { Injectable, Logger } from "@nestjs/common";
import { ContainersService } from "../containers/containers.service";
import type { Deployment } from "../deployments/deployments.service";
import { DockerLogService } from "../docker/docker-log.service";
import { LogStorageService } from "../logs/log-storage.service";

// The runtime log of a deployment's container is keyed by (deployment, compose service) — stable
// across releases — so a health-checked swap appends the new container's output onto the same
// stream and the history outlives the old container. Single-container deployments use "default".
export function runtimeLogKey(deploymentId: string, service: string | null): string {
  return `runtime/${deploymentId}/${service ?? "default"}`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Follows each running container's stdout/stderr and persists it through LogStorageService, so
// runtime logs survive restarts and remain visible after a container stops. Follows are tracked by
// container id; the durable file is keyed by service, so it persists across container replacement.
@Injectable()
export class RuntimeLogCollector {
  private readonly logger = new Logger(RuntimeLogCollector.name);
  private readonly follows = new Map<string, { stream: Readable; key: string }>();

  constructor(
    private readonly dockerLogs: DockerLogService,
    private readonly containers: ContainersService,
    private readonly logs: LogStorageService,
  ) {}

  // Attaches a follow to every running container of the deployment that isn't already followed, and
  // detaches follows whose container has gone (e.g. the superseded side of a swap).
  async syncDeployment(deployment: Deployment): Promise<void> {
    let running: { id: string; service: string | null }[];

    try {
      const list = await this.containers.listForDeployment(deployment);
      running = list.filter((container) => container.running);
    } catch (error) {
      this.logger.warn(`runtime log sync for ${deployment.name} failed: ${describeError(error)}`);

      return;
    }

    const wanted = new Set(running.map((container) => container.id));
    const prefix = `runtime/${deployment.id}/`;

    for (const [id, follow] of [...this.follows]) {
      if (follow.key.startsWith(prefix) && !wanted.has(id)) {
        this.detach(id);
      }
    }

    for (const container of running) {
      if (!this.follows.has(container.id)) {
        await this.attach(container.id, runtimeLogKey(deployment.id, container.service));
      }
    }
  }

  // Stops following a deployment's containers (on stop/teardown). The persisted history is kept.
  stopDeployment(deploymentId: string): void {
    const prefix = `runtime/${deploymentId}/`;

    for (const [id, follow] of [...this.follows]) {
      if (follow.key.startsWith(prefix)) {
        this.detach(id);
      }
    }
  }

  private async attach(containerId: string, key: string): Promise<void> {
    try {
      const stream = await this.dockerLogs.getLogStream(containerId, 200);
      this.follows.set(containerId, { stream, key });

      stream.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split("\n")) {
          if (line.length > 0) {
            this.logs.append(key, line);
          }
        }
      });
      stream.on("end", () => this.follows.delete(containerId));
      stream.on("error", () => this.follows.delete(containerId));
    } catch (error) {
      this.logger.warn(`failed to follow ${containerId}: ${describeError(error)}`);
    }
  }

  private detach(containerId: string): void {
    const follow = this.follows.get(containerId);

    if (follow) {
      follow.stream.destroy();
      this.follows.delete(containerId);
    }
  }
}
