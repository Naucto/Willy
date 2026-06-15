import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef, GridToolbarQuickFilter, Toolbar } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useDeleteRelease,
  useDeployment,
  useDeploymentContainers,
  useReleases,
  useRollback,
} from "../api/hooks";
import type { Deployment, Release } from "../api/types";
import { Console } from "../components/Console";
import { ALL_CONTAINERS, ContainerSelector } from "../components/ContainerSelector";
import { CopyButton } from "../components/CopyButton";
import { CronRunsTab } from "../components/CronRunsTab";
import { DeployActions } from "../components/DeployActions";
import { DomainsManager } from "../components/DomainsManager";
import { EnvVarEditor } from "../components/EnvVarEditor";
import { LogViewer } from "../components/LogViewer";
import { NetworkingTab } from "../components/NetworkingTab";
import { ResourcesTab } from "../components/ResourcesTab";
import { SettingsTab } from "../components/SettingsTab";
import { StatusBadge } from "../components/StatusBadge";
import { VolumesTab } from "../components/VolumesTab";
import { WebhookTab } from "../components/WebhookTab";
import { describeError } from "../errors";

function isRunning(deployment: Deployment): boolean {
  return (
    deployment.activeReleaseId !== null &&
    ["RUNNING", "DEGRADED", "DEPLOYING"].includes(deployment.state)
  );
}

function DetailRow({
  label,
  value,
  href,
  copyLabel,
}: {
  label: string;
  value: string | number | null | undefined;
  href?: string | undefined;
  copyLabel?: string | undefined;
}) {
  const present = value !== null && value !== undefined && value !== "";

  return (
    <Box sx={{ display: "flex", gap: 2, py: 0.5, alignItems: "center", minHeight: 32 }}>
      <Box sx={{ width: 160, color: "text.secondary", flexShrink: 0 }}>{label}</Box>
      <Box sx={{ fontFamily: "monospace", wordBreak: "break-all", flexGrow: 1 }}>
        {present && href ? (
          <Link href={href} target="_blank" rel="noopener noreferrer">
            {value}
          </Link>
        ) : present ? (
          value
        ) : (
          "—"
        )}
      </Box>
      {present && copyLabel && <CopyButton value={String(value)} label={copyLabel} />}
    </Box>
  );
}

