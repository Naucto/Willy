import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import DownloadIcon from "@mui/icons-material/Download";
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
  useBackupVolumes,
  useCreateBackup,
  useDeleteBackup,
} from "../api/hooks";
import type { Backup } from "../api/types";
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
  const { data: volumes } = useBackupVolumes();
  const createBackup = useCreateBackup();
  const deleteBackup = useDeleteBackup();

  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState("");

  const volumeList = volumes?.volumes ?? [];

  const onCreate = async () => {
    try {
      await createBackup.mutateAsync({ kind: "VOLUME_TAR", target });
      enqueueSnackbar("Backup started", { variant: "success" });
      setAdding(false);
      setTarget("");
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    }
  };

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

  const columns: GridColDef<Backup>[] = [
    { field: "kind", headerName: "Kind", width: 130 },
    { field: "target", headerName: "Target", flex: 1, minWidth: 200 },
    {
      field: "status",
      headerName: "Status",
      width: 130,
      renderCell: (params) => (
        <Chip size="small" label={params.row.status} color={STATUS_COLOR[params.row.status]} />
      ),
    },
    {
      field: "sizeBytes",
      headerName: "Size",
      width: 110,
      valueFormatter: (value) => formatBytes(value as number | null),
    },
    {
      field: "createdAt",
      headerName: "Created",
      width: 190,
      valueFormatter: (value) => new Date(value as string).toLocaleString(),
    },
    {
      field: "actions",
      headerName: "",
      width: 100,
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
        Snapshots a Docker volume into a compressed archive you can download. Database dumps and
        scheduled backups are coming next.
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

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm">
        <DialogTitle>New volume backup</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Volume"
              value={target}
              helperText="The Docker volume to archive."
              onChange={(event) => setTarget(event.target.value)}
            >
              {volumeList.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={createBackup.isPending || !target}
            onClick={() => void onCreate()}
          >
            Back up
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
