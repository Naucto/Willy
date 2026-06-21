import type { CreateDeploymentInput, DeploymentType } from "../api/types";
import type { SourceValue } from "../components/source/sourceTypes";
import { isValidFqdn } from "../domain";

// Pure wizard state + transitions for the create-deployment flow. Kept out of the page component so
// the step gating, validation and payload shaping are unit-testable in isolation.
export interface WizardState {
  name: string;
  type: DeploymentType;
  source: SourceValue;
  domainEnabled: boolean;
  domain: string;
  domainService: string;
  domainPort: string;
  runCommand: string;
  cronExpr: string;
  memoryLimitMb: number;
  cpuCores: number;
}

export type StepKey = "type" | "source" | "build" | "domain" | "resources" | "review";

export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const INITIAL_WIZARD_STATE: WizardState = {
  name: "",
  type: "WEB",
  source: {
    buildStrategy: "DOCKERFILE",
    gitUrl: "",
    gitRef: "main",
    gitToken: "",
    imageRef: "",
    dockerfilePath: "",
    composeFilePath: "",
  },
  domainEnabled: false,
  domain: "",
  domainService: "",
  domainPort: "",
  runCommand: "",
  cronExpr: "",
  memoryLimitMb: 0,
  cpuCores: 0,
};

// WEB deployments get a Domain step (no build inputs — readiness lives in the Health section now);
// WORKER/CRON get a "Build & run" step for their command/schedule and have no domain.
export function stepsFor(type: DeploymentType): { key: StepKey; label: string }[] {
  const steps: { key: StepKey; label: string }[] = [
    { key: "type", label: "Type" },
    { key: "source", label: "Source" },
  ];

  if (type === "WEB") {
    steps.push({ key: "domain", label: "Domain" });
  } else {
    steps.push({ key: "build", label: "Build & run" });
  }

  steps.push({ key: "resources", label: "Resources" }, { key: "review", label: "Review" });

  return steps;
}

function trimmed(value: string): string | undefined {
  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

// The blocking validation error for a step, or null if it's complete. Gates the Next/Create button.
export function stepError(key: StepKey, state: WizardState): string | null {
  if (key === "type") {
    if (!state.name.trim()) {
      return "Name is required";
    }

    if (!NAME_PATTERN.test(state.name.trim())) {
      return "Name must be lowercase letters, digits and hyphens (1–41 chars)";
    }
  }

  if (key === "source") {
    if (state.source.buildStrategy === "IMAGE") {
      if (!state.source.imageRef.trim()) {
        return "Image reference is required";
      }
    } else if (!state.source.gitUrl.trim()) {
      return "Git URL is required";
    }
  }

  if (
    key === "domain" &&
    state.domainEnabled &&
    state.domain.trim() &&
    !isValidFqdn(state.domain)
  ) {
    return "Enter a valid domain, e.g. app.example.com";
  }

  return null;
}

export function toPayload(state: WizardState): CreateDeploymentInput {
  const { source } = state;
  const payload: CreateDeploymentInput = {
    name: state.name.trim(),
    type: state.type,
    buildStrategy: source.buildStrategy,
  };

  const set = <K extends keyof CreateDeploymentInput>(
    field: K,
    value: CreateDeploymentInput[K] | undefined,
  ): void => {
    if (value !== undefined) {
      payload[field] = value;
    }
  };

  if (state.memoryLimitMb > 0) {
    set("memoryLimitMb", state.memoryLimitMb);
  }

  if (state.cpuCores > 0) {
    set("nanoCpus", Math.round(state.cpuCores * 1e9));
  }

  if (source.buildStrategy === "IMAGE") {
    set("imageRef", trimmed(source.imageRef));
  } else {
    set("gitUrl", trimmed(source.gitUrl));
    set("gitRef", trimmed(source.gitRef));
    set("gitToken", trimmed(source.gitToken));
  }

  if (source.buildStrategy === "DOCKERFILE") {
    set("dockerfilePath", trimmed(source.dockerfilePath));
  }

  if (source.buildStrategy === "COMPOSE") {
    set("composeFilePath", trimmed(source.composeFilePath));
  }

  if (state.type === "WEB" && state.domainEnabled) {
    const domain = trimmed(state.domain);
    set("domain", domain);

    if (domain) {
      set("domainPort", state.domainPort ? Number(state.domainPort) : undefined);

      if (source.buildStrategy === "COMPOSE") {
        set("domainService", trimmed(state.domainService));
      }
    }
  }

  if (state.type === "WORKER") {
    set("runCommand", trimmed(state.runCommand));
  }

  if (state.type === "CRON") {
    set("cronExpr", trimmed(state.cronExpr));
    set("runCommand", trimmed(state.runCommand));
  }

  return payload;
}
