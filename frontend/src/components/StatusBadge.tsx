import { Chip } from "@mui/material";
import type { DeploymentState, ReleaseStatus } from "../api/types";

type Color = "default" | "success" | "warning" | "error" | "info";

const DEPLOYMENT_COLORS: Record<DeploymentState, Color> = {
  CREATED: "default",
  DEPLOYING: "info",
  RUNNING: "success",
  DEGRADED: "warning",
  STOPPED: "default",
  ERROR: "error",
};

const RELEASE_COLORS: Record<ReleaseStatus, Color> = {
  QUEUED: "default",
  CLONING: "info",
  BUILDING: "info",
  HEALTHCHECKING: "info",
  LIVE: "success",
  SUPERSEDED: "default",
  FAILED: "error",
  ROLLEDBACK: "warning",
  INTERRUPTED: "warning",
};

export function StatusBadge({ status }: { status: DeploymentState | ReleaseStatus }) {
  const color =
    (DEPLOYMENT_COLORS as Record<string, Color>)[status] ??
    RELEASE_COLORS[status as ReleaseStatus] ??
    "default";

  return <Chip label={status} color={color} size="small" variant="outlined" />;
}
