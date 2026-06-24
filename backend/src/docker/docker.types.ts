import type { HealthcheckSpec } from "../deployments/resource-limits";

export interface ContainerStat {
  cpuPercent: number;
  memUsageBytes: number;
  memLimitBytes: number;
  swapBytes: number;
  // Cumulative byte counters since the container started; rates are derived by the sampler.
  netRxBytes: number;
  netTxBytes: number;
  blkReadBytes: number;
  blkWriteBytes: number;
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

export interface DockerHealthConfig {
  Test?: string[];
  Interval?: number;
  Timeout?: number;
  Retries?: number;
  StartPeriod?: number;
}
