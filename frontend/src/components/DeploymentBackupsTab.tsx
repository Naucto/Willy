import AddIcon from "@mui/icons-material/Add";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import RestoreIcon from "@mui/icons-material/Restore";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useState } from "react";
import {
  downloadBackup,
  useBackupDestinations,
  useBackups,
  useCreateBackupFor,
  useDeleteBackup,
  useDeploymentContainers,
  useDeploymentTasks,
  usePushBackup,
  useRestoreBackup,
} from "../api/hooks";
import type { Backup, Task } from "../api/types";
import { latestTaskByBackup } from "../backupActivity";
import { useAction } from "../useAction";
import { BackupSchedules } from "./BackupSchedules";
import { OperateButton, OperateIconButton } from "./OperateButton";

// Per-row labels for the non-create operations a backup can be the subject of.
const ACTIVITY_LABEL: Record<string, { running: string; success: string; failed: string }> = {
  RESTORE: { running: "Restoring…", success: "Restored", failed: "Restore failed" },
  OFFSITE_PUSH: { running: "Pushing…", success: "Pushed", failed: "Push failed" },
};

function ActivityCell({ task }: { task: Task | undefined }) {
  const labels = task ? ACTIVITY_LABEL[task.kind] : undefined;

  if (!task || !labels) {
    return null;
  }

  if (task.status === "PENDING" || task.status === "RUNNING") {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          {labels.running}
        </Typography>
      </Box>
    );
  }

  if (task.status === "FAILED") {
    return (
      <Tooltip title={task.errorMessage ?? ""}>
        <Chip size="small" color="error" label={labels.failed} />
      </Tooltip>
    );
  }

  return <Chip size="small" color="success" variant="outlined" label={labels.success} />;
}

