import { spawn } from "node:child_process";
import { type Duplex, PassThrough, type Readable } from "node:stream";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Docker from "dockerode";
import type { HealthcheckSpec } from "../deployments/resource-limits";
import { type MemSnapshot, cpuPercent, memUsage } from "../stats/stats.util";

export interface ContainerStat {
  cpuPercent: number;
  memUsageBytes: number;
  memLimitBytes: number;
  swapBytes: number;
}

export interface VolumeUsage {
  name: string;
  bytes: number;
}

export interface DiskUsage {
  imagesBytes: number;
  containersBytes: number;
  volumesBytes: number;
  buildCacheBytes: number;
  volumes: VolumeUsage[];
}

// Minimal shape of `docker system df` (dockerode types it as `any`).
interface DfResponse {
  LayersSize?: number;
  Images?: { Size?: number }[];
  Containers?: { SizeRw?: number }[];
  Volumes?: { Name?: string; UsageData?: { Size?: number } }[];
  BuildCache?: { Size?: number }[];
}

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
  // Linux capabilities to add/drop relative to Docker's defaults.
  capAdd?: string[] | undefined;
  capDrop?: string[] | undefined;
  command?: string[] | undefined;
  // Per-container log rotation overrides (fall back to the operator-wide default).
  logMaxSizeMb?: number | undefined;
  logMaxFiles?: number | undefined;
  // Custom healthcheck to inject; surfaces as Docker State.Health so the deploy gate can wait on it.
  healthcheck?: HealthcheckSpec | null | undefined;
}

export interface VolumeMount {
  name: string;
  destination: string;
  rw: boolean;
}

export interface ContainerNetwork {
  name: string;
  ip: string | null;
}

export interface ContainerStatus {
  id: string;
  name: string | undefined;
  image: string | undefined;
  running: boolean;
  health: string | undefined;
  ip: string | undefined;
  mounts: VolumeMount[];
  // Compose service name (com.docker.compose.service label), when part of a stack.
  service: string | undefined;
  // Networks the container is attached to, with its IP on each.
  networks: ContainerNetwork[];
  // TCP ports the image declares via EXPOSE, ascending; drives the domain port picker.
  exposedPorts: number[];
  // The healthcheck the image/compose file declares (read-only), if any. Durations are humanised.
  declaredHealthcheck: DeclaredHealthcheck | undefined;
}

export interface DeclaredHealthcheck {
  test: string[];
  interval: string | null;
  timeout: string | null;
  retries: number | null;
  startPeriod: string | null;
}

export interface OneShotOptions {
  image: string;
  // Omit to use the image's default CMD (e.g. a CRON image with a baked-in entrypoint).
  command?: string[] | undefined;
  env?: Record<string, string> | undefined;
  // Docker bind specs, e.g. "volume-or-path:/data:ro".
  binds?: string[] | undefined;
  entrypoint?: string[] | undefined;
  // Network to join (e.g. so pg_dump can reach a database container).
  network?: string | undefined;
  // Docker labels to stamp on the helper (e.g. willy.internal so the admin panel hides it).
  labels?: Record<string, string> | undefined;
  memoryMb?: number | undefined;
  nanoCpus?: number | undefined;
}

export interface OneShotResult {
  exitCode: number;
  logs: string;
}

// Docker reports exposed ports as a set keyed "<port>/<proto>" (e.g. "80/tcp"). We surface the TCP
// ports as a deduped, ascending list to drive the domain port picker; UDP isn't web-routable.
export function parseExposedPorts(exposed: Record<string, unknown> | undefined): number[] {
  const ports = Object.keys(exposed ?? {})
    .filter((spec) => spec.endsWith("/tcp"))
    .map((spec) => Number.parseInt(spec, 10))
    .filter((port) => Number.isInteger(port) && port > 0);

  return Array.from(new Set(ports)).sort((a, b) => a - b);
}

