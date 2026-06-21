import { PassThrough } from "node:stream";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import type Docker from "dockerode";
import { FileManagerError } from "../common/errors";
import {
  FILE_MANAGER_LABEL,
  FILE_MANAGER_VOLUME_LABEL,
  INTERNAL_LABEL,
  OWNER_LABEL,
} from "../traefik/label-generator.service";
import { DOCKER_CLIENT } from "./docker-client";
import { describeError } from "./docker-helpers";
import { DockerImageService } from "./docker-image.service";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Bound to one warm helper for the duration of a single file operation. The op runs commands and
// streams content through these without re-resolving the container.
export interface HelperHandle {
  containerId: string;
  exec: (cmd: string[]) => Promise<ExecResult>;
  getArchive: (path: string) => Promise<NodeJS.ReadableStream>;
  putArchive: (tar: Buffer, destDir: string) => Promise<void>;
}

interface HelperEntry {
  name: string;
  containerId: string;
  lastUsed: number;
  // Number of file operations currently running against this helper; the reaper never kills a busy one.
  inFlight: number;
  // De-dupes concurrent get-or-create for the same (deployment, volume).
  acquiring?: Promise<string>;
}

const DEFAULT_IMAGE = "alpine:3.20";
const DEFAULT_IDLE_TTL_MS = 5 * 60_000;
const REAP_INTERVAL_MS = 60_000;
// Hard ceiling on a single exec's captured output — guards the server against a pathological
// listing/command flooding stdout. Listings are paged client-side well under this.
const MAX_EXEC_OUTPUT_BYTES = 1024 * 1024;

