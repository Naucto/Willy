// The sections shown for a deployment, in sidebar/URL order. CRON deployments show "Runs" instead of
// the Runtime-logs/Console sections (which need a long-lived container). Shared by the sidebar and
// the detail page so both agree on the set + order.
export interface DeploymentSection {
  key: string;
  label: string;
}

export function deploymentSections(isCron: boolean): DeploymentSection[] {
  return [
    { key: "overview", label: "Overview" },
    { key: "build", label: "Build logs" },
    ...(isCron
      ? [{ key: "runs", label: "Runs" }]
      : [
          { key: "runtime", label: "Runtime logs" },
          { key: "console", label: "Console" },
        ]),
    { key: "env", label: "Environment" },
    { key: "volumes", label: "Volumes" },
    { key: "networking", label: "Networking" },
    { key: "resources", label: "Resources" },
    { key: "settings", label: "Settings" },
  ];
}
