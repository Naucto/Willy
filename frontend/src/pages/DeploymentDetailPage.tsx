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
  Link,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useDeleteRelease,
  useDeployment,
  useDeploymentContainers,
  useDeploymentTransition,
  useReleases,
  useRollback,
} from "../api/hooks";
import type { Deployment, Release } from "../api/types";
import { ROLE_REASON, useCan } from "../auth/permissions";
import { ALL_CONTAINERS, ContainerSelector } from "../components/ContainerSelector";
import { CopyButton } from "../components/CopyButton";
import { CronRunsTab } from "../components/CronRunsTab";
import { DeployActions } from "../components/DeployActions";
import { DeploymentBackupsTab } from "../components/DeploymentBackupsTab";
import { DomainsManager } from "../components/DomainsManager";
import { EnvVarEditor } from "../components/EnvVarEditor";
import { HealthTab } from "../components/HealthTab";
import { LogViewer } from "../components/LogViewer";
import { NetworkingTab } from "../components/NetworkingTab";
import { OperateButton, OperateIconButton } from "../components/OperateButton";
import { PageLoader } from "../components/PageLoader";
import { ResourcesTab } from "../components/ResourcesTab";
import { DeploymentUtilization } from "../components/ResourceUtilization";
import { SelectOption } from "../components/SelectOption";
import { SettingsTab } from "../components/SettingsTab";
import { StatusBadge } from "../components/StatusBadge";
import { VolumesTab } from "../components/VolumesTab";
import { WebhookTab } from "../components/WebhookTab";
import { describeError } from "../errors";
import { formatRelativeTime, humanizeType } from "../format";
import { useAction } from "../useAction";

// The console pulls in the xterm terminal and monitoring pulls in the charting lib; both are split out
// so those heavy deps load only when their tab is opened.
const Console = lazy(() => import("../components/Console").then((m) => ({ default: m.Console })));
const MonitoringTab = lazy(() =>
  import("../components/MonitoringTab").then((m) => ({ default: m.MonitoringTab })),
);

