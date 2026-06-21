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
import { useMemo, useState } from "react";
import { useCreateBackupFor, useDeploymentContainers, useResetVolume } from "../api/hooks";
import { useAction } from "../useAction";

interface VolumeRow {
  id: string;
  name: string;
  container: string;
  destination: string;
}

export function VolumesTab({ deploymentId }: { deploymentId: string }) {
  const run = useAction();
  const { data: containers, isLoading } = useDeploymentContainers(deploymentId);
  const backup = useCreateBackupFor(deploymentId);
  const reset = useResetVolume(deploymentId);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  // One row per (container, mount) so it's clear which container maps which volume where. The same
  // named volume can appear under several containers; the backup/reset actions act on it by name.
  const volumes = useMemo<VolumeRow[]>(() => {
    const rows: VolumeRow[] = [];

    for (const container of containers ?? []) {
      for (const mount of container.volumes) {
        rows.push({
          id: `${container.id}:${mount.name}:${mount.destination}`,
          name: mount.name,
          container: container.name,
          destination: mount.destination,
        });
      }
    }

    return rows;
  }, [containers]);

  const onBackup = (name: string) => run(() => backup.mutateAsync(name), `Backing up ${name}`);

  const onReset = async (name: string) => {
    if (await run(() => reset.mutateAsync(name), `Resetting ${name}`)) {
      setConfirmReset(null);
    }
  };

  const columns: GridColDef<VolumeRow>[] = [
    { field: "name", headerName: "Volume", flex: 1, minWidth: 220 },
    { field: "container", headerName: "Container", width: 220 },
    { field: "destination", headerName: "Mounted at", flex: 1, minWidth: 200 },
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
            getRowId={(row) => row.id}
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