// Manages one long-lived BusyBox helper container per (deployment, volume), with the target named
// volume mounted at /mnt. File operations run via fast `docker exec` (metadata) and getArchive/
// putArchive tar streams (content), so request-per-click browsing stays snappy. Helpers are reaped
// after an idle period and any survivors are swept on boot. The helper mounts the named volume
// directly, so it works even when the deployment's own containers are stopped.
@Injectable()
export class VolumeHelperService implements OnModuleInit {
  private readonly logger = new Logger(VolumeHelperService.name);
  private readonly helpers = new Map<string, HelperEntry>();
  private readonly image: string;
  private readonly idleTtlMs: number;
  private reaping = false;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly images: DockerImageService,
    config: ConfigService,
  ) {
    this.image = config.get<string>("FILE_MANAGER_IMAGE") ?? DEFAULT_IMAGE;
    this.idleTtlMs = config.get<number>("FILE_MANAGER_HELPER_IDLE_TTL_MS") ?? DEFAULT_IDLE_TTL_MS;
  }

  // Drop helpers left behind by a previous run (the in-process map is empty after a restart, so any
  // container wearing our label is an orphan).
  async onModuleInit(): Promise<void> {
    try {
      const stale = await this.docker.listContainers({
        all: true,
        filters: { label: [`${FILE_MANAGER_LABEL}=true`] },
      });

      for (const info of stale) {
        await this.forceRemove(info.Id);
      }
    } catch (error) {
      this.logger.warn(`file-manager helper boot sweep failed: ${describeError(error)}`);
    }
  }

  // Runs `fn` against the warm helper for (deployment, volume), holding it "busy" so the reaper
  // leaves it alone for the duration. The handle's calls are pre-bound to the resolved container.
  async withHelper<T>(
    deploymentId: string,
    volume: string,
    fn: (helper: HelperHandle) => Promise<T>,
  ): Promise<T> {
    const key = this.key(deploymentId, volume);
    const containerId = await this.acquire(deploymentId, volume);
    const entry = this.helpers.get(key);

    if (entry) {
      entry.inFlight += 1;
      entry.lastUsed = Date.now();
    }

    try {
      return await fn({
        containerId,
        exec: (cmd) => this.exec(containerId, cmd),
        getArchive: (path) => this.docker.getContainer(containerId).getArchive({ path }),
        putArchive: (tar, destDir) =>
          this.docker
            .getContainer(containerId)
            .putArchive(tar, { path: destDir })
            .then(() => undefined),
      });
    } finally {
      const current = this.helpers.get(key);

      if (current) {
        current.inFlight -= 1;
        current.lastUsed = Date.now();
      }
    }
  }

  // Like withHelper, but for a streaming op (download): the helper is held busy until the returned
  // stream ends/errors/closes, not when `produce` resolves — so the reaper can't kill it mid-download.
  async beginStream<T extends { stream: NodeJS.ReadableStream }>(
    deploymentId: string,
    volume: string,
    produce: (helper: HelperHandle) => Promise<T>,
  ): Promise<T> {
    const key = this.key(deploymentId, volume);
    const containerId = await this.acquire(deploymentId, volume);
    const entry = this.helpers.get(key);

    if (entry) {
      entry.inFlight += 1;
      entry.lastUsed = Date.now();
    }

    let released = false;
    const release = () => {
      if (released) {
        return;
      }

      released = true;
      const current = this.helpers.get(key);

      if (current) {
        current.inFlight -= 1;
        current.lastUsed = Date.now();
      }
    };

    try {
      const result = await produce({
        containerId,
        exec: (cmd) => this.exec(containerId, cmd),
        getArchive: (path) => this.docker.getContainer(containerId).getArchive({ path }),
        putArchive: (tar, destDir) =>
          this.docker
            .getContainer(containerId)
            .putArchive(tar, { path: destDir })
            .then(() => undefined),
      });

      result.stream.once("end", release);
      result.stream.once("close", release);
      result.stream.once("error", release);

      return result;
    } catch (error) {
      release();

      throw error;
    }
  }

  private key(deploymentId: string, volume: string): string {
    return `${deploymentId}::${volume}`;
  }

  private nameFor(deploymentId: string, volume: string): string {
    const safeVolume = volume.replace(/[^a-zA-Z0-9_.-]/g, "-");

    return `willy-fm-${deploymentId}-${safeVolume}`;
  }

  // Get-or-create the warm helper. Concurrent callers share the in-flight create; a cached entry is
  // re-validated (the container can be reaped/killed out from under us) and recreated if dead.
  private async acquire(deploymentId: string, volume: string): Promise<string> {
    const key = this.key(deploymentId, volume);
    const cached = this.helpers.get(key);

    if (cached?.acquiring) {
      return cached.acquiring;
    }

    if (cached) {
      if (await this.isAlive(cached.containerId)) {
        cached.lastUsed = Date.now();

        return cached.containerId;
      }

      this.helpers.delete(key);
    }

    const acquiring = this.create(deploymentId, volume);
    const entry: HelperEntry = {
      name: this.nameFor(deploymentId, volume),
      containerId: "",
      lastUsed: Date.now(),
      inFlight: 0,
      acquiring,
    };
    this.helpers.set(key, entry);

    try {
      const id = await acquiring;
      entry.containerId = id;
      entry.lastUsed = Date.now();
      delete entry.acquiring;

      return id;
    } catch (error) {
      this.helpers.delete(key);

      throw error;
    }
  }

  private async create(deploymentId: string, volume: string): Promise<string> {
    await this.images.ensureImage(this.image);

    const name = this.nameFor(deploymentId, volume);
    // Clear any stale container squatting the deterministic name (crash before the boot sweep ran).
    await this.removeByName(name);

    const container = await this.docker.createContainer({
      name,
      Image: this.image,
      Cmd: ["tail", "-f", "/dev/null"],
      Labels: {
        [INTERNAL_LABEL]: "true",
        [OWNER_LABEL]: deploymentId,
        [FILE_MANAGER_LABEL]: "true",
        [FILE_MANAGER_VOLUME_LABEL]: volume,
      },
      HostConfig: {
        Binds: [`${volume}:/mnt`],
        // No network and a read-only root fs: even a symlink escape inside the volume can only read
        // the stock image — the only writable mount is the volume itself, and the Docker socket is
        // never exposed. Default caps are kept so chown/chmod on volume files still work.
        NetworkMode: "none",
        ReadonlyRootfs: true,
        SecurityOpt: ["no-new-privileges"],
        Memory: 128 * 1024 * 1024,
        LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "1" } },
      },
    });

    await container.start();

    return container.id;
  }

  // Runs a command (always an arg array — no shell, so no injection) and returns its captured
  // output + exit code. Output is demuxed (non-TTY) and hard-capped.
  private async exec(containerId: string, cmd: string[]): Promise<ExecResult> {
    const exec = await this.docker.getContainer(containerId).exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    const out = new PassThrough();
    const err = new PassThrough();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let total = 0;
    let overflowed = false;

    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      total += chunk.length;

      if (total > MAX_EXEC_OUTPUT_BYTES) {
        overflowed = true;
        stream.destroy();

        return;
      }

      target.push(chunk);
    };

    out.on("data", collect(stdoutChunks));
    err.on("data", collect(stderrChunks));
    this.docker.modem.demuxStream(stream, out, err);

    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("close", resolve);
      stream.on("error", reject);
    });

    if (overflowed) {
      throw new FileManagerError("command output too large");
    }

    const info = await exec.inspect();

    return {
      stdout: Buffer.concat(stdoutChunks).toString("utf8"),
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
      exitCode: info.ExitCode ?? -1,
    };
  }

  private async isAlive(containerId: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(containerId).inspect();

      return info.State.Running === true;
    } catch {
      return false;
    }
  }

  private async removeByName(name: string): Promise<void> {
    try {
      const existing = await this.docker.listContainers({
        all: true,
        filters: { name: [name] },
      });

      for (const info of existing) {
        await this.forceRemove(info.Id);
      }
    } catch (error) {
      this.logger.warn(`failed to clear stale helper ${name}: ${describeError(error)}`);
    }
  }

  private async forceRemove(containerId: string): Promise<void> {
    try {
      await this.docker.getContainer(containerId).remove({ force: true, v: false });
    } catch (error) {
      this.logger.warn(`failed to remove helper ${containerId}: ${describeError(error)}`);
    }
  }

  // Reap idle, not-busy helpers. Single-flight so a slow sweep can't overlap itself.
  @Interval(REAP_INTERVAL_MS)
  private async reap(): Promise<void> {
    if (this.reaping) {
      return;
    }

    this.reaping = true;

    try {
      const now = Date.now();

      for (const [key, entry] of this.helpers) {
        if (entry.acquiring || entry.inFlight > 0) {
          continue;
        }

        if (now - entry.lastUsed > this.idleTtlMs) {
          this.helpers.delete(key);
          await this.forceRemove(entry.containerId);
        }
      }
    } finally {
      this.reaping = false;
    }
  }
}
