import { Box, CircularProgress, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { useDeploymentStats, useSystemStats } from "../api/hooks";
import { formatBytes } from "../format";

// Panel shell shown while stats load (or briefly while a deploy is transitioning), so the
// utilization section is always present rather than popping in.
function UtilizationShell({ title }: { title: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        {title}
      </Typography>
      <Box sx={{ display: "grid", placeItems: "center", py: 3 }}>
        <CircularProgress size={22} />
      </Box>
    </Paper>
  );
}

function UsageBar({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: number | null;
  detail: string;
  color?: "primary" | "warning" | "error";
}) {
  const pct = value === null ? null : Math.max(0, Math.min(100, value));

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {detail}
        </Typography>
      </Box>
      <LinearProgress
        variant={pct === null ? "indeterminate" : "determinate"}
        value={pct ?? 0}
        color={color ?? "primary"}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
}

function memColor(ratio: number): "primary" | "warning" | "error" {
  if (ratio >= 0.9) return "error";
  if (ratio >= 0.75) return "warning";
  return "primary";
}

// Live per-deployment CPU / memory (+ swap) / storage, polled while the tab is open.
export function DeploymentUtilization({ deploymentId }: { deploymentId: string }) {
  const { data: stats } = useDeploymentStats(deploymentId);

  if (!stats) {
    return <UtilizationShell title="Live utilization" />;
  }

  const cpuCeiling = stats.cpuCores ? stats.cpuCores * 100 : null;
  const cpuDetail = cpuCeiling ? `${stats.cpuPercent}% of ${cpuCeiling}%` : `${stats.cpuPercent}%`;
  const memRatio = stats.memLimitBytes ? stats.memUsageBytes / stats.memLimitBytes : 0;

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        Live utilization
      </Typography>

      <Stack spacing={2} sx={{ mt: 1 }}>
        <UsageBar
          label="CPU"
          value={cpuCeiling ? (stats.cpuPercent / cpuCeiling) * 100 : stats.cpuPercent}
          detail={cpuDetail}
        />
        <UsageBar
          label="Memory"
          value={stats.memLimitBytes ? memRatio * 100 : null}
          detail={
            stats.memLimitBytes
              ? `${formatBytes(stats.memUsageBytes)} / ${formatBytes(stats.memLimitBytes)}`
              : formatBytes(stats.memUsageBytes)
          }
          color={memColor(memRatio)}
        />
        {stats.swapBytes > 0 && (
          <UsageBar label="Swap" value={null} detail={formatBytes(stats.swapBytes)} />
        )}
        <UsageBar
          label="Volume storage"
          value={null}
          detail={
            stats.volumes.length > 0
              ? `${formatBytes(stats.storageBytes)} · ${stats.volumes.length} volume(s)`
              : formatBytes(stats.storageBytes)
          }
        />
      </Stack>
    </Paper>
  );
}

// Global host overview: aggregate CPU/memory across running containers and disk usage by category.
export function SystemUtilization() {
  const { data: stats } = useSystemStats();

  if (!stats) {
    return <UtilizationShell title="Host utilization" />;
  }

  const cpuCeiling = stats.cpus * 100;
  const memRatio = stats.memTotalBytes ? stats.memUsageBytes / stats.memTotalBytes : 0;
  const disk = stats.disk;
  const diskTotal =
    disk.imagesBytes + disk.containersBytes + disk.volumesBytes + disk.buildCacheBytes;

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        Host utilization
      </Typography>

      <Stack spacing={2} sx={{ mt: 1 }}>
        <UsageBar
          label="CPU"
          value={(stats.cpuPercent / cpuCeiling) * 100}
          detail={`${stats.cpuPercent}% of ${stats.cpus} core(s)`}
        />
        <UsageBar
          label="Memory"
          value={memRatio * 100}
          detail={`${formatBytes(stats.memUsageBytes)} / ${formatBytes(stats.memTotalBytes)}`}
          color={memColor(memRatio)}
        />
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Disk
            </Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatBytes(diskTotal)}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Images {formatBytes(disk.imagesBytes)} · Volumes {formatBytes(disk.volumesBytes)} ·
            Containers {formatBytes(disk.containersBytes)} · Build cache{" "}
            {formatBytes(disk.buildCacheBytes)}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
