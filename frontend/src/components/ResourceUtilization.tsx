import MemoryIcon from "@mui/icons-material/Memory";
import SpeedIcon from "@mui/icons-material/Speed";
import StorageIcon from "@mui/icons-material/Storage";
import { Box } from "@mui/material";
import {
  useDeploymentStats,
  useDeploymentStatsHistory,
  useSystemStats,
  useSystemStatsHistory,
} from "../api/hooks";
import { formatBytes, formatPercent } from "../format";
import { CHART_COLORS } from "./MetricChart";
import { StatCard } from "./StatCard";

const ICON = { fontSize: 18 } as const;

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
      }}
    >
      {children}
    </Box>
  );
}

function diskTotal(disk: {
  imagesBytes: number;
  containersBytes: number;
  volumesBytes: number;
  buildCacheBytes: number;
}): number {
  return disk.imagesBytes + disk.containersBytes + disk.volumesBytes + disk.buildCacheBytes;
}

// Per-deployment KPI overview: current CPU / memory / storage with recent sparklines, each linking
// to the deployment's Graphs section.
export function DeploymentUtilization({ deploymentId }: { deploymentId: string }) {
  const { data: stats, isPending } = useDeploymentStats(deploymentId);
  const { data: history } = useDeploymentStatsHistory(deploymentId, "15m");
  const samples = history?.samples ?? [];
  const to = `/deployments/${deploymentId}/monitoring`;

  const cpuDetail = stats?.cpuCores ? `of ${stats.cpuCores * 100}%` : "no limit";
  const memDetail = stats?.memLimitBytes ? `of ${formatBytes(stats.memLimitBytes)}` : "no limit";

  return (
    <CardGrid>
      <StatCard
        title="CPU"
        icon={<SpeedIcon sx={ICON} />}
        value={formatPercent(stats?.cpuPercent)}
        detail={cpuDetail}
        data={samples.map((sample) => sample.cpuPercent)}
        color={CHART_COLORS[0]}
        to={to}
        loading={isPending}
      />
      <StatCard
        title="Memory"
        icon={<MemoryIcon sx={ICON} />}
        value={formatBytes(stats?.memUsageBytes)}
        detail={memDetail}
        data={samples.map((sample) => sample.memUsageBytes)}
        color={CHART_COLORS[1]}
        to={to}
        loading={isPending}
      />
      <StatCard
        title="Storage"
        icon={<StorageIcon sx={ICON} />}
        value={formatBytes(stats?.storageBytes)}
        detail={
          stats && stats.volumes.length > 0
            ? `${stats.volumes.length} volume(s)`
            : "volumes + layers"
        }
        data={samples.map((sample) => sample.storageBytes)}
        color={CHART_COLORS[2]}
        to={to}
        loading={isPending}
      />
    </CardGrid>
  );
}

// Host KPI overview (admin): aggregate CPU / memory / disk, each linking to the Monitoring page.
export function SystemUtilization() {
  const { data: stats, isPending } = useSystemStats();
  const { data: history } = useSystemStatsHistory("15m");
  const samples = history?.samples ?? [];
  const to = "/monitoring";

  return (
    <CardGrid>
      <StatCard
        title="Host CPU"
        icon={<SpeedIcon sx={ICON} />}
        value={formatPercent(stats?.cpuPercent)}
        detail={stats ? `of ${stats.cpus} cores` : ""}
        data={samples.map((sample) => sample.cpuPercent)}
        color={CHART_COLORS[0]}
        to={to}
        loading={isPending}
      />
      <StatCard
        title="Memory"
        icon={<MemoryIcon sx={ICON} />}
        value={formatBytes(stats?.memUsageBytes)}
        detail={stats ? `of ${formatBytes(stats.memTotalBytes)}` : ""}
        data={samples.map((sample) => sample.memUsageBytes)}
        color={CHART_COLORS[1]}
        to={to}
        loading={isPending}
      />
      <StatCard
        title="Disk"
        icon={<StorageIcon sx={ICON} />}
        value={formatBytes(stats ? diskTotal(stats.disk) : 0)}
        detail={stats ? `images ${formatBytes(stats.disk.imagesBytes)}` : ""}
        data={samples.map((sample) => diskTotal(sample.disk))}
        color={CHART_COLORS[2]}
        to={to}
        loading={isPending}
      />
    </CardGrid>
  );
}
