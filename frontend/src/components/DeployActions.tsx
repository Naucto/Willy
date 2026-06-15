import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import StopIcon from "@mui/icons-material/Stop";
import {
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useDeploy, useRemoveDeployment, useRestart, useStart, useStop } from "../api/hooks";
import type { Deployment } from "../api/types";
import { describeError } from "../errors";
import { ConfirmDialog } from "./ConfirmDialog";

interface DeployActionsProps {
  deployment: Deployment;
  // "full" shows contextual buttons (detail page); "menu" shows only the kebab (list rows).
  variant?: "full" | "menu";
  onDeleted?: () => void;
}

interface Action {
  key: string;
  label: string;
  tip: string;
  icon: ReactNode;
  spinning: boolean;
  run: () => void;
  destructive?: boolean;
}

export function DeployActions({ deployment, variant = "full", onDeleted }: DeployActionsProps) {
  const { enqueueSnackbar } = useSnackbar();
  const deploy = useDeploy(deployment.id);
  const restart = useRestart(deployment.id);
  const stop = useStop(deployment.id);
  const start = useStart(deployment.id);
  const remove = useRemoveDeployment();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // Keep the clicked action's spinner on until the server reports a settled state — the
  // mutation itself resolves immediately (202), the real work runs in the background.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingBase = useRef<string | null>(null);

  useEffect(() => {
    if (pendingKey === null) {
      return;
    }

    // updatedAt changes on every server-side state write; once it differs from the value at
    // click time and the deployment is no longer transitioning, the action has landed.
    if (deployment.updatedAt !== pendingBase.current && deployment.state !== "DEPLOYING") {
      pendingBase.current = null;
      setPendingKey(null);
    }
  }, [deployment.updatedAt, deployment.state, pendingKey]);

  const running = ["RUNNING", "DEPLOYING", "DEGRADED"].includes(deployment.state);
  const hasRelease = deployment.activeReleaseId !== null;
  const lifecycleBusy = pendingKey !== null || deployment.state === "DEPLOYING";

  const trigger = (key: string, action: () => Promise<unknown>, message: string) => async () => {
    pendingBase.current = deployment.updatedAt;
    setPendingKey(key);

    try {
      await action();
      enqueueSnackbar(message, { variant: "success" });
    } catch (error) {
      pendingBase.current = null;
      setPendingKey(null);
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const actions: Action[] = [
    {
      key: "deploy",
      label: "Deploy",
      tip: "Clone the latest commit, build it, and roll it out — the new version only takes over once it passes its health check.",
      icon: <RocketLaunchIcon fontSize="small" />,
      spinning: pendingKey === "deploy",
      run: () => void trigger("deploy", () => deploy.mutateAsync(), "Deploy queued")(),
    },
  ];

  if (running) {
    actions.push({
      key: "restart",
      label: "Restart",
      tip: "Recreate the container from the current release — applies env/setting changes without rebuilding.",
      icon: <RestartAltIcon fontSize="small" />,
      spinning: pendingKey === "restart",
      run: () => void trigger("restart", () => restart.mutateAsync(), "Restarting")(),
    });
    actions.push({
      key: "stop",
      label: "Stop",
      tip: "Stop and remove the running container (the build/image is kept; Start brings it back).",
      icon: <StopIcon fontSize="small" />,
      spinning: pendingKey === "stop",
      run: () => void trigger("stop", () => stop.mutateAsync(), "Stopping")(),
    });
  } else if (hasRelease) {
    actions.push({
      key: "start",
      label: "Start",
      tip: "Start the active release's container again (no rebuild).",
      icon: <PlayArrowIcon fontSize="small" />,
      spinning: pendingKey === "start",
      run: () => void trigger("start", () => start.mutateAsync(), "Starting")(),
    });
  }

  actions.push({
    key: "delete",
    label: "Delete",
    tip: "Tear down the container and permanently remove this deployment.",
    icon: <DeleteIcon fontSize="small" color="error" />,
    spinning: remove.isPending,
    run: () => setConfirmDelete(true),
    destructive: true,
  });

  const isDisabled = (action: Action): boolean =>
    action.destructive ? remove.isPending : lifecycleBusy;

  const confirmDialog = (
    <ConfirmDialog
      open={confirmDelete}
      title="Delete deployment"
      message="This tears down the container and removes the deployment. This cannot be undone."
      confirmPhrase={deployment.name}
      confirmLabel="Delete"
      destructive
      onCancel={() => setConfirmDelete(false)}
      onConfirm={() => {
        setConfirmDelete(false);
        void (async () => {
          try {
            await remove.mutateAsync(deployment.id);
            onDeleted?.();
          } catch (error) {
            enqueueSnackbar(describeError(error), { variant: "error" });
          }
        })();
      }}
    />
  );

  if (variant === "menu") {
    return (
      <>
        <IconButton
          aria-label="actions"
          size="small"
          onClick={(event: MouseEvent<HTMLElement>) => {
            event.stopPropagation();
            setMenuAnchor(event.currentTarget);
          }}
        >
          <MoreVertIcon />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
          {actions.map((action) => (
            <MenuItem
              key={action.key}
              disabled={isDisabled(action)}
              onClick={(event) => {
                event.stopPropagation();
                setMenuAnchor(null);
                action.run();
              }}
            >
              <ListItemIcon>
                {action.spinning ? <CircularProgress size={18} /> : action.icon}
              </ListItemIcon>
              <ListItemText sx={action.destructive ? { color: "error.main" } : undefined}>
                {action.label}
              </ListItemText>
            </MenuItem>
          ))}
        </Menu>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {actions.map((action) => (
          <Tooltip key={action.key} title={action.tip}>
            <span>
              <Button
                variant={action.key === "deploy" ? "contained" : "outlined"}
                color={action.destructive ? "error" : "primary"}
                disabled={isDisabled(action)}
                startIcon={
                  action.spinning ? <CircularProgress size={18} color="inherit" /> : action.icon
                }
                onClick={action.run}
              >
                {action.label}
              </Button>
            </span>
          </Tooltip>
        ))}
      </Stack>
      {confirmDialog}
    </>
  );
}