const STATUS_COLOR: Record<string, "default" | "info" | "success" | "error"> = {
  PENDING: "default",
  RUNNING: "info",
  SUCCESS: "success",
  FAILED: "error",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function DeploymentBackupsTab({ deploymentId }: { deploymentId: string }) {
  const run = useAction();
  const { data: backups, isLoading } = useBackups(deploymentId);
  const { data: tasks } = useDeploymentTasks(deploymentId);
  const activity = latestTaskByBackup(tasks);
  const { data: destinations } = useBackupDestinations();
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();
  const pushBackup = usePushBackup();

  const [adding, setAdding] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [pushId, setPushId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState("");

  const onDownload = (id: string) => run(() => downloadBackup(id));

  const onDelete = (id: string) => run(() => deleteBackup.mutateAsync(id), "Backup deleted");

  const onRestore = async (id: string) => {
    if (await run(() => restoreBackup.mutateAsync(id), "Restore started")) {
      setRestoreId(null);
    }
  };

  const onPush = async () => {
    if (!pushId || !destinationId) {
      return;
    }

    if (
      await run(() => pushBackup.mutateAsync({ id: pushId, destinationId }), "Offsite push started")
    ) {
      setPushId(null);
      setDestinationId("");
    }
  };

  const columns: GridColDef<Backup>[] = [
    { field: "target", headerName: "Volume", flex: 1, minWidth: 200 },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (params) => {
        const chip = (
          <Chip size="small" label={params.row.status} color={STATUS_COLOR[params.row.status]} />
        );

        return params.row.status === "FAILED" && params.row.errorMessage ? (
          <Tooltip title={params.row.errorMessage}>{chip}</Tooltip>
        ) : (
          chip
        );
      },
    },
    {
      field: "activity",
      headerName: "Activity",
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => <ActivityCell task={activity.get(params.row.id)} />,
    },
    {
      field: "sizeBytes",
      headerName: "Size",
      width: 100,
      valueFormatter: (value) => formatBytes(value as number | null),
    },
    {
      field: "createdAt",
      headerName: "Created",
      width: 180,
      valueFormatter: (value) => new Date(value as string).toLocaleString(),
    },
    {
      field: "actions",
      headerName: "",
      width: 170,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => {
        const task = activity.get(params.row.id);
        const busy = task?.status === "PENDING" || task?.status === "RUNNING";

        return (
          <Box>
            <Tooltip title="Download">
              <span>
                <IconButton
                  size="small"
                  disabled={params.row.status !== "SUCCESS"}
                  onClick={() => void onDownload(params.row.id)}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={params.row.offsiteUrl ? `Pushed: ${params.row.offsiteUrl}` : "Push offsite"}
            >
              <span>
                <OperateIconButton
                  size="small"
                  color={params.row.offsiteUrl ? "success" : "default"}
                  disabled={params.row.status !== "SUCCESS" || busy}
                  onClick={() => setPushId(params.row.id)}
                >
                  <CloudUploadIcon fontSize="small" />
                </OperateIconButton>
              </span>
            </Tooltip>
            <Tooltip title="Restore to this deployment">
              <span>
                <OperateIconButton
                  size="small"
                  disabled={params.row.status !== "SUCCESS" || busy}
                  onClick={() => setRestoreId(params.row.id)}
                >
                  <RestoreIcon fontSize="small" />
                </OperateIconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete">
              <span>
                <OperateIconButton
                  size="small"
                  disabled={busy}
                  onClick={() => void onDelete(params.row.id)}
                >
                  <DeleteIcon fontSize="small" />
                </OperateIconButton>
              </span>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Backups
        </Typography>
        <OperateButton variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          New backup
        </OperateButton>
      </Box>

      <Box sx={{ height: 360 }}>
        <DataGrid
          rows={backups ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            sorting: { sortModel: [{ field: "createdAt", sort: "desc" }] },
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          localeText={{ noRowsLabel: "No backups yet for this deployment." }}
          sx={{ border: 0 }}
        />
      </Box>

      <BackupSchedules deploymentId={deploymentId} />

      <NewBackupDialog deploymentId={deploymentId} open={adding} onClose={() => setAdding(false)} />

      <Dialog open={pushId !== null} onClose={() => setPushId(null)} fullWidth maxWidth="xs">
        <DialogTitle>Push offsite</DialogTitle>
        <DialogContent>
          {destinations && destinations.length > 0 ? (
            <TextField
              select
              fullWidth
              label="Destination"
              value={destinationId}
              sx={{ mt: 1 }}
              onChange={(event) => setDestinationId(event.target.value)}
            >
              {destinations.map((dest) => (
                <MenuItem key={dest.id} value={dest.id}>
                  {dest.name} ({dest.type})
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Alert severity="info">Add an offsite destination on the Backups page first.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPushId(null)}>Cancel</Button>
          <OperateButton
            variant="contained"
            disabled={pushBackup.isPending || !destinationId}
            onClick={() => void onPush()}
          >
            Push
          </OperateButton>
        </DialogActions>
      </Dialog>

      <Dialog open={restoreId !== null} onClose={() => setRestoreId(null)} maxWidth="xs">
        <DialogTitle>Restore this backup?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Stops the deployment's containers, replaces the volume's contents with this archive, and
            starts them again. Current data in the volume is overwritten.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreId(null)}>Cancel</Button>
          <OperateButton
            color="error"
            variant="contained"
            disabled={restoreBackup.isPending}
            onClick={() => restoreId && void onRestore(restoreId)}
          >
            Restore
          </OperateButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function NewBackupDialog({
  deploymentId,
  open,
  onClose,
}: {
  deploymentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const run = useAction();
  const [containerId, setContainerId] = useState("");
  const [volume, setVolume] = useState("");

  const { data: containers } = useDeploymentContainers(deploymentId);
  const createBackup = useCreateBackupFor(deploymentId);

  const selectedContainer = (containers ?? []).find((container) => container.id === containerId);
  const volumes = selectedContainer?.volumes ?? [];

  const reset = () => {
    setContainerId("");
    setVolume("");
  };

  const onCreate = async () => {
    if (await run(() => createBackup.mutateAsync(volume), "Backup started")) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New backup</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Container"
            value={containerId}
            disabled={(containers ?? []).length === 0}
            onChange={(event) => {
              setContainerId(event.target.value);
              setVolume("");
            }}
          >
            {(containers ?? []).map((container) => (
              <MenuItem key={container.id} value={container.id}>
                {container.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Volume"
            value={volume}
            disabled={!containerId || volumes.length === 0}
            helperText={
              containerId && volumes.length === 0 ? "This container has no named volumes." : " "
            }
            onChange={(event) => setVolume(event.target.value)}
          >
            {volumes.map((mount) => (
              <MenuItem key={mount.name} value={mount.name}>
                {mount.name} ({mount.destination})
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <OperateButton
          variant="contained"
          disabled={createBackup.isPending || !volume}
          onClick={() => void onCreate()}
        >
          Back up
        </OperateButton>
      </DialogActions>
    </Dialog>
  );
}
