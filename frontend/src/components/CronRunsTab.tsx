import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useState } from "react";
import { useCronRuns, useRunCron } from "../api/hooks";
import type { CronRun } from "../api/types";
import { useAction } from "../useAction";

const STATUS_COLOR: Record<string, "info" | "success" | "error"> = {
  RUNNING: "info",
  SUCCESS: "success",
  FAILED: "error",
};

export function CronRunsTab({ deploymentId }: { deploymentId: string }) {
  const run = useAction();
  const { data: runs, isLoading } = useCronRuns(deploymentId);
  const runNow = useRunCron(deploymentId);
  const [logRun, setLogRun] = useState<CronRun | null>(null);

  const onRunNow = () => run(() => runNow.mutateAsync(), "Run started");

  const columns: GridColDef<CronRun>[] = [
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (params) => (
        <Chip size="small" label={params.row.status} color={STATUS_COLOR[params.row.status]} />
      ),
    },
    {
      field: "exitCode",
      headerName: "Exit",
      width: 80,
      valueFormatter: (value) => (value === null || value === undefined ? "—" : String(value)),
    },
    {
      field: "startedAt",
      headerName: "Started",
      width: 190,
      valueFormatter: (value) => new Date(value as string).toLocaleString(),
    },
    {
      field: "finishedAt",
      headerName: "Finished",
      width: 190,
      valueFormatter: (value) => (value ? new Date(value as string).toLocaleString() : "—"),
    },
    {
      field: "logs",
      headerName: "",
      flex: 1,
      minWidth: 120,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => (
        <Button size="small" disabled={!params.row.logs} onClick={() => setLogRun(params.row)}>
          View logs
        </Button>
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Each run executes the run command on the schedule; recent runs are kept here.
        </Typography>
        <Button variant="contained" disabled={runNow.isPending} onClick={() => void onRunNow()}>
          Run now
        </Button>
      </Box>

      {runs && runs.length === 0 ? (
        <Alert severity="info">
          No runs yet — they appear here on the schedule, or use “Run now”.
        </Alert>
      ) : (
        <Box sx={{ height: 480 }}>
          <DataGrid
            rows={runs ?? []}
            columns={columns}
            loading={isLoading}
            getRowId={(row) => row.id}
            density="compact"
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{ border: 0 }}
          />
        </Box>
      )}

      <Dialog open={logRun !== null} onClose={() => setLogRun(null)} fullWidth maxWidth="md">
        <DialogTitle>Run logs</DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              bgcolor: "#0d1117",
              color: "#c9d1d9",
              borderRadius: 1,
              overflow: "auto",
              maxHeight: "60vh",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {logRun?.logs ?? ""}
          </Box>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
