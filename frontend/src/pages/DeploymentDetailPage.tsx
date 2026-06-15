import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogTitle,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDeployment, useReleases, useRollback } from "../api/hooks";
import type { Deployment, Release } from "../api/types";
import { Console } from "../components/Console";
import { CopyButton } from "../components/CopyButton";
import { DeployActions } from "../components/DeployActions";
import { EnvVarEditor } from "../components/EnvVarEditor";
import { LogViewer } from "../components/LogViewer";
import { SettingsTab } from "../components/SettingsTab";
import { StatusBadge } from "../components/StatusBadge";
import { describeError } from "../errors";

type TabKey = "overview" | "build" | "runtime" | "console" | "env" | "settings";

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
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: deployment, isLoading, error } = useDeployment(id);
  const [tab, setTab] = useState<TabKey>("overview");

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

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {deployment.name}
        </Typography>
        <StatusBadge status={deployment.state} />
        <Typography variant="body2" color="text.secondary">
          {deployment.type}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <DeployActions deployment={deployment} onDeleted={() => navigate("/deployments")} />
      </Box>

      <Tabs value={tab} onChange={(_, value: TabKey) => setTab(value)}>
        <Tab label="Overview" value="overview" />
        <Tab label="Build logs" value="build" />
        <Tab label="Runtime logs" value="runtime" />
        <Tab label="Console" value="console" />
        <Tab label="Env" value="env" />
        <Tab label="Settings" value="settings" />
      </Tabs>

      {tab === "overview" && <OverviewTab deploymentId={id} deployment={deployment} />}
      {tab === "build" && <BuildLogsTab deploymentId={id} />}
      {tab === "runtime" && <RuntimeLogsTab deploymentId={id} deployment={deployment} />}
      {tab === "console" &&
        (isRunning(deployment) ? (
          <Console deploymentId={id} />
        ) : (
          <Alert severity="info">Console is available while the deployment is running.</Alert>
        ))}
      {tab === "env" && <EnvVarEditor deploymentId={id} />}
      {tab === "settings" && <SettingsTab deployment={deployment} />}
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
        <ReleasesTable
          releases={releases}
          deploymentId={deploymentId}
          activeReleaseId={deployment.activeReleaseId}
        />
      </Box>
    </Stack>
  );
}

function ReleasesTable({
  releases,
  deploymentId,
  activeReleaseId,
}: {
  releases: Release[] | undefined;
  deploymentId: string;
  activeReleaseId: string | null;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const rollback = useRollback(deploymentId);

  if (!releases || releases.length === 0) {
    return <Alert severity="info">No releases yet. Trigger a deploy.</Alert>;
  }

  const onRollback = async (releaseId: string) => {
    try {
      await rollback.mutateAsync(releaseId);
      enqueueSnackbar("Rollback queued", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(describeError(error), { variant: "error" });
    }
  };

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Status</TableCell>
          <TableCell>Commit</TableCell>
          <TableCell>Image</TableCell>
          <TableCell>Queued</TableCell>
          <TableCell align="right" />
        </TableRow>
      </TableHead>
      <TableBody>
        {releases.map((release) => (
          <TableRow key={release.id} selected={release.id === activeReleaseId}>
            <TableCell>
              <StatusBadge status={release.status} />
            </TableCell>
            <TableCell sx={{ fontFamily: "monospace" }}>
              {release.gitSha ? (
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  {release.gitSha.slice(0, 8)}
                  <CopyButton value={release.gitSha} label="commit" />
                </Box>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell sx={{ fontFamily: "monospace" }}>
              {release.imageTag ? (
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  {release.imageTag}
                  <CopyButton value={release.imageTag} label="image" />
                </Box>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{new Date(release.queuedAt).toLocaleString()}</TableCell>
            <TableCell align="right">
              {release.imageTag && release.id !== activeReleaseId && (
                <Button
                  size="small"
                  disabled={rollback.isPending}
                  onClick={() => void onRollback(release.id)}
                >
                  Rollback
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RuntimeLogsTab({
  deploymentId,
  deployment,
}: {
  deploymentId: string;
  deployment: Deployment;
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

  return <LogViewer path={`/deployments/${deploymentId}/logs`} />;
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

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Select a release</DialogTitle>
        <List sx={{ pt: 0 }}>
          {releases.map((release) => (
            <ListItemButton
              key={release.id}
              selected={release.id === releaseId}
              onClick={() => {
                setReleaseId(release.id);
                setPickerOpen(false);
              }}
            >
              <ListItemText
                primary={releaseSummary(release)}
                secondary={release.imageTag ?? undefined}
                slotProps={{
                  primary: { sx: { fontFamily: "monospace", fontSize: 13 } },
                  secondary: { sx: { fontFamily: "monospace", fontSize: 12 } },
                }}
              />
            </ListItemButton>
          ))}
        </List>
      </Dialog>
    </Stack>
  );
}
