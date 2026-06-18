import type { DeploymentType } from "./api/types";

// The sections shown for a deployment, in sidebar/URL order. CRON deployments show "Runs" instead of
// the Runtime-logs/Console sections (which need a long-lived container); only WEB deployments get
// Domains. Shared by the sidebar and the detail page so both agree on the set + order.
export interface DeploymentSection {
  key: string;
  label: string;
}

export function deploymentSections(type: DeploymentType): DeploymentSection[] {
  const isCron = type === "CRON";
  const isWeb = type === "WEB";

  return [
    { key: "overview", label: "Overview" },
    // "Deployment" (key kept as "settings" so routes/icons/switch stay put) sits right below
    // Overview — it governs the core build/run config and is the first thing to set up.
    { key: "settings", label: "Deployment" },
    { key: "build", label: "Build logs" },
    ...(isCron
      ? [{ key: "runs", label: "Runs" }]
      : [
          { key: "runtime", label: "Runtime logs" },
          { key: "console", label: "Console" },
        ]),
    { key: "env", label: "Environment" },
    { key: "volumes", label: "Volumes" },
    { key: "backups", label: "Backups" },
    { key: "networking", label: "Networking" },
    ...(isWeb ? [{ key: "domains", label: "Domains" }] : []),
    { key: "resources", label: "Resources" },
    { key: "health", label: "Health" },
    { key: "webhook", label: "Webhook" },
  ];
}
