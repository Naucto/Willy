// Per-container resource tuning. For single-container deployments these live as columns on the
// deployment; for compose they're stored per service in `serviceResources` and injected into the
// generated override. All fields optional — absent means "leave to Docker / the compose file".
export type RestartPolicyName = "NO" | "ON_FAILURE" | "ALWAYS" | "UNLESS_STOPPED";

// A user-defined container healthcheck, injected at runtime (compose service block / Docker create
// config). Durations are Docker duration strings (e.g. "30s"); the test is the shell command run
// (wrapped as CMD-SHELL). Surfacing it via Docker's State.Health lets the deploy health-gate wait
// on it automatically.
export interface HealthcheckSpec {
  test: string;
  interval?: string;
  timeout?: string;
  retries?: number;
  startPeriod?: string;
}

export interface ResourceLimits {
  memoryLimitMb?: number | null;
  nanoCpus?: number | null;
  capAdd?: string[];
  capDrop?: string[];
  restartPolicy?: RestartPolicyName;
  // Log rotation (json-file driver): max size per file in MB, and how many files to keep.
  logMaxSizeMb?: number | null;
  logMaxFiles?: number | null;
  // Custom healthcheck injected for this scope; null/absent leaves the image's own (or none).
  healthcheck?: HealthcheckSpec | null;
}

export type ServiceResources = Record<string, ResourceLimits>;
