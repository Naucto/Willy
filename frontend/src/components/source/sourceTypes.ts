import type { BuildStrategy } from "../../api/types";

// The editable source configuration, shared verbatim by the create wizard and the settings page so
// a single set of per-type field components drives both. Strategy-irrelevant fields are simply
// ignored by the active child component.
export interface SourceValue {
  buildStrategy: BuildStrategy;
  gitUrl: string;
  gitRef: string;
  gitToken: string;
  imageRef: string;
  dockerfilePath: string;
  composeFilePath: string;
}

// The shared interface every per-source-type child component implements.
export interface SourceFieldsProps {
  value: SourceValue;
  onChange: (patch: Partial<SourceValue>) => void;
  // The private-repo token is only collected at creation (it's write-only afterwards).
  showToken?: boolean;
}

export interface SourceOption {
  value: BuildStrategy;
  label: string;
  description: string;
}

// One explanation per source type, shown beside the radio buttons (wizard) and under the dropdown
// (settings) — the same string in both places.
export const SOURCE_OPTIONS: SourceOption[] = [
  {
    value: "DOCKERFILE",
    label: "Git + Dockerfile",
    description: "Clone a git repository and build the image from its Dockerfile.",
  },
  {
    value: "COMPOSE",
    label: "Git + Docker Compose",
    description: "Clone a git repository and bring up its docker-compose stack (multi-service).",
  },
  {
    value: "IMAGE",
    label: "Docker image",
    description: "Run an existing image from a registry as-is — no repository, no build step.",
  },
];

export function sourceDescription(strategy: BuildStrategy): string {
  return SOURCE_OPTIONS.find((option) => option.value === strategy)?.description ?? "";
}

export function isGitStrategy(strategy: BuildStrategy): boolean {
  return strategy === "DOCKERFILE" || strategy === "COMPOSE";
}
