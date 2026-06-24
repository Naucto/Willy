import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";
import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { ContainersService } from "../containers/containers.service";
import { type Deployment, DeploymentsService } from "../deployments/deployments.service";
import { DockerLogService } from "../docker/docker-log.service";
import { LogStorageService } from "../logs/log-storage.service";

// A follow's underlying connection can drop without the container stopping (e.g. a redeploy resets
// the project bridge network). syncDeployment only runs on boot/deploy, so without a periodic sweep
// such a follow is never re-established and the container's runtime log silently freezes.
const RESYNC_INTERVAL_MS = 30_000;

// A follow can also stall silently — the connection looks alive but stops delivering, emitting
// neither end nor error. We only suspect a stall once a follow has been idle this long; below it,
// silence just means a quiet container.
const STALE_AFTER_MS = 120_000;

// Deployments whose containers are worth following; matches the stats sampler's running set.
const RUNNING_STATES = new Set(["RUNNING", "DEGRADED", "DEPLOYING"]);

// The runtime log of a deployment's container is keyed by (deployment, compose service) — stable
// across releases — so a health-checked swap appends the new container's output onto the same
// stream and the history outlives the old container. Single-container deployments use "default".
export function runtimeLogKey(deploymentId: string, service: string | null): string {
  return `runtime/${deploymentId}/${service ?? "default"}`;
}

// Split a `timestamps: true` log line into its RFC3339 prefix (as epoch ms) and the message. Lines
// without a parseable timestamp (e.g. a frame split mid-line) return tsMs null and pass through
// verbatim, so content is never mangled.
export function parseTimestampedLine(line: string): { tsMs: number | null; message: string } {
  const space = line.indexOf(" ");

  if (space > 0) {
    const candidate = line.slice(0, space);

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate)) {
      const ms = Date.parse(candidate);

      if (!Number.isNaN(ms)) {
        return { tsMs: ms, message: line.slice(space + 1) };
      }
    }
  }

  return { tsMs: null, message: line };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Follow {
  stream: Readable;
  key: string;
  // Wall-clock of the last received chunk; drives stall detection.
  lastDataAt: number;
}

// Follows each running container's stdout/stderr and persists it through LogStorageService, so
// runtime logs survive restarts and remain visible after a container stops. Follows are tracked by
// container id; the durable file is keyed by service, so it persists across container replacement.
@Injectable()
export class RuntimeLogCollector {
  private readonly logger = new Logger(RuntimeLogCollector.name);
  private readonly follows = new Map<string, Follow>();
  // Epoch-ms of the last line collected per durable key. Survives a follow's death so a re-attach
  // resumes with `since` instead of replaying `tail` lines already in the store (which would
  // duplicate them). Keyed by durable key so it carries across a container swap.
  private readonly watermarks = new Map<string, number>();
  // Durable keys whose follow is currently stalled, with an emitter that notifies log viewers so the
  // freeze is shown in the UI and cleared on recovery. One listener per open SSE stream.
  private readonly stalled = new Set<string>();
  private readonly statusEmitter = new EventEmitter();

  constructor(
    private readonly dockerLogs: DockerLogService,
    private readonly containers: ContainersService,
    private readonly logs: LogStorageService,
    private readonly deployments: DeploymentsService,
  ) {
    // Many concurrent viewers may each subscribe; lift Node's default 10-listener warning ceiling.
    this.statusEmitter.setMaxListeners(0);
  }

  // Subscribe to a key's stall state. Fires immediately with the current state so a viewer that
  // connects mid-stall shows the banner right away. Returns an unsubscribe.
  onStatus(key: string, listener: (stalled: boolean) => void): () => void {
    const handler = (changed: string, isStalled: boolean): void => {
      if (changed === key) {
        listener(isStalled);
      }
    };

    this.statusEmitter.on("status", handler);
    listener(this.stalled.has(key));

    return () => this.statusEmitter.off("status", handler);
  }

  private markStalled(key: string): void {
    if (!this.stalled.has(key)) {
      this.stalled.add(key);
      this.statusEmitter.emit("status", key, true);
    }
  }