export function DeploymentDetailPage() {
  const { id = "", section } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: deployment, isLoading, error } = useDeployment(id);
  const { data: containers } = useDeploymentContainers(id);

  // The active section is driven by the URL; the left sidebar (AppShell) navigates between sections.
  const active = section ?? "overview";

  // Resolve the focused container from the URL, falling back to the first one. Persisted in the URL
  // so switching tabs keeps focus on the same container.
  const requested = searchParams.get("container");
  const matched = containers?.find((container) => container.id === requested);
  const selected = matched ?? containers?.[0];
  const selectedId = selected?.id;

  // The Environment tab reuses the same selector but adds an "Everyone" entry (shared vars); its
  // value can be the ALL sentinel rather than a container id, and it defaults to Everyone.
  const isEnv = active === "env";
  const isCompose = deployment?.buildStrategy === "COMPOSE";
  const envValue = requested === ALL_CONTAINERS ? ALL_CONTAINERS : (matched?.id ?? ALL_CONTAINERS);
  const envService = envValue === ALL_CONTAINERS ? "" : (matched?.service ?? "");

  const selectContainer = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("container", value);
    setSearchParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !deployment) {
    return <Alert severity="error">{error ? describeError(error) : "Deployment not found"}</Alert>;
  }

  // The container dropdown is a persistent part of the deployment bar. On Environment it shows for
  // any compose stack (Everyone + each service); elsewhere only when there's more than one container
  // to focus (single-container deployments have nothing to choose).
  const containerCount = containers?.length ?? 0;
  const showSelector = isEnv
    ? isCompose && containerCount >= 1
    : containerCount > 1 && Boolean(selectedId);

  return (
    <Stack spacing={3}>
      {/* Single non-wrapping row so the actions area stays width-constrained and folds to icons
          when cramped (a wrapping row would give it a full line and never fold). The name
          ellipsizes to absorb the squeeze. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", minWidth: 0 }}>
        <Typography variant="h4" noWrap sx={{ fontWeight: 700, minWidth: 0, flexShrink: 1 }}>
          {deployment.name}
        </Typography>
        <StatusBadge status={deployment.state} />
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          {deployment.type}
        </Typography>
        {showSelector && containers && (
          <ContainerSelector
            containers={containers}
            value={isEnv ? envValue : (selectedId ?? "")}
            onChange={selectContainer}
            allowAll={isEnv}
          />
        )}
        {/* DeployActions flex-grows to fill the rest of the row and right-aligns; it folds its
            buttons to icons when that remaining space gets tight. */}
        <DeployActions deployment={deployment} onDeleted={() => navigate("/deployments")} />
      </Box>

      {active === "overview" && <OverviewTab deploymentId={id} deployment={deployment} />}
      {active === "build" && <BuildLogsTab deploymentId={id} />}
      {active === "runs" && <CronRunsTab deploymentId={id} />}
      {active === "runtime" && (
        <RuntimeLogsTab deploymentId={id} deployment={deployment} container={selectedId} />
      )}
      {active === "console" &&
        (isRunning(deployment) ? (
          <Console deploymentId={id} container={selectedId} />
        ) : (
          <Alert severity="info">Console is available while the deployment is running.</Alert>
        ))}
      {active === "env" && <EnvVarEditor deployment={deployment} service={envService} />}
      {active === "volumes" && <VolumesTab deploymentId={id} containerId={selectedId} />}
      {active === "networking" && <NetworkingTab container={selected} />}
      {active === "domains" && <DomainsManager deployment={deployment} />}
      {active === "resources" && <ResourcesTab deployment={deployment} container={selected} />}
      {active === "webhook" && <WebhookTab deployment={deployment} />}
      {active === "settings" && <SettingsTab deployment={deployment} />}
    </Stack>
  );
}

function OverviewTab({
  deploymentId,
  deployment,
}: {
  deploymentId: string;
  deployment: Deployment;
}) {
  const { data: releases } = useReleases(deploymentId);

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <DetailRow
            label="Domain"
            value={deployment.primaryDomain}
            href={deployment.primaryDomain ? `https://${deployment.primaryDomain}` : undefined}
            copyLabel="domain"
          />
          <DetailRow
            label="Repository"
            value={deployment.gitUrl}
            href={deployment.gitUrl}
            copyLabel="repository URL"
          />
          <DetailRow label="Ref" value={deployment.gitRef} />
          <DetailRow label="Build strategy" value={deployment.buildStrategy} />
          <DetailRow label="Service port" value={deployment.webServicePort} />
          <DetailRow label="Health check" value={deployment.healthCheckPath} />
          <DetailRow label="Restart policy" value={deployment.restartPolicy} />
          <DetailRow label="Memory limit (MB)" value={deployment.memoryLimitMb} />
        </CardContent>
      </Card>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Releases
        </Typography>
        {releases && releases.length > 0 ? (
          <ReleasesGrid
            releases={releases}
            deploymentId={deploymentId}
            activeReleaseId={deployment.activeReleaseId}
            deploymentState={deployment.state}
            deploymentUpdatedAt={deployment.updatedAt}
            height={380}
          />
        ) : (
          <Alert severity="info">No releases yet. Trigger a deploy.</Alert>
        )}
      </Box>
    </Stack>
  );
}

function PickerToolbar({ title }: { title: string }) {
  // The new-style Toolbar provides the context GridToolbarQuickFilter needs in MUI X v9.
  return (
    <Toolbar>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, flexGrow: 1, pl: 1 }}>
        {title}
      </Typography>
      <GridToolbarQuickFilter />
    </Toolbar>
  );
}

