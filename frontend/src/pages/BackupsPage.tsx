import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import RestoreIcon from "@mui/icons-material/Restore";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { useSnackbar } from "notistack";
import { useState } from "react";
import {
  downloadBackup,
  useBackups,
  useCreateBackupFor,
  useDeleteBackup,
  useDeploymentContainers,
  useDeployments,
  useRestoreBackup,
} from "../api/hooks";
import type { Backup } from "../api/types";
import { BackupSchedules } from "../components/BackupSchedules";
import { describeError } from "../errors";

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

export function BackupsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { data: backups, isLoading } = useBackups();
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();

  const [adding, setAdding] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const onDownload = async (id: string) => {
    try {
      await downloadBackup(id);
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteBackup.mutateAsync(id);
      enqueueSnackbar("Backup deleted", { variant: "success" });
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  const onRestore = async (id: string) => {
    try {
      await restoreBackup.mutateAsync(id);
      enqueueSnackbar("Restore started", { variant: "success" });
      setRestoreId(null);
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  const columns: GridColDef<Backup>[] = [
    { field: "target", headerName: "Volume", flex: 1, minWidth: 200 },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (params) => (
        <Chip size="small" label={params.row.status} color={STATUS_COLOR[params.row.status]} />
      ),
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
      width: 130,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
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
          <Tooltip title="Restore to its deployment">
            <span>
              <IconButton
                size="small"
                disabled={params.row.status !== "SUCCESS" || !params.row.deploymentId}
                onClick={() => setRestoreId(params.row.id)}
              >
                <RestoreIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => void onDelete(params.row.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Backups
        </Typography>
        <Button variant="contained" onClick={() => setAdding(true)}>
          New backup
        </Button>
      </Box>

      <Alert severity="info">
        Snapshots a deployment's volume into a compressed archive you can download or restore back
        to that deployment. Database dumps and schedules are coming next.
      </Alert>

      <Box sx={{ height: 540 }}>
        <DataGrid
          rows={backups ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          showToolbar
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            sorting: { sortModel: [{ field: "createdAt", sort: "desc" }] },
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          sx={{ border: 0 }}
        />
      </Box>

      <BackupSchedules />

      <NewBackupDialog open={adding} onClose={() => setAdding(false)} />

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
          <Button
            color="error"
            variant="contained"
            disabled={restoreBackup.isPending}
            onClick={() => restoreId && void onRestore(restoreId)}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function NewBackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: deployments } = useDeployments();
  const [deploymentId, setDeploymentId] = useState("");
  const [containerId, setContainerId] = useState("");
  const [volume, setVolume] = useState("");

  const { data: containers } = useDeploymentContainers(deploymentId);
  const createBackup = useCreateBackupFor(deploymentId);

  const selectedContainer = (containers ?? []).find((container) => container.id === containerId);
  const volumes = selectedContainer?.volumes ?? [];

  const reset = () => {
    setDeploymentId("");
    setContainerId("");
    setVolume("");
  };

  const onCreate = async () => {
    try {
      await createBackup.mutateAsync(volume);
      enqueueSnackbar("Backup started", { variant: "success" });
      reset();
      onClose();
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New backup</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Deployment"
            value={deploymentId}
            onChange={(event) => {
              setDeploymentId(event.target.value);
              setContainerId("");
              setVolume("");
            }}
          >
            {(deployments ?? []).map((deployment) => (
              <MenuItem key={deployment.id} value={deployment.id}>
                {deployment.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Container"
            value={containerId}
            disabled={!deploymentId || (containers ?? []).length === 0}
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
        <Button
          variant="contained"
          disabled={createBackup.isPending || !volume}
          onClick={() => void onCreate()}
        >
          Back up
        </Button>
      </DialogActions>
    </Dialog>
  );
}
