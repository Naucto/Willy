import { Alert, Box, Card, CardContent, Stack, Typography } from "@mui/material";
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
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="overline" color="text.secondary">
            Networks — {container.name}
          </Typography>

          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This container isn't attached to any network.
            </Typography>
          ) : (
            <Box sx={{ width: "100%" }}>
              <DataGrid
                rows={rows}
                columns={columns}
                getRowId={(row) => row.name}
                density="compact"
                autoHeight
                hideFooter
                disableRowSelectionOnClick
                sx={{ border: 0 }}
              />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
