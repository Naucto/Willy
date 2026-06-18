import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useAuditLogs } from "../api/hooks";
import type { AuditLog } from "../api/types";
import { describeError } from "../errors";

const columns: GridColDef<AuditLog>[] = [
  {
    field: "createdAt",
    headerName: "When",
    width: 180,
    valueFormatter: (value) => new Date(value as string).toLocaleString(),
  },
  {
    field: "actorEmail",
    headerName: "Actor",
    flex: 1,
    minWidth: 180,
    valueGetter: (_value, row) => row.actorEmail ?? "—",
  },
  {
    field: "action",
    headerName: "Action",
    width: 170,
    renderCell: (params) => <Chip size="small" label={params.row.action} variant="outlined" />,
  },
  {
    field: "target",
    headerName: "Target",
    flex: 1,
    minWidth: 200,
    sortable: false,
    valueGetter: (_value, row) =>
      row.targetType ? `${row.targetType}: ${row.targetId ?? ""}` : "—",
  },
  { field: "ip", headerName: "IP", width: 140, valueGetter: (_value, row) => row.ip ?? "—" },
];

export function AuditPage() {
  const { data, isLoading, error } = useAuditLogs();

  return (
    <Stack spacing={3}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>
        Audit log
      </Typography>

      {error && <Alert severity="error">{describeError(error)}</Alert>}

      <Box sx={{ height: 600 }}>
        <DataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          showToolbar
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          localeText={{ noRowsLabel: "No audit entries yet." }}
          sx={{ border: 0 }}
        />
      </Box>
    </Stack>
  );
}
