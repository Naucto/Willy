// Per-build-strategy settings, stored as a single JSONB column on a deployment. The active
// build strategy (a separate enum column) selects which shape applies — a base deployment plus a
// strategy-specific config, rather than a flat column per strategy.

export interface DockerfileConfig {
  dockerfilePath?: string;
}

export interface ComposeConfig {
  composeFilePath?: string;
  composeWebService?: string;
}

export interface ImageConfig {
  imageRef: string;
}

export type StrategyConfig = DockerfileConfig | ComposeConfig | ImageConfig;
