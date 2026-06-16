import BackupIcon from "@mui/icons-material/Backup";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useMemo, useState } from "react";
import { useCreateBackupFor, useDeploymentContainers, useResetVolume } from "../api/hooks";
import { describeError } from "../errors";

interface VolumeRow {
  name: string;
  usedBy: string;
}

export function VolumesTab({
  deploymentId,
  containerId,
}: {
  deploymentId: string;
  containerId?: string | undefined;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: containers, isLoading } = useDeploymentContainers(deploymentId);
  const backup = useCreateBackupFor(deploymentId);
  const reset = useResetVolume(deploymentId);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  // Scope to the focused container when one is selected; otherwise show every container's volumes.
  // A volume can be mounted by several containers — collapse to one row per volume.
  const volumes = useMemo<VolumeRow[]>(() => {
    const scoped = containerId
      ? (containers ?? []).filter((container) => container.id === containerId)
      : (containers ?? []);
    const byName = new Map<string, string[]>();

    for (const container of scoped) {
      for (const mount of container.volumes) {
        const entries = byName.get(mount.name) ?? [];
        entries.push(`${container.name} → ${mount.destination}`);
        byName.set(mount.name, entries);
      }
    }

    return [...byName.entries()].map(([name, uses]) => ({ name, usedBy: uses.join(", ") }));
  }, [containers, containerId]);

  const onBackup = async (name: string) => {
    try {
      await backup.mutateAsync(name);
      enqueueSnackbar(`Backing up ${name}`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const onReset = async (name: string) => {
    try {
      await reset.mutateAsync(name);
      enqueueSnackbar(`Resetting ${name}`, { variant: "success" });
      setConfirmReset(null);
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const columns: GridColDef<VolumeRow>[] = [
    { field: "name", headerName: "Volume", width: 280 },
    { field: "usedBy", headerName: "Mounted at", flex: 1, minWidth: 240 },
    {
      field: "actions",
      headerName: "",
      width: 110,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <Box>
          <Tooltip title="Back up this volume">
            <IconButton size="small" onClick={() => void onBackup(params.row.name)}>
              <BackupIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Wipe this volume's contents">
            <IconButton size="small" color="error" onClick={() => setConfirmReset(params.row.name)}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      {isLoading ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ width: "100%" }}>
          <DataGrid
            rows={volumes}
            columns={columns}
            getRowId={(row) => row.name}
            density="compact"
            autoHeight
            disableRowSelectionOnClick
            hideFooter
            localeText={{ noRowsLabel: "No named volumes for this deployment." }}
            sx={{ border: 0 }}
          />
        </Box>
      )}

      <Box sx={{ fontSize: 12, color: "text.secondary" }}>
        Volumes come from the deployment's containers. Back up before a reset — reset erases a
        volume's contents.
      </Box>

      <Dialog open={confirmReset !== null} onClose={() => setConfirmReset(null)} maxWidth="xs">
        <DialogTitle>Reset {confirmReset}?</DialogTitle>
        <DialogContent>
          <Box sx={{ fontSize: 14, color: "text.secondary" }}>
            This stops the containers using the volume, erases all its contents, and starts them
            again. This can't be undone — consider backing it up first.
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={reset.isPending}
            onClick={() => confirmReset && void onReset(confirmReset)}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