  private markLive(key: string): void {
    if (this.stalled.delete(key)) {
      this.statusEmitter.emit("status", key, false);
    }
  }

  // Periodically re-sync every running deployment. syncDeployment is idempotent — it only attaches
  // containers not already followed and detaches ones that vanished — so this re-establishes any
  // follow that dropped without restarting a still-live container.
  @Interval(RESYNC_INTERVAL_MS)
  async resync(): Promise<void> {
    let running: Deployment[];

    try {
      running = (await this.deployments.findAll()).filter((deployment) =>
        RUNNING_STATES.has(deployment.state),
      );
    } catch (error) {
      this.logger.warn(`runtime log resync listing failed: ${describeError(error)}`);

      return;
    }

    for (const deployment of running) {
      await this.syncDeployment(deployment);
    }

    await this.recoverStalledFollows();
  }

  // Catch follows that stalled without emitting end/error: if a follow has been idle a while and the
  // daemon reports a line newer than our watermark, the stream is dead — tear it down and re-attach
  // (which resumes from the watermark). A genuinely quiet container reports nothing newer, so it's
  // left alone.
  private async recoverStalledFollows(): Promise<void> {
    const now = Date.now();

    for (const [containerId, follow] of [...this.follows]) {
      if (now - follow.lastDataAt < STALE_AFTER_MS) {
        continue;
      }

      try {
        const latest = await this.dockerLogs.latestLogTimestampMs(containerId);
        const watermark = this.watermarks.get(follow.key);

        if (latest !== null && (watermark === undefined || latest > watermark)) {
          this.logger.warn(`runtime log follow for ${follow.key} stalled; re-attaching`);
          this.markStalled(follow.key);
          this.detach(containerId);
          await this.attach(containerId, follow.key);
        }
      } catch (error) {
        this.logger.warn(`stall check for ${follow.key} failed: ${describeError(error)}`);
      }
    }
  }

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

  // Stops following a deployment's containers (on stop/teardown). The persisted history is kept, but
  // the resume watermarks are dropped so the next start replays a fresh tail rather than trying to
  // `since`-resume from a stale point.
  stopDeployment(deploymentId: string): void {
    const prefix = `runtime/${deploymentId}/`;

    for (const [id, follow] of [...this.follows]) {
      if (follow.key.startsWith(prefix)) {
        this.detach(id);
      }
    }

    for (const key of [...this.watermarks.keys()]) {
      if (key.startsWith(prefix)) {
        this.watermarks.delete(key);
      }
    }

    for (const key of [...this.stalled]) {
      if (key.startsWith(prefix)) {
        this.markLive(key);
      }
    }
  }

  private async attach(containerId: string, key: string): Promise<void> {
    // Resume from the watermark when we have one (a re-attach), else replay the recent tail. The
    // follow carries timestamps so the watermark can advance and a later re-attach won't duplicate.
    const watermark = this.watermarks.get(key);
    const options =
      watermark !== undefined
        ? { since: Math.floor(watermark / 1000), timestamps: true }
        : { tail: 200, timestamps: true };

    try {
      const stream = await this.dockerLogs.getLogStream(containerId, options);
      const follow: Follow = { stream, key, lastDataAt: Date.now() };
      this.follows.set(containerId, follow);

      // `since` is second-granular, so a resume re-delivers lines from the watermark's whole second.
      // Skip those at/before the watermark; once past them, stream normally (no per-line dropping in
      // steady state, which could lose lines whose timestamps tie or arrive slightly out of order).
      let deduping = watermark !== undefined;

      stream.on("data", (chunk: Buffer) => {
        follow.lastDataAt = Date.now();
        // Output is flowing again — clear any stall the recovery sweep flagged for this key.
        this.markLive(key);

        for (const line of chunk.toString("utf8").split("\n")) {
          if (line.length === 0) {
            continue;
          }

          const { tsMs, message } = parseTimestampedLine(line);

          if (deduping) {
            if (tsMs !== null && watermark !== undefined && tsMs <= watermark) {
              continue;
            }

            deduping = false;
          }

          if (tsMs !== null) {
            this.watermarks.set(key, tsMs);
          }

          if (message.length > 0) {
            this.logs.append(key, message);
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
