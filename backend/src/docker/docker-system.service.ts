import { Inject, Injectable, Logger } from "@nestjs/common";
import type Docker from "dockerode";
import {
  type BlkioSnapshot,
  type MemSnapshot,
  type NetSnapshot,
  blkioBytes,
  cpuPercent,
  memUsage,
  netBytes,
} from "../stats/stats.util";
import { DOCKER_CLIENT } from "./docker-client";
import { describeError } from "./docker-helpers";
import type { ContainerStat, DiskUsage } from "./docker.types";

// Minimal shape of `docker system df` (dockerode types it as `any`).
interface DfResponse {
  LayersSize?: number;
  Images?: { Size?: number }[];
  Containers?: { SizeRw?: number }[];
  Volumes?: { Name?: string; UsageData?: { Size?: number } }[];
  BuildCache?: { Size?: number }[];
}

// Host-level Docker queries: daemon health, capacity, per-container stats, disk usage, volumes, and
// the admin-overview listings.
@Injectable()
export class DockerSystemService {
  private readonly logger = new Logger(DockerSystemService.name);

  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

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
      const net = netBytes(raw.networks as unknown as Record<string, NetSnapshot> | undefined);
      const blk = blkioBytes(raw.blkio_stats as unknown as BlkioSnapshot | undefined);

      return {
        cpuPercent: cpuPercent(raw.cpu_stats, raw.precpu_stats),
        memUsageBytes: mem.usageBytes,
        memLimitBytes: mem.limitBytes,
        swapBytes: mem.swapBytes,
        netRxBytes: net.rxBytes,
        netTxBytes: net.txBytes,
        blkReadBytes: blk.readBytes,
        blkWriteBytes: blk.writeBytes,
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

  async listVolumes(): Promise<string[]> {
    const { Volumes } = await this.docker.listVolumes();

    return (Volumes ?? []).map((volume) => volume.Name).sort();
  }

  async removeNetwork(name: string): Promise<void> {
    try {
      await this.docker.getNetwork(name).remove();
    } catch {
      // Network may not exist or still be in use — best effort.
    }
  }

  // All containers (running + stopped) — for the admin resource overview.
  async listAllContainers() {
    return this.docker.listContainers({ all: true });
  }
}
