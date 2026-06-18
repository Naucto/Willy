import { ApiProperty } from "@nestjs/swagger";

export class ContainerStatDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Number, description: "CPU usage as a percentage of one core." })
  cpuPercent!: number;

  @ApiProperty({ type: Number })
  memUsageBytes!: number;
}

export class VolumeUsageDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Number })
  bytes!: number;
}

export class DeploymentStatsDto {
  @ApiProperty({ type: Number, description: "Sum of CPU% across the deployment's containers." })
  cpuPercent!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Configured CPU limit in cores." })
  cpuCores!: number | null;

  @ApiProperty({ type: Number })
  memUsageBytes!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Configured memory limit in bytes." })
  memLimitBytes!: number | null;

  @ApiProperty({ type: Number })
  swapBytes!: number;

  @ApiProperty({ type: Number, description: "Named volumes + container writable layers." })
  storageBytes!: number;

  @ApiProperty({ type: () => [VolumeUsageDto] })
  volumes!: VolumeUsageDto[];

  @ApiProperty({ type: () => [ContainerStatDto] })
  containers!: ContainerStatDto[];
}

export class DiskUsageDto {
  @ApiProperty({ type: Number })
  imagesBytes!: number;

  @ApiProperty({ type: Number })
  containersBytes!: number;

  @ApiProperty({ type: Number })
  volumesBytes!: number;

  @ApiProperty({ type: Number })
  buildCacheBytes!: number;
}

export class SystemStatsDto {
  @ApiProperty({ type: Number, description: "Host logical CPU count." })
  cpus!: number;

  @ApiProperty({ type: Number, description: "Host total memory in bytes." })
  memTotalBytes!: number;

  @ApiProperty({ type: Number, description: "Sum of CPU% across all running containers." })
  cpuPercent!: number;

  @ApiProperty({ type: Number, description: "Sum of memory used across all running containers." })
  memUsageBytes!: number;

  @ApiProperty({ type: () => DiskUsageDto })
  disk!: DiskUsageDto;
}