// Docker reports healthcheck durations in nanoseconds; surface them as the duration strings users
// recognise (e.g. 30000000000 → "30s"). Null for unset/zero (Docker's "inherit the default").
function nsToDuration(ns: number | undefined): string | null {
  if (!ns || ns <= 0) {
    return null;
  }

  return `${Math.round(ns / 1e9)}s`;
}

// Parses a Docker duration string ("30s", "1m30s", "500ms") into nanoseconds for the Engine API.
// Returns undefined for blank/unparseable input so Docker falls back to its own default.
export function durationToNs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const matches = value.trim().matchAll(/(\d+)(ms|s|m|h)/g);
  const unit: Record<string, number> = { ms: 1e6, s: 1e9, m: 60e9, h: 3600e9 };
  let total = 0;

  for (const [, amount, suffix] of matches) {
    total += Number(amount) * (unit[suffix ?? "s"] ?? 0);
  }

  return total > 0 ? total : undefined;
}

interface DockerHealthConfig {
  Test?: string[];
  Interval?: number;
  Timeout?: number;
  Retries?: number;
  StartPeriod?: number;
}

function parseDeclaredHealthcheck(
  config: DockerHealthConfig | undefined,
): DeclaredHealthcheck | undefined {
  const test = config?.Test;

  // No healthcheck, or one explicitly disabled (Test: ["NONE"]).
  if (!test || test.length === 0 || test[0] === "NONE") {
    return undefined;
  }

  return {
    test,
    interval: nsToDuration(config?.Interval),
    timeout: nsToDuration(config?.Timeout),
    retries: config?.Retries ?? null,
    startPeriod: nsToDuration(config?.StartPeriod),
  };
}

// Builds the Docker create-config Healthcheck block from a user's custom healthcheck (the test is a
// shell string, wrapped CMD-SHELL). Returns undefined when there's nothing to inject.
function buildHealthcheckConfig(
  healthcheck: HealthcheckSpec | null | undefined,
): DockerHealthConfig | undefined {
  if (!healthcheck?.test.trim()) {
    return undefined;
  }

  const config: DockerHealthConfig = { Test: ["CMD-SHELL", healthcheck.test] };
  const interval = durationToNs(healthcheck.interval);
  const timeout = durationToNs(healthcheck.timeout);
  const startPeriod = durationToNs(healthcheck.startPeriod);

  if (interval !== undefined) {
    config.Interval = interval;
  }

  if (timeout !== undefined) {
    config.Timeout = timeout;
  }

  if (healthcheck.retries) {
    config.Retries = healthcheck.retries;
  }

  if (startPeriod !== undefined) {
    config.StartPeriod = startPeriod;
  }

  return config;
}

