import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import StopIcon from "@mui/icons-material/Stop";
import {
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { type MouseEvent, useState } from "react";
import { useDeploy, useRemoveDeployment, useStart, useStop } from "../api/hooks";
import type { Deployment } from "../api/types";
import { describeError } from "../errors";
import { ConfirmDialog } from "./ConfirmDialog";

interface DeployActionsProps {
  deployment: Deployment;
  // "full" shows contextual buttons plus a menu; "menu" shows only the kebab menu.
  variant?: "full" | "menu";
  onDeleted?: () => void;
}

// Which lifecycle actions make sense for the current state.
function availableActions(deployment: Deployment): {
  canStop: boolean;
  canStart: boolean;
  canDeploy: boolean;
} {
  const running = ["RUNNING", "DEPLOYING", "DEGRADED"].includes(deployment.state);
  const hasRelease = deployment.activeReleaseId !== null;

  return {
    canStop: running,
    canStart: !running && hasRelease,
    canDeploy: true,
  };
}

export function DeployActions({ deployment, variant = "full", onDeleted }: DeployActionsProps) {
  const { enqueueSnackbar } = useSnackbar();
  const deploy = useDeploy(deployment.id);
  const stop = useStop(deployment.id);
  const start = useStart(deployment.id);
  const remove = useRemoveDeployment();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const { canStop, canStart, canDeploy } = availableActions(deployment);
  const busy = deploy.isPending || stop.isPending || start.isPending;

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      enqueueSnackbar(message, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  };

  const closeMenu = (event?: MouseEvent<HTMLElement>) => {
    event?.stopPropagation();
    setMenuAnchor(null);
  };

  const onDelete = () => {
    void run(async () => {
      await remove.mutateAsync(deployment.id);
      onDeleted?.();
    }, "Deleted");
  };

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {variant === "full" && canDeploy && (
          <Button
            variant="contained"
            startIcon={<RocketLaunchIcon />}
            disabled={busy}
            onClick={() => void run(() => deploy.mutateAsync(), "Deploy queued")}
          >
            Deploy
          </Button>
        )}
        {variant === "full" && canStop && (
          <Button
            variant="outlined"
            startIcon={<StopIcon />}
            disabled={busy}
            onClick={() => void run(() => stop.mutateAsync(), "Stopping")}
          >
            Stop
          </Button>
        )}
        {variant === "full" && canStart && (
          <Button
            variant="outlined"
            startIcon={<PlayArrowIcon />}
            disabled={busy}
            onClick={() => void run(() => start.mutateAsync(), "Starting")}
          >
            Start
          </Button>
        )}

        <IconButton aria-label="actions" onClick={openMenu} size="small">
          <MoreVertIcon />
        </IconButton>
      </Stack>

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => closeMenu()}>
        {canDeploy && (
          <MenuItem
            onClick={(event) => {
              closeMenu(event);
              void run(() => deploy.mutateAsync(), "Deploy queued");
            }}
          >
            <ListItemIcon>
              <RocketLaunchIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Deploy</ListItemText>
          </MenuItem>
        )}
        {canStop && (
          <MenuItem
            onClick={(event) => {
              closeMenu(event);
              void run(() => stop.mutateAsync(), "Stopping");
            }}
          >
            <ListItemIcon>
              <StopIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Stop</ListItemText>
          </MenuItem>
        )}
        {canStart && (
          <MenuItem
            onClick={(event) => {
              closeMenu(event);
              void run(() => start.mutateAsync(), "Starting");
            }}
          >
            <ListItemIcon>
              <PlayArrowIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Start</ListItemText>
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={(event) => {
            closeMenu(event);
            setConfirmDelete(true);
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>Delete</ListItemText>
        </MenuItem>
      </Menu>

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
          onDelete();
        }}
      />
    </>
  );
}
