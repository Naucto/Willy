import { Chip } from "@mui/material";
import type { DeploymentTransition } from "../api/hooks";
import type { DeploymentState, ReleaseStatus } from "../api/types";

type Color = "default" | "success" | "warning" | "error" | "info";

// Humanized label + color for every state a badge can show: deployment states, release statuses,
// and the synthetic in-flight transitions. Raw enum values never reach the user.
const STATUS: Record<string, { label: string; color: Color }> = {
  // Deployment states.
  CREATED: { label: "Created", color: "default" },
  DEPLOYING: { label: "Deploying", color: "info" },
  RUNNING: { label: "Running", color: "success" },
  DEGRADED: { label: "Degraded", color: "warning" },
  STOPPED: { label: "Stopped", color: "default" },
  ERROR: { label: "Error", color: "error" },

  // Release statuses.
  QUEUED: { label: "Queued", color: "default" },
  CLONING: { label: "Cloning", color: "info" },
  BUILDING: { label: "Building", color: "info" },
  HEALTHCHECKING: { label: "Health-checking", color: "info" },
  LIVE: { label: "Live", color: "success" },
  SUPERSEDED: { label: "Superseded", color: "default" },
  FAILED: { label: "Failed", color: "error" },
  ROLLEDBACK: { label: "Rolled back", color: "warning" },
  INTERRUPTED: { label: "Interrupted", color: "warning" },

  // Synthetic transient states (a lifecycle action is mid-flight).
  RESTARTING: { label: "Restarting", color: "info" },
  STARTING: { label: "Starting", color: "info" },
  STOPPING: { label: "Stopping", color: "warning" },
  DELETING: { label: "Deleting", color: "error" },
};

export function StatusBadge({
  status,
}: {
  status: DeploymentState | ReleaseStatus | DeploymentTransition;
}) {
  const { label, color } = STATUS[status] ?? { label: status, color: "default" };

  return <Chip label={label} color={color} size="small" variant="outlined" />;
}
