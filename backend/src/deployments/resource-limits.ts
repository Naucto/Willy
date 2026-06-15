// Per-container resource tuning. For single-container deployments these live as columns on the
// deployment; for compose they're stored per service in `serviceResources` and injected into the
// generated override. All fields optional — absent means "leave to Docker / the compose file".
export type RestartPolicyName = "NO" | "ON_FAILURE" | "ALWAYS" | "UNLESS_STOPPED";

export interface ResourceLimits {
  memoryLimitMb?: number | null;
  nanoCpus?: number | null;
  capAdd?: string[];
  capDrop?: string[];
  restartPolicy?: RestartPolicyName;
  // Log rotation (json-file driver): max size per file in MB, and how many files to keep.
  logMaxSizeMb?: number | null;
  logMaxFiles?: number | null;
}

export type ServiceResources = Record<string, ResourceLimits>;
