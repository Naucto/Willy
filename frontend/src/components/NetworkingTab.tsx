import { Box, Chip, CircularProgress, Stack } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useDeploymentContainers } from "../api/hooks";
import type { Container } from "../api/types";

interface NetworkRow {
  id: string;
  container: string;
  networks: Container["networks"];
  ports: number[];
}

// Read-only overview of every container's network attachments, assigned IPs, and the ports its
// image exposes — so it's clear which container maps to what. (Attach/detach is a later iteration.)
export function NetworkingTab({ deploymentId }: { deploymentId: string }) {
  const { data: containers, isLoading } = useDeploymentContainers(deploymentId);

  const rows: NetworkRow[] = (containers ?? []).map((container) => ({
    id: container.id,
    container: container.name,
    networks: container.networks,
    ports: container.exposedPorts,
  }));

  const columns: GridColDef<NetworkRow>[] = [
    { field: "container", headerName: "Container", flex: 1, minWidth: 200 },
    {
      field: "networks",
      headerName: "Networks",
      flex: 1,
      minWidth: 220,
      sortable: false,
      renderCell: (params) =>
        params.row.networks.length > 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {params.row.networks.map((net) => (
              <Box key={net.name}>{net.ip ? `${net.name} (${net.ip})` : net.name}</Box>
            ))}
          </Box>
        ) : (
          "—"
        ),
    },
    {
      field: "ports",
      headerName: "Exposed ports",
      width: 200,
      sortable: false,
      renderCell: (params) =>
        params.row.ports.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {params.row.ports.map((port) => (
              <Chip key={port} label={port} size="small" variant="outlined" />
            ))}
          </Box>
        ) : (
          "—"
        ),
    },
  ];

  if (isLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          density="compact"
          autoHeight
          hideFooter
          getRowHeight={() => "auto"}
          disableRowSelectionOnClick
          localeText={{
            noRowsLabel: "No running containers — networking appears once they're up.",
          }}
          sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
        />
      </Box>

      <Box sx={{ fontSize: 12, color: "text.secondary" }}>
        Each container's networks, assigned IPs, and the ports its image exposes. Attach/detach is a
        later iteration.
      </Box>
    </Stack>
  );
}
