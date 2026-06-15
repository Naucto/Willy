import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import StopIcon from "@mui/icons-material/Stop";
import { Button, Stack } from "@mui/material";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDeploy, useRemoveDeployment, useStart, useStop } from "../api/hooks";
import type { Deployment } from "../api/types";
import { describeError } from "../errors";
import { ConfirmDialog } from "./ConfirmDialog";

export function DeployActions({ deployment }: { deployment: Deployment }) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const deploy = useDeploy(deployment.id);
  const stop = useStop(deployment.id);
  const start = useStart(deployment.id);
  const remove = useRemoveDeployment();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      enqueueSnackbar(message, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={<RocketLaunchIcon />}
          disabled={deploy.isPending}
          onClick={() => void run(() => deploy.mutateAsync(), "Deploy queued")}
        >
          Deploy
        </Button>
        <Button
          variant="outlined"
          startIcon={<StopIcon />}
          disabled={stop.isPending}
          onClick={() => void run(() => stop.mutateAsync(), "Stopping")}
        >
          Stop
        </Button>
        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          disabled={start.isPending}
          onClick={() => void run(() => start.mutateAsync(), "Starting")}
        >
          Start
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
      </Stack>

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
            navigate("/deployments");
          }, "Deleted");
        }}
      />
    </>
  );
}