// De-multiplexes a non-TTY Docker log buffer (8-byte frame headers) into plain text.
function demuxLogBuffer(raw: Buffer): string {
  let text = "";
  let offset = 0;

  while (offset + 8 <= raw.length) {
    const size = raw.readUInt32BE(offset + 4);
    const start = offset + 8;
    text += raw.subarray(start, start + size).toString("utf8");
    offset = start + size;
  }

  return text || raw.toString("utf8");
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
  // Per-container log rotation (operator-tunable retention).
  private readonly logConfig: { Type: string; Config: Record<string, string> };

  constructor(config: ConfigService) {
    this.docker = new Docker({
      host: config.get<string>("DOCKER_PROXY_HOST") ?? "docker-socket-proxy",
      port: config.get<number>("DOCKER_PROXY_PORT") ?? 2375,
      protocol: "http",
    });
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

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();

      return true;
    } catch (error) {
      this.logger.warn(`docker ping failed: ${describeError(error)}`);

      return false;
    }
  }

  // Host capacity (CPU count + total memory in MB) from the Docker daemon — used to size the
  // resource-limit sliders to the real machine instead of hardcoded ceilings.
  async hostInfo(): Promise<{ cpus: number; memoryMb: number }> {
    const info = (await this.docker.info()) as { NCPU?: number; MemTotal?: number };

    return {
      cpus: info.NCPU ?? 0,
      memoryMb: info.MemTotal ? Math.floor(info.MemTotal / (1024 * 1024)) : 0,
    };
  }

  // One-shot CPU/memory sample for a container. Returns null if it vanished between listing and
  // sampling (common during a deploy) so callers can just skip it.
  async containerStats(id: string): Promise<ContainerStat | null> {
    try {
      const raw = await this.docker.getContainer(id).stats({ stream: false });
      const mem = memUsage(raw.memory_stats as unknown as MemSnapshot);

      return {
        cpuPercent: cpuPercent(raw.cpu_stats, raw.precpu_stats),
        memUsageBytes: mem.usageBytes,
        memLimitBytes: mem.limitBytes,
        swapBytes: mem.swapBytes,
      };
    } catch {
      return null;
    }
  }

  // Aggregated on-disk usage (`docker system df`): image layers, container writable layers, named
  // volumes (with per-volume sizes), and the build cache. `/system/df` is gated by the socket-proxy
  // (the SYSTEM permission); if it's unavailable we degrade to zeros rather than failing the whole
  // stats response — CPU/memory still come through.
  async diskUsage(): Promise<DiskUsage> {
    let df: DfResponse;

    try {
      df = (await this.docker.df()) as DfResponse;
    } catch (error) {
      this.logger.warn(`disk usage unavailable (docker df): ${describeError(error)}`);

      return {
        imagesBytes: 0,
        containersBytes: 0,
        volumesBytes: 0,
        buildCacheBytes: 0,
        volumes: [],
      };
    }

    const volumes = (df.Volumes ?? [])
      .map((v) => ({ name: v.Name ?? "", bytes: Math.max(0, v.UsageData?.Size ?? 0) }))
      .filter((v) => v.name.length > 0);

    return {
      imagesBytes: df.LayersSize ?? (df.Images ?? []).reduce((sum, i) => sum + (i.Size ?? 0), 0),
      containersBytes: (df.Containers ?? []).reduce((sum, c) => sum + (c.SizeRw ?? 0), 0),
      volumesBytes: volumes.reduce((sum, v) => sum + v.bytes, 0),
      buildCacheBytes: (df.BuildCache ?? []).reduce((sum, b) => sum + (b.Size ?? 0), 0),
      volumes,
    };
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
        LogConfig: this.resolveLogConfig(options.logMaxSizeMb, options.logMaxFiles),
      },
    });

    await container.start();

    return container.id;
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

  // Runs a one-shot helper container to completion, returning its exit code + combined logs.
  // Used for backups (tar a volume, pg_dump, aws s3 sync) via throwaway containers.
  async runToCompletion(options: OneShotOptions): Promise<OneShotResult> {
    await this.ensureImage(options.image);

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

  async listVolumes(): Promise<string[]> {
    const { Volumes } = await this.docker.listVolumes();

    return (Volumes ?? []).map((volume) => volume.Name).sort();
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

  // Opens an interactive shell (TTY) in a container for the console. The returned duplex
  // carries raw terminal bytes both ways; resize forwards window changes to the PTY.
  async execShell(
    containerId: string,
  ): Promise<{ stream: Duplex; resize: (cols: number, rows: number) => Promise<void> }> {
    const exec = await this.docker.getContainer(containerId).exec({
      Cmd: ["/bin/sh"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    const stream = (await exec.start({ hijack: true, stdin: true, Tty: true })) as Duplex;

    return { stream, resize: (cols, rows) => exec.resize({ w: cols, h: rows }) };
  }

  async removeNetwork(name: string): Promise<void> {
    try {
      await this.docker.getNetwork(name).remove();
    } catch {
      // Network may not exist or still be in use — best effort.
    }
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

  // All images on the host, including untagged ones — for the admin resource overview.
  async listAllImages() {
    return this.docker.listImages();
  }

  // All containers (running + stopped) — for the admin resource overview.
  async listAllContainers() {
    return this.docker.listContainers({ all: true });
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
}