// Shared releases grid: "manage" mode (Overview) shows copy buttons + a Rollback action and
// highlights the active release; "select" mode (passing onSelect, used by the build-log picker)
// makes rows clickable and shows a titled toolbar instead.
function ReleasesGrid({
  releases,
  activeReleaseId,
  deploymentId,
  height,
  onSelect,
  toolbarTitle,
  deploymentState,
  deploymentUpdatedAt,
}: {
  releases: Release[];
  activeReleaseId: string | null;
  deploymentId: string;
  height: number;
  onSelect?: (releaseId: string) => void;
  toolbarTitle?: string;
  deploymentState?: string;
  deploymentUpdatedAt?: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const rollback = useRollback(deploymentId);
  const deleteRelease = useDeleteRelease(deploymentId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const selectMode = onSelect !== undefined;

  // Keep the clicked Rollback's spinner on (and the others disabled) until the deployment
  // settles — same model as the lifecycle action buttons.
  const [pendingRollbackId, setPendingRollbackId] = useState<string | null>(null);
  const rollbackBase = useRef<string | null>(null);

  useEffect(() => {
    if (pendingRollbackId === null) {
      return;
    }

    if (deploymentUpdatedAt !== rollbackBase.current && deploymentState !== "DEPLOYING") {
      rollbackBase.current = null;
      setPendingRollbackId(null);
    }
  }, [deploymentUpdatedAt, deploymentState, pendingRollbackId]);

  const rollbackBusy = pendingRollbackId !== null || deploymentState === "DEPLOYING";

  const onRollback = async (releaseId: string) => {
    rollbackBase.current = deploymentUpdatedAt ?? null;
    setPendingRollbackId(releaseId);

    try {
      await rollback.mutateAsync(releaseId);
      enqueueSnackbar("Rollback queued", { variant: "success" });
    } catch (error) {
      rollbackBase.current = null;
      setPendingRollbackId(null);
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  const columns: GridColDef<Release>[] = [
    {
      field: "status",
      headerName: "Status",
      width: 150,
      renderCell: (params) => <StatusBadge status={params.row.status} />,
    },
    {
      field: "commit",
      headerName: "Commit",
      width: 150,
      sortable: false,
      valueGetter: (_value, row) => row.gitSha ?? "",
      renderCell: (params) =>
        params.row.gitSha ? (
          <Box sx={{ display: "flex", alignItems: "center", fontFamily: "monospace" }}>
            {params.row.gitSha.slice(0, 8)}
            {!selectMode && <CopyButton value={params.row.gitSha} label="commit" />}
          </Box>
        ) : (
          "—"
        ),
    },
    {
      field: "imageTag",
      headerName: "Image",
      flex: 1,
      minWidth: 220,
      valueGetter: (_value, row) => row.imageTag ?? "",
      renderCell: (params) =>
        params.row.imageTag ? (
          <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, fontFamily: "monospace" }}>
            <Box sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>{params.row.imageTag}</Box>
            {!selectMode && <CopyButton value={params.row.imageTag} label="image" />}
          </Box>
        ) : (
          "—"
        ),
    },
    {
      field: "queuedAt",
      headerName: "Queued",
      width: 190,
      valueFormatter: (value) => new Date(value as string).toLocaleString(),
    },
  ];

  const onDelete = async (releaseId: string) => {
    try {
      await deleteRelease.mutateAsync(releaseId);
      enqueueSnackbar("Release deleted", { variant: "success" });
      setPendingDeleteId(null);
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  if (!selectMode) {
    columns.push({
      field: "actions",
      headerName: "",
      width: 170,
      sortable: false,
      filterable: false,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => (
        <Box>
          {params.row.imageTag && params.row.id !== activeReleaseId && (
            <Button
              size="small"
              disabled={rollbackBusy}
              startIcon={
                pendingRollbackId === params.row.id ? (
                  <CircularProgress size={16} color="inherit" />
                ) : undefined
              }
              onClick={() => void onRollback(params.row.id)}
            >
              Rollback
            </Button>
          )}
          {params.row.id !== activeReleaseId && (
            <Tooltip title="Delete release">
              <IconButton
                size="small"
                disabled={deleteRelease.isPending}
                onClick={() => setPendingDeleteId(params.row.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    });
  }

  return (
    <Box sx={{ height }}>
      <DataGrid
        rows={releases}
        columns={columns}
        getRowId={(row) => row.id}
        getRowClassName={(params) => (params.id === activeReleaseId ? "willy-active" : "")}
        showToolbar
        {...(onSelect ? { onRowClick: (params) => onSelect(params.row.id) } : {})}
        {...(toolbarTitle
          ? { slots: { toolbar: () => <PickerToolbar title={toolbarTitle} /> } }
          : {})}
        density="compact"
        disableRowSelectionOnClick
        initialState={{
          sorting: { sortModel: [{ field: "queuedAt", sort: "desc" }] },
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        sx={{
          border: 0,
          "& .willy-active": { bgcolor: "action.selected" },
          ...(selectMode ? { "& .MuiDataGrid-row": { cursor: "pointer" } } : {}),
        }}
      />

      <Dialog
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        maxWidth="xs"
      >
        <DialogTitle>Delete this release?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Removes the release's container and image. This can't be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteRelease.isPending}
            onClick={() => pendingDeleteId && void onDelete(pendingDeleteId)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function RuntimeLogsTab({
  deploymentId,
  deployment,
  container,
}: {
  deploymentId: string;
  deployment: Deployment;
  container?: string | undefined;
}) {
  if (!deployment.activeReleaseId) {
    return <Alert severity="info">No deployment yet — trigger a deploy to see runtime logs.</Alert>;
  }

  const running = ["RUNNING", "DEGRADED", "DEPLOYING"].includes(deployment.state);

  if (!running) {
    return (
      <Alert severity="info">
        Deployment is not running ({deployment.state}). Runtime logs appear while the container
        runs.
      </Alert>
    );
  }

  const path = container
    ? `/deployments/${deploymentId}/logs?container=${encodeURIComponent(container)}`
    : `/deployments/${deploymentId}/logs`;

  // Re-mount on container change so the viewer resets and re-tails the new container.
  return <LogViewer key={container ?? "default"} path={path} />;
}

function releaseSummary(release: Release): string {
  const ref = release.gitSha?.slice(0, 8) ?? release.id.slice(0, 8);

  return `${release.status} · ${ref} · ${new Date(release.queuedAt).toLocaleString()}`;
}

function BuildLogsTab({ deploymentId }: { deploymentId: string }) {
  const { data: releases } = useReleases(deploymentId);
  const [releaseId, setReleaseId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Default to the most recent release once they load.
  useEffect(() => {
    const first = releases?.[0];

    if (!releaseId && first) {
      setReleaseId(first.id);
    }
  }, [releases, releaseId]);

  if (!releases || releases.length === 0) {
    return <Alert severity="info">No releases yet. Trigger a deploy to see build logs.</Alert>;
  }

  const current = releases.find((release) => release.id === releaseId);

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Button variant="outlined" onClick={() => setPickerOpen(true)}>
          Choose release
        </Button>
        {current && (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {releaseSummary(current)}
          </Typography>
        )}
      </Box>

      {releaseId && <LogViewer key={releaseId} path={`/releases/${releaseId}/logs`} />}

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} fullWidth maxWidth="md">
        <DialogContent sx={{ p: 0 }}>
          <ReleasesGrid
            releases={releases}
            activeReleaseId={releaseId || null}
            deploymentId={deploymentId}
            height={480}
            toolbarTitle="Select a release"
            onSelect={(id) => {
              setReleaseId(id);
              setPickerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