// Tabs whose content is scoped to a single container; only these show the container selector
// (Environment is handled separately, with an extra "Everyone" entry). Volumes/Networking show all
// containers at once (so the mapping is visible), so they're deliberately not here.
const CONTAINER_SCOPED = new Set(["runtime", "console", "resources", "health"]);

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
  const transition = useDeploymentTransition(id);
  const canOperate = useCan("operate");

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

  // The Build logs tab picks a release the same way container-scoped tabs pick a container: a
  // selector in the deployment bar, persisted in the URL (?release=).
  const releaseParam = searchParams.get("release") ?? "";
  const selectRelease = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("release", value);
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
  // any compose stack (Everyone + each service); on the genuinely container-scoped tabs it shows
  // only when there's more than one container to focus. It is hidden everywhere else (Overview,
  // Build — build logs are per-release, not per-container — Runs, Domains, Webhook, Settings).
  const containerCount = containers?.length ?? 0;
  const showSelector = isEnv
    ? isCompose && containerCount >= 1
    : CONTAINER_SCOPED.has(active) && containerCount > 1 && Boolean(selectedId);

  return (
    <Stack spacing={3}>
      {/* Single non-wrapping row so the actions area stays width-constrained and folds to icons
          when cramped (a wrapping row would give it a full line and never fold). The name
          ellipsizes to absorb the squeeze. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap", minWidth: 0 }}>
        <Typography variant="h4" noWrap sx={{ fontWeight: 700, minWidth: 0, flexShrink: 1 }}>
          {deployment.name}
        </Typography>
        <StatusBadge status={transition ?? deployment.state} />
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
          {humanizeType(deployment.type)}
        </Typography>
        {showSelector && containers && (
          <ContainerSelector
            containers={containers}
            value={isEnv ? envValue : (selectedId ?? "")}
            onChange={selectContainer}
            allowAll={isEnv}
          />
        )}
        {active === "build" && (
          <ReleaseSelector deploymentId={id} value={releaseParam} onChange={selectRelease} />
        )}
        {/* DeployActions flex-grows to fill the rest of the row and right-aligns; it folds its
            buttons to icons when that remaining space gets tight. */}
        <DeployActions
          deployment={deployment}
          onDeleted={() => navigate("/deployments", { replace: true })}
        />
      </Box>

      {/* Suspense covers the lazily-loaded Console (xterm) and Monitoring (charts) tabs. */}
      <Suspense fallback={<PageLoader />}>
        {active === "overview" && <OverviewTab deploymentId={id} deployment={deployment} />}
        {active === "build" && <BuildLogsTab deploymentId={id} releaseId={releaseParam} />}
        {active === "runs" && <CronRunsTab deploymentId={id} />}
        {active === "runtime" && (
          <RuntimeLogsTab deploymentId={id} deployment={deployment} container={selectedId} />
        )}
        {active === "console" &&
          (!canOperate ? (
            // The console runs commands inside the container — never connect it for a read-only role.
            <Alert severity="warning">{ROLE_REASON.operate} to use the console.</Alert>
          ) : isRunning(deployment) ? (
            <Console deploymentId={id} container={selectedId} />
          ) : (
            <Alert severity="info">Console is available while the deployment is running.</Alert>
          ))}
        {active === "env" && <EnvVarEditor deployment={deployment} service={envService} />}
        {active === "volumes" && <VolumesTab deploymentId={id} />}
        {active === "backups" && <DeploymentBackupsTab deploymentId={id} />}
        {active === "networking" && <NetworkingTab deploymentId={id} />}
        {active === "domains" && <DomainsManager deployment={deployment} />}
        {active === "resources" && <ResourcesTab deployment={deployment} container={selected} />}
        {active === "monitoring" && <MonitoringTab deployment={deployment} />}
        {active === "health" && <HealthTab deployment={deployment} container={selected} />}
        {active === "webhook" && <WebhookTab deployment={deployment} />}
        {active === "settings" && <SettingsTab deployment={deployment} />}
      </Suspense>
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
      <DeploymentUtilization deploymentId={deploymentId} />

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

// The releases grid on Overview: copy buttons + a Rollback action, highlighting the active release.
function ReleasesGrid({
  releases,
  activeReleaseId,
  deploymentId,
  height,
  deploymentState,
  deploymentUpdatedAt,
}: {
  releases: Release[];
  activeReleaseId: string | null;
  deploymentId: string;
  height: number;
  deploymentState?: string;
  deploymentUpdatedAt?: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const run = useAction();
  const canOperate = useCan("operate");
  const rollback = useRollback(deploymentId);
  const deleteRelease = useDeleteRelease(deploymentId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
            <CopyButton value={params.row.gitSha} label="commit" />
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
            <CopyButton value={params.row.imageTag} label="image" />
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
    if (await run(() => deleteRelease.mutateAsync(releaseId), "Release deleted")) {
      setPendingDeleteId(null);
    }
  };

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
          <OperateButton
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
          </OperateButton>
        )}
        {params.row.id !== activeReleaseId && (
          <Tooltip title={canOperate ? "Delete release" : ROLE_REASON.operate}>
            <span>
              <OperateIconButton
                size="small"
                disabled={deleteRelease.isPending}
                onClick={() => setPendingDeleteId(params.row.id)}
              >
                <DeleteIcon fontSize="small" />
              </OperateIconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    ),
  });

  return (
    <Box sx={{ height }}>
      <DataGrid
        rows={releases}
        columns={columns}
        getRowId={(row) => row.id}
        getRowClassName={(params) => (params.id === activeReleaseId ? "willy-active" : "")}
        showToolbar
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

function releaseRef(release: Release): string {
  return release.gitSha?.slice(0, 8) ?? release.id.slice(0, 8);
}

function releaseCaption(release: Release): string {
  const when = formatRelativeTime(new Date(release.queuedAt).getTime() / 1000);

  return release.imageTag ? `${release.imageTag} · ${when}` : when;
}

// The release picker lives in the deployment bar (see ReleaseSelector); this just renders the log
// stream for the selected release, defaulting to the most recent until one is chosen.
function BuildLogsTab({ deploymentId, releaseId }: { deploymentId: string; releaseId: string }) {
  const { data: releases } = useReleases(deploymentId);

  if (!releases || releases.length === 0) {
    return <Alert severity="info">No releases yet. Trigger a deploy to see build logs.</Alert>;
  }

  const effective = releaseId || releases[0]?.id || "";

  if (!effective) {
    return <Alert severity="info">No releases yet. Trigger a deploy to see build logs.</Alert>;
  }

  return <LogViewer key={effective} path={`/releases/${effective}/logs`} />;
}

// Release picker for the Build logs tab, shown in the deployment bar like the container selector.
// Defaults to (displays) the most recent release until the user explicitly picks one.
function ReleaseSelector({
  deploymentId,
  value,
  onChange,
}: {
  deploymentId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: releases } = useReleases(deploymentId);

  if (!releases || releases.length === 0) {
    return null;
  }

  const effective = value || releases[0]?.id || "";

  const labelFor = (id: string): string => {
    const release = releases.find((candidate) => candidate.id === id);

    return release ? `${release.status} · ${releaseRef(release)}` : "";
  };

  return (
    <TextField
      select
      size="small"
      label="Release"
      value={effective}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 240 }}
      slotProps={{ select: { renderValue: (v) => labelFor(v as string) } }}
    >
      {releases.map((release) => (
        <MenuItem key={release.id} value={release.id}>
          <SelectOption
            title={releaseRef(release)}
            status={<StatusBadge status={release.status} />}
            caption={releaseCaption(release)}
          />
        </MenuItem>
      ))}
    </TextField>
  );
}
