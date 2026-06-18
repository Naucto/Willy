import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAdminContainers, useAppSettings, usePruneContainers } from "../api/hooks";
import type { AdminContainer } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { describeError } from "../errors";
import { formatRelativeTime } from "../format";

const STATE_COLOR: Record<string, "success" | "error" | "info" | "default" | "warning"> = {
  running: "success",
  exited: "default",
  created: "info",
  paused: "warning",
  restarting: "warning",
  dead: "error",
};

export function ContainersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [pruneConfirm, setPruneConfirm] = useState(false);

  const { data: settings } = useAppSettings();
  const showAll = settings?.showAllResources ?? false;
  const { data: containers, isLoading, error } = useAdminContainers(showAll);
  const pruneContainers = usePruneContainers();

  const stoppedCount = (containers ?? []).filter((c) => c.state !== "running").length;

  const onPrune = async () => {
    try {
      const result = await pruneContainers.mutateAsync();
      enqueueSnackbar(
        `Removed ${result.itemsRemoved} container(s) — ${result.spaceReclaimedBytes > 0 ? `${String(result.spaceReclaimedBytes)} B reclaimed` : "no space reclaimed"}`,
        { variant: "success" },
      );
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    } finally {
      setPruneConfirm(false);
    }
  };

  const columns: GridColDef<AdminContainer>[] = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 180,
    },
    {
      field: "state",
      headerName: "Status",
      width: 130,
      renderCell: (params) => {
        const state: string = params.value as string;
        const color = STATE_COLOR[state] ?? "default";

        return (
          <Chip
            label={params.row.status || state}
            color={color}
            size="small"
            sx={{ maxWidth: 120 }}
          />
        );
      },
    },
    {
      field: "image",
      headerName: "Image",
      flex: 1,
      minWidth: 180,
    },
    {
      field: "deployment",
      headerName: "Deployment",
      width: 180,
      sortable: false,
      renderCell: (params) => {
        const dep = params.row.deployment;

        if (!dep) {
          return (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              —
            </Typography>
          );
        }

        return (
          <Chip
            label={dep.name}
            size="small"
            component={RouterLink}
            to={`/deployments/${dep.id}`}
            clickable
          />
        );
      },
    },
    {
      field: "created",
      headerName: "Created",
      width: 120,
      valueFormatter: (value: number) => formatRelativeTime(value),
    },
    {
      field: "actions",
      headerName: "",
      width: 90,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => {
        const dep = params.row.deployment;
        const isRunning = params.row.state === "running";

        return (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Tooltip title={dep && isRunning ? "Go to logs" : "No logs available"}>
              <span>
                <IconButton
                  size="small"
                  disabled={!dep || !isRunning}
                  component={dep && isRunning ? RouterLink : "button"}
                  to={dep ? `/deployments/${dep.id}/runtime` : undefined}
                >
                  <ArticleOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={dep ? "Go to deployment" : "No associated deployment"}>
              <span>
                <IconButton
                  size="small"
                  disabled={!dep}
                  component={dep ? RouterLink : "button"}
                  to={dep ? `/deployments/${dep.id}` : undefined}
                >
                  <RocketLaunchIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Containers
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="outlined"
          onClick={() => setPruneConfirm(true)}
          disabled={stoppedCount === 0}
        >
          Prune stopped{stoppedCount > 0 ? ` (${stoppedCount})` : ""}
        </Button>
      </Box>

      {error && <Alert severity="error">{describeError(error)}</Alert>}

      <Box sx={{ height: 540 }}>
        <DataGrid
          rows={containers ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          showToolbar
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 0 }}
        />
      </Box>

      <ConfirmDialog
        open={pruneConfirm}
        title="Prune stopped containers"
        message={`Remove all ${stoppedCount} stopped container(s)? Running containers are not affected.`}
        confirmLabel="Prune"
        onConfirm={() => void onPrune()}
        onCancel={() => setPruneConfirm(false)}
      />
    </Stack>
  );
}
