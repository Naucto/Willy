import { Injectable, NotFoundException } from "@nestjs/common";
import { ContainersService } from "../containers/containers.service";
import { DeploymentsService } from "../deployments/deployments.service";
import { DockerService } from "../docker/docker.service";
import type { DeploymentStatsDto, SystemStatsDto } from "./dto/stats.dto";

@Injectable()
export class StatsService {
  constructor(
    private readonly docker: DockerService,
    private readonly containers: ContainersService,
    private readonly deployments: DeploymentsService,
  ) {}

  async deploymentStats(deploymentId: string): Promise<DeploymentStatsDto> {
    const deployment = await this.deployments.findById(deploymentId);

    if (!deployment) {
      throw new NotFoundException(`Deployment ${deploymentId} not found`);
    }

    const containers = await this.containers.listForDeployment(deployment);
    const running = containers.filter((container) => container.running);

    const perContainer = (
      await Promise.all(
        running.map(async (container) => {
          const stat = await this.docker.containerStats(container.id);

          return stat ? { id: container.id, name: container.name, ...stat } : null;
        }),
      )
    ).filter((sample) => sample !== null);

    const cpuPercent = perContainer.reduce((sum, s) => sum + s.cpuPercent, 0);
    const memUsageBytes = perContainer.reduce((sum, s) => sum + s.memUsageBytes, 0);
    const swapBytes = perContainer.reduce((sum, s) => sum + s.swapBytes, 0);

    // Storage = the deployment's named volumes + its containers' writable layers.
    const volumeNames = new Set(
      containers.flatMap((container) => container.volumes.map((mount) => mount.name)),
    );
    const disk = await this.docker.diskUsage();
    const volumes = disk.volumes.filter((volume) => volumeNames.has(volume.name));
    const volumesBytes = volumes.reduce((sum, volume) => sum + volume.bytes, 0);

    return {
      cpuPercent: round(cpuPercent),
      cpuCores: deployment.nanoCpus ? deployment.nanoCpus / 1e9 : null,
      memUsageBytes,
      memLimitBytes: deployment.memoryLimitMb ? deployment.memoryLimitMb * 1024 * 1024 : null,
      swapBytes,
      storageBytes: volumesBytes,
      volumes,
      containers: perContainer.map((s) => ({
        id: s.id,
        name: s.name,
        cpuPercent: round(s.cpuPercent),
        memUsageBytes: s.memUsageBytes,
      })),
    };
  }

  async systemStats(): Promise<SystemStatsDto> {
    const [host, allContainers, disk] = await Promise.all([
      this.docker.hostInfo(),
      this.docker.listAllContainers(),
      this.docker.diskUsage(),
    ]);

    const running = allContainers.filter((container) => container.State === "running");
    const samples = await Promise.all(running.map((c) => this.docker.containerStats(c.Id)));
    const live = samples.filter((stat) => stat !== null);

    return {
      cpus: host.cpus,
      memTotalBytes: host.memoryMb * 1024 * 1024,
      cpuPercent: round(live.reduce((sum, s) => sum + s.cpuPercent, 0)),
      memUsageBytes: live.reduce((sum, s) => sum + s.memUsageBytes, 0),
      disk: {
        imagesBytes: disk.imagesBytes,
        containersBytes: disk.containersBytes,
        volumesBytes: disk.volumesBytes,
        buildCacheBytes: disk.buildCacheBytes,
      },
    };
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
