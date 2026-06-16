import { Alert, Box, Stack } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import type { Container } from "../api/types";

interface NetworkRow {
  name: string;
  ip: string;
}

// Read-only view of a container's networks + IPs. (Attach/detach is a later iteration.)
export function NetworkingTab({ container }: { container?: Container | undefined }) {
  if (!container) {
    return <Alert severity="info">No running container — networking appears once it's up.</Alert>;
  }

  const rows: NetworkRow[] = container.networks.map((net) => ({
    name: net.name,
    ip: net.ip ?? "—",
  }));

  const columns: GridColDef<NetworkRow>[] = [
    { field: "name", headerName: "Network", flex: 1, minWidth: 220 },
    { field: "ip", headerName: "IP address", width: 200 },
  ];

  return (
    <Stack spacing={2}>
      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.name}
          density="compact"
          autoHeight
          hideFooter
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: "This container isn't attached to any network." }}
          sx={{ border: 0 }}
        />
      </Box>

      <Box sx={{ fontSize: 12, color: "text.secondary" }}>
        Networks for {container.name}. Attach/detach is a later iteration.
      </Box>
    </Stack>
  );
}
