import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useState } from "react";
import {
  useBackupSchedules,
  useCreateSchedule,
  useDeleteSchedule,
  useDeploymentContainers,
  useSetScheduleEnabled,
} from "../api/hooks";
import type { BackupSchedule } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { useAction } from "../useAction";
import { Gated } from "./Gated";

export function BackupSchedules({ deploymentId }: { deploymentId: string }) {
  const run = useAction();
  const canOperate = useCan("operate");
  const { data: schedules, isLoading } = useBackupSchedules(deploymentId);
  const setEnabled = useSetScheduleEnabled();
  const deleteSchedule = useDeleteSchedule();
  const [adding, setAdding] = useState(false);

  const onToggle = (id: string, enabled: boolean) =>
    run(() => setEnabled.mutateAsync({ id, enabled }));

  const onDelete = (id: string) => run(() => deleteSchedule.mutateAsync(id), "Schedule deleted");

  const columns: GridColDef<BackupSchedule>[] = [
    { field: "target", headerName: "Volume", flex: 1, minWidth: 180 },
    { field: "cron", headerName: "Schedule (cron)", width: 160 },
    { field: "retention", headerName: "Keep", width: 80 },
    {
      field: "lastRunAt",
      headerName: "Last run",
      width: 180,
      valueFormatter: (value) => (value ? new Date(value as string).toLocaleString() : "—"),
    },
    {
      field: "enabled",
      headerName: "Enabled",
      width: 100,
      renderCell: (params) => (
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Switch
            size="small"
            checked={params.row.enabled}
            onChange={(event) => void onToggle(params.row.id, event.target.checked)}
          />
        </Gated>
      ),
    },
    {
      field: "actions",
      headerName: "",
      width: 60,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <IconButton size="small" onClick={() => void onDelete(params.row.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Gated>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Schedules
        </Typography>
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            New schedule
          </Button>
        </Gated>
      </Box>

      <Box sx={{ height: 320 }}>
        <DataGrid
          rows={schedules ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          density="compact"
          disableRowSelectionOnClick
          hideFooter
          localeText={{ noRowsLabel: "No schedules yet." }}
          sx={{ border: 0 }}
        />
      </Box>

      <NewScheduleDialog
        deploymentId={deploymentId}
        open={adding}
        onClose={() => setAdding(false)}
      />
    </Box>
  );
}

function NewScheduleDialog({
  deploymentId,
  open,
  onClose,
}: {
  deploymentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const run = useAction();
  const canOperate = useCan("operate");
  const createSchedule = useCreateSchedule();

  const [containerId, setContainerId] = useState("");
  const [volume, setVolume] = useState("");
  const [cron, setCron] = useState("0 3 * * *");
  const [retention, setRetention] = useState(7);

  const { data: containers } = useDeploymentContainers(deploymentId);
  const selectedContainer = (containers ?? []).find((container) => container.id === containerId);
  const volumes = selectedContainer?.volumes ?? [];

  const reset = () => {
    setContainerId("");
    setVolume("");
    setCron("0 3 * * *");
    setRetention(7);
  };

  const onCreate = async () => {
    if (
      await run(
        () => createSchedule.mutateAsync({ target: volume, cron, retention, deploymentId }),
        "Schedule created",
      )
    ) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New backup schedule</DialogTitle>
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
            onChange={(event) => setVolume(event.target.value)}
          >
            {volumes.map((mount) => (
              <MenuItem key={mount.name} value={mount.name}>
                {mount.name} ({mount.destination})
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Cron expression"
            value={cron}
            helperText="Standard 5-field cron, e.g. 0 3 * * * (daily at 03:00)."
            onChange={(event) => setCron(event.target.value)}
          />

          <TextField
            label="Keep (most recent backups)"
            type="number"
            value={retention}
            onChange={(event) => setRetention(Math.max(1, Number(event.target.value)))}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Gated can={canOperate} reason={ROLE_REASON.operate}>
          <Button
            variant="contained"
            disabled={createSchedule.isPending || !volume || !cron.trim()}
            onClick={() => void onCreate()}
          >
            Create
          </Button>
        </Gated>
      </DialogActions>
    </Dialog>
  );
}
