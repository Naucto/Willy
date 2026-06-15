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
} from "@mui/material";
import { useSnackbar } from "notistack";
import { type MouseEvent, type ReactNode, useState } from "react";
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
  icon: ReactNode;
  pending: boolean;
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

  const running = ["RUNNING", "DEPLOYING", "DEGRADED"].includes(deployment.state);
  const hasRelease = deployment.activeReleaseId !== null;
  const busy = deploy.isPending || restart.isPending || stop.isPending || start.isPending;

  const run = (action: () => Promise<unknown>, message: string) => async () => {
    try {
      await action();
      enqueueSnackbar(message, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const actions: Action[] = [
    {
      key: "deploy",
      label: "Deploy",
      icon: <RocketLaunchIcon fontSize="small" />,
      pending: deploy.isPending,
      run: () => void run(() => deploy.mutateAsync(), "Deploy queued")(),
    },
  ];

  if (running) {
    actions.push({
      key: "restart",
      label: "Restart",
      icon: <RestartAltIcon fontSize="small" />,
      pending: restart.isPending,
      run: () => void run(() => restart.mutateAsync(), "Restarting")(),
    });
    actions.push({
      key: "stop",
      label: "Stop",
      icon: <StopIcon fontSize="small" />,
      pending: stop.isPending,
      run: () => void run(() => stop.mutateAsync(), "Stopping")(),
    });
  } else if (hasRelease) {
    actions.push({
      key: "start",
      label: "Start",
      icon: <PlayArrowIcon fontSize="small" />,
      pending: start.isPending,
      run: () => void run(() => start.mutateAsync(), "Starting")(),
    });
  }

  actions.push({
    key: "delete",
    label: "Delete",
    icon: <DeleteIcon fontSize="small" color="error" />,
    pending: remove.isPending,
    run: () => setConfirmDelete(true),
    destructive: true,
  });

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
        void run(async () => {
          await remove.mutateAsync(deployment.id);
          onDeleted?.();
        }, "Deleted")();
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
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                setMenuAnchor(null);
                action.run();
              }}
            >
              <ListItemIcon>
                {action.pending ? <CircularProgress size={18} /> : action.icon}
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
          <Button
            key={action.key}
            variant={action.key === "deploy" ? "contained" : "outlined"}
            color={action.destructive ? "error" : "primary"}
            disabled={busy}
            startIcon={
              action.pending ? <CircularProgress size={18} color="inherit" /> : action.icon
            }
            onClick={action.run}
          >
            {action.label}
          </Button>
        ))}
      </Stack>
      {confirmDialog}
    </>
  );
}
