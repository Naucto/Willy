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

  @ApiProperty({ type: Number, description: "Cumulative network bytes received." })
  netRxBytes!: number;

  @ApiProperty({ type: Number, description: "Cumulative network bytes transmitted." })
  netTxBytes!: number;

  @ApiProperty({ type: Number, description: "Cumulative block-device bytes read." })
  blkReadBytes!: number;

  @ApiProperty({ type: Number, description: "Cumulative block-device bytes written." })
  blkWriteBytes!: number;

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

  @ApiProperty({ type: Number, description: "Cumulative network bytes received (all containers)." })
  netRxBytes!: number;

  @ApiProperty({
    type: Number,
    description: "Cumulative network bytes transmitted (all containers).",
  })
  netTxBytes!: number;

  @ApiProperty({
    type: Number,
    description: "Cumulative block-device bytes read (all containers).",
  })
  blkReadBytes!: number;

  @ApiProperty({
    type: Number,
    description: "Cumulative block-device bytes written (all containers).",
  })
  blkWriteBytes!: number;

  @ApiProperty({ type: () => DiskUsageDto })
  disk!: DiskUsageDto;
}

// One recorded host snapshot. Same fields as the live SystemStatsDto plus the sample timestamp and
// the derived I/O rates (the cumulative byte counters are diffed by the sampler into bytes/sec).
export class HostStatsSampleDto extends SystemStatsDto {
  @ApiProperty({ type: Number, description: "Sample time (epoch ms)." })
  ts!: number;

  @ApiProperty({ type: Number, description: "Network receive rate in bytes/sec." })
  netRxBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Network transmit rate in bytes/sec." })
  netTxBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Block-device read rate in bytes/sec." })
  blkReadBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Block-device write rate in bytes/sec." })
  blkWriteBytesPerSec!: number;
}

export class HostStatsHistoryDto {
  @ApiProperty({ type: () => [HostStatsSampleDto] })
  samples!: HostStatsSampleDto[];
}

// One recorded per-deployment snapshot. The plotted scalars only — the live endpoint still carries
// the per-container/volume breakdown, which isn't useful as a time series.
export class DeploymentStatsSampleDto {
  @ApiProperty({ type: Number, description: "Sample time (epoch ms)." })
  ts!: number;

  @ApiProperty({ type: Number })
  cpuPercent!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Configured CPU limit in cores." })
  cpuCores!: number | null;

  @ApiProperty({ type: Number })
  memUsageBytes!: number;

  @ApiProperty({ type: Number, nullable: true, description: "Configured memory limit in bytes." })
  memLimitBytes!: number | null;

  @ApiProperty({ type: Number })
  swapBytes!: number;

  @ApiProperty({ type: Number, description: "Network receive rate in bytes/sec." })
  netRxBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Network transmit rate in bytes/sec." })
  netTxBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Block-device read rate in bytes/sec." })
  blkReadBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Block-device write rate in bytes/sec." })
  blkWriteBytesPerSec!: number;

  @ApiProperty({ type: Number, description: "Named volumes + container writable layers." })
  storageBytes!: number;
}

export class DeploymentStatsHistoryDto {
  @ApiProperty({ type: () => [DeploymentStatsSampleDto] })
  samples!: DeploymentStatsSampleDto[];
}
